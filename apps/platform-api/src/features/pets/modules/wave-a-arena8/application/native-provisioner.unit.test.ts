import {afterEach,describe,expect,it,vi} from 'vitest';
import {DomainError} from '../../../../../shared/common/errors';
import {
  arena8AllocationFingerprint,ownedPetUuid,type Arena8Artifact,type OwnedArena8Allocation,
} from './allocation';
import {
  NativeArena8Provisioner,
  type NativeArena8MatchRecord,NativeArena8MatchRegistry,
  type NativeArena8RuntimeHandle,NativeArena8RuntimeRequest,
} from './native-provisioner';

const ACCOUNT='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const MATCH='33333333-3333-4333-8333-333333333333';
const MATCH2='55555555-5555-4555-8555-555555555555';
const BOOT='44444444-4444-4444-8444-444444444444';
const BOOT2='66666666-6666-4666-8666-666666666666';
const CONTENT='ab'.repeat(32);
const ORIGIN='https://127.0.0.1:4443';
const CREDENTIAL='cd'.repeat(32);
const ARTIFACTS:readonly Arena8Artifact[]=Object.freeze([
  Object.freeze({definitionId:'ember-core',upgradeLevel:2}),
]);
const REQUEST='77777777-7777-4777-8777-777777777777';
const REQUEST2='88888888-8888-4888-8888-888888888888';

type Called={scope:Record<string,unknown>;expected:number;enabled:boolean;capacity:number;generation:number};

class MemoryRegistry implements NativeArena8MatchRegistry {
  readonly records=new Map<string,NativeArena8MatchRecord>();
  async findRequest(accountId:string,requestId:string){
    return [...this.records.values()].find(row=>row.accountId===accountId&&row.requestId===requestId);
  }
  async findActive(accountId:string){
    return [...this.records.values()].find(row=>row.accountId===accountId&&
      (row.status==='STARTING'||row.status==='ACTIVE'));
  }
  async create(record:NativeArena8MatchRecord){
    for(const row of this.records.values())if(row.accountId===record.accountId&&
      (row.requestId===record.requestId||row.status==='STARTING'||row.status==='ACTIVE')){
      throw Object.assign(new Error('conflict'),{code:'23505'});
    }
    this.records.set(record.matchId,record);
  }
  async activate(matchId:string,generation:number){
    const row=this.records.get(matchId);
    if(!row||row.status!=='STARTING')throw new Error('Activation conflict');
    this.records.set(matchId,{...row,status:'ACTIVE',generation});
  }
  async fail(matchId:string){
    const row=this.records.get(matchId);
    if(row&&row.status!=='FAILED'&&row.status!=='CLOSED')
      this.records.set(matchId,{...row,status:'FAILED'});
  }
  async close(matchId:string){
    const row=this.records.get(matchId);
    if(row&&(row.status==='STARTING'||row.status==='ACTIVE'))
      this.records.set(matchId,{...row,status:'CLOSED'});
  }
}

class FakeAdmission {
  readonly worlds=new Map<string,number>();
  readonly configureCalls:Called[]=[];
  readonly allocateCalls:{credential:string;scope:Record<string,unknown>}[]=[];
  readonly heartbeats:{scope:Record<string,unknown>;generation:number}[]=[];
  denyConfigure=false;
  denyAllocate=false;
  async configure(scope:Record<string,unknown>,expected:number,enabled=true,capacity=0){
    if(this.denyConfigure)throw new Error('denied');
    const prior=this.worlds.get(String(scope.worldId))??0;
    if(prior!==expected)throw new Error('generation');
    const generation=prior+1;
    this.worlds.set(String(scope.worldId),generation);
    this.configureCalls.push({scope,expected,enabled,capacity,generation});
    return generation;
  }
  async allocate(credential:string,scope:Record<string,unknown>){
    if(this.denyAllocate)throw new Error('denied');
    this.allocateCalls.push({credential,scope});
    return {accountId:ACCOUNT,sessionId:ACCOUNT,generation:1,validUntilMs:Date.now()+5000};
  }
  async heartbeat(scope:Record<string,unknown>,generation:number){
    this.heartbeats.push({scope,generation});
  }
}

class FakeRuntime {
  readonly requests:NativeArena8RuntimeRequest[]=[];
  readonly stops=vi.fn(async()=>{});
  readonly exits:('none'|'early')[]=[];
  readonly handles:NativeArena8RuntimeHandle[]=[];
  async contentHash(){return CONTENT;}
  async start(request:NativeArena8RuntimeRequest){
    this.requests.push(request);
    let listener:(()=>void)|undefined;
    const handle:NativeArena8RuntimeHandle={
      port:49152,
      stop:this.stops,
      onExit:cb=>{listener=cb;},
    };
    Object.assign(handle,{triggerExit:()=>listener?.()});
    this.handles.push(handle);
    return handle;
  }
}

function fixture(overrides:{
  ownership?:(accountId:string,input:{petId:string})=>Promise<OwnedArena8Allocation>;
  registry?:MemoryRegistry;admission?:FakeAdmission;runtime?:FakeRuntime;
  ids?:string[];
}={}){
  const registry=overrides.registry??new MemoryRegistry();
  const admission=overrides.admission??new FakeAdmission();
  const runtime=overrides.runtime??new FakeRuntime();
  const issued:Record<string,unknown>[]=[];
  const issuer={issue:vi.fn(async(credential:string,scope:Record<string,unknown>)=>{
    const index=issued.length;issued.push({credential,scope});
    return {ticket:'ticket-'+index+'.payload.signature',
      expiresAt:new Date(1_700_000_030_000).toISOString()};
  })};
  const ids=overrides.ids??[MATCH,BOOT];
  const provisioner=new NativeArena8Provisioner({
    ownership:overrides.ownership??(async()=>({level:12,artifacts:ARTIFACTS})),
    matches:registry,admission,issuer,runtime,httpsOrigin:ORIGIN,
    now:()=>1_700_000_000_000,id:()=>ids.shift()!,
  });
  return {provisioner,registry,admission,runtime,issuer,issued,ids};
}

afterEach(()=>vi.useRealTimers());

describe('Native Arena8 provisioner',()=>{
  it('allocates a server-owned runtime match and issues a scoped ticket',async()=>{
    const f=fixture();
    const result=await f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST,{
      petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular',
    });
    expect(Object.keys(result).sort()).toEqual([
      'allocation','bootId','contentHash','expiresAt','httpsOrigin','matchId',
      'principal','ticket','wssUrl',
    ]);
    expect(result).toEqual({
      matchId:MATCH,wssUrl:'wss://127.0.0.1:4443/rt/v1',httpsOrigin:ORIGIN,
      ticket:'ticket-0.payload.signature',expiresAt:'2023-11-14T22:13:50.000Z',
      contentHash:CONTENT,bootId:BOOT,principal:ACCOUNT,
      allocation:{
        petId:'ember-cub',mapId:'cinder-terraces',
        encounterId:'cinder-terraces-regular',level:12,artifacts:ARTIFACTS,
      },
    });
    const record=f.registry.records.get(MATCH)!;
    expect(record.status).toBe('ACTIVE');
    expect(record.generation).toBe(1);
    expect(record.worldId).toBe('native:arena8-'+MATCH);
    expect(record.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const scope={worldId:record.worldId,runtimeBootId:BOOT,contentHash:CONTENT,protocolVersion:1};
    expect(f.admission.configureCalls).toHaveLength(1);
    expect(f.admission.configureCalls[0]).toMatchObject({expected:0,enabled:true,capacity:1,scope});
    expect(f.admission.allocateCalls).toHaveLength(2);
    expect(f.admission.allocateCalls).toEqual([
      {credential:CREDENTIAL,scope},{credential:CREDENTIAL,scope},
    ]);
    expect(f.runtime.requests).toEqual([{
      accountId:ACCOUNT,matchId:MATCH,bootId:BOOT,worldId:record.worldId,
      contentHash:CONTENT,ownedPetId:ownedPetUuid(ACCOUNT,'ember-cub'),
      petId:'ember-cub',level:12,encounterId:'cinder-terraces-regular',
      artifacts:ARTIFACTS,origin:ORIGIN,
    }]);
    expect(f.issued[0].scope).toEqual(scope);
    expect(f.issued[0].credential).toBe(CREDENTIAL);
    const serialized=JSON.stringify(result);
    for(const secret of ['databaseUrl','storageKey','caFile','publicKey','role','policy'])
      expect(serialized).not.toContain(secret);
  });

  it('rejects an unowned Pet before reserving, configuring or spawning',async()=>{
    const f=fixture({ownership:async()=>{throw new DomainError('FORBIDDEN',403,'Pet is not owned');}});
    await expect(f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST,{
      petId:'absent',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular',
    })).rejects.toMatchObject({code:'FORBIDDEN',status:403});
    expect(f.registry.records.size).toBe(0);
    expect(f.admission.configureCalls).toHaveLength(0);
    expect(f.admission.allocateCalls).toHaveLength(0);
    expect(f.runtime.requests).toHaveLength(0);
  });

  it('reuses the active match for an identical fingerprint with a fresh ticket',async()=>{
    const f=fixture();
    const input={petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular'};
    const first=await f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST,input);
    const second=await f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST2,input);
    expect(second.matchId).toBe(first.matchId);
    expect(second.ticket).not.toBe(first.ticket);
    expect(f.runtime.requests).toHaveLength(1);
    expect(f.issued).toHaveLength(2);
    // Two admissions across startup plus one lease renewal for the reconnect.
    expect(f.admission.allocateCalls).toHaveLength(3);
    expect(f.registry.records.size).toBe(1);
    expect(f.ids).toHaveLength(0);
  });

  it('keeps a request fingerprint immutable and rejects a conflicting live allocation',async()=>{
    let level=12;
    const f=fixture({ownership:async()=>({level,artifacts:ARTIFACTS})});
    const input={petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular'};
    await f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST,input);
    level=13;
    await expect(f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST,input))
      .rejects.toMatchObject({code:'REQUEST_CONFLICT',status:409});
    await expect(f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST2,input))
      .rejects.toMatchObject({code:'REQUEST_CONFLICT',status:409});
    expect(f.runtime.requests).toHaveLength(1);
    expect(f.issued).toHaveLength(1);
  });

  it('fails closed and revokes the world when admission denies allocation',async()=>{
    const admission=new FakeAdmission();admission.denyAllocate=true;
    const f=fixture({admission});
    await expect(f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST,{
      petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular',
    })).rejects.toMatchObject({code:'WORLD_UNAVAILABLE',status:503});
    expect(f.runtime.requests).toHaveLength(0);
    expect(f.issued).toHaveLength(0);
    expect(f.registry.records.get(MATCH)?.status).toBe('FAILED');
    expect(f.admission.configureCalls.at(-1)).toMatchObject({enabled:false,capacity:0});
  });

  it('heartbeats the lease and closes the runtime and world on shutdown',async()=>{
    vi.useFakeTimers();
    const f=fixture();
    await f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST,{
      petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular',
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.admission.heartbeats).toHaveLength(1);
    expect(f.admission.heartbeats[0].generation).toBe(1);
    await f.provisioner.close();
    expect(f.runtime.stops).toHaveBeenCalledTimes(1);
    expect(f.registry.records.get(MATCH)?.status).toBe('CLOSED');
    expect(f.admission.configureCalls.at(-1)).toMatchObject({enabled:false,capacity:0});
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.admission.heartbeats).toHaveLength(1);
    await expect(f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST2,{
      petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular',
    })).rejects.toMatchObject({code:'WORLD_UNAVAILABLE',status:503});
  });

  it('retires a journal row that has no live local runtime after a restart',async()=>{
    const registry=new MemoryRegistry();
    const fingerprint=arena8AllocationFingerprint(ACCOUNT,CONTENT,{
      petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular',
    },{level:12,artifacts:ARTIFACTS});
    const record:NativeArena8MatchRecord=Object.freeze({
      matchId:MATCH,accountId:ACCOUNT,requestId:REQUEST,fingerprint,
      worldId:'native:arena8-'+MATCH,bootId:BOOT,contentHash:CONTENT,generation:1,
      petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular',
      level:12,artifacts:ARTIFACTS,status:'ACTIVE',
    });
    registry.records.set(MATCH,record);
    const admission=new FakeAdmission();admission.worlds.set(record.worldId,1);
    const f=fixture({registry,admission,ids:[MATCH2,BOOT2]});
    const input={petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular'};
    await expect(f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST2,input))
      .rejects.toMatchObject({code:'WORLD_UNAVAILABLE',status:503});
    expect(registry.records.get(MATCH)?.status).toBe('FAILED');
    expect(admission.configureCalls.at(-1)).toMatchObject({enabled:false,capacity:0});
    expect(f.runtime.requests).toHaveLength(0);
  });

  it('marks the match failed and permits a fresh match after runtime exit',async()=>{
    const f=fixture({ids:[MATCH,BOOT,MATCH2,BOOT2]});
    const input={petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular'};
    await f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST,input);
    (f.runtime.handles[0] as unknown as {triggerExit:()=>void}).triggerExit();
    await Promise.resolve();
    expect(f.registry.records.get(MATCH)?.status).toBe('FAILED');
    expect(f.admission.configureCalls.at(-1)).toMatchObject({enabled:false,capacity:0});
    const next=await f.provisioner.allocate(ACCOUNT,CREDENTIAL,REQUEST2,input);
    expect(next.matchId).toBe(MATCH2);
    expect(f.runtime.requests).toHaveLength(2);
  });
});

describe('Native Arena8 allocation identity',()=>{
  const input={petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular'};
  it('derives a stable owned Pet UUID from the account and species',()=>{
    const value=ownedPetUuid(ACCOUNT,'ember-cub');
    expect(value).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(ownedPetUuid(ACCOUNT,'ember-cub')).toBe(value);
    expect(ownedPetUuid(OTHER,'ember-cub')).not.toBe(value);
    expect(ownedPetUuid(ACCOUNT,'tide-pup')).not.toBe(value);
  });
  it('binds the immutable fingerprint to content, level and Artifacts',()=>{
    const owned={level:12,artifacts:ARTIFACTS};
    const value=arena8AllocationFingerprint(ACCOUNT,CONTENT,input,owned);
    expect(value).toMatch(/^[a-f0-9]{64}$/);
    expect(arena8AllocationFingerprint(ACCOUNT,CONTENT,input,owned)).toBe(value);
    expect(arena8AllocationFingerprint(ACCOUNT,'cd'.repeat(32),input,owned)).not.toBe(value);
    expect(arena8AllocationFingerprint(ACCOUNT,CONTENT,input,{level:13,artifacts:ARTIFACTS})).not.toBe(value);
    expect(arena8AllocationFingerprint(ACCOUNT,CONTENT,input,{
      level:12,artifacts:[{definitionId:'ember-core',upgradeLevel:3}],
    })).not.toBe(value);
  });
});
