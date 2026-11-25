import {randomUUID} from 'node:crypto';
import type {GameplayBundleValidator} from '../../../../gameplay/modules/config/infrastructure/engine-validator';
import type {RuntimeScope} from '../../../../identity/modules/runtime-access/application/runtime-tickets';
import {DomainError} from '../../../../../shared/common/errors';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PET=/^[a-z][a-z0-9-]{2,63}$/;
const WORLD=/^native:[a-z0-9][a-z0-9._-]{0,63}$/;
const SEATS=4,CAPACITY=4,HEARTBEAT_MS=2000,WSS_PATH='/rt/v1';

export type CoopSeat=Readonly<{account:string;petId:string;petLevel:number;artifactPowerPm:number}>;
export type CoopAllocationStatus='STARTING'|'ACTIVE'|'SETTLED'|'FAILED'|'CLOSED';
export type CoopAllocationRecord=Readonly<{
 matchId:string;roomId:string;worldId:string;bootId:string;
 configVersion:number;configDigest:string;contentHash:string;
 seats:readonly CoopSeat[];status:CoopAllocationStatus;generation:number;
}>;
export type CoopMatchStorePort=Readonly<{
 findByRoom(roomId:string):Promise<CoopAllocationRecord|undefined>;
 listRecoverable():Promise<readonly CoopAllocationRecord[]>;
 listStarting():Promise<readonly CoopAllocationRecord[]>;
 create(record:CoopAllocationRecord):Promise<void>;
 activate(matchId:string,generation:number):Promise<void>;
 recovered(matchId:string,generation:number):Promise<void>;
 fail(matchId:string):Promise<void>;
 close(matchId:string):Promise<void>;
}>;
export type CoopAdmissionPort=Readonly<{
 configure(scope:RuntimeScope,expectedGeneration:number,enabled:boolean,capacity:number):Promise<number>;
 allocate(credential:string,scope:RuntimeScope):Promise<Readonly<{accountId:string;sessionId:string;generation:number;validUntilMs:number}>>;
 heartbeat(scope:RuntimeScope,generation:number):Promise<void>;
}>;
export type CoopIssuerPort=Readonly<{issue(credential:string,scope:RuntimeScope):Promise<Readonly<{ticket:string;expiresAt:string}>>}>;
export type CoopRuntimeRequest=Readonly<{
 matchId:string;bootId:string;worldId:string;origin:string;
 configDigest:string;bundle:Record<string,unknown>;seats:readonly CoopSeat[];
}>;
export type CoopRuntimeHandle=Readonly<{port:number;stop():Promise<void>;onExit(listener:()=>void):void}>;
export type CoopRuntimePort=Readonly<{start(request:CoopRuntimeRequest):Promise<CoopRuntimeHandle>}>;
export type CoopProvisionerOptions=Readonly<{
 store:CoopMatchStorePort;admission:CoopAdmissionPort;issuer:CoopIssuerPort;
 runtime:CoopRuntimePort;validator:GameplayBundleValidator;httpsOrigin:string;
 loadBundle:(record:Pick<CoopAllocationRecord,'configVersion'|'configDigest'>)=>Promise<Record<string,unknown>|undefined>;
 id?:()=>string;
}>;
export type CoopStartInput=Readonly<{
 roomId:string;configVersion:number;configDigest:string;
 bundle:Record<string,unknown>;seats:readonly CoopSeat[];
}>;
export type CoopStartResult=Readonly<{matchId:string;worldId:string;bootId:string;contentHash:string;generation:number}>;
export type CoopAdmissionView=Readonly<{
 roomId:string;matchId:string;seat:number;wssUrl:string;httpsOrigin:string;
 ticket:string;expiresAt:string;contentHash:string;
}>;
type Lease={timer:ReturnType<typeof setInterval>;stop:()=>void};
type ActiveMatch={record:CoopAllocationRecord;scope:RuntimeScope;generation:number;handle:CoopRuntimeHandle;lease:Lease;stopped:boolean;exited:boolean};

const unavailable=(message='Cooperative native runtime is unavailable')=>new DomainError('NOT_AVAILABLE',503,message);
const conflict=(message:string)=>new DomainError('REQUEST_CONFLICT',409,message);
const forbidden=(message:string)=>new DomainError('FORBIDDEN',403,message);

function scopeFor(record:Pick<CoopAllocationRecord,'worldId'|'bootId'|'contentHash'>):RuntimeScope{
 return Object.freeze({worldId:record.worldId,runtimeBootId:record.bootId,contentHash:record.contentHash,protocolVersion:1 as const});
}
function seatsValid(seats:readonly CoopSeat[]){
 if(seats.length!==SEATS)return false;
 const accounts=new Set(seats.map(seat=>seat.account)),pets=new Set(seats.map(seat=>seat.petId));
 return accounts.size===SEATS&&pets.size===SEATS&&seats.every(seat=>
  UUID.test(seat.account)&&PET.test(seat.petId)&&Number.isInteger(seat.petLevel)&&seat.petLevel>=1&&seat.petLevel<=60&&
  Number.isInteger(seat.artifactPowerPm)&&seat.artifactPowerPm>=1_000&&seat.artifactPowerPm<=5_000);
}

// One authoritative cooperative match per room. The published bundle and the
// frozen four-seat roster are provisioned through the existing ticket,
// admission and runtime path; this class is the only composition owner.
export class CoopMatchProvisioner{
 private readonly active=new Map<string,ActiveMatch>();
 private readonly id:()=>string;
 private readonly origin:string;
 private closing=false;

 constructor(private readonly options:CoopProvisionerOptions){
  const origin=new URL(options.httpsOrigin);
  if(origin.protocol!=='https:'||origin.origin!==options.httpsOrigin||!['127.0.0.1','[::1]'].includes(origin.hostname))
   throw new Error('Cooperative native runtime requires an exact loopback HTTPS origin');
  this.origin=options.httpsOrigin;
  this.id=options.id??randomUUID;
 }

 private lease(scope:RuntimeScope,generation:number,onFailure:()=>void):Lease{
  let stopped=false,failed=false;
  const timer=setInterval(()=>{
   if(stopped||failed)return;
   void this.options.admission.heartbeat(scope,generation).catch(()=>{
    failed=true;onFailure();
   });
  },HEARTBEAT_MS);
  timer.unref?.();
  return {timer,stop:()=>{stopped=true;clearInterval(timer);}};
 }
 private async abandon(record:CoopAllocationRecord,generation:number){
  const active=this.active.get(record.matchId);
  active?.lease.stop();
  await active?.handle.stop().catch(()=>{});
  this.active.delete(record.matchId);
  if(generation>0)
   await this.options.admission.configure(scopeFor(record),generation,false,0).catch(()=>{});
  await this.options.store.fail(record.matchId).catch(()=>{});
 }

 async start(input:CoopStartInput):Promise<CoopStartResult>{
  if(this.closing)throw unavailable();
  if(!UUID.test(input.roomId)||!seatsValid(input.seats))throw conflict('Cooperative allocation is invalid');
  const prior=await this.options.store.findByRoom(input.roomId);
  if(prior){
   const current=this.active.get(prior.matchId);
   if(prior.status==='ACTIVE'&&current&&!current.stopped&&!current.exited)
    return Object.freeze({matchId:prior.matchId,worldId:prior.worldId,bootId:prior.bootId,contentHash:prior.contentHash,generation:current.generation});
   if(prior.status==='STARTING')throw conflict('Cooperative allocation is still starting');
   if(prior.status==='ACTIVE')throw unavailable('Cooperative native match recovery is not implemented');
   throw conflict('Cooperative allocation is no longer active');
  }
  let verdict;
  try{verdict=await this.options.validator.validate('arena8-coop-pve',input.bundle);}
  catch{throw unavailable('Published cooperative configuration is invalid');}
  if(verdict.digest!==input.configDigest)throw unavailable('Published cooperative configuration does not match its digest');
  const matchId=this.id(),bootId=this.id(),worldId='native:coop-'+matchId;
  if(!WORLD.test(worldId))throw unavailable();
  const record:CoopAllocationRecord=Object.freeze({
   matchId,roomId:input.roomId,worldId,bootId,configVersion:input.configVersion,
   configDigest:input.configDigest,contentHash:verdict.contentHash,
   seats:Object.freeze(input.seats.map(seat=>Object.freeze({...seat}))),status:'STARTING',generation:0,
  });
  try{await this.options.store.create(record);}
  catch{throw conflict('Cooperative room already has an allocation');}
  const scope=scopeFor(record);
  let generation=0,handle:CoopRuntimeHandle|undefined,lease:Lease|undefined,active:ActiveMatch|undefined;
  try{
   generation=await this.options.admission.configure(scope,0,true,CAPACITY);
   lease=this.lease(scope,generation,()=>{
    if(active)void this.abandon(active.record,active.generation);
   });
   let startError:unknown;
   for(let attempt=0;attempt<3;attempt++){
    try{
     handle=await this.options.runtime.start(Object.freeze({
      matchId,bootId,worldId,origin:this.origin,configDigest:input.configDigest,
      bundle:input.bundle,seats:record.seats,
     }));
     startError=undefined;break;
    }catch(error){
     startError=error;
     if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500+attempt*500));
    }
   }
   if(!handle)throw startError;
   await this.options.store.activate(matchId,generation);
   const activated:CoopAllocationRecord=Object.freeze({...record,status:'ACTIVE',generation});
   active={record:activated,scope,generation,handle,lease,stopped:false,exited:false};
   handle.onExit(()=>{
    const current=this.active.get(matchId);
    if(current)current.exited=true;
   });
   this.active.set(matchId,active);
   return Object.freeze({matchId,worldId,bootId,contentHash:verdict.contentHash,generation});
  }catch(error){
   lease?.stop();
   await handle?.stop().catch(()=>{});
   if(generation>0)await this.options.admission.configure(scope,generation,false,0).catch(()=>{});
   await this.options.store.fail(matchId).catch(()=>{});
   if(error instanceof DomainError)throw error;
   throw unavailable();
  }
 }

 async admission(roomId:string,credential:string):Promise<CoopAdmissionView>{
  if(this.closing)throw unavailable();
  if(!UUID.test(roomId))throw conflict('Cooperative allocation is invalid');
  const record=await this.options.store.findByRoom(roomId);
  if(!record||record.status!=='ACTIVE')throw conflict('Cooperative match is not active');
  const current=this.active.get(record.matchId);
  if(!current||current.stopped||current.exited)throw unavailable('Cooperative native match recovery is not implemented');
  let allocated;
  try{allocated=await this.options.admission.allocate(credential,current.scope);}
  catch{throw unavailable('Cooperative native admission is unavailable');}
  const seat=record.seats.findIndex(value=>value.account===allocated.accountId);
  if(seat<0)throw forbidden('Only a seated participant can join this match');
  let issued;
  try{issued=await this.options.issuer.issue(credential,current.scope);}
  catch{throw unavailable('Cooperative native admission is unavailable');}
  return Object.freeze({
   roomId,matchId:record.matchId,seat,
   wssUrl:'wss:'+this.origin.slice('https:'.length)+WSS_PATH,
   httpsOrigin:this.origin,ticket:issued.ticket,expiresAt:issued.expiresAt,
   contentHash:record.contentHash,
  });
 }

 async recover():Promise<Readonly<{recovered:number;failed:number}>>{
  if(this.closing)return Object.freeze({recovered:0,failed:0});
  const records=await this.options.store.listRecoverable();
  let recovered=0,failed=0;
  for(const record of records){
   if(this.active.has(record.matchId)){recovered+=1;continue;}
   let generation=0;
   try{
    const bundle=await this.options.loadBundle(record);
    if(!bundle)throw unavailable('Pinned cooperative configuration is unavailable');
    const verdict=await this.options.validator.validate('arena8-coop-pve',bundle);
    if(verdict.digest!==record.configDigest||verdict.contentHash!==record.contentHash)
     throw unavailable('Pinned cooperative configuration no longer matches the allocation');
    const scope=scopeFor(record);
    generation=await this.options.admission.configure(scope,record.generation,true,CAPACITY);
    let handle:CoopRuntimeHandle|undefined;
    try{handle=await this.options.runtime.start({
     matchId:record.matchId,bootId:record.bootId,worldId:record.worldId,origin:this.origin,
     configDigest:record.configDigest,bundle,seats:record.seats,
    });}catch{handle=undefined;}
    if(!handle)throw unavailable();
    const lease=this.lease(scope,generation,()=>{
     const current=this.active.get(record.matchId);
     if(current)void this.abandon(current.record,current.generation);
    });
    await this.options.store.recovered(record.matchId,generation);
    const restored:CoopAllocationRecord=Object.freeze({...record,status:'ACTIVE',generation});
    handle.onExit(()=>{
     const current=this.active.get(record.matchId);
     if(current)current.exited=true;
    });
    this.active.set(record.matchId,{record:restored,scope,generation,handle,lease,stopped:false,exited:false});
    recovered+=1;
   }catch{
    failed+=1;
    if(generation>0)await this.options.admission.configure(scopeFor(record),generation,false,0).catch(()=>{});
    // Never mark a durable ACTIVE allocation FAILED merely because recovery
    // could not reacquire it; admission stays closed until an operator resolves it.
   }
  }
  const starting=await this.options.store.listStarting().catch(()=>[] as readonly CoopAllocationRecord[]);
  for(const record of starting){
   // A STARTING allocation never activated, so no ticket or command could have
   // reached the runtime. Startup reconciliation marks it FAILED instead of
   // leaving it ambiguous forever.
   await this.options.store.fail(record.matchId).catch(()=>{});
   failed+=1;
  }
  return Object.freeze({recovered,failed});
 }

 async close(){
  this.closing=true;
  const matches=[...this.active.values()];
  this.active.clear();
  await Promise.all(matches.map(async active=>{
   active.lease.stop();
   await active.handle.stop().catch(()=>{});
   const disabled=await this.options.admission.configure(active.scope,active.generation,false,0).catch(()=>0);
   if(disabled>0)await this.options.store.recovered(active.record.matchId,disabled).catch(()=>{});
   // A graceful API shutdown stops the runtime but leaves the allocation ACTIVE:
   // the next process revalidates and re-provisions it. Room close is a separate
   // explicit operation and still closes the match.
  }));
 }
}
