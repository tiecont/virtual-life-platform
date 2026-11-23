import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {
  CORE_ELEMENTS,
  GACHA_FEATURED,
  GACHA_STANDARD_POOL,
  GACHA_ODDS,
  MAPS,
  PARSED_WAVE1_MANIFEST,
  WAVE1_RULES_HASH,
  Wave1ManifestSchema,
} from '../../apps/platform-api/src/features/pets/modules/wave1/domain/manifest';

const origin='http://127.0.0.1:3300',schema='wave1_pet_test_'+randomUUID().replaceAll('-','');
let admin:Pool,pool:Pool,app:Awaited<ReturnType<typeof createApp>>,disabled:Awaited<ReturnType<typeof createApp>>;
let auth:{cookie:string;csrf:string};

beforeAll(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL??'');
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test database required');
  admin=new Pool({connectionString:url.toString()});
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options','-c search_path='+schema);
  pool=new Pool({connectionString:url.toString()});
  await migrate(pool);
  const config=readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'wave1-pet-arena-test-session-secret-0001'});
  app=await createApp(config,pool,false,{petArenaWave1:{enabled:true}});
  disabled=await createApp(config,pool,false,{petArenaWave1:{enabled:false}});
  const guest=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.201.0.1',headers:{origin},payload:{requestId:randomUUID(),displayName:'Wave 1 Arena visitor',avatarKey:'mint'}});
  expect(guest.statusCode).toBe(201);
  auth={
    cookie:String(guest.headers['set-cookie']).split(';')[0],
    csrf:String(guest.json().csrfToken),
  };
});

afterAll(async()=>{
  await app?.app.close();
  await disabled?.app.close();
  await pool?.end();
  if(admin){await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
});

const get=(url:string,headers:{cookie?:string}={})=>app.http.inject({method:'GET',url,headers:{origin,...headers}});
const post=(url:string,payload:unknown,headers=auth)=>app.http.inject({
  method:'POST',url,remoteAddress:'127.201.0.1',
  headers:{origin,cookie:headers.cookie,'x-csrf-token':headers.csrf},
  payload:payload as Record<string,unknown>,
});

describe('Wave 1 Pet Arena deterministic backend contract',()=>{
  it('1 is absent unless the local/test preview composition explicitly enables it',async()=>{
    expect((await disabled.http.inject('/v1/pets/wave1/manifest')).statusCode).toBe(404);
    expect((await get('/v1/pets/wave1/manifest',{cookie:auth.cookie})).statusCode).toBe(200);
  });
  it('2 requires an authenticated session',async()=>{
    expect((await get('/v1/pets/wave1/manifest')).statusCode).toBe(401);
  });
  it('3 rejects unknown query fields before returning rule data',async()=>{
    expect((await get('/v1/pets/wave1/manifest?extra=1',{cookie:auth.cookie})).statusCode).toBe(422);
  });
  it('4 marks every preview response private and non-cacheable',async()=>{
    const response=await get('/v1/pets/wave1/manifest',{cookie:auth.cookie});
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toBe('Cookie');
  });
  it('5 returns the strict versioned manifest DTO',async()=>{
    const response=await get('/v1/pets/wave1/manifest',{cookie:auth.cookie});
    expect(Wave1ManifestSchema.parse(response.json())).toEqual(PARSED_WAVE1_MANIFEST);
  });
  it('6 exposes exactly six core elements',async()=>{
    expect(CORE_ELEMENTS).toEqual(['fire','water','electric','ghost','ground','light']);
    expect(PARSED_WAVE1_MANIFEST.elements).toHaveLength(6);
  });
  it('7 provides a complete bounded 6x6 effectiveness matrix',async()=>{
    for(const row of PARSED_WAVE1_MANIFEST.elements){
      expect(Object.keys(row.effectiveness)).toHaveLength(6);
      for(const value of Object.values(row.effectiveness))expect([0,800,1000,1250]).toContain(value);
    }
  });
  it('8 preserves the canonical electric immunity to ground',async()=>{
    expect(PARSED_WAVE1_MANIFEST.elements.find(value=>value.id==='electric').effectiveness.ground).toBe(0);
    expect(PARSED_WAVE1_MANIFEST.elements.find(value=>value.id==='ground').effectiveness.electric).toBe(1250);
  });
  it('9 keeps every element addressable in at least one directional row',async()=>{
    for(const element of CORE_ELEMENTS)expect(PARSED_WAVE1_MANIFEST.elements.some(row=>row.effectiveness[element]!==1000)).toBe(true);
  });
  it('10 pins the three evolution thresholds at 20, 40 and 60',async()=>{
    expect(PARSED_WAVE1_MANIFEST.evolution.map(value=>value.level)).toEqual([20,40,60]);
    expect(PARSED_WAVE1_MANIFEST.maxLevel).toBe(60);
  });
  it('11 returns base-stage stats at level 1',async()=>{
    const response=await post('/v1/pets/wave1/evolution/preview',{element:'fire',level:1});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({stage:0,stats:{hp:100,attack:24,defense:12,speed:14},unlocks:[]});
  });
  it('12 remains in base stage at level 19',async()=>{
    expect((await post('/v1/pets/wave1/evolution/preview',{element:'fire',level:19})).json().stage).toBe(0);
  });
  it('13 unlocks evolution stage 1 at level 20',async()=>{
    const body=(await post('/v1/pets/wave1/evolution/preview',{element:'fire',level:20})).json();
    expect(body.stage).toBe(1);
    expect(body.unlocks).toContain('second-skill-and-map-2');
  });
  it('14 keeps stage 1 at level 39',async()=>{
    expect((await post('/v1/pets/wave1/evolution/preview',{element:'water',level:39})).json().stage).toBe(1);
  });
  it('15 unlocks evolution stage 2 at level 40',async()=>{
    expect((await post('/v1/pets/wave1/evolution/preview',{element:'ghost',level:40})).json()).toMatchObject({stage:2,unlocks:expect.arrayContaining(['signature-slot-and-boss-assist'])});
  });
  it('16 keeps stage 2 at level 59',async()=>{
    expect((await post('/v1/pets/wave1/evolution/preview',{element:'ground',level:59})).json().stage).toBe(2);
  });
  it('17 unlocks final evolution stage 3 at level 60 without changing order',async()=>{
    const body=(await post('/v1/pets/wave1/evolution/preview',{element:'light',level:60})).json();
    expect(body.stage).toBe(3);
    expect(body.unlocks).toEqual(['second-skill-and-map-2','signature-slot-and-boss-assist','ultimate-skill-and-mastery-aura']);
  });
  it('18 rejects levels above the max-60 cap',async()=>{
    expect((await post('/v1/pets/wave1/evolution/preview',{element:'light',level:61})).statusCode).toBe(422);
  });
  it('19 rejects unknown elements and unknown DTO fields',async()=>{
    expect((await post('/v1/pets/wave1/evolution/preview',{element:'normal',level:20})).statusCode).toBe(422);
    expect((await post('/v1/pets/wave1/evolution/preview',{element:'fire',level:20,damage:999})).statusCode).toBe(422);
  });
  it('20 exposes six ordered maps with one regular encounter and one boss each',async()=>{
    expect(PARSED_WAVE1_MANIFEST.maps).toHaveLength(6);
    expect(PARSED_WAVE1_MANIFEST.maps.map(value=>value.id)).toEqual(MAPS.map(value=>value.id));
    for(const map of PARSED_WAVE1_MANIFEST.maps){expect(map.regular.boss).toBe(false);expect(map.boss.boss).toBe(true);}
  });
  it('21 starts a clean campaign at Cinder Terraces',async()=>{
    const response=await post('/v1/pets/wave1/campaign/next',{heroElement:'fire',level:30,clearedMaps:[]});
    expect(response.statusCode).toBe(200);
    expect(response.json().nextMap.id).toBe('cinder-terraces');
  });
  it('22 derives only the next prerequisite map from an ordered clear prefix',async()=>{
    expect((await post('/v1/pets/wave1/campaign/next',{heroElement:'water',level:40,clearedMaps:['cinder-terraces']})).json().nextMap.id).toBe('tideglass-lagoon');
    expect((await post('/v1/pets/wave1/campaign/next',{heroElement:'light',level:60,clearedMaps:MAPS.map(value=>value.id)})).json().nextMap).toBeNull();
  });
  it('23 rejects out-of-order or duplicate campaign progress',async()=>{
    expect((await post('/v1/pets/wave1/campaign/next',{heroElement:'fire',level:30,clearedMaps:['tideglass-lagoon']})).statusCode).toBe(422);
    expect((await post('/v1/pets/wave1/campaign/next',{heroElement:'fire',level:30,clearedMaps:['cinder-terraces','cinder-terraces']})).statusCode).toBe(422);
  });
  it('24 exposes Icarus plus exactly six equal-weight Standard S off-rate candidates and disabled purchases',async()=>{
    const response=await get('/v1/pets/wave1/gacha',{cookie:auth.cookie});
    const gacha=response.json();
    expect(gacha).toMatchObject({enabled:false,purchasesEnabled:false,featured:GACHA_FEATURED,featuredProbabilityForS:500_000,softPityAt:60,hardPityAt:80});
    expect(gacha.standardPool.map(value=>value.petId)).toEqual(GACHA_STANDARD_POOL);
    expect(new Set(gacha.standardPool.map(value=>value.weight))).toEqual(new Set([1]));
    expect(gacha.sProbabilityByPull).toEqual(GACHA_ODDS);
    expect(gacha.sProbabilityByPull.at(-1).sProbabilityPpm).toBe(1_000_000);
    expect(gacha.sProbabilityByPull.every((value,index,rows)=>index===0||value.sProbabilityPpm>=rows[index-1].sProbabilityPpm)).toBe(true);
    expect(PARSED_WAVE1_MANIFEST.rulesHash).toBe(WAVE1_RULES_HASH);
  });
});
