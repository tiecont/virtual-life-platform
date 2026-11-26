import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Pool} from 'pg';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {installGameplayConfig} from '../../apps/platform-api/src/features/gameplay/modules/config/application/seed-gameplay-config';
import {OperatorService} from '../../apps/platform-api/src/features/identity/modules/operators/application/operator-service';
import {totp} from '../../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto';
import type {GameplayBundleValidator} from '../../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-validator';

const origin='http://127.0.0.1:3300',adminOrigin='http://127.0.0.1:3301',ruleset='arena8-coop-pve';
const bundle=(requiredRoomPoints:number)=>({schemaVersion:1,engineCapability:'arena8-coop-v1',configId:'arena8-coop-v1',boss:{id:'cinder-terraces-warden',maxHp:12_000,requiredRoomPoints}});
const engine:GameplayBundleValidator={async validate(_ruleset,input){
 return {digest:createHash('sha256').update(JSON.stringify(input)).digest('hex'),engineCapability:'arena8-coop-v1',contentHash:createHash('sha256').update('content:'+JSON.stringify(input)).digest('hex')};
}};
const operatorPassword='coop-fixture-operator-password',operatorFactor='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const operatorNow=Date.now();
type Auth={cookie:string;csrf:string;accountId:string};
let admin:Pool,pool:Pool,server:Awaited<ReturnType<typeof createApp>>,schema:string,address=1;
beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test database required');
 admin=new Pool({connectionString:url.toString()});
 schema='coop_rooms_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA "${schema}"`);
 url.searchParams.set('options','-c search_path='+schema);
 pool=new Pool({connectionString:url.toString()});
 await migrate(pool);
 await installGameplayConfig(pool,ruleset,bundle(5_000),engine,'system:test-installation');
 const authKey=randomBytes(32).toString('hex');
 await new OperatorService(pool,authKey,()=>operatorNow-60_000).bootstrap({password:operatorPassword,totpSecret:operatorFactor,code:totp(operatorFactor,operatorNow-60_000)});
 const config=readConfig({ADMIN_ORIGIN:adminOrigin,OPERATOR_AUTH_KEY:authKey,NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'coop-rooms-test-secret-'.repeat(2),LOCAL_COOP_ROOMS:'1'});
 server=await createApp(config,pool,false,{now:()=>operatorNow,gameplayConfig:{validator:engine}});
});
afterAll(async()=>{await server?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}});
async function guest(name:string):Promise<Auth>{
 const response=await server.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.210.1.'+address++,headers:{origin},payload:{requestId:randomUUID(),displayName:name,avatarKey:'mint'}});
 expect(response.statusCode).toBe(201);
 const body=response.json() as {csrfToken:string;profile:{id:string}};
 return {cookie:String(response.headers['set-cookie']).split(';')[0],csrf:body.csrfToken,accountId:body.profile.id};
}
async function grantPet(auth:Auth,petId:string,level=1){
 await pool.query('INSERT INTO pet_wave_one_players(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING',[auth.accountId]);
 await pool.query('INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,$2,$3,0,$4)',[auth.accountId,petId,level,'starter']);
}
async function grantPoints(auth:Auth,points:number){
 await pool.query('INSERT INTO coop_achievement_ledger(account_id,points,source,source_ref) VALUES($1,$2,$3,$4)',[auth.accountId,points,'admin_grant',randomUUID()]);
}
const post=(auth:Auth,url:string,body:Record<string,unknown>,csrf=auth.csrf)=>server.http.inject({method:'POST',url,remoteAddress:'127.210.2.1',headers:{origin,cookie:auth.cookie,'x-csrf-token':csrf},payload:body});
const get=(auth:Auth,url:string)=>server.http.inject({url,remoteAddress:'127.210.2.1',headers:{origin,cookie:auth.cookie}});
async function eligibleHost(points=5_000){
 const auth=await guest('Coop host'),pet='icarus';
 await grantPet(auth,pet);await grantPoints(auth,points);
 return {auth,pet};
}
async function createRoom(auth:Auth,petId='icarus',requestId=randomUUID()){
 const response=await post(auth,'/v1/coop/rooms',{requestId,petId});
 return {response,requestId};
}

describe('cooperative rooms and achievement eligibility',()=>{
 it('reports eligibility from the published Boss threshold',async()=>{
  const auth=await guest('Coop eligibility');
  const before=await get(auth,'/v1/coop/eligibility');
  expect(before.statusCode).toBe(200);
  expect(before.json()).toMatchObject({ruleset:'arena8-coop-pve',bossId:'cinder-terraces-warden',points:0,requiredPoints:5_000,eligible:false});
  await grantPoints(auth,4_999);
  expect((await get(auth,'/v1/coop/eligibility')).json()).toMatchObject({points:4_999,eligible:false});
  await grantPoints(auth,1);
  expect((await get(auth,'/v1/coop/eligibility')).json()).toMatchObject({points:5_000,eligible:true});
 });
 it('rejects room creation one point below the published threshold and accepts equality',async()=>{
  const poor=await guest('Coop near miss'),pet='icarus';
  await grantPet(poor,pet);await grantPoints(poor,4_999);
  const denied=await post(poor,'/v1/coop/rooms',{requestId:randomUUID(),petId:pet});
  expect(denied.statusCode).toBe(403);
  await grantPoints(poor,1);
  const {response}=await createRoom(poor);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ruleset,bossId:'cinder-terraces-warden',requiredPoints:5_000,status:'OPEN',you:{seat:0,isHost:true}});
  expect(response.json().seats).toEqual([{seat:0,petId:pet,petLevel:1,ready:false,you:true,ownedPetInstanceId:expect.any(String)}]);
  expect((await pool.query('SELECT count(*)::int AS n FROM coop_rooms WHERE host_account_id=$1',[poor.accountId])).rows[0].n).toBe(1);
 });
 it('runs create, join, select, ready and start for four accounts and then freezes the roster',async()=>{
  const host=await eligibleHost(),room=(await createRoom(host.auth,host.pet)).response.json();
  const pets=['coralline','volt','terran'];
  const members:Awaited<ReturnType<typeof guest>>[]=[];
  for(const [index,name] of ['Coop two','Coop three','Coop four'].entries()){
   const member=await guest(name);await grantPet(member,pets[index]!);
   expect((await post(member,'/v1/coop/rooms/'+room.roomId+'/join',{requestId:randomUUID()})).statusCode).toBe(200);
   expect((await post(member,'/v1/coop/rooms/'+room.roomId+'/pet',{requestId:randomUUID(),petId:pets[index]!})).statusCode).toBe(200);
   members.push(member);
  }
  const early=(await post(host.auth,'/v1/coop/rooms/'+room.roomId+'/start',{requestId:randomUUID()}));
  expect(early.statusCode).toBe(409);
  expect((await post(host.auth,'/v1/coop/rooms/'+room.roomId+'/ready',{requestId:randomUUID(),ready:true})).statusCode).toBe(200);
  for(const member of members)expect((await post(member,'/v1/coop/rooms/'+room.roomId+'/ready',{requestId:randomUUID(),ready:true})).statusCode).toBe(200);
  expect((await post(members[0]!,'/v1/coop/rooms/'+room.roomId+'/start',{requestId:randomUUID()})).statusCode).toBe(403);
  const started=await post(host.auth,'/v1/coop/rooms/'+room.roomId+'/start',{requestId:randomUUID()});
  expect(started.statusCode).toBe(200);
  expect(started.json()).toMatchObject({status:'LOCKED',canStart:false,canJoin:false});
  expect(started.json().seats).toHaveLength(4);
  expect(started.json().seats.every((seat:{ready:boolean})=>seat.ready)).toBe(true);
  expect((await post(members[0]!,'/v1/coop/rooms/'+room.roomId+'/leave',{requestId:randomUUID()})).statusCode).toBe(409);
  await expect(pool.query('UPDATE coop_room_seats SET ready=true WHERE room_id=$1',[room.roomId])).rejects.toThrow();
  expect((await get(members[1]!,'/v1/coop/rooms/'+room.roomId)).statusCode).toBe(200);
 });
 it('replays an identical request idempotently and rejects a reused key with different input',async()=>{
  const host=await eligibleHost(),requestId=randomUUID();
  const first=await post(host.auth,'/v1/coop/rooms',{requestId,petId:host.pet});
  expect(first.statusCode).toBe(200);
  const replay=await post(host.auth,'/v1/coop/rooms',{requestId,petId:host.pet});
  expect(replay.statusCode).toBe(200);expect(replay.json()).toEqual(first.json());
  const changed=await post(host.auth,'/v1/coop/rooms',{requestId,petId:'coralline'});
  expect(changed.statusCode).toBe(409);
  expect((await pool.query('SELECT count(*)::int AS n FROM coop_rooms WHERE host_account_id=$1',[host.auth.accountId])).rows[0].n).toBe(1);
  const roomId=first.json().roomId as string;
  expect((await pool.query('SELECT count(*)::int AS n FROM coop_room_events WHERE room_id=$1 AND action=$2',[roomId,'create'])).rows[0].n).toBe(1);
 });
 it('keeps a room on its pinned threshold when a new version publishes',async()=>{
  const host=await eligibleHost();
  const room=(await createRoom(host.auth)).response.json();
  const changedBundle=bundle(6_000);
  await expect(installGameplayConfig(pool,ruleset,changedBundle,engine,'system:test-installation'))
   .resolves.toMatchObject({created:false,version:1});
  const login=await server.http.inject({method:'POST',url:'/v1/operator/login',headers:{origin:adminOrigin},payload:{password:operatorPassword,code:totp(operatorFactor,operatorNow)}});
  expect(login.statusCode).toBe(200);
  const headers={origin:adminOrigin,cookie:String(login.headers['set-cookie']).split(';')[0],'x-csrf-token':login.json().csrfToken};
  const operatorPost=async(action:string,payload:Record<string,unknown>)=>{
   const response=await server.http.inject({method:'POST',url:'/v1/operator/gameplay-config-'+action,headers,payload:{...payload,requestId:randomUUID(),ruleset}});
   expect(response.statusCode).toBe(200);
   return response.json();
  };
  const draft=await operatorPost('draft',{parentVersion:1,bundle:changedBundle});
  const checked=await operatorPost('validate',{version:draft.version,expectedRevision:draft.revision});
  await operatorPost('publish',{version:checked.version,expectedRevision:checked.revision,expectedActiveRevision:1});
  expect((await get(host.auth,'/v1/coop/eligibility')).json()).toMatchObject({requiredPoints:6_000,points:5_000,eligible:false});
  expect((await post(host.auth,'/v1/coop/rooms',{requestId:randomUUID(),petId:'icarus'})).statusCode).toBe(403);
  const pinned=await get(host.auth,'/v1/coop/rooms/'+room.roomId);
  expect(pinned.statusCode).toBe(200);expect(pinned.json().requiredPoints).toBe(5_000);
 });
 it('enforces authentication, CSRF, origin and closed-room visibility',async()=>{
  const host=await eligibleHost(6_000),member=await guest('Coop outsider');
  expect((await server.http.inject({url:'/v1/coop/eligibility'})).statusCode).toBe(401);
  const room=(await createRoom(host.auth)).response.json();
  expect((await post(host.auth,'/v1/coop/rooms',{requestId:randomUUID(),petId:'icarus'},'0'.repeat(64))).statusCode).toBe(403);
  expect((await server.http.inject({method:'POST',url:'/v1/coop/rooms',headers:{origin:'http://127.0.0.1:3399',cookie:host.auth.cookie,'x-csrf-token':host.auth.csrf},payload:{requestId:randomUUID()}})).statusCode).toBe(403);
  expect((await post(host.auth,'/v1/coop/rooms',{requestId:randomUUID(),petId:'icarus',sql:'SELECT 1'})).statusCode).toBe(422);
  expect((await post(host.auth,'/v1/coop/rooms/'+room.roomId+'/close',{requestId:randomUUID()})).statusCode).toBe(200);
  expect((await get(member,'/v1/coop/rooms/'+room.roomId)).statusCode).toBe(404);
  expect((await post(member,'/v1/coop/rooms/'+room.roomId+'/join',{requestId:randomUUID()})).statusCode).toBe(409);
 });
});
