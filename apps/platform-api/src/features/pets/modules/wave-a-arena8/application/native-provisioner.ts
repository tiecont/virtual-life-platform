import {randomUUID} from 'node:crypto';
import type {RuntimeScope} from '../../../../identity/modules/runtime-access/application/runtime-tickets';
import {
  arena8AllocationFingerprint,assertUuid,conflict,invalid,ownedPetUuid,unavailable,
  type AllocateInput,type Arena8Artifact,type OwnedArena8Allocation,
} from './allocation';

export const ARENA8_NATIVE_TICKET_KEY_ID='arena8-native-v1';
export const ARENA8_NATIVE_WSS_PATH='/rt/v1';
const HEARTBEAT_INTERVAL_MS=2000;
const WORLD_PREFIX='native:arena8-';
const PROTOCOL_VERSION=1 as const;

export type NativeArena8MatchStatus='STARTING'|'ACTIVE'|'CLOSED'|'FAILED';
export type NativeArena8MatchRecord=Readonly<{
  matchId:string;accountId:string;requestId:string;fingerprint:string;
  worldId:string;bootId:string;contentHash:string;generation:number;
  petId:string;mapId:string;encounterId:string;level:number;
  artifacts:readonly Arena8Artifact[];status:NativeArena8MatchStatus;
}>;

export type NativeArena8MatchRegistry={
  findRequest(accountId:string,requestId:string):Promise<NativeArena8MatchRecord|undefined>;
  findActive(accountId:string):Promise<NativeArena8MatchRecord|undefined>;
  create(record:NativeArena8MatchRecord):Promise<void>;
  activate(matchId:string,generation:number):Promise<void>;
  fail(matchId:string):Promise<void>;
  close(matchId:string):Promise<void>;
};

export type NativeArena8AdmissionPort={
  configure(scope:RuntimeScope,expectedGeneration:number,enabled?:boolean,capacity?:number):Promise<number>;
  allocate(credential:string,scope:RuntimeScope):Promise<Readonly<{
    accountId:string;sessionId:string;generation:number;validUntilMs:number;
  }>>;
  heartbeat(scope:RuntimeScope,generation:number):Promise<void>;
};

export type NativeArena8IssuerPort={
  issue(credential:string,scope:RuntimeScope):Promise<Readonly<{ticket:string;expiresAt:string}>>;
};

export type NativeArena8RuntimeRequest=Readonly<{
  accountId:string;matchId:string;bootId:string;worldId:string;contentHash:string;
  ownedPetId:string;petId:string;level:number;encounterId:string;
  artifacts:readonly Arena8Artifact[];origin:string;
}>;

export type NativeArena8RuntimeHandle={
  readonly port:number;
  stop():Promise<void>;
  onExit(listener:()=>void):void;
};

export type NativeArena8RuntimePort={
  contentHash():Promise<string>;
  start(request:NativeArena8RuntimeRequest):Promise<NativeArena8RuntimeHandle>;
};

export type NativeArena8ProvisionerOptions=Readonly<{
  ownership:(accountId:string,input:AllocateInput)=>Promise<OwnedArena8Allocation>;
  matches:NativeArena8MatchRegistry;
  admission:NativeArena8AdmissionPort;
  issuer:NativeArena8IssuerPort;
  runtime:NativeArena8RuntimePort;
  httpsOrigin:string;
  capacity?:number;
  now?:()=>number;
  id?:()=>string;
}>;

export type NativeArena8AllocationView=Readonly<{
  matchId:string;wssUrl:string;httpsOrigin:string;ticket:string;expiresAt:string;
  contentHash:string;bootId:string;principal:string;
  allocation:Readonly<{
    petId:string;mapId:string;encounterId:string;level:number;
    artifacts:readonly Arena8Artifact[];
  }>;
}>;

type Lease={
  timer:ReturnType<typeof setInterval>;
  work:()=>Promise<void>;
  stop:()=>void;
};
type ActiveMatch={
  record:NativeArena8MatchRecord;scope:RuntimeScope;generation:number;
  handle:NativeArena8RuntimeHandle;lease:Lease;
  stopped:boolean;exited:boolean;
};

function scopeFor(record:Pick<NativeArena8MatchRecord,'worldId'|'bootId'|'contentHash'>):RuntimeScope{
  return Object.freeze({
    worldId:record.worldId,runtimeBootId:record.bootId,
    contentHash:record.contentHash,protocolVersion:PROTOCOL_VERSION,
  });
}
function expired(expiresAt:string,now:number){
  const at=Date.parse(expiresAt);
  return !Number.isFinite(at)||at<=now;
}

// Local-only server-owned Arena8 match provisioner. It owns authenticated
// allocation, the per-match native runtime process and the short-lived ticket;
// it never exposes runtime configuration, credentials or storage keys.
export class NativeArena8Provisioner {
  private readonly active=new Map<string,ActiveMatch>();
  private readonly now:()=>number;
  private readonly id:()=>string;
  private readonly capacity:number;
  private readonly httpsOrigin:string;
  private readonly wssUrl:string;
  private content?:Promise<string>;
  private closing=false;

  constructor(private readonly options:NativeArena8ProvisionerOptions){
    const origin=new URL(options.httpsOrigin);
    if(origin.protocol!=='https:'||origin.origin!==options.httpsOrigin)
      throw new Error('Native Arena8 requires an exact HTTPS origin');
    this.httpsOrigin=options.httpsOrigin;
    this.wssUrl='wss:'+options.httpsOrigin.slice('https:'.length)+ARENA8_NATIVE_WSS_PATH;
    this.capacity=options.capacity??1;
    if(!Number.isInteger(this.capacity)||this.capacity<1||this.capacity>10000)
      throw new Error('Native Arena8 capacity is invalid');
    this.now=options.now??Date.now;
    this.id=options.id??randomUUID;
  }

  private async contentHash(){
    this.content ??=this.options.runtime.contentHash().then(hash=>{
      if(!/^[a-f0-9]{64}$/.test(hash))throw unavailable('Arena8 content is unavailable');
      return hash;
    });
    return this.content;
  }

  async allocate(
    accountId:string,credential:string,requestId:string,input:AllocateInput,
  ):Promise<NativeArena8AllocationView>{
    if(this.closing)throw unavailable('Arena8 native runtime is unavailable');
    assertUuid(accountId,'account');
    assertUuid(requestId,'requestId');
    if(!input||typeof input!=='object')throw invalid('Invalid Arena8 allocation');
    const target=Object.freeze({
      petId:input.petId,mapId:input.mapId,encounterId:input.encounterId,
    });
    const owned=await this.options.ownership(accountId,target);
    const contentHash=await this.contentHash();
    const fingerprint=arena8AllocationFingerprint(accountId,contentHash,target,owned);

    const priorRequest=await this.options.matches.findRequest(accountId,requestId);
    if(priorRequest){
      if(priorRequest.fingerprint!==fingerprint)
        throw conflict('Request was used for a different Arena8 allocation');
      if(priorRequest.status!=='ACTIVE')
        throw conflict(priorRequest.status==='STARTING'
          ?'Arena8 allocation is still starting':'Arena8 request is no longer active');
      return this.reissue(priorRequest,credential,contentHash);
    }
    const active=await this.options.matches.findActive(accountId);
    if(active){
      if(active.fingerprint!==fingerprint)
        throw conflict('Another Arena8 allocation is active');
      return this.reissue(active,credential,contentHash);
    }

    const matchId=this.id(),bootId=this.id(),worldId=WORLD_PREFIX+matchId;
    if(!/^native:[a-z0-9][a-z0-9._-]{0,63}$/.test(worldId))throw unavailable('Arena8 world unavailable');
    const record:NativeArena8MatchRecord=Object.freeze({
      matchId,accountId,requestId,fingerprint,worldId,bootId,contentHash,
      generation:0,petId:target.petId,mapId:target.mapId,encounterId:target.encounterId,
      level:owned.level,artifacts:owned.artifacts,status:'STARTING',
    });
    try{
      await this.options.matches.create(record);
    }catch(error){
      return this.resolveReservationRace(accountId,requestId,fingerprint,credential,contentHash,error);
    }
    return this.provision(record,credential);
  }

  private async resolveReservationRace(
    accountId:string,requestId:string,fingerprint:string,credential:string,
    contentHash:string,error:unknown,
  ):Promise<NativeArena8AllocationView>{
    if((error as {code?:unknown})?.code!=='23505')
      throw unavailable('Arena8 allocation is unavailable');
    const request=await this.options.matches.findRequest(accountId,requestId);
    if(request){
      if(request.fingerprint!==fingerprint)
        throw conflict('Request was used for a different Arena8 allocation');
      if(request.status!=='ACTIVE')
        throw conflict(request.status==='STARTING'
          ?'Arena8 allocation is still starting':'Arena8 request is no longer active');
      return this.reissue(request,credential,contentHash);
    }
    const active=await this.options.matches.findActive(accountId);
    if(active&&active.fingerprint===fingerprint){
      if(active.status!=='ACTIVE')throw conflict('Arena8 allocation is still starting');
      return this.reissue(active,credential,contentHash);
    }
    throw conflict('Another Arena8 allocation is active');
  }

  private async reissue(
    record:NativeArena8MatchRecord,credential:string,contentHash:string,
  ):Promise<NativeArena8AllocationView>{
    if(record.contentHash!==contentHash)
      throw unavailable('Arena8 content changed while a match was active');
    const current=this.active.get(record.matchId);
    if(!current){
      // A journal row without a live local process (for example after an API
      // restart) can never be reissued. Retire it so a new allocation can start.
      await this.options.matches.fail(record.matchId).catch(()=>{});
      if(record.generation>0)
        await this.options.admission.configure(scopeFor(record),record.generation,false,0).catch(()=>{});
      throw unavailable('Arena8 native runtime is unavailable');
    }
    if(current.stopped||current.exited)
      throw unavailable('Arena8 native runtime is unavailable');
    if(record.status!=='ACTIVE')throw conflict('Arena8 allocation is still starting');
    // The admission lease and ticket TTL are intentionally short, so every
    // reconnect renews admission before signing a fresh scoped ticket.
    let allocation;
    try{allocation=await this.options.admission.allocate(credential,current.scope);}
    catch{throw unavailable('Arena8 native admission is unavailable');}
    if(allocation.accountId!==record.accountId)
      throw unavailable('Arena8 native admission is unavailable');
    return this.issue(current,credential);
  }

  private startLease(scope:RuntimeScope,generation:number,onFailure:()=>void){
    let work=Promise.resolve(),stopped=false,failed=false;
    const timer=setInterval(()=>{
      work=work.then(async()=>{
        if(stopped||failed)return;
        try{await this.options.admission.heartbeat(scope,generation);}
        catch{failed=true;onFailure();}
      }).catch(()=>{});
    },HEARTBEAT_INTERVAL_MS);
    timer.unref?.();
    return {
      timer,work:()=>work,
      stop:()=>{stopped=true;clearInterval(timer);},
    } satisfies Lease;
  }

  private async provision(
    record:NativeArena8MatchRecord,credential:string,
  ):Promise<NativeArena8AllocationView>{
    const scope=scopeFor(record);
    let generation=0,handle:NativeArena8RuntimeHandle|undefined;
    let lease:Lease|undefined,active:ActiveMatch|undefined,leaseFailed=false;
    try{
      generation=await this.options.admission.configure(scope,0,true,this.capacity);
      const initial=await this.options.admission.allocate(credential,scope);
      if(initial.accountId!==record.accountId)
        throw new Error('Arena8 admission identity mismatch');
      // The world lease is five seconds. Serving heartbeat renewals while the
      // binary boots keeps the server-owned world alive during startup.
      lease=this.startLease(scope,generation,()=>{
        leaseFailed=true;
        if(active)this.abandon(active);
      });
      handle=await this.options.runtime.start(Object.freeze({
        accountId:record.accountId,matchId:record.matchId,bootId:record.bootId,
        worldId:record.worldId,contentHash:record.contentHash,
        ownedPetId:ownedPetUuid(record.accountId,record.petId),
        petId:record.petId,level:record.level,encounterId:record.encounterId,
        artifacts:record.artifacts,origin:this.httpsOrigin,
      }));
      await lease.work();
      if(leaseFailed)throw new Error('Arena8 lease failed during startup');
      await this.options.matches.activate(record.matchId,generation);
      // Refresh admission after startup so the ticket is not bounded by the
      // short lease consumed while the runtime booted.
      const allocation=await this.options.admission.allocate(credential,scope);
      if(allocation.accountId!==record.accountId)
        throw new Error('Arena8 admission identity mismatch');
      if(leaseFailed)throw new Error('Arena8 lease failed during startup');
      active={
        record:Object.freeze({...record,generation,status:'ACTIVE'}),
        scope,generation,handle,lease,stopped:false,exited:false,
      };
    }catch{
      lease?.stop();
      await lease?.work().catch(()=>{});
      if(handle)await handle.stop().catch(()=>{});
      if(generation>0)await this.options.admission.configure(scope,generation,false,0).catch(()=>{});
      await this.options.matches.fail(record.matchId).catch(()=>{});
      throw unavailable('Arena8 native runtime is unavailable');
    }
    this.active.set(record.matchId,active);
    handle.onExit(()=>this.runtimeExited(active));
    return this.issue(active,credential);
  }

  private runtimeExited(active:ActiveMatch){
    if(active.stopped||active.exited)return;
    active.exited=true;
    this.abandon(active);
  }

  private abandon(active:ActiveMatch){
    if(active.stopped)return;
    active.stopped=true;
    active.lease.stop();
    this.active.delete(active.record.matchId);
    void this.options.matches.fail(active.record.matchId).catch(()=>{});
    void this.options.admission.configure(active.scope,active.generation,false,0).catch(()=>{});
    void active.handle.stop().catch(()=>{});
  }

  private async issue(
    active:ActiveMatch,credential:string,
  ):Promise<NativeArena8AllocationView>{
    const issued=await this.options.issuer.issue(credential,active.scope);
    const now=this.now();
    if(typeof issued.ticket!=='string'||!issued.ticket||!Number.isSafeInteger(now)||now<0||
      expired(issued.expiresAt,now))
      throw unavailable('Arena8 native ticket is unavailable');
    const record=active.record;
    return Object.freeze({
      matchId:record.matchId,
      wssUrl:this.wssUrl,
      httpsOrigin:this.httpsOrigin,
      ticket:issued.ticket,
      expiresAt:issued.expiresAt,
      contentHash:record.contentHash,
      bootId:record.bootId,
      principal:record.accountId,
      allocation:Object.freeze({
        petId:record.petId,mapId:record.mapId,encounterId:record.encounterId,
        level:record.level,artifacts:record.artifacts,
      }),
    });
  }

  // Called only after the authoritative native settlement receipt is durable.
  // It stops the per-match runtime, closes the bridge, retires admission and
  // releases the journal's active slot so the next match can be provisioned.
  async complete(accountId:string,matchId:string){
    const active=this.active.get(matchId);
    if(!active||active.record.accountId!==accountId)return;
    active.stopped=true;
    this.active.delete(matchId);
    active.lease.stop();
    await active.lease.work().catch(()=>{});
    await active.handle.stop().catch(()=>{});
    await this.options.matches.close(matchId).catch(()=>{});
    await this.options.admission.configure(active.scope,active.generation,false,0).catch(()=>{});
  }

  async close(){
    if(this.closing)return;
    this.closing=true;
    const active=[...this.active.values()];
    this.active.clear();
    await Promise.allSettled(active.map(async match=>{
      match.stopped=true;
      match.lease.stop();
      await match.lease.work().catch(()=>{});
      await match.handle.stop().catch(()=>{});
      await this.options.matches.close(match.record.matchId).catch(()=>{});
      await this.options.admission.configure(match.scope,match.generation,false,0).catch(()=>{});
    }));
  }
}
