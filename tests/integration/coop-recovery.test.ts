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
import {CoopRoomStore} from '../../apps/platform-api/src/features/coop/modules/rooms/infrastructure/store';

const origin='http://127.0.0.1:3300',ruleset='arena8-coop-pve',HTTPS='https://127.0.0.1:4443';
const bundle={schemaVersion:1,engineCapability:'arena8-coop-v1',configId:'arena8-coop-v1',boss:{id:'cinder-terraces-warden',maxHp:12_000,requiredRoomPoints:5_000}};
const digest=createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
const contentHash=createHash('sha256').update('content:'+JSON.stringify(bundle)).digest('hex');
const engine:GameplayBundleValidator={async validate(){return {digest,engineCapability:'arena8-coop-v1',contentHash};}};
type Auth={cookie:string;csrf:string;accountId:string;petId:string};
let admin:Pool,pool:Pool,app1:Awaited<ReturnType<typeof createApp>>,app2:Awaited<ReturnType<typeof createApp>>,schema:string,address=1,databaseUrl='';
const runtime={requests:[] as CoopRuntimeRequest[],start:async(request:CoopRuntimeRequest)=>{runtime.requests.push(request);return {port:49152,stop:async()=>{},onExit:()=>{}};}};
const admission={configured:[] as Record<string,unknown>[],async configure(scope:Record<string,unknown>,expected:number,enabled:boolean,capacity:number){this.configured.push({scope,expected,enabled,capacity});return expected+1;},async allocate(credential:string){const context=await app2.identity.authenticate(credential);return {accountId:context.accountId,sessionId:context.sessionId,generation:2,validUntilMs:Date.now()+5000};},async heartbeat(){}};
const issuer={async issue(){return {ticket:'recovered-ticket.payload.signature',expiresAt:new Date(Date.now()+60000).toISOString()};}};
let provisioner:CoopMatchProvisioner;

beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test database required');
 admin=new Pool({connectionString:url.toString()});
 schema='coop_recovery_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA "${schema}"`);
 url.searchParams.set('options','-c search_path='+schema);
 pool=new Pool({connectionString:url.toString()});
 await migrate(pool);
 await installGameplayConfig(pool,ruleset,bundle,engine,'system:test-installation');
 databaseUrl=url.toString();
 const config=readConfig({NODE_ENV:'test',DATABASE_URL:databaseUrl,SESSION_SECRET:'coop-recovery-test-secret-'.repeat(2),LOCAL_COOP_ROOMS:'1'});
 app1=await createApp(config,pool,false,{});
 provisioner=new CoopMatchProvisioner({
  store:new CoopMatchStore(pool),
  admission:admission as never,issuer:issuer as never,runtime:runtime as never,
  validator:engine,httpsOrigin:HTTPS,
  loadBundle:async record=>new CoopRoomStore().pinnedBundle(pool,record.configVersion,record.configDigest),
 });
 app2=await createApp(config,pool,false,{coopProvisioner:provisioner});
});
afterAll(async()=>{await app1?.app.close();await app2?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}});
async function guest(name:string,petId:string):Promise<Auth>{
 const response=await app1.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.212.1.'+address++,headers:{origin},payload:{requestId:randomUUID(),displayName:name,avatarKey:'mint'}});
 expect(response.statusCode).toBe(201);
 const body=response.json() as {csrfToken:string;profile:{id:string}};
 const accountId=body.profile.id;
 await pool.query('INSERT INTO pet_wave_one_players(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
 await pool.query('INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,$2,1,0,$3)',[accountId,petId,'starter']);
 return {cookie:String(response.headers['set-cookie']).split(';')[0],csrf:body.csrfToken,accountId,petId};
}
const post=(app:Awaited<ReturnType<typeof createApp>>,auth:Auth,url:string,body:Record<string,unknown>)=>app.http.inject({method:'POST',url,remoteAddress:'127.212.2.1',headers:{origin,cookie:auth.cookie,'x-csrf-token':auth.csrf},payload:body});

describe('cooperative allocation recovery',()=>{
 it('restores an active match with the original world, boot, seats and configuration binding',async()=>{
  const pets=['icarus','coralline','volt','terran'];
  const members=[await guest('Recovery host',pets[0]!),await guest('Recovery two',pets[1]!),await guest('Recovery three',pets[2]!),await guest('Recovery four',pets[3]!)];
  await pool.query('INSERT INTO coop_achievement_ledger(account_id,points,source,source_ref) VALUES($1,5000,$2,$3)',[members[0]!.accountId,'admin_grant',randomUUID()]);
  const roomId=randomUUID(),matchId=randomUUID(),bootId=randomUUID(),worldId='native:coop-'+matchId;
  await pool.query("INSERT INTO coop_rooms(id,ruleset,boss_id,host_account_id,config_version,config_digest,required_points,status,revision) VALUES($1,'arena8-coop-pve','cinder-terraces-warden',$2,1,$3,5000,'OPEN',3)",[roomId,members[0]!.accountId,digest]);
  for(const [index,member] of members.entries())
   await pool.query('INSERT INTO coop_room_seats(room_id,seat,account_id,pet_id,pet_level,ready) VALUES($1,$2,$3,$4,1,true)',[roomId,index,member.accountId,member.petId]);
  await pool.query("UPDATE coop_rooms SET status='LOCKED',revision=revision+1 WHERE id=$1",[roomId]);
  await pool.query("UPDATE coop_rooms SET status='STARTED',revision=revision+1 WHERE id=$1",[roomId]);
  const seats=members.map(member=>({account:member.accountId,petId:member.petId,petLevel:1,artifactPowerPm:1000}));
  await pool.query("INSERT INTO coop_allocations(match_id,room_id,ruleset,config_version,config_digest,content_hash,world_id,boot_id,generation,seats,status) VALUES($1,$2,'arena8-coop-pve',1,$3,$4,$5,$6,1,$7::jsonb,'ACTIVE')",[matchId,roomId,digest,contentHash,worldId,bootId,JSON.stringify(seats)]);

  // Recreate the API exactly as a process restart would, with the durable
  // allocation already ACTIVE. Startup recovery must reuse the same identity.
  await app2.app.close();
  app2=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:databaseUrl,SESSION_SECRET:'coop-recovery-test-secret-'.repeat(2),LOCAL_COOP_ROOMS:'1'}),pool,false,{coopProvisioner:provisioner});
  expect(runtime.requests).toHaveLength(1);
  expect(runtime.requests[0]).toMatchObject({matchId,worldId,bootId,configDigest:digest});
  expect(runtime.requests[0]!.seats).toHaveLength(4);
  expect(admission.configured[0]).toMatchObject({expected:1,enabled:true,capacity:4});
  const stored=(await pool.query('SELECT status,generation FROM coop_allocations WHERE match_id=$1',[matchId])).rows[0];
  expect(stored).toMatchObject({status:'ACTIVE',generation:2});

  const ticket=await post(app2,members[2]!,'/v1/coop/rooms/'+roomId+'/admission',{});
  expect(ticket.statusCode).toBe(200);
  expect(ticket.json()).toMatchObject({roomId,matchId,seat:2,contentHash});
  const outsider=await guest('Recovery outsider','icarus');
  expect((await post(app2,outsider,'/v1/coop/rooms/'+roomId+'/admission',{})).statusCode).toBe(403);
 });
});
