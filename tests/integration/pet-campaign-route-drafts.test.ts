import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {CampaignRouteDraftStore} from '../../apps/platform-api/src/features/pets/modules/campaign-routes/infrastructure/draft-store';
import {readCampaignRouteDraft} from '../../apps/platform-api/src/features/pets/modules/campaign-routes/domain/route-draft';
import {collectionPet} from '../../apps/platform-api/src/features/pets/modules/wave1/application/service';
import {WAVE1_PET_BY_ID,GACHA_OFF_RATE_POOL} from '../../apps/platform-api/src/features/pets/modules/wave1/domain/catalog';

const schema='route_draft_'+randomUUID().replaceAll('-','');
const revision='6'.repeat(40);
let admin:Pool,pool:Pool;
let draft:ReturnType<typeof readCampaignRouteDraft>;

beforeAll(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL??'');
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))
    throw new Error('Disposable database required');
  admin=new Pool({connectionString:url.toString()});
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options','-c search_path='+schema);
  pool=new Pool({connectionString:url.toString()});
  await migrate(pool);
  const source=JSON.parse(await readFile('specs/pet-arena/campaign-v4-content.json','utf8'));
  draft=readCampaignRouteDraft({version:source.schemaVersion,state:source.releaseState,
    acquisitionEnabled:source.routeAcquisitionEnabled,maps:source.maps});
});
afterAll(async()=>{
  await pool?.end();
  if(admin){await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
});

describe('private campaign route draft authority',()=>{
  it('retains one immutable, digest-bound version for concurrent submissions',async()=>{
    const store=new CampaignRouteDraftStore(pool);
    const [first,second]=await Promise.all([store.insert(draft,revision),store.insert(draft,revision)]);
    expect(first).toEqual(second);
    expect((await store.version(first.version))?.draft).toEqual(draft);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.draft.maps.flatMap(map=>map.routes)).toHaveLength(48);
    expect(first.draft.acquisitionEnabled).toBe(false);
    await expect(pool.query('UPDATE pet_arena_campaign_route_drafts SET source_revision=$1 WHERE version=$2',
      ['7'.repeat(40),first.version])).rejects.toMatchObject({code:'23514'});
    const limits=await pool.query('SELECT (SELECT count(*) FROM pet_wave_one_owned)::int AS owned,'+
      '(SELECT count(*) FROM gameplay_config_active)::int AS active');
    expect(limits.rows).toEqual([{owned:0,active:0}]);
  });

  it('rejects a missing prerequisite, cross-map Pet and gated Standard S',async()=>{
    const store=new CampaignRouteDraftStore(pool);
    const skip=structuredClone(draft);
    skip.maps[0].routes[7].prerequisiteEncounterId=null;
    await expect(store.insert(skip,revision)).rejects.toThrow('prerequisite order');
    const crossed=structuredClone(draft);
    crossed.maps[0].routes[5].opponentPetId='bird-water-tidewren';
    await expect(store.insert(crossed,revision)).rejects.toThrow('unique, active map Pet');
    const gated=structuredClone(draft);
    gated.maps[0].routes[0].opponentPetId='pet-s-fire-vulcaryn';
    await expect(store.insert(gated,revision)).rejects.toThrow('unique, active map Pet');
  });

  it('rejects an enabled or incomplete draft in PostgreSQL independently of the loader',async()=>{
    const insert='INSERT INTO pet_arena_campaign_route_drafts(content_digest,source_revision,draft) VALUES($1,$2,$3)';
    await expect(pool.query(insert,['a'.repeat(64),revision,{...draft,acquisitionEnabled:true}]))
      .rejects.toMatchObject({code:'23514'});
    const incomplete:Partial<typeof draft>={...draft};
    delete incomplete.acquisitionEnabled;
    await expect(pool.query(insert,['b'.repeat(64),revision,incomplete])).rejects.toMatchObject({code:'23514'});
  });

  it('prepares family ownership presentation and retains the frozen historical banner',()=>{
    expect(collectionPet('fire-coalwhisk')).toEqual(WAVE1_PET_BY_ID.get('fire-coalwhisk'));
    expect(collectionPet('dragon-fire-ignivar')).toEqual({name:'Ignivar',element:'fire',rank:'S'});
    expect(collectionPet('bird-fire-cinderquill')).toEqual({name:'Cinderquill',element:'fire',rank:'A'});
    expect(collectionPet('pet-s-fire-vulcaryn')).toBeUndefined();
    expect(GACHA_OFF_RATE_POOL).not.toContain('dragon-fire-ignivar');
    expect(GACHA_OFF_RATE_POOL).not.toContain('bird-fire-cinderquill');
    expect(GACHA_OFF_RATE_POOL).not.toContain('pet-s-fire-vulcaryn');
  });
});
