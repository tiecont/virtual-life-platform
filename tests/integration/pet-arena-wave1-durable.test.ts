import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig,type Config} from '../../apps/platform-api/src/shared/config/environment';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';

type App=Awaited<ReturnType<typeof createApp>>;
type Auth={cookie:string;csrf:string;accountId:string};
type Encounter={won:boolean;turns:number;remainingHp:number;enemyHp:number};
type StateView={
  revision:number;wallet:{coins:number};party:string[];
  pets:{petId:string;name:string;element:string;rank:string;level:number;exp:number;expToNext:number;stage:number;unlocks:string[];stats:{hp:number;attack:number;defense:number;speed:number};duplicateExp:number}[];
  campaign:{clearedMaps:string[];nextMapId:string|null};
  gacha:{misses:number;guaranteed:boolean;revision:number;history:{seq:number;petId:string|null;featured:boolean;duplicate:boolean;createdAt:string}[]};
};
type PartyResponse={revision:number;party:string[]};
type CampaignResponse={revision:number;acquiredPetId:string|null;result:{mapId:string;won:boolean;firstClear:boolean;regular:Encounter;boss:Encounter|null;rewards:{exp:number;coins:number;levelsGained:number;stage:number}};state:StateView};
type GachaResponse={revision:number;pulls:{petId:string;featured:boolean;duplicate:boolean;pityBefore:number}[];cost:number;state:StateView};

const origin='http://127.0.0.1:3300',remoteAddress='127.201.7.1';
const schema='wave1_durable_test_'+randomUUID().replaceAll('-','');
const POLICY=['skill','strike','guard','strike','skill','strike','guard','strike','skill','strike','guard','strike'];
const GUARDS=Array.from({length:12},()=>'guard');
let admin:Pool,pool:Pool,config:Config,app:App,disabled:App;
const entropyValues:number[]=[];
const entropy={int:(maxExclusive:number)=>{
  const value=entropyValues.shift();
  if(value===undefined)throw new Error('Wave 1 test entropy exhausted');
  if(!Number.isInteger(value)||value<0||value>=maxExclusive)throw new Error('Wave 1 test entropy out of range');
  return value;
}};
const draw=(...values:number[])=>{entropyValues.push(...values);};
const featuredDraw=()=>draw(0,0,0);
const missDraw=()=>draw(999_999,0,0);
const offRateDraw=(ticket:number)=>draw(0,500_000,ticket);

beforeAll(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL??'');
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test database required');
  admin=new Pool({connectionString:url.toString()});
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options','-c search_path='+schema);
  pool=new Pool({connectionString:url.toString()});
  await migrate(pool);
  config=readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'wave1-pet-arena-durable-test-secret-0001'});
  app=await createApp(config,pool,false,{petArenaWave1:{enabled:true,entropy}});
  disabled=await createApp(config,pool,false,{petArenaWave1:{enabled:false}});
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
    method:'POST',url:'/v1/session/guest',remoteAddress:'127.201.8.'+guestAddress++,
    headers:{origin},payload:{requestId:randomUUID(),displayName:'Wave 1 durable visitor',avatarKey:'mint'},
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
  const response=await get(target,'/v1/pets/wave1/state',auth);
  expect(response.statusCode).toBe(200);
  return response.json() as StateView;
}
function play(auth:Auth,mapId:string,petId:string,requestId=randomUUID(),actions:string[]=POLICY,bossActions?:string[],target:App=app){
  return post(target,'/v1/pets/wave1/campaign/play',{requestId,mapId,petId,actions,...(bossActions?{bossActions}:{})},auth);
}
function pull(auth:Auth,count:1|10,requestId=randomUUID(),target:App=app){
  return post(target,'/v1/pets/wave1/gacha/pull',{requestId,count},auth);
}
async function scalar(sql:string,params:unknown[]):Promise<number>{
  const row=(await pool.query<{value:number}>(sql,params)).rows[0];
  if(!row)throw new Error('Expected scalar row');
  return row.value;
}

describe('Wave 1 durable Pet Arena loop',()=>{
  it('1 stays absent unless the local/test composition enables it',async()=>{
    expect((await disabled.http.inject({method:'GET',url:'/v1/pets/wave1/state'})).statusCode).toBe(404);
    expect((await disabled.http.inject({method:'GET',url:'/v1/pets/wave1/manifest'})).statusCode).toBe(404);
    expect((await disabled.http.inject({method:'POST',url:'/v1/pets/wave1/gacha/pull',headers:{origin}})).statusCode).toBe(404);
  });

  it('2 requires an authenticated guest session and CSRF on mutations',async()=>{
    const visitor=await guest();
    expect((await app.http.inject({method:'GET',url:'/v1/pets/wave1/state',remoteAddress,headers:{origin}})).statusCode).toBe(401);
    const missing=await app.http.inject({method:'POST',url:'/v1/pets/wave1/party',remoteAddress,headers:{origin,cookie:visitor.cookie},payload:{requestId:randomUUID(),petIds:['fire-coalwhisk']}});
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toMatchObject({error:{code:'FORBIDDEN'}});
    const forged=await app.http.inject({method:'POST',url:'/v1/pets/wave1/party',remoteAddress,headers:{origin,cookie:visitor.cookie,'x-csrf-token':'0'.repeat(64)},payload:{requestId:randomUUID(),petIds:['fire-coalwhisk']}});
    expect(forged.statusCode).toBe(403);
  });

  it('3 starts with the wallet, three starters and an empty campaign',async()=>{
    const visitor=await guest();
    const response=await get(app,'/v1/pets/wave1/state',visitor);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toBe('Cookie');
    const view=response.json() as StateView;
    expect(view).toMatchObject({
      revision:0,wallet:{coins:8000},party:['fire-coalwhisk','water-dewskip','ground-clodkin'],
      campaign:{clearedMaps:[],nextMapId:'cinder-terraces'},
      gacha:{misses:0,guaranteed:false,revision:0,history:[]},
    });
    expect(view.pets.map(pet=>pet.petId)).toEqual(['fire-coalwhisk','water-dewskip','ground-clodkin']);
    expect(view.pets.map(pet=>pet.name)).toEqual(['Coalwhisk','Dewskip','Clodkin']);
    for(const pet of view.pets){
      expect(pet).toMatchObject({level:1,exp:0,expToNext:30,stage:0,unlocks:[],duplicateExp:0});
    }
    expect(view.pets[0].stats).toEqual({hp:100,attack:24,defense:12,speed:14});
  });

  it('4 owns and orders a 1-4 Pet party with unique ownership',async()=>{
    const visitor=await guest();
    featuredDraw();
    expect((await pull(visitor,1)).statusCode).toBe(200);
    const four=['fire-coalwhisk','water-dewskip','ground-clodkin','pet-v3-fire-icarus'];
    const saved=await post(app,'/v1/pets/wave1/party',{requestId:randomUUID(),petIds:four},visitor);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({revision:2,party:four});
    expect((await state(app,visitor)).party).toEqual(four);
    const reduced=await post(app,'/v1/pets/wave1/party',{requestId:randomUUID(),petIds:['water-dewskip','fire-coalwhisk']},visitor);
    expect(reduced.statusCode).toBe(200);
    expect((reduced.json() as PartyResponse).party).toEqual(['water-dewskip','fire-coalwhisk']);
    for(const petIds of [
      ['fire-coalwhisk','fire-coalwhisk'],
      ['light-gleamlet'],
      ['fire-coalwhisk','water-dewskip','ground-clodkin','pet-v3-fire-icarus','pet-v31-water-marivell'],
      [],
    ]){
      const response=await post(app,'/v1/pets/wave1/party',{requestId:randomUUID(),petIds},visitor);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({error:{code:'INVALID_REQUEST'}});
    }
    expect((await state(app,visitor)).party).toEqual(['water-dewskip','fire-coalwhisk']);
  });

  it('5 rejects locked, unknown and invalid campaign plays and persists no loss',async()=>{
    const visitor=await guest();
    expect((await play(visitor,'tideglass-lagoon','water-dewskip')).statusCode).toBe(400);
    expect((await play(visitor,'unknown-map','fire-coalwhisk')).statusCode).toBe(400);
    expect((await play(visitor,'cinder-terraces','light-gleamlet')).statusCode).toBe(400);
    expect((await play(visitor,'cinder-terraces','fire-coalwhisk',randomUUID(),['dance'])).statusCode).toBe(400);
    const loss=await play(visitor,'cinder-terraces','fire-coalwhisk',randomUUID(),GUARDS);
    expect(loss.statusCode).toBe(200);
    const body=loss.json() as CampaignResponse;
    expect(body.result).toMatchObject({
      mapId:'cinder-terraces',won:false,firstClear:false,
      regular:{won:false,turns:12,remainingHp:64,enemyHp:70},boss:null,
      rewards:{exp:0,coins:0,levelsGained:0,stage:0},
    });
    expect(body.state).toMatchObject({revision:1,wallet:{coins:8000},campaign:{clearedMaps:[],nextMapId:'cinder-terraces'}});
    expect(body.state.pets[0]).toMatchObject({petId:'fire-coalwhisk',level:1,exp:0});
    expect(await scalar('SELECT count(*)::int AS value FROM pet_wave_one_map_clears WHERE account_id=$1',[visitor.accountId])).toBe(0);
  });

  it('6 awards the first clear, levels the Pet and reduces a replay reward',async()=>{
    const visitor=await guest();
    const first=await play(visitor,'cinder-terraces','fire-coalwhisk');
    expect(first.statusCode).toBe(200);
    const cleared=first.json() as CampaignResponse;
    expect(cleared.result).toEqual({
      mapId:'cinder-terraces',won:true,firstClear:true,
      regular:{won:true,turns:5,remainingHp:82,enemyHp:0},
      boss:{won:true,turns:9,remainingHp:44,enemyHp:0},
      rewards:{exp:500,coins:200,levelsGained:9,stage:0},
    });
    expect(cleared.state).toMatchObject({
      revision:1,wallet:{coins:8200},campaign:{clearedMaps:['cinder-terraces'],nextMapId:'tideglass-lagoon'},
    });
    expect(cleared.state.pets[0]).toMatchObject({petId:'fire-coalwhisk',level:10,exp:50,expToNext:75,stage:0});
    expect(await scalar('SELECT count(*)::int AS value FROM pet_wave_one_map_clears WHERE account_id=$1',[visitor.accountId])).toBe(1);
    const replay=await play(visitor,'cinder-terraces','fire-coalwhisk');
    expect(replay.statusCode).toBe(200);
    const repeated=replay.json() as CampaignResponse;
    expect(repeated.result).toMatchObject({
      mapId:'cinder-terraces',won:true,firstClear:false,
      rewards:{exp:120,coins:40,levelsGained:2,stage:0},
    });
    expect(repeated.state).toMatchObject({revision:2,wallet:{coins:8240},campaign:{clearedMaps:['cinder-terraces'],nextMapId:'tideglass-lagoon'}});
    expect(repeated.state.pets[0]).toMatchObject({level:12,exp:15,expToNext:85,stage:0});
    expect(await scalar('SELECT count(*)::int AS value FROM pet_wave_one_map_clears WHERE account_id=$1',[visitor.accountId])).toBe(1);
    expect(await scalar('SELECT replays AS value FROM pet_wave_one_map_clears WHERE account_id=$1 AND map_id=$2',[visitor.accountId,'cinder-terraces'])).toBe(1);
  });

  it('7 returns the stored response for a retried request without double rewards',async()=>{
    const visitor=await guest();
    const requestId=randomUUID();
    const first=await play(visitor,'cinder-terraces','fire-coalwhisk',requestId);
    expect(first.statusCode).toBe(200);
    const stored=first.json() as CampaignResponse;
    const retried=await play(visitor,'cinder-terraces','fire-coalwhisk',requestId);
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toEqual(stored);
    const view=await state(app,visitor);
    expect(view.wallet.coins).toBe(8200);
    expect(view.pets[0]).toMatchObject({level:10,exp:50});
    expect(view.revision).toBe(1);
    expect(await scalar('SELECT count(*)::int AS value FROM pet_wave_one_requests WHERE account_id=$1',[visitor.accountId])).toBe(1);
    const conflict=await play(visitor,'tideglass-lagoon','fire-coalwhisk',requestId);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({error:{code:'REQUEST_CONFLICT'}});
    expect(await state(app,visitor)).toMatchObject({revision:1,wallet:{coins:8200}});
  });

  it('8 debits gacha coins, records misses, guarantees featured and reports duplicates',async()=>{
    const visitor=await guest();
    missDraw();
    const miss=await pull(visitor,1);
    expect(miss.statusCode).toBe(200);
    const missed=miss.json() as GachaResponse;
    expect(missed).toMatchObject({revision:1,pulls:[],cost:100,state:{wallet:{coins:7900},gacha:{misses:1,guaranteed:false,revision:1,history:[{seq:1,petId:null,pityBefore:0}]}}});
    expect(missed.state.pets[0]).toMatchObject({petId:'fire-coalwhisk',level:1,exp:25});
    featuredDraw();
    const first=await pull(visitor,1);
    const featured=first.json() as GachaResponse;
    expect(featured).toMatchObject({revision:2,cost:100,pulls:[{petId:'pet-v3-fire-icarus',featured:true,duplicate:false,pityBefore:1}]});
    expect(featured.state).toMatchObject({wallet:{coins:7800},gacha:{misses:0,guaranteed:false,revision:2}});
    expect(featured.state.gacha.history).toHaveLength(2);
    expect(featured.state.gacha.history[1]).toMatchObject({seq:2,petId:'pet-v3-fire-icarus',featured:true,duplicate:false});
    offRateDraw(2);
    const offRate=(await pull(visitor,1)).json() as GachaResponse;
    expect(offRate).toMatchObject({revision:3,pulls:[{petId:'pet-v31-electric-quorion',featured:false,duplicate:false,pityBefore:0}]});
    expect(offRate.state.gacha).toMatchObject({misses:0,guaranteed:true,revision:3});
    draw(0,999_999,0);
    const guaranteed=(await pull(visitor,1)).json() as GachaResponse;
    expect(guaranteed).toMatchObject({revision:4,pulls:[{petId:'pet-v3-fire-icarus',featured:true,duplicate:true,pityBefore:0}]});
    expect(guaranteed.state.gacha).toMatchObject({guaranteed:false,revision:4});
    expect(guaranteed.state.pets.find(pet=>pet.petId==='pet-v3-fire-icarus')).toMatchObject({level:6,exp:0,duplicateExp:200});
    featuredDraw();
    const duplicate=(await pull(visitor,1)).json() as GachaResponse;
    expect(duplicate).toMatchObject({revision:5,pulls:[{petId:'pet-v3-fire-icarus',featured:true,duplicate:true,pityBefore:0}],cost:100});
    expect(duplicate.state).toMatchObject({wallet:{coins:7500},gacha:{revision:5}});
    expect(duplicate.state.gacha.history).toHaveLength(5);
    expect(duplicate.state.gacha.history[4]).toMatchObject({seq:5,duplicate:true});
    expect(duplicate.state.pets.filter(pet=>pet.petId==='pet-v3-fire-icarus')).toHaveLength(1);
    expect(duplicate.state.pets.find(pet=>pet.petId==='pet-v3-fire-icarus')).toMatchObject({level:9,exp:20,duplicateExp:400});
    await pool.query('UPDATE pet_wave_one_players SET coins=50 WHERE account_id=$1',[visitor.accountId]);
    const poor=await pull(visitor,1);
    expect(poor.statusCode).toBe(409);
    expect(poor.json()).toMatchObject({error:{code:'INSUFFICIENT_FUNDS'}});
    expect(await state(app,visitor)).toMatchObject({wallet:{coins:50},gacha:{misses:0,guaranteed:false,revision:5}});
  });

  it('9 resolves a ten-pull with first copies and duplicate EXP in order',async()=>{
    const visitor=await guest();
    for(let index=0;index<10;index+=1)featuredDraw();
    const response=await pull(visitor,10);
    expect(response.statusCode).toBe(200);
    const body=response.json() as GachaResponse;
    expect(body.cost).toBe(1000);
    expect(body.pulls).toHaveLength(10);
    expect(body.pulls.every(entry=>entry.petId==='pet-v3-fire-icarus'&&entry.featured)).toBe(true);
    expect(body.pulls[0].duplicate).toBe(false);
    expect(body.pulls.slice(1).every(entry=>entry.duplicate)).toBe(true);
    expect(body.state).toMatchObject({revision:1,wallet:{coins:7000},gacha:{misses:0,guaranteed:false,revision:10}});
    expect(body.state.gacha.history.map(entry=>entry.seq)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(body.state.pets.find(pet=>pet.petId==='pet-v3-fire-icarus')).toMatchObject({level:22,exp:120,duplicateExp:1800,stage:1});
    expect(body.state.pets.filter(pet=>pet.petId==='pet-v3-fire-icarus')).toHaveLength(1);
  });

  it('10 applies soft pity at pull 60 and the hard pity ceiling',async()=>{
    const visitor=await guest();
    await state(app,visitor);
    await pool.query('UPDATE pet_wave_one_players SET gacha_misses=59,coins=1000 WHERE account_id=$1',[visitor.accountId]);
    draw(50_000,0,0);
    const soft=(await pull(visitor,1)).json() as GachaResponse;
    expect(soft.pulls).toEqual([{petId:'pet-v3-fire-icarus',featured:true,duplicate:false,pityBefore:59}]);
    expect(soft.state.gacha).toMatchObject({misses:0,guaranteed:false,revision:1});
    expect(soft.state.wallet.coins).toBe(900);
    await pool.query('UPDATE pet_wave_one_players SET gacha_misses=79,coins=1000 WHERE account_id=$1',[visitor.accountId]);
    draw(999_999,0,0);
    const hard=(await pull(visitor,1)).json() as GachaResponse;
    expect(hard.pulls).toEqual([{petId:'pet-v3-fire-icarus',featured:true,duplicate:true,pityBefore:79}]);
    expect(hard.state.gacha).toMatchObject({misses:0,guaranteed:false,revision:2});
  });

  it('11 rejects client-selected entropy and invalid pull shapes',async()=>{
    const visitor=await guest();
    for(const payload of [
      {requestId:randomUUID(),count:1,sRoll:0},
      {requestId:randomUUID(),count:1,featuredRoll:0},
      {requestId:randomUUID(),count:1,offRateTicket:0},
      {requestId:randomUUID(),count:5},
    ]){
      const response=await post(app,'/v1/pets/wave1/gacha/pull',payload,visitor);
      expect(response.statusCode).toBe(422);
    }
    expect(await state(app,visitor)).toMatchObject({wallet:{coins:8000},gacha:{revision:0,history:[]}});
  });

  it('12 survives a newly created app instance against the same database',async()=>{
    const first=await createApp(config,pool,false,{petArenaWave1:{enabled:true,entropy}});
    const visitor=await guest(first);
    const pullRequestId=randomUUID();
    featuredDraw();
    const pulled=await pull(visitor,1,pullRequestId,first);
    expect(pulled.statusCode).toBe(200);
    const storedPull=pulled.json() as GachaResponse;
    expect((await play(visitor,'cinder-terraces','fire-coalwhisk',randomUUID(),POLICY,undefined,first)).statusCode).toBe(200);
    expect((await post(first,'/v1/pets/wave1/party',{requestId:randomUUID(),petIds:['water-dewskip']},visitor)).statusCode).toBe(200);
    const before=await state(first,visitor);
    expect(before).toMatchObject({revision:3,wallet:{coins:8100},party:['water-dewskip'],campaign:{clearedMaps:['cinder-terraces']}});
    await first.app.close();
    const second=await createApp(config,pool,false,{petArenaWave1:{enabled:true,entropy}});
    try{
      expect(await state(second,visitor)).toEqual(before);
      const replayed=await pull(visitor,1,pullRequestId,second);
      expect(replayed.statusCode).toBe(200);
      expect(replayed.json()).toEqual(storedPull);
      expect(await state(second,visitor)).toMatchObject({revision:3,wallet:{coins:8100}});
      const next=await post(second,'/v1/pets/wave1/party',{requestId:randomUUID(),petIds:['fire-coalwhisk']},visitor);
      expect(next.statusCode).toBe(200);
      expect((next.json() as PartyResponse).revision).toBe(4);
      expect((await state(second,visitor)).party).toEqual(['fire-coalwhisk']);
    }finally{await second.app.close();}
  });

  it('13 refuses to enable the composition in production',async()=>{
    const production:Config={...config,NODE_ENV:'production'};
    await expect(createApp(production,pool,false,{petArenaWave1:{enabled:true}})).rejects.toThrow('local/test only');
  });
  it('14 previews authoritative turns and verifies the same Icarus FIRE_ZONE replay on settlement',async()=>{
    const visitor=await guest();
    const mapId='cinder-terraces',petId='pet-v3-fire-icarus',url='/v1/pets/wave1/campaign/preview';
    featuredDraw();
    expect((await pull(visitor,1)).statusCode).toBe(200);
    const save=await post(app,'/v1/pets/wave1/party',{requestId:randomUUID(),petIds:[petId,'fire-coalwhisk']},visitor);
    expect(save.statusCode).toBe(200);
    const charge=['guard','guard','guard'];
    const actions=[...charge,'fire-zone'];
    expect((await post(app,url,{mapId,petId,actions},visitor)).statusCode).toBe(400);
    expect((await post(app,url,{mapId,petId:'fire-coalwhisk',actions},visitor)).statusCode).toBe(400);
    await pool.query('UPDATE pet_wave_one_owned SET level=40 WHERE account_id=$1 AND pet_id=$2',[visitor.accountId,petId]);
    const start=await post(app,url,{mapId,petId,actions:[]},visitor);
    expect(start.json()).toMatchObject({turns:0,remainingHp:295,enemyHp:70,rage:0,effectiveness:800});
    expect((await post(app,url,{mapId,petId,actions:charge,bossActions:[]},visitor)).statusCode).toBe(400);
    expect((await post(app,url,{mapId,petId,actions:charge},visitor)).json()).toMatchObject({rage:100,skillReady:true,complete:false});
    expect((await post(app,url,{mapId,petId,actions},visitor)).json()).toMatchObject({won:true,rage:0,fireZoneTurns:2});
    const bossActions=[...actions,'guard','guard','strike'];
    expect((await post(app,url,{mapId,petId,actions,bossActions:bossActions.slice(0,5)},visitor)).json()).toMatchObject({enemyHp:24,fireZoneTurns:1});
    expect(await state(app,visitor)).toMatchObject({revision:2,campaign:{clearedMaps:[]}});
    const settled=await play(visitor,mapId,petId,randomUUID(),actions,bossActions);
    expect(settled.statusCode).toBe(200);
    expect(settled.json()).toMatchObject({result:{won:true,boss:{turns:7,remainingHp:268,enemyHp:0}}});
  });

  it('15 clears all six maps, recruits campaign Pets and preserves the level cap',async()=>{
    const visitor=await guest();
    await state(app,visitor);
    await pool.query('UPDATE pet_wave_one_owned SET level=59,exp=319 WHERE account_id=$1 AND pet_id=$2',[visitor.accountId,'ground-clodkin']);
    const mapIds=['cinder-terraces','tideglass-lagoon','stormcoil-fields','lantern-necropolis','ochre-labyrinth','dawn-prism-sanctum'];
    const petId='ground-clodkin',attacks=Array.from({length:12},()=>'strike');
    for(const [index,mapId] of mapIds.entries()){
      const response=await play(visitor,mapId,petId,randomUUID(),attacks);
      expect(response.statusCode).toBe(200);
      const result=response.json() as CampaignResponse;
      expect(result.result).toMatchObject({won:true,firstClear:true,rewards:{stage:3,levelsGained:index===0?1:0}});
      expect(result.acquiredPetId).toEqual(expect.any(String));
      expect(result.state.campaign.nextMapId).toBe(mapIds[index+1]??null);
    }
    for(let index=0;index<4;index++){
      const response=await play(visitor,mapIds[0],petId,randomUUID(),attacks);
      expect(response.statusCode).toBe(200);
      expect((response.json() as CampaignResponse).result.firstClear).toBe(false);
    }
    const final=await state(app,visitor);
    expect(final.campaign).toEqual({clearedMaps:mapIds,nextMapId:null});
    expect(final.pets).toEqual(expect.arrayContaining([
      expect.objectContaining({petId,level:60,exp:0,stage:3}),
      expect.objectContaining({petId:'fire-pyrecrown',level:1}),
    ]));
  });

  it('16 serializes concurrent requests with the same mutation key',async()=>{
    const visitor=await guest();
    const key=randomUUID();
    featuredDraw();
    const results=await Promise.all([pull(visitor,1,key),pull(visitor,1,key)]);
    expect(results.map(response=>response.statusCode)).toEqual([200,200]);
    expect(results[0].json()).toEqual(results[1].json());
    expect(await state(app,visitor)).toMatchObject({revision:1,wallet:{coins:7900},gacha:{history:[{seq:1,petId:'pet-v3-fire-icarus'}]}});
    const exported=await get(disabled,'/v1/me/export',visitor);
    expect(exported.statusCode).toBe(200);
    expect(exported.json()).toMatchObject({domains:{petArenaWave1:{wallet:{coins:7900},
      gacha:{history:[{seq:1,petId:'pet-v3-fire-icarus'}]}}}});
    const deleted=await app.http.inject({
      method:'DELETE',url:'/v1/me',remoteAddress,
      headers:{origin,cookie:visitor.cookie,'x-csrf-token':visitor.csrf,'idempotency-key':randomUUID()},
    });
    expect(deleted.statusCode).toBe(200);
    expect(await scalar('SELECT count(*)::int AS value FROM pet_wave_one_players WHERE account_id=$1',[visitor.accountId])).toBe(0);
  });

});
