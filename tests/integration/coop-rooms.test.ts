import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Pool} from 'pg';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {CoopEncounterCatalogSchema,GameplayConfigVersionViewSchema} from '@aetheria/contracts';
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
let operatorHeaders:Record<string,string>;
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
 const login=await server.http.inject({method:'POST',url:'/v1/operator/login',headers:{origin:adminOrigin},payload:{password:operatorPassword,code:totp(operatorFactor,operatorNow)}});
 expect(login.statusCode).toBe(200);
 operatorHeaders={origin:adminOrigin,cookie:String(login.headers['set-cookie']).split(';')[0]!,'x-csrf-token':login.json().csrfToken};
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
const readJson=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
type TestBoss={mapId:string;id:string;name:string;requiredMapClear?:string};
async function eligibleHost(points=5_000){
 const auth=await guest('Coop host'),pet='icarus';
 await grantPet(auth,pet);await grantPoints(auth,points);
 return {auth,pet};
}
async function createRoom(auth:Auth,petId='icarus',requestId=randomUUID()){
 const response=await post(auth,'/v1/coop/rooms',{requestId,petId});
 return {response,requestId};
}
async function publish(bundle:Record<string,unknown>){
 const overview=await server.http.inject({url:'/v1/operator/gameplay-config?ruleset='+ruleset,headers:operatorHeaders});
 expect(overview.statusCode).toBe(200);
 const {active}=overview.json() as {active:{version:number;revision:number}};
 const operatorPost=async(action:string,payload:Record<string,unknown>)=>{
  const response=await server.http.inject({method:'POST',url:'/v1/operator/gameplay-config-'+action,headers:operatorHeaders,payload:{...payload,requestId:randomUUID(),ruleset}});
  expect(response.statusCode).toBe(200);
  return response.json();
 };
 const draft=await operatorPost('draft',{parentVersion:active.version,bundle});
 const checked=await operatorPost('validate',{version:draft.version,expectedRevision:draft.revision});
 await operatorPost('publish',{version:checked.version,expectedRevision:checked.revision,expectedActiveRevision:active.revision});
 return checked.version as number;
}

describe('cooperative rooms and achievement eligibility',()=>{
 it('reports eligibility from the published Boss threshold',async()=>{
  const auth=await guest('Coop eligibility');
  const before=await get(auth,'/v1/coop/eligibility');
  expect(before.statusCode).toBe(200);
  expect(before.json()).toEqual({ruleset,bossId:'cinder-terraces-warden',points:0,requiredPoints:5_000,eligible:false});
  expect((await get(auth,'/v1/coop/encounters')).json()).toEqual({ruleset,configVersion:1,points:0,encounters:[]});
  expect((await get(auth,'/v1/coop/eligibility?bossId=cinder-terraces-warden')).json()).toEqual(before.json());
  expect((await get(auth,'/v1/coop/eligibility?unknown=1')).statusCode).toBe(422);
  await grantPoints(auth,4_999);
  expect((await get(auth,'/v1/coop/eligibility')).json()).toMatchObject({points:4_999,eligible:false});
  await grantPoints(auth,1);
  expect((await get(auth,'/v1/coop/eligibility')).json()).toMatchObject({points:5_000,eligible:true});
  // Individual rewards and requirements are capped independently of lifetime earnings.
  await pool.query("INSERT INTO coop_achievement_ledger(account_id,points,source,source_ref) SELECT $1,1000000,'admin_grant','test-'||n FROM generate_series(1,2148) n",[auth.accountId]);
  expect((await get(auth,'/v1/coop/eligibility')).json()).toMatchObject({points:2_148_005_000,eligible:true});
  expect((await get(auth,'/v1/coop/encounters')).json()).toMatchObject({points:2_148_005_000});
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
  await publish(changedBundle);
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
 it('requires the published campaign clear to host and preserves an existing room after publication',async()=>{
  const candidate=readJson('../../config/gameplay/arena8-coop-v2.seed.json') as {bosses:TestBoss[]};
  const {mapId,requiredMapClear}=readJson('../../crates/aetheria-pet-arena/tests/fixtures/arena8-coop-map-prerequisite.json') as {mapId:string;requiredMapClear:string};
  const boss=candidate.bosses.find(entry=>entry.mapId===mapId)!;
  boss.requiredMapClear=requiredMapClear;
  const version=await publish(candidate);
  const host=await eligibleHost(),other=await eligibleHost(4_999),member=await guest('Campaign guest');
  const eligibility='/v1/coop/eligibility?mapId='+mapId;
  const request={requestId:randomUUID(),mapId,petId:host.pet};
  const create=(body=request)=>post(host.auth,'/v1/coop/rooms',body);
  expect((await get(host.auth,'/v1/coop/eligibility?mapId='+requiredMapClear)).json()).toMatchObject({eligible:true});
  expect((await get(host.auth,eligibility)).json()).toMatchObject({eligible:false,prerequisite:{mapId:requiredMapClear,mapName:'Cinder Terraces',cleared:false}});
  expect((await get(host.auth,'/v1/coop/eligibility?bossId='+boss.id)).json()).toMatchObject({eligible:false});
  const denied=await create();
  expect(denied.statusCode).toBe(403);
  expect(denied.json().error.message).toBe('Clear Cinder Terraces to create this room');
  expect((await create({...request,bossId:boss.id})).statusCode).toBe(403);

  await pool.query('INSERT INTO pet_wave_one_map_clears(account_id,map_id) VALUES($1,$2)',[other.auth.accountId,requiredMapClear]);
  expect((await get(other.auth,eligibility)).json()).toMatchObject({eligible:false});
  expect((await post(other.auth,'/v1/coop/rooms',{requestId:randomUUID(),mapId,petId:other.pet})).statusCode).toBe(403);
  await grantPoints(other.auth,1);
  expect((await get(other.auth,eligibility)).json()).toMatchObject({eligible:true});
  const complete=(kind:'regular'|'boss')=>pool.query(
   'INSERT INTO pet_wave_one_encounters(account_id,map_id,encounter_id) VALUES($1,$2,$3)',
   [host.auth.accountId,requiredMapClear,requiredMapClear+'-'+kind],
  );
  await complete('boss');
  expect((await create()).statusCode).toBe(403);
  await complete('regular');
  expect((await get(host.auth,eligibility)).json()).toMatchObject({eligible:true,prerequisite:{mapId:requiredMapClear,mapName:'Cinder Terraces',cleared:true}});
  const accepted=await create();
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json()).toMatchObject({mapId,bossId:boss.id,configVersion:version});
  const roomId=accepted.json().roomId as string;
  expect((await get(member,'/v1/coop/rooms/'+roomId)).json()).toMatchObject({canJoin:true,configVersion:version});

  boss.requiredMapClear='stormcoil-fields';
  await publish(candidate);
  expect((await get(host.auth,eligibility)).json()).toMatchObject({eligible:false});
  expect((await create({...request,requestId:randomUUID()})).statusCode).toBe(403);
  expect((await create()).json()).toEqual(accepted.json());
  const joined=await post(member,'/v1/coop/rooms/'+roomId+'/join',{requestId:randomUUID(),mapId});
  expect(joined.statusCode).toBe(200);
  expect(joined.json()).toMatchObject({mapId,configVersion:version,you:{seat:1,isHost:false}});
 });
 it('lists the six published campaign encounters and advances hosting availability from settled clears',async()=>{
  const url='/v1/coop/encounters';
  expect((await server.http.inject({url})).statusCode).toBe(401);
  const candidate=readJson('../../config/gameplay/arena8-coop-v2.seed.json') as {bosses:TestBoss[]};
  const prerequisites=readJson('../fixtures/coop-campaign-prerequisites.json') as Record<string,string|null>;
  const {maps}=readJson('../../specs/pet-arena/mvp-wave1-43-pets.json') as {
   maps:{id:string;name:string;regularPetIds:string[];legendaryPetId:string}[];
  };
  expect(Object.keys(prerequisites)).toEqual(maps.map(map=>map.id));
  for(const boss of candidate.bosses){
   const prerequisite=prerequisites[boss.mapId];
   if(prerequisite)boss.requiredMapClear=prerequisite;
  }
  const version=await publish(candidate);
  const operatorVersion=await server.http.inject({url:'/v1/operator/gameplay-config-version?ruleset='+ruleset+'&version='+version,headers:operatorHeaders});
  const view=GameplayConfigVersionViewSchema.parse(operatorVersion.json());
  expect(view.bundle).toEqual(candidate);
  expect(view.catalogReference).toHaveLength(55);
  expect(view.catalogReference?.filter(p=>p.starter).map(p=>p.id).sort()).toEqual(['fire-coalwhisk','ground-clodkin','water-dewskip']);
  expect(view.catalogReference?.find(p=>p.id==='pet-v31-fire-cindrelis')).toMatchObject({catalogRank:'S',sourceCategory:'standard_gacha'});
  const host=await eligibleHost(),guestWithoutProgress=await eligibleHost();
  const readCatalog=async(auth:Auth)=>{
   const response=await get(auth,url);
   expect(response.statusCode).toBe(200);
   expect(response.headers['cache-control']).toBe('private, no-store');
   return CoopEncounterCatalogSchema.parse(response.json());
  };
  const initial=await readCatalog(host.auth);
  expect(initial).toMatchObject({ruleset,configVersion:version,points:5_000});
  expect(initial.encounters).toHaveLength(maps.length);
  for(const [index,map] of maps.entries()){
   const boss=candidate.bosses[index]!;
   const previous=maps[index-1];
   expect(initial.encounters[index]).toEqual({
    mapId:map.id,mapName:map.name,bossId:boss.id,bossName:boss.name,
    regularEncounterId:map.id+'-regular',bossEncounterId:map.id+'-boss',
    recruitment:{regularPetIds:map.regularPetIds,legendaryPetId:map.legendaryPetId},
    requiredPoints:5_000,eligible:index===0,
    prerequisite:previous?{mapId:previous.id,mapName:previous.name,cleared:false}:null,
   });
   await pool.query('INSERT INTO pet_wave_one_encounters(account_id,map_id,encounter_id) VALUES($1,$2,$3),($1,$2,$4)',
    [host.auth.accountId,map.id,map.id+'-regular',map.id+'-boss']);
   const updated=await readCatalog(host.auth);
   expect(updated.encounters.map(encounter=>encounter.eligible)).toEqual(maps.map((_,position)=>position<=index+1));
  }
  expect((await readCatalog(guestWithoutProgress.auth)).encounters.map(encounter=>encounter.eligible)).toEqual([true,false,false,false,false,false]);
 });
});
