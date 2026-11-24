import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig,type Config} from '../../apps/platform-api/src/shared/config/environment';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';

type App=Awaited<ReturnType<typeof createApp>>;
type Auth={cookie:string;csrf:string;accountId:string};
type Modifiers={hp:number;attack:number;defense:number;speed:number};
type InventoryItem={artifactId:string;definitionId:string;name:string;slot:string;rank:string;upgradeLevel:number;maxUpgradeLevel:number;nextUpgradeCost:number|null;modifiers:Modifiers;equipped:{petId:string;slot:string}|null;acquiredFrom:string;acquiredMapId:string|null;acquiredAt:string};
type PetView={petId:string;level:number;powerClass:string|null;slots:{core:string|null;aegis:string|null;rune:string|null};totals:Modifiers;digest:string;snapshotId:string|null};
type SnapshotView={snapshotId:string;digest:string;createdAt:string;loadout:{petId:string;petLevel:number;entries:{slot:string;artifactId:string;definitionId:string;upgradeLevel:number;modifiers:Modifiers}[];totals:Modifiers}};
type StateView={revision:number;materials:number;inventory:InventoryItem[];pets:PetView[];pve:{claims:{mapId:string;artifactId:string;definitionId:string;materials:number;claimedAt:string}[];available:{mapId:string;definitionId:string;materials:number}[]};snapshots:SnapshotView[]};
type EquipResponse={revision:number;petId:string;slot:string;artifactId:string;state:StateView};
type UnequipResponse={revision:number;petId:string;slot:string;removedArtifactId:string|null;state:StateView};
type UpgradeResponse={revision:number;artifactId:string;upgradeLevel:number;spent:number;state:StateView};
type ClaimResponse={revision:number;grant:{mapId:string;artifactId:string;definitionId:string;materials:number};state:StateView};
type SnapshotResponse={revision:number;snapshot:SnapshotView;state:StateView};

const origin='http://127.0.0.1:3300',remoteAddress='127.207.9.1';
const schema='wave_a_artifacts_test_'+randomUUID().replaceAll('-','');
const POLICY=['skill','strike','guard','strike','skill','strike','guard','strike','skill','strike','guard','strike'];
const MAP_IDS=['cinder-terraces','tideglass-lagoon','stormcoil-fields','lantern-necropolis','ochre-labyrinth','dawn-prism-sanctum'];
const STARTER='fire-coalwhisk';
let admin:Pool,pool:Pool,config:Config,app:App,disabled:App;
const entropyValues:number[]=[];
const entropy={int:(_maxExclusive:number)=>{const next=entropyValues.shift();if(next===undefined)throw new Error('Wave A test entropy exhausted');return next;}};

beforeAll(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL??'');
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test database required');
  admin=new Pool({connectionString:url.toString()});
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options','-c search_path='+schema);
  pool=new Pool({connectionString:url.toString()});
  await migrate(pool);
  config=readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'wave-a-artifacts-test-secret-0001'});
  app=await createApp(config,pool,false,{petArenaWave1:{enabled:true,entropy},petArtifacts:{enabled:true}});
  disabled=await createApp(config,pool,false,{});
});

afterAll(async()=>{
  await app?.app.close();
  await disabled?.app.close();
  await pool?.end();
  if(admin){await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
});

beforeEach(()=>{entropyValues.length=0;});

let guestAddress=1;
async function guest(target:App=app):Promise<Auth>{
  const response=await target.http.inject({
    method:'POST',url:'/v1/session/guest',remoteAddress:'127.207.10.'+guestAddress++,
    headers:{origin},payload:{requestId:randomUUID(),displayName:'Wave A visitor',avatarKey:'mint'},
  });
  expect(response.statusCode).toBe(201);
  const body=response.json() as {csrfToken:string;profile:{id:string}};
  return {cookie:String(response.headers['set-cookie']).split(';')[0],csrf:body.csrfToken,accountId:body.profile.id};
}
const get=(target:App,url:string,auth?:{cookie:string})=>target.http.inject({method:'GET',url,remoteAddress,headers:{origin,...(auth?{cookie:auth.cookie}:{})}});
const post=(target:App,url:string,payload:unknown,auth:Auth,headers:Record<string,string>={})=>target.http.inject({
  method:'POST',url,remoteAddress,
  headers:{origin,cookie:auth.cookie,'x-csrf-token':auth.csrf,...headers},
  payload:payload as Record<string,unknown>,
});
async function state(target:App,auth:Auth):Promise<StateView>{
  const response=await get(target,'/v1/pets/artifacts/state',auth);
  expect(response.statusCode).toBe(200);
  return response.json() as StateView;
}
async function initializePets(auth:Auth){expect((await get(app,'/v1/pets/wave1/state',auth)).statusCode).toBe(200);}
async function setPetLevel(auth:Auth,petId:string,level:number){
  const updated=await pool.query('UPDATE pet_wave_one_owned SET level=$3,exp=0 WHERE account_id=$1 AND pet_id=$2',[auth.accountId,petId,level]);
  expect(updated.rowCount).toBe(1);
}
async function insertArtifact(auth:Auth,definitionId:string,level=1):Promise<string>{
  await state(app,auth);
  const artifactId=randomUUID();
  await pool.query("INSERT INTO pet_artifact_owned(account_id,artifact_id,definition_id,upgrade_level,acquired_from) VALUES($1,$2,$3,$4,'starter')",[auth.accountId,artifactId,definitionId,level]);
  return artifactId;
}
async function addClear(auth:Auth,mapId:string){
  await pool.query('INSERT INTO pet_wave_one_map_clears(account_id,map_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[auth.accountId,mapId]);
}
const equip=(auth:Auth,petId:string,artifactId:string,requestId=randomUUID(),target:App=app)=>post(target,'/v1/pets/artifacts/equip',{requestId,petId,artifactId},auth);
const unequip=(auth:Auth,petId:string,slot:string,requestId=randomUUID(),target:App=app)=>post(target,'/v1/pets/artifacts/unequip',{requestId,petId,slot},auth);
const upgrade=(auth:Auth,artifactId:string,requestId=randomUUID(),target:App=app)=>post(target,'/v1/pets/artifacts/upgrade',{requestId,artifactId},auth);
const claim=(auth:Auth,requestId=randomUUID(),target:App=app)=>post(target,'/v1/pets/artifacts/pve/claim',{requestId},auth);
const snapshot=(auth:Auth,petId:string,requestId=randomUUID(),target:App=app)=>post(target,'/v1/pets/artifacts/loadout/snapshot',{requestId,petId},auth);
async function scalar(sql:string,params:unknown[]):Promise<number>{
  const row=(await pool.query<{value:number}>(sql,params)).rows[0];
  if(!row)throw new Error('Expected scalar row');
  return row.value;
}

describe('Wave A Artifact durable loop',()=>{
  it('1 stays absent unless the local/test composition opts in',async()=>{
    for(const request of [
      {method:'GET' as const,url:'/v1/pets/artifacts/state'},
      {method:'GET' as const,url:'/v1/pets/artifacts/catalog'},
      {method:'POST' as const,url:'/v1/pets/artifacts/pve/claim',headers:{origin},payload:{requestId:randomUUID()}},
    ])expect((await disabled.http.inject({...request,remoteAddress})).statusCode).toBe(404);
    const visitor=await guest();
    const exported=await get(disabled,'/v1/me/export',visitor);
    expect(exported.statusCode).toBe(200);
    expect(exported.json()).toMatchObject({domains:{}});
    expect(Object.keys((exported.json() as {domains:Record<string,unknown>}).domains)).not.toContain('petArtifacts');
  });

  it('2 requires an authenticated session, exact origin and CSRF on mutations',async()=>{
    const visitor=await guest();
    const anonymous=await app.http.inject({method:'GET',url:'/v1/pets/artifacts/state',remoteAddress,headers:{origin}});
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toMatchObject({error:{code:'UNAUTHENTICATED'}});
    const missing=await app.http.inject({method:'POST',url:'/v1/pets/artifacts/pve/claim',remoteAddress,headers:{origin,cookie:visitor.cookie},payload:{requestId:randomUUID()}});
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toMatchObject({error:{code:'FORBIDDEN'}});
    const forged=await post(app,'/v1/pets/artifacts/pve/claim',{requestId:randomUUID()},visitor,{'x-csrf-token':'0'.repeat(64)});
    expect(forged.statusCode).toBe(403);
    const wrongOrigin=await app.http.inject({
      method:'POST',url:'/v1/pets/artifacts/pve/claim',remoteAddress,
      headers:{origin:'http://127.0.0.1:3399',cookie:visitor.cookie,'x-csrf-token':visitor.csrf},payload:{requestId:randomUUID()},
    });
    expect(wrongOrigin.statusCode).toBe(403);
    const response=await get(app,'/v1/pets/artifacts/state',visitor);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toBe('Cookie');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect((await get(app,'/v1/pets/artifacts/state?extra=1',visitor)).statusCode).toBe(422);
    expect((await post(app,'/v1/pets/artifacts/equip',{requestId:randomUUID(),petId:STARTER,artifactId:randomUUID(),slot:'rune'},visitor)).statusCode).toBe(422);
  });

  it('3 starts with materials, a D-rank starter core and no equipment',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    const view=await state(app,visitor);
    expect(view).toMatchObject({
      revision:0,materials:150,
      pve:{claims:[],available:[]},
      snapshots:[],
    });
    expect(view.inventory).toHaveLength(1);
    expect(view.inventory[0]).toMatchObject({
      definitionId:'core-emberglass',name:'Emberglass Core',slot:'core',rank:'D',upgradeLevel:1,maxUpgradeLevel:5,
      nextUpgradeCost:60,modifiers:{hp:4,attack:2,defense:0,speed:0},equipped:null,acquiredFrom:'starter',acquiredMapId:null,
    });
    expect(view.pets.map(pet=>pet.petId)).toEqual([STARTER,'water-dewskip','ground-clodkin']);
    for(const pet of view.pets){
      expect(pet).toMatchObject({level:1,powerClass:'B',slots:{core:null,aegis:null,rune:null},totals:{hp:0,attack:0,defense:0,speed:0},snapshotId:null});
      expect(pet.digest).toMatch(/^[a-f0-9]{64}$/);
    }
    const catalog=await get(app,'/v1/pets/artifacts/catalog',visitor);
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toMatchObject({
      schemaVersion:1,ruleset:'aetheria-pet-artifacts-wave-a',release:'LOCAL_ONLY',enabled:false,gating:'pet-level-only',combat:'snapshot-only',
      rankLevelRequirements:[{rank:'D',level:1},{rank:'C',level:10},{rank:'B',level:20},{rank:'A',level:40},{rank:'S',level:60}],
      upgradeCosts:[{rank:'D',costs:[60,80,100,120]},{rank:'C',costs:[120,160,200,240]},{rank:'B',costs:[180,240,300,360]},{rank:'A',costs:[240,320,400,480]},{rank:'S',costs:[300,400,500,600]}],
      maxUpgradeLevel:5,startingMaterials:150,
    });
  });

  it('4 equips, swaps, unequips and rejects unknown or unowned artifacts',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    await setPetLevel(visitor,STARTER,10);
    await setPetLevel(visitor,'water-dewskip',10);
    const view=await state(app,visitor);
    const starterId=view.inventory[0].artifactId;
    const equipped=await equip(visitor,STARTER,starterId);
    expect(equipped.statusCode).toBe(200);
    const first=equipped.json() as EquipResponse;
    expect(first).toMatchObject({revision:1,petId:STARTER,slot:'core',artifactId:starterId});
    expect(first.state.inventory[0].equipped).toEqual({petId:STARTER,slot:'core'});
    expect(first.state.pets[0]).toMatchObject({slots:{core:starterId,aegis:null,rune:null},totals:{hp:4,attack:2,defense:0,speed:0}});
    const second=await insertArtifact(visitor,'core-amberlattice');
    const swapped=await equip(visitor,STARTER,second);
    expect(swapped.statusCode).toBe(200);
    expect((swapped.json() as EquipResponse).state.inventory.map(item=>[item.definitionId,item.equipped])).toEqual([
      ['core-emberglass',null],['core-amberlattice',{petId:STARTER,slot:'core'}],
    ]);
    const conflict=await equip(visitor,'water-dewskip',second);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({error:{code:'NOT_AVAILABLE',message:'Artifact is equipped on another Pet'}});
    expect((await equip(visitor,'light-gleamlet',second)).statusCode).toBe(400);
    expect((await equip(visitor,STARTER,randomUUID())).statusCode).toBe(404);
    expect((await equip(visitor,STARTER,'not-a-uuid')).statusCode).toBe(422);
    const removed=await unequip(visitor,STARTER,'core');
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({petId:STARTER,slot:'core',removedArtifactId:second});
    expect((removed.json() as UnequipResponse).state.pets[0].slots.core).toBeNull();
    const empty=await unequip(visitor,STARTER,'core');
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({removedArtifactId:null,revision:(removed.json() as UnequipResponse).revision});
    const uppercase=await equip(visitor,STARTER,starterId.toUpperCase());
    expect(uppercase.statusCode).toBe(200);
    expect((uppercase.json() as EquipResponse).artifactId).toBe(starterId);
    expect(await scalar('SELECT count(*)::int AS value FROM pet_artifact_loadouts WHERE account_id=$1',[visitor.accountId])).toBe(1);
  });

  it('5 gates rank thresholds by Pet level and lets a B-power-class Lv60 Pet equip S',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    const cRank=await insertArtifact(visitor,'core-amberlattice');
    await setPetLevel(visitor,STARTER,9);
    const tooLow=await equip(visitor,STARTER,cRank);
    expect(tooLow.statusCode).toBe(409);
    expect(tooLow.json()).toMatchObject({error:{code:'NOT_AVAILABLE',message:'Pet level 10 is required for C-rank artifacts'}});
    await setPetLevel(visitor,STARTER,10);
    expect((await equip(visitor,STARTER,cRank)).statusCode).toBe(200);
    const sRank=await insertArtifact(visitor,'rune-temporal-seal');
    const bPowerClass=await state(app,visitor);
    expect(bPowerClass.pets[0]).toMatchObject({petId:STARTER,level:10,powerClass:'B'});
    await setPetLevel(visitor,STARTER,59);
    expect((await equip(visitor,STARTER,sRank)).statusCode).toBe(409);
    await setPetLevel(visitor,STARTER,60);
    const equipped=await equip(visitor,STARTER,sRank);
    expect(equipped.statusCode).toBe(200);
    const body=equipped.json() as EquipResponse;
    expect(body.slot).toBe('rune');
    expect(body.state.pets[0]).toMatchObject({petId:STARTER,level:60,powerClass:'B',slots:{core:cRank,rune:sRank,aegis:null}});
    expect(body.state.pets[0].totals).toEqual({hp:14,attack:13,defense:1,speed:6});
    const plate=await insertArtifact(visitor,'aegis-bastionplate');
    expect((await equip(visitor,STARTER,plate)).statusCode).toBe(200);
    const threeSlots=(await state(app,visitor)).pets[0].slots;
    expect(threeSlots.core).toBe(cRank);
    expect(threeSlots.aegis).toBe(plate);
    expect(threeSlots.rune).toBe(sRank);
  });

  it('6 upgrades deterministically, consumes materials and stops at the cap',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    const view=await state(app,visitor);
    const starterId=view.inventory[0].artifactId;
    await pool.query('UPDATE pet_artifact_players SET materials=1000 WHERE account_id=$1',[visitor.accountId]);
    const first=await upgrade(visitor,starterId);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({revision:1,artifactId:starterId,upgradeLevel:2,spent:60});
    expect((first.json() as UpgradeResponse).state.materials).toBe(940);
    for(const [index,cost] of [80,100,120].entries()){
      const response=await upgrade(visitor,starterId);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({upgradeLevel:index+3,spent:cost});
    }
    const maxed=(await state(app,visitor)).inventory[0];
    expect(maxed).toMatchObject({upgradeLevel:5,nextUpgradeCost:null,modifiers:{hp:8,attack:2,defense:0,speed:0}});
    expect((await state(app,visitor)).materials).toBe(640);
    const atCap=await upgrade(visitor,starterId);
    expect(atCap.statusCode).toBe(409);
    expect(atCap.json()).toMatchObject({error:{code:'NOT_AVAILABLE',message:'Artifact is at its maximum upgrade level'}});
    const fresh=await insertArtifact(visitor,'rune-mistquill');
    await pool.query('UPDATE pet_artifact_players SET materials=0 WHERE account_id=$1',[visitor.accountId]);
    const poor=await upgrade(visitor,fresh);
    expect(poor.statusCode).toBe(409);
    expect(poor.json()).toMatchObject({error:{code:'INSUFFICIENT_FUNDS'}});
    expect((await upgrade(visitor,randomUUID())).statusCode).toBe(404);
    await pool.query('UPDATE pet_artifact_players SET materials=1000 WHERE account_id=$1',[visitor.accountId]);
    const paid=(await upgrade(visitor,fresh)).json() as UpgradeResponse;
    expect(paid).toMatchObject({upgradeLevel:2,spent:120});
    expect(paid.state.materials).toBe(880);
  });

  it('7 claims one deterministic PvE reward per cleared map in campaign order',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    const early=await claim(visitor);
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({error:{code:'NOT_AVAILABLE',message:'No PvE artifact reward is available'}});
    await addClear(visitor,MAP_IDS[0]);
    await addClear(visitor,MAP_IDS[1]);
    const first=await claim(visitor);
    expect(first.statusCode).toBe(200);
    const granted=first.json() as ClaimResponse;
    expect(granted).toMatchObject({revision:1,grant:{mapId:MAP_IDS[0],definitionId:'core-amberlattice',materials:60}});
    expect(granted.grant.artifactId).toMatch(/^[0-9a-f-]{36}$/);
    expect(granted.state.materials).toBe(210);
    expect(granted.state.inventory.map(item=>item.definitionId).sort()).toEqual(['core-amberlattice','core-emberglass']);
    expect(granted.state.pve.available).toEqual([{mapId:MAP_IDS[1],definitionId:'aegis-bastionplate',materials:90}]);
    const second=await claim(visitor);
    expect(second.json()).toMatchObject({grant:{mapId:MAP_IDS[1],definitionId:'aegis-bastionplate',materials:90}});
    expect((await state(app,visitor)).pve.claims.map(entry=>entry.mapId)).toEqual([MAP_IDS[0],MAP_IDS[1]]);
    expect((await claim(visitor)).statusCode).toBe(409);
    expect(await scalar('SELECT count(*)::int AS value FROM pet_artifact_pve_claims WHERE account_id=$1',[visitor.accountId])).toBe(2);
  });

  it('8 settles a real Wave 1 campaign clear into an Artifact reward',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    const played=await post(app,'/v1/pets/wave1/campaign/play',{requestId:randomUUID(),mapId:MAP_IDS[0],petId:STARTER,actions:POLICY},visitor);
    expect(played.statusCode).toBe(200);
    expect((played.json() as {result:{won:boolean;firstClear:boolean}}).result).toMatchObject({won:true,firstClear:true});
    const available=(await state(app,visitor)).pve.available;
    expect(available).toEqual([{mapId:MAP_IDS[0],definitionId:'core-amberlattice',materials:60}]);
    const claimed=await claim(visitor);
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json()).toMatchObject({grant:{mapId:MAP_IDS[0],definitionId:'core-amberlattice'}});
    expect((await claim(visitor)).statusCode).toBe(409);
  });

  it('9 replays receipts without double grants and rejects conflicting request ids',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    await addClear(visitor,MAP_IDS[0]);
    const requestId=randomUUID();
    const first=await claim(visitor,requestId);
    expect(first.statusCode).toBe(200);
    const stored=first.json() as ClaimResponse;
    const replay=await claim(visitor,requestId);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(stored);
    expect(await scalar('SELECT count(*)::int AS value FROM pet_artifact_pve_claims WHERE account_id=$1',[visitor.accountId])).toBe(1);
    expect(await scalar('SELECT count(*)::int AS value FROM pet_artifact_owned WHERE account_id=$1',[visitor.accountId])).toBe(2);
    expect(await scalar('SELECT count(*)::int AS value FROM pet_artifact_requests WHERE account_id=$1',[visitor.accountId])).toBe(1);
    const artifactId=stored.grant.artifactId;
    const conflict=await post(app,'/v1/pets/artifacts/upgrade',{requestId,artifactId},visitor);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({error:{code:'REQUEST_CONFLICT'}});
    expect((await state(app,visitor)).materials).toBe(210);
  });

  it('10 serializes concurrent identical requests and concurrent equipment conflicts',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    await setPetLevel(visitor,STARTER,10);
    await setPetLevel(visitor,'water-dewskip',10);
    const view=await state(app,visitor);
    const starterId=view.inventory[0].artifactId;
    const requestId=randomUUID();
    const results=await Promise.all([upgrade(visitor,starterId,requestId),upgrade(visitor,starterId,requestId)]);
    expect(results.map(response=>response.statusCode)).toEqual([200,200]);
    expect(results[0].json()).toEqual(results[1].json());
    expect((await state(app,visitor)).materials).toBe(90);
    expect((await state(app,visitor)).inventory[0].upgradeLevel).toBe(2);
    const second=await insertArtifact(visitor,'core-amberlattice');
    const races=await Promise.all([equip(visitor,STARTER,second),equip(visitor,'water-dewskip',second)]);
    expect(races.map(response=>response.statusCode).sort()).toEqual([200,409]);
    expect(await scalar('SELECT count(*)::int AS value FROM pet_artifact_loadouts WHERE account_id=$1',[visitor.accountId])).toBe(1);
    expect((await state(app,visitor)).pets.filter(pet=>pet.slots.core!==null)).toHaveLength(1);
    await pool.query('UPDATE pet_artifact_players SET materials=1000 WHERE account_id=$1',[visitor.accountId]);
    const distinct=await Promise.all([upgrade(visitor,second),upgrade(visitor,second)]);
    expect(distinct.map(response=>response.statusCode)).toEqual([200,200]);
    expect((await state(app,visitor)).inventory.find(item=>item.artifactId===second)?.upgradeLevel).toBe(3);
    expect((await state(app,visitor)).materials).toBe(720);
  });

  it('11 stores immutable content-addressed loadout snapshots',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    const view=await state(app,visitor);
    const starterId=view.inventory[0].artifactId;
    const empty=await snapshot(visitor,STARTER);
    expect(empty.statusCode).toBe(200);
    const firstSnapshot=empty.json() as SnapshotResponse;
    expect(firstSnapshot.revision).toBe(0);
    expect(firstSnapshot.snapshot).toMatchObject({loadout:{petId:STARTER,petLevel:1,entries:[],totals:{hp:0,attack:0,defense:0,speed:0}}});
    expect(firstSnapshot.snapshot.digest).toMatch(/^[a-f0-9]{64}$/);
    const repeated=await snapshot(visitor,STARTER);
    expect(repeated.statusCode).toBe(200);
    expect((repeated.json() as SnapshotResponse).snapshot.snapshotId).toBe(firstSnapshot.snapshot.snapshotId);
    expect(await scalar('SELECT count(*)::int AS value FROM pet_artifact_snapshots WHERE account_id=$1',[visitor.accountId])).toBe(1);
    const equipped=await equip(visitor,STARTER,starterId);
    expect(equipped.statusCode).toBe(200);
    const populated=await snapshot(visitor,STARTER);
    const secondSnapshot=populated.json() as SnapshotResponse;
    expect(secondSnapshot.snapshot.snapshotId).not.toBe(firstSnapshot.snapshot.snapshotId);
    expect(secondSnapshot.snapshot).toMatchObject({loadout:{petId:STARTER,petLevel:1,entries:[{slot:'core',artifactId:starterId,definitionId:'core-emberglass',upgradeLevel:1,modifiers:{hp:4,attack:2,defense:0,speed:0}}],totals:{hp:4,attack:2,defense:0,speed:0}}});
    const fetched=await get(app,'/v1/pets/artifacts/snapshots/'+secondSnapshot.snapshot.snapshotId,visitor);
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(secondSnapshot.snapshot);
    await expect(pool.query('UPDATE pet_artifact_snapshots SET pet_level=60 WHERE account_id=$1 AND snapshot_id=$2',[visitor.accountId,secondSnapshot.snapshot.snapshotId]))
      .rejects.toThrow(/immutable/);
    await expect(pool.query('DELETE FROM pet_artifact_snapshots WHERE account_id=$1 AND snapshot_id=$2',[visitor.accountId,secondSnapshot.snapshot.snapshotId]))
      .rejects.toThrow(/append-only/);
    const other=await guest();
    await initializePets(other);
    expect((await get(app,'/v1/pets/artifacts/snapshots/'+secondSnapshot.snapshot.snapshotId,other)).statusCode).toBe(404);
    expect((await snapshot(visitor,'light-gleamlet')).statusCode).toBe(400);
    const current=(await state(app,visitor)).pets[0];
    expect(current.snapshotId).toBe(secondSnapshot.snapshot.snapshotId);
    expect(current.digest).toBe(secondSnapshot.snapshot.digest);
  });

  it('12 survives a new app instance and keeps receipts idempotent after restart',async()=>{
    const first=await createApp(config,pool,false,{petArenaWave1:{enabled:true,entropy},petArtifacts:{enabled:true}});
    const visitor=await guest(first);
    await initializePets(visitor);
    const requestId=randomUUID();
    const claimed=await claim(visitor,requestId,first);
    expect(claimed.statusCode).toBe(409);
    await addClear(visitor,MAP_IDS[2]);
    const granted=await claim(visitor,requestId,first);
    expect(granted.statusCode).toBe(200);
    const stored=granted.json() as ClaimResponse;
    const before=await state(first,visitor);
    expect(before).toMatchObject({revision:1,materials:240});
    await first.app.close();
    const second=await createApp(config,pool,false,{petArenaWave1:{enabled:true,entropy},petArtifacts:{enabled:true}});
    try{
      expect(await state(second,visitor)).toEqual(before);
      const replayed=await claim(visitor,requestId,second);
      expect(replayed.statusCode).toBe(200);
      expect(replayed.json()).toEqual(stored);
      const artifactId=stored.grant.artifactId;
      await setPetLevel(visitor,STARTER,10);
      const equipped=await equip(visitor,STARTER,artifactId,randomUUID(),second);
      expect(equipped.statusCode).toBe(200);
      expect((equipped.json() as EquipResponse).revision).toBe(2);
      expect((await state(second,visitor)).materials).toBe(240);
    }finally{await second.app.close();}
  });

  it('13 exports artifacts, cascades account deletion and refuses production composition',async()=>{
    const visitor=await guest();
    await initializePets(visitor);
    await addClear(visitor,MAP_IDS[0]);
    expect((await claim(visitor)).statusCode).toBe(200);
    const exported=await get(app,'/v1/me/export',visitor);
    expect(exported.statusCode).toBe(200);
    expect(exported.json()).toMatchObject({domains:{petArtifacts:{schemaVersion:1,initialized:true,materials:210,inventory:[{definitionId:'core-emberglass'},{definitionId:'core-amberlattice'}],pveClaims:[{mapId:MAP_IDS[0]}]}}});
    const deleted=await app.http.inject({
      method:'DELETE',url:'/v1/me',remoteAddress,
      headers:{origin,cookie:visitor.cookie,'x-csrf-token':visitor.csrf,'idempotency-key':randomUUID()},
    });
    expect(deleted.statusCode).toBe(200);
    for(const table of ['pet_artifact_players','pet_artifact_owned','pet_artifact_loadouts','pet_artifact_snapshots','pet_artifact_pve_claims','pet_artifact_requests']){
      expect(await scalar('SELECT count(*)::int AS value FROM '+table+' WHERE account_id=$1',[visitor.accountId])).toBe(0);
    }
    const production:Config={...config,NODE_ENV:'production'};
    await expect(createApp(production,pool,false,{petArtifacts:{enabled:true}})).rejects.toThrow('local/test only');
    expect(()=>readConfig({NODE_ENV:'test',DATABASE_URL:String(config.DATABASE_URL),SESSION_SECRET:'wave-a-artifacts-test-secret-0001',LOCAL_PET_ARTIFACTS:'1',HOST:'0.0.0.0'})).toThrow(/LOCAL_PET_ARTIFACTS/);
    expect(()=>readConfig({NODE_ENV:'production',DATABASE_URL:String(config.DATABASE_URL),SESSION_SECRET:'wave-a-artifacts-test-secret-0001',LOCAL_PET_ARTIFACTS:'1'})).toThrow(/LOCAL_PET_ARTIFACTS/);
  });
});
