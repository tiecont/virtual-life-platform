import {describe,expect,it,vi} from 'vitest';
import {DomainError} from '../../../../../shared/common/errors';
import {
 CoopMatchProvisioner,type CoopAdmissionPort,type CoopAllocationRecord,type CoopIssuerPort,
 type CoopMatchStorePort,type CoopRuntimeHandle,type CoopRuntimePort,type CoopRuntimeRequest,type CoopSeat,
} from './provisioner';

const ROOM='11111111-1111-4111-8111-111111111111';
const DIGEST='aa'.repeat(32),CONTENT='bb'.repeat(32),ORIGIN='https://127.0.0.1:4443';
const ACCOUNTS=['22222222-2222-4222-8222-222222222221','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222223','22222222-2222-4222-8222-222222222224'];
const SEATS:readonly CoopSeat[]=ACCOUNTS.map((account,index)=>Object.freeze({account,petId:['icarus','coralline','volt','terran'][index]!,petLevel:1,artifactPowerPm:1_000,ownedPetInstanceId:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(index+1).padStart(12,'0')}));
const bundle={schemaVersion:1,boss:{id:'cinder-terraces-warden',requiredRoomPoints:5_000}};

class MemoryStore implements CoopMatchStorePort{
 readonly rows=new Map<string,CoopAllocationRecord>();
 async findByRoom(roomId:string){return [...this.rows.values()].find(row=>row.roomId===roomId);}
 async listRecoverable(){return [...this.rows.values()].filter(row=>row.status==='ACTIVE');}
 async listStarting(){return [...this.rows.values()].filter(row=>row.status==='STARTING');}
 async recovered(matchId:string,generation:number){
  const row=this.rows.get(matchId);if(!row||row.status!=='ACTIVE')throw new Error('recovery conflict');
  this.rows.set(matchId,{...row,generation});
 }
 async create(record:CoopAllocationRecord){
  if([...this.rows.values()].some(row=>row.roomId===record.roomId))throw Object.assign(new Error('duplicate'),{code:'23505'});
  this.rows.set(record.matchId,record);
 }
 async activate(matchId:string,generation:number){
  const row=this.rows.get(matchId);if(!row||row.status!=='STARTING')throw new Error('activation conflict');
  this.rows.set(matchId,{...row,status:'ACTIVE',generation});
 }
 async fail(matchId:string){const row=this.rows.get(matchId);if(row)this.rows.set(matchId,{...row,status:'FAILED'});}
 async close(matchId:string){const row=this.rows.get(matchId);if(row)this.rows.set(matchId,{...row,status:'CLOSED'});}
}
class FakeAdmission implements CoopAdmissionPort{
 configured:Record<string,unknown>[]=[];heartbeats=0;denied=new Set<string>();
 async configure(scope:Record<string,unknown>,expected:number,enabled:boolean,capacity:number){
  this.configured.push({scope,expected,enabled,capacity});return expected+1;
 }
 async allocate(credential:string,_scope:Record<string,unknown>){
  const account=this.denied.has(credential)?'99999999-9999-4999-8999-999999999999':credential.replace('cred-','');
  return {accountId:account,sessionId:account,generation:1,validUntilMs:Date.now()+5000};
 }
 async heartbeat(){this.heartbeats+=1;}
}
class FakeIssuer implements CoopIssuerPort{
 issued:{credential:string;scope:Record<string,unknown>}[]=[];
 async issue(credential:string,scope:Record<string,unknown>){
  this.issued.push({credential,scope});
  return {ticket:'ticket-'+this.issued.length+'.payload.signature',expiresAt:'2026-11-25T20:00:00.000Z'};
 }
}
class FakeRuntime implements CoopRuntimePort{
 requests:CoopRuntimeRequest[]=[];stops=vi.fn(async()=>{});
 fail=false;
 async start(request:CoopRuntimeRequest){
  if(this.fail)throw new Error('synthetic runtime failure');
  this.requests.push(request);
  return {port:49152,stop:this.stops,onExit:()=>{}} satisfies CoopRuntimeHandle;
 }
}
const validator={validate:vi.fn(async(_ruleset:'arena8-coop-pve',_bundle:Record<string,unknown>)=>({digest:DIGEST,engineCapability:'arena8-coop-v1',contentHash:CONTENT}))};

function fixture(overrides:{store?:MemoryStore;admission?:FakeAdmission;runtime?:FakeRuntime;loadBundle?:(record:{configVersion:number;configDigest:string})=>Promise<Record<string,unknown>|undefined>}={}){
 const store=overrides.store??new MemoryStore(),admission=overrides.admission??new FakeAdmission();
 const runtime=overrides.runtime??new FakeRuntime(),issuer=new FakeIssuer();
 const provisioner=new CoopMatchProvisioner({
  store,admission,runtime,issuer,validator,httpsOrigin:ORIGIN,
  loadBundle:overrides.loadBundle??(async()=>bundle),
  id:(()=>{let value=0;return()=>'33333333-3333-4333-8333-'+String(++value).padStart(12,'0');})(),
 });
 return {provisioner,store,admission,runtime,issuer};
}
const startInput={roomId:ROOM,bossId:bundle.boss.id,configVersion:1,configDigest:DIGEST,bundle,seats:SEATS};

describe('cooperative match provisioner',()=>{
 it('starts one four-seat match from the published bundle and reuses it',async()=>{
  const {provisioner,store,admission,runtime}=fixture();
  const first=await provisioner.start(startInput);
  expect(first.contentHash).toBe(CONTENT);
  expect(validator.validate).toHaveBeenCalledWith('arena8-coop-pve',bundle);
  expect(admission.configured[0]).toMatchObject({expected:0,enabled:true,capacity:4});
  expect(runtime.requests).toHaveLength(1);
  expect(runtime.requests[0]!.seats).toHaveLength(4);
  expect(runtime.requests[0]!.bundle).toBe(bundle);
  const stored=store.rows.get(first.matchId)!;
  expect(stored).toMatchObject({status:'ACTIVE',generation:1,contentHash:CONTENT,configDigest:DIGEST});
  const second=await provisioner.start(startInput);
  expect(second).toEqual(first);
  expect(runtime.requests).toHaveLength(1);
 });
 it('fails closed on an invalid bundle, a digest mismatch or a malformed roster',async()=>{
  const {provisioner,store}=fixture();
  await expect(provisioner.start({...startInput,configDigest:'cc'.repeat(32)})).rejects.toMatchObject({status:503});
  await expect(provisioner.start({...startInput,seats:SEATS.slice(0,3) as unknown as readonly CoopSeat[]})).rejects.toBeInstanceOf(DomainError);
  const repeated=SEATS.map((seat,index)=>({...seat,ownedPetInstanceId:SEATS[0].ownedPetInstanceId}));
  await expect(provisioner.start({...startInput,seats:repeated})).rejects.toBeInstanceOf(DomainError);
  expect(store.rows.size).toBe(0);
 });
 it('issues a scoped admission ticket for a seated account only',async()=>{
  const {provisioner,issuer}=fixture();
  const started=await provisioner.start(startInput);
  const view=await provisioner.admission(ROOM,'cred-'+ACCOUNTS[2]);
  expect(view).toMatchObject({roomId:ROOM,bossId:bundle.boss.id,matchId:started.matchId,seat:2,contentHash:CONTENT,httpsOrigin:ORIGIN});
  expect(view.wssUrl).toBe('wss://127.0.0.1:4443/rt/v1');
  expect(issuer.issued[0]!.scope).toMatchObject({worldId:started.worldId,runtimeBootId:started.bootId,contentHash:CONTENT});
  await expect(provisioner.admission(ROOM,'cred-99999999-9999-4999-8999-999999999999')).rejects.toMatchObject({status:403});
  await expect(provisioner.admission('44444444-4444-4444-8444-444444444444','cred-'+ACCOUNTS[0])).rejects.toMatchObject({status:409});
 });
 it('records a failed allocation when the runtime cannot start',async()=>{
  const {provisioner,store,admission,runtime}=fixture();
  runtime.fail=true;
  await expect(provisioner.start(startInput)).rejects.toMatchObject({status:503});
  expect([...store.rows.values()][0]).toMatchObject({status:'FAILED'});
  expect(admission.configured.at(-1)).toMatchObject({enabled:false,capacity:0});
  await expect(provisioner.start(startInput)).rejects.toBeInstanceOf(DomainError);
 });
 it('refuses admission after an API restart until recovery is implemented',async()=>{
  const store=new MemoryStore();
  const first=fixture({store});
  await first.provisioner.start(startInput);
  const restarted=fixture({store,admission:new FakeAdmission()});
  await expect(restarted.provisioner.admission(ROOM,'cred-'+ACCOUNTS[0])).rejects.toMatchObject({status:503});
  await expect(restarted.provisioner.start(startInput)).rejects.toMatchObject({status:503});
 });
 it('recovers an active allocation with the same match, world, boot and configuration',async()=>{
  const store=new MemoryStore();
  const match='66666666-6666-4666-8666-666666666666',boot='77777777-7777-4777-8777-777777777777';
  store.rows.set(match,{matchId:match,roomId:ROOM,bossId:bundle.boss.id,worldId:'native:coop-'+match,bootId:boot,configVersion:1,configDigest:DIGEST,contentHash:CONTENT,seats:SEATS,status:'ACTIVE',generation:1});
  const {provisioner,admission,runtime}=fixture({store});
  await expect(provisioner.recover()).resolves.toEqual({recovered:1,failed:0});
  expect(runtime.requests).toHaveLength(1);
  expect(runtime.requests[0]).toMatchObject({matchId:match,worldId:'native:coop-'+match,bootId:boot,configDigest:DIGEST});
  expect(admission.configured[0]).toMatchObject({expected:1,enabled:true,capacity:4});
  expect(store.rows.get(match)!.generation).toBe(2);
  const view=await provisioner.admission(ROOM,'cred-'+ACCOUNTS[1]);
  expect(view).toMatchObject({matchId:match,seat:1,contentHash:CONTENT});
 });
 it('leaves an unresolvable allocation active but closed to admission',async()=>{
  const store=new MemoryStore();
  const match='88888888-8888-4888-8888-888888888888';
  store.rows.set(match,{matchId:match,roomId:ROOM,bossId:bundle.boss.id,worldId:'native:coop-'+match,bootId:'99999999-9999-4999-8999-999999999999',configVersion:1,configDigest:DIGEST,contentHash:CONTENT,seats:SEATS,status:'ACTIVE',generation:1});
  const {provisioner}=fixture({store,loadBundle:async()=>undefined});
  await expect(provisioner.recover()).resolves.toEqual({recovered:0,failed:1});
  expect(store.rows.get(match)!.status).toBe('ACTIVE');
  await expect(provisioner.admission(ROOM,'cred-'+ACCOUNTS[0])).rejects.toMatchObject({status:503});
 });
 it('reconciles a STARTING allocation as failed on startup',async()=>{
  const store=new MemoryStore();
  const match='77777777-7777-4777-8777-777777777777';
  store.rows.set(match,{matchId:match,roomId:ROOM,bossId:bundle.boss.id,worldId:'native:coop-'+match,bootId:'99999999-9999-4999-8999-999999999999',configVersion:1,configDigest:DIGEST,contentHash:CONTENT,seats:SEATS,status:'STARTING',generation:0});
  const {provisioner}=fixture({store});
  await expect(provisioner.recover()).resolves.toEqual({recovered:0,failed:1});
  expect(store.rows.get(match)!.status).toBe('FAILED');
 });
 it('stops the runtime but leaves the allocation active for recovery',async()=>{
  const {provisioner,runtime,admission,store}=fixture();
  const started=await provisioner.start(startInput);
  await provisioner.close();
  expect(runtime.stops).toHaveBeenCalledOnce();
  expect(admission.configured.at(-1)).toMatchObject({enabled:false,capacity:0});
  expect(store.rows.get(started.matchId)).toMatchObject({status:'ACTIVE'});
 });
});
