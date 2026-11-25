import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Pool} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {installGameplayConfig} from '../../apps/platform-api/src/features/gameplay/modules/config/application/seed-gameplay-config';
import type {GameplayBundleValidator} from '../../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-validator';
import {CoopMatchProvisioner,type CoopRuntimeRequest} from '../../apps/platform-api/src/features/coop/modules/match/application/provisioner';
import {CoopMatchStore} from '../../apps/platform-api/src/features/coop/modules/match/infrastructure/match-store';

const origin='http://127.0.0.1:3300',ruleset='arena8-coop-pve',HTTPS='https://127.0.0.1:4443';
const bundle={schemaVersion:1,engineCapability:'arena8-coop-v1',configId:'arena8-coop-v1',boss:{id:'cinder-terraces-warden',maxHp:12_000,requiredRoomPoints:5_000}};
const digest=createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
const contentHash=createHash('sha256').update('content:'+JSON.stringify(bundle)).digest('hex');
const engine:GameplayBundleValidator={async validate(){return {digest,engineCapability:'arena8-coop-v1',contentHash};}};
type Auth={cookie:string;csrf:string;accountId:string};
let admin:Pool,pool:Pool,server:Awaited<ReturnType<typeof createApp>>,schema:string,address=1;
const runtime={requests:[] as CoopRuntimeRequest[],start:async(request:CoopRuntimeRequest)=>{runtime.requests.push(request);return {port:49152,stop:async()=>{},onExit:()=>{}};}};
const issued:{credential:string;scope:Record<string,unknown>}[]=[];
const admission={
 configured:[] as Record<string,unknown>[],
 async configure(scope:Record<string,unknown>,expected:number,enabled:boolean,capacity:number){this.configured.push({scope,expected,enabled,capacity});return expected+1;},
 async allocate(credential:string){
  const context=await server.identity.authenticate(credential);
  return {accountId:context.accountId,sessionId:context.sessionId,generation:1,validUntilMs:Date.now()+5000};
 },
 async heartbeat(){},
};
const issuer={async issue(credential:string,scope:Record<string,unknown>){
 issued.push({credential,scope});
 return {ticket:'ticket-'+issued.length+'.payload.signature',expiresAt:new Date(Date.now()+60000).toISOString()};
}};
let provisioner:CoopMatchProvisioner;

beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test database required');
 admin=new Pool({connectionString:url.toString()});
 schema='coop_native_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA "${schema}"`);
 url.searchParams.set('options','-c search_path='+schema);
 pool=new Pool({connectionString:url.toString()});
 await migrate(pool);
 await installGameplayConfig(pool,ruleset,bundle,engine,'system:test-installation');
 provisioner=new CoopMatchProvisioner({
  store:new CoopMatchStore(pool),
  admission:admission as never,
  issuer:issuer as never,
  runtime:runtime as never,
  validator:engine,
  httpsOrigin:HTTPS,
  loadBundle:async()=>bundle,
 });
 const config=readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'coop-native-test-secret-'.repeat(2),LOCAL_COOP_ROOMS:'1'});
 server=await createApp(config,pool,false,{coopProvisioner:provisioner});
});
afterAll(async()=>{await server?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}});
async function guest(name:string):Promise<Auth>{
 const response=await server.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.211.1.'+address++,headers:{origin},payload:{requestId:randomUUID(),displayName:name,avatarKey:'mint'}});
 expect(response.statusCode).toBe(201);
 const body=response.json() as {csrfToken:string;profile:{id:string}};
 return {cookie:String(response.headers['set-cookie']).split(';')[0],csrf:body.csrfToken,accountId:body.profile.id};
}
async function readyParticipant(name:string,petId:string,points=0){
 const auth=await guest(name);
 await pool.query('INSERT INTO pet_wave_one_players(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING',[auth.accountId]);
 await pool.query('INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,$2,1,0,$3)',[auth.accountId,petId,'starter']);
 if(points>0)await pool.query('INSERT INTO coop_achievement_ledger(account_id,points,source,source_ref) VALUES($1,$2,$3,$4)',[auth.accountId,points,'admin_grant',randomUUID()]);
 return auth;
}
const post=(auth:Auth,url:string,body:Record<string,unknown>)=>server.http.inject({method:'POST',url,remoteAddress:'127.211.2.1',headers:{origin,cookie:auth.cookie,'x-csrf-token':auth.csrf},payload:body});

describe('four-account cooperative native allocation',()=>{
 it('provisions one match from the room roster and issues a scoped ticket per seat',async()=>{
  const pets=['icarus','coralline','volt','terran'];
  const host=await readyParticipant('Native host',pets[0]!,5_000);
  const room=(await post(host,'/v1/coop/rooms',{requestId:randomUUID(),petId:pets[0]})).json();
  const members=[host];
  for(const [index,pet] of pets.slice(1).entries()){
   const member=await readyParticipant('Native seat '+(index+2),pet);
   expect((await post(member,'/v1/coop/rooms/'+room.roomId+'/join',{requestId:randomUUID()})).statusCode).toBe(200);
   expect((await post(member,'/v1/coop/rooms/'+room.roomId+'/pet',{requestId:randomUUID(),petId:pet})).statusCode).toBe(200);
   expect((await post(member,'/v1/coop/rooms/'+room.roomId+'/ready',{requestId:randomUUID(),ready:true})).statusCode).toBe(200);
   members.push(member);
  }
  expect((await post(host,'/v1/coop/rooms/'+room.roomId+'/ready',{requestId:randomUUID(),ready:true})).statusCode).toBe(200);
  const started=await post(host,'/v1/coop/rooms/'+room.roomId+'/start',{requestId:randomUUID()});
  expect(started.statusCode).toBe(200);
  expect(started.json()).toMatchObject({status:'STARTED',canStart:false,canJoin:false});
  expect(runtime.requests).toHaveLength(1);
  expect(runtime.requests[0]!.seats.map(seat=>seat.account)).toEqual(members.map(member=>member.accountId));
  expect(admission.configured[0]).toMatchObject({enabled:true,capacity:4});
  const allocation=(await pool.query('SELECT status,generation,jsonb_array_length(seats) AS seats FROM coop_allocations WHERE room_id=$1',[room.roomId])).rows[0];
  expect(allocation).toMatchObject({status:'ACTIVE',seats:4});

  const tickets=new Set<string>();
  for(const [index,member] of members.entries()){
   const response=await post(member,'/v1/coop/rooms/'+room.roomId+'/admission',{});
   expect(response.statusCode).toBe(200);
   expect(response.json()).toMatchObject({roomId:room.roomId,seat:index,contentHash,httpsOrigin:HTTPS,wssUrl:'wss://127.0.0.1:4443/rt/v1'});
   tickets.add(response.json().ticket);
  }
  expect(tickets.size).toBe(4);
  expect(issued[0]!.scope).toMatchObject({contentHash,protocolVersion:1});

  const outsider=await guest('Native outsider');
  expect((await post(outsider,'/v1/coop/rooms/'+room.roomId+'/admission',{})).statusCode).toBe(403);
  expect((await server.http.inject({method:'POST',url:'/v1/coop/rooms/'+room.roomId+'/admission',headers:{origin},payload:{}})).statusCode).toBe(401);

  const replay=await post(host,'/v1/coop/rooms/'+room.roomId+'/start',{requestId:randomUUID()});
  expect(replay.statusCode).toBe(200);
  expect(replay.json()).toMatchObject({status:'STARTED'});
  expect(runtime.requests).toHaveLength(1);
  expect((await pool.query('SELECT count(*)::int AS n FROM coop_allocations')).rows[0].n).toBe(1);
 });
});
