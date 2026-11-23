import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool,type PoolClient} from 'pg';
import {randomUUID,randomBytes} from 'node:crypto';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {PetManifestStore,petManifestHash} from '../../apps/platform-api/src/features/pets/modules/content/infrastructure/manifest-store';
import {PetContentManifestV3Schema,PetMatchContentPinV3Schema} from '@aetheria/contracts';
import {petManifestFixture} from '../support/pet-manifest-fixture';
import {petDesignDraft} from '../../scripts/pet-content-draft-seed.mjs';
async function fixture(){return petManifestFixture(await petDesignDraft());}

const schema='pet_manifest_'+randomUUID().replaceAll('-','');let admin:Pool,pool:Pool,store:PetManifestStore;
beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL!);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test/.test(url.pathname.slice(1)))throw Error('Disposable local DB required');
 admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await Promise.all([migrate(pool),migrate(pool)]);store=new PetManifestStore(pool);
});
afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function transaction<T>(work:(tx:PoolClient)=>Promise<T>){const tx=await pool.connect();try{await tx.query('BEGIN');const result=await work(tx);await tx.query('COMMIT');return result;}catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}}
async function version(name:string){const value=await fixture();value.maps[0].displayName=name;return store.seal(value);}
async function select(hash:string){return store.transition('select',hash,(await store.selection()).revision);}
function pin(hash:string){return PetMatchContentPinV3Schema.parse({schemaVersion:3,ruleset:'pet-arena-pve-v3',contentHash:hash,rulesHash:'a'.repeat(64),loadout:'starter',encounter:'practice-fire',encounterRevision:1,level:1,stats:{hp:100,attack:10,defense:5,speed:10}});}
async function insertMatch(tx:PoolClient,id:string,hash:string){await tx.query(`INSERT INTO game_native_matches(id,world_id,ruleset_id,ruleset_version,content_hash,engine_hash,owner_boot_id,epoch,server_tick,logical_time_ms,rng_cursor,status,seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot,protocol_version,canonical_version,rng_version)
 VALUES($1,'native:pet-arena','pet-arena-pve-v3',3,$2,$3,$4,1,0,0,0,'ACTIVE',$5,$6,'fixture-key',$7,$8,$9,1,1,1)`,[id,Buffer.from(hash,'hex'),Buffer.from('a'.repeat(64),'hex'),randomUUID(),randomBytes(32),randomBytes(32),randomBytes(12),randomBytes(16),randomBytes(32)]);}
it('seals concurrently and hashes unordered definitions consistently without changing ordered equipment',async()=>{
 const value=await fixture(),hash=petManifestHash(value),results=await Promise.all(Array.from({length:8},()=>store.seal(value)));
 expect(results.filter(r=>r.created)).toHaveLength(1);value.species.reverse();value.effectiveness.reverse();expect(petManifestHash(value)).toBe(hash);
 expect((await store.read(hash)).manifest.species).toHaveLength(114);
 await expect(pool.query('UPDATE pet_content_versions SET manifest=$2 WHERE content_hash=$1',[hash,JSON.stringify({...value,rulesHash:'b'.repeat(64)})])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query('DELETE FROM pet_content_versions WHERE content_hash=$1',[hash])).rejects.toMatchObject({code:'23514'});
});
it('rejects unknown fields, nested objects, executable content, broken references and immunity softlocks before SQL',async()=>{
 const value=await fixture(),before=(await pool.query('SELECT count(*) FROM pet_content_versions')).rows[0].count;
 for(const change of [
  (v:typeof value)=>Object.assign(v,{script:{nested:{execute:'bad'}}}),
  (v:typeof value)=>Object.assign(v.encounters[0],{level:'1'}),
  (v:typeof value)=>{v.cards[0].skill='missing';},
  (v:typeof value)=>{v.encounters[0].revision=0;},
  (v:typeof value)=>{v.loadouts[0].cards.push(v.loadouts[0].cards[0]);},
  (v:typeof value)=>{v.effectiveness.forEach(e=>{if(e.defender==='fire')e.permille=0;});},
  (v:typeof value)=>Object.assign(v.assets,{0:{id:'bad',species:'missing',rights:'APPROVED'}}),
  (v:typeof value)=>Object.assign(v,{release:'PRODUCTION'}),
 ]){const invalid=structuredClone(value);change(invalid);expect(PetContentManifestV3Schema.safeParse(invalid).success).toBe(false);await expect(store.seal(invalid)).rejects.toBeDefined();}
 expect((await pool.query('SELECT count(*) FROM pet_content_versions')).rows[0].count).toBe(before);
});
it('serializes competing selections, rolls back only compatible previous versions and preserves old match pins after retirement',async()=>{
 const first=await version('first'),second=await version('second');const selection=await select(first.hash),id=randomUUID(),binding=pin(first.hash);
 await transaction(async tx=>{await insertMatch(tx,id,first.hash);await store.pin(tx,id,binding,selection.revision);});
 const races=await Promise.allSettled([store.transition('select',second.hash,selection.revision),store.transition('select',second.hash,selection.revision)]);expect(races.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const rollback=await store.transition('rollback',first.hash,selection.revision+1);expect(rollback.hash).toBe(first.hash);
 const retired=await store.transition('retire',first.hash,rollback.revision);expect(retired.hash).toBeNull();
 expect(await new PetManifestStore(pool).readPin(id)).toEqual({pin:binding,manifest:(await store.read(first.hash)).manifest});
 await expect(store.transition('select',first.hash,retired.revision)).rejects.toThrow('Content retired');
 await expect(pool.query('DELETE FROM pet_content_match_pins WHERE match_id=$1',[id])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query("UPDATE pet_content_versions SET state='sealed' WHERE content_hash=$1",[first.hash])).rejects.toMatchObject({code:'23514'});
 const never=await version('never selected');await select(second.hash);await expect(store.transition('rollback',never.hash,(await store.selection()).revision)).rejects.toThrow('never selected');
 const incompatible=await fixture();incompatible.rulesHash='c'.repeat(64);const foreign=await store.seal(incompatible);await select(foreign.hash);await expect(store.transition('rollback',second.hash,(await store.selection()).revision)).rejects.toThrow('Incompatible');
});
it('native v3 allocation fails atomically without a pin or with stale selection, wrong hash or encounter revision',async()=>{
 const a=await version('allocation-a'),b=await version('allocation-b'),selection=await select(a.hash);
 for(const kind of ['missing','hash','revision','stale']){
  const id=randomUUID();await expect(transaction(async tx=>{await insertMatch(tx,id,kind==='hash'?b.hash:a.hash);if(kind!=='missing')await store.pin(tx,id,{...pin(a.hash),encounterRevision:kind==='revision'?2:1},selection.revision-(kind==='stale'?1:0));})).rejects.toBeDefined();
  expect((await pool.query('SELECT 1 FROM game_native_matches WHERE id=$1',[id])).rowCount).toBe(0);expect((await pool.query('SELECT 1 FROM pet_content_match_pins WHERE match_id=$1',[id])).rowCount).toBe(0);
 }
});
it('retirement and allocation serialize; accepted allocation remains readable and a later allocation fails',async()=>{
 const a=await version('race-retire'),selection=await select(a.hash),id=randomUUID();
 let ready!:()=>void;const pinned=new Promise<void>(resolve=>{ready=resolve;});let release!:()=>void;const proceed=new Promise<void>(resolve=>{release=resolve;});
 const allocation=transaction(async tx=>{await insertMatch(tx,id,a.hash);await store.pin(tx,id,pin(a.hash),selection.revision);ready();await proceed;});
 await pinned;const retirement=store.transition('retire',a.hash,selection.revision);release();await allocation;await retirement;
 expect((await store.readPin(id)).pin.contentHash).toBe(a.hash);
 await expect(transaction(tx=>store.pin(tx,randomUUID(),pin(a.hash),selection.revision))).rejects.toThrow('Stale');
});
it('failed audit insertion rolls back selection and retirement; PUBLIC has no content access',async()=>{
 const a=await version('audit-rollback'),selection=await select(a.hash);
 await pool.query("CREATE FUNCTION pet_transition_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test transition failure'; END $$");await pool.query('CREATE TRIGGER pet_transition_failure BEFORE INSERT ON pet_content_transitions FOR EACH ROW EXECUTE FUNCTION pet_transition_failure()');
 try{await expect(store.transition('retire',a.hash,selection.revision)).rejects.toThrow('test transition failure');expect(await store.selection()).toEqual(selection);expect((await store.read(a.hash)).state).toBe('sealed');}finally{await pool.query('DROP TRIGGER pet_transition_failure ON pet_content_transitions');await pool.query('DROP FUNCTION pet_transition_failure()');}
 const role='pet_manifest_role_'+randomUUID().replaceAll('-','');await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
 try{await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);for(const table of ['pet_content_versions','pet_content_selection','pet_content_transitions','pet_content_match_pins'])for(const operation of ['SELECT * FROM','DELETE FROM'])await expect(transaction(async tx=>{await tx.query(`SET LOCAL ROLE "${role}"`);await tx.query(`${operation} ${table}`);})).rejects.toMatchObject({code:'42501'});}finally{await pool.query(`REVOKE USAGE ON SCHEMA "${schema}" FROM "${role}"`);await admin.query(`DROP ROLE "${role}"`);}
});
