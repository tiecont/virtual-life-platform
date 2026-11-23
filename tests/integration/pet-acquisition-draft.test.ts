import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate,migrationManifest} from '../../apps/platform-api/src/shared/database/migrations';
import {PetAcquisitionDraftStore,petAcquisitionHash} from '../../apps/platform-api/src/features/pets/modules/content/infrastructure/acquisition-draft-store';
import {petAcquisitionDraft} from '../../scripts/pet-acquisition-draft-seed.mjs';
import {PetDraftStore} from '../../apps/platform-api/src/features/pets/modules/content/infrastructure/draft-store';
import {petDesignDraft} from '../../scripts/pet-content-draft-seed.mjs';

const schema='pet240_'+randomUUID().replaceAll('-','');let admin:Pool,pool:Pool,store:PetAcquisitionDraftStore;
let input:Awaited<ReturnType<typeof petAcquisitionDraft>>;
beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL!);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test/.test(url.pathname.slice(1)))throw Error('Disposable local DB required');
 admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString(),max:12});await Promise.all([migrate(pool),migrate(pool)]);input=await petAcquisitionDraft();store=new PetAcquisitionDraftStore(pool,input.upstream);
});
afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
it('imports exact 240 source composition once under eight concurrent attempts with stable order-independent hash and no v2 changes',async()=>{
 const oldId=randomUUID(),oldStore=new PetDraftStore(pool),oldInput=await petDesignDraft();await oldStore.seed(oldId,oldInput);const old=await oldStore.read(oldId);
 const id=randomUUID(),results=await Promise.all(Array.from({length:8},()=>store.seed(id,input.value)));expect(results.filter(r=>r.created)).toHaveLength(1);expect(new Set(results.map(r=>r.hash)).size).toBe(1);
 const value=(await store.read(id))!,counts=Object.fromEntries(['map_regular','map_legendary','limited_event_gacha','standard_gacha'].map(source=>[source,value.pets.filter(p=>p.acquisition.source===source).length]));expect(counts).toEqual({map_regular:209,map_legendary:19,limited_event_gacha:6,standard_gacha:6});expect(value.pets).toHaveLength(240);expect(value.maps).toHaveLength(19);
 const reversed=structuredClone(input.value);reversed.pets.reverse();reversed.maps.reverse();expect(petAcquisitionHash(reversed)).toBe(results[0].hash);expect(await store.seed(id,reversed)).toEqual({id,hash:results[0].hash,created:false});expect(await new PetAcquisitionDraftStore(pool,input.upstream).read(id)).toEqual(value);expect(await oldStore.read(oldId)).toEqual(old);
 expect((await pool.query('SELECT count(*)::int AS n FROM city_schema_migrations')).rows[0].n).toBe(Object.keys(await migrationManifest()).length);expect((await pool.query('SELECT count(*)::int AS n FROM pet_content_versions')).rows[0].n).toBe(0);expect((await pool.query('SELECT count(*)::int AS n FROM game_native_matches')).rows[0].n).toBe(0);
});
it('rejects conflicting hash and invalid source/type/reference/unknown fields before writing anything',async()=>{
 const id=randomUUID();await store.seed(id,input.value);const changed=structuredClone(input.value);changed.sourceSha256='b'.repeat(64);await expect(store.seed(id,changed)).rejects.toThrow('seed conflict');
 const before=(await pool.query('SELECT count(*) FROM pet_acquisition_drafts')).rows[0].count;
 for(const change of [
  (v:typeof input.value)=>Object.assign(v,{script:{nested:'execute'}}),
  (v:typeof input.value)=>{v.pets[0].name='Renamed upstream';},
  (v:typeof input.value)=>Object.assign(v.pets[0].acquisition,{requiredUniqueWins:'3'}),
  (v:typeof input.value)=>{v.pets[0].acquisition.mapId='missing';},
  (v:typeof input.value)=>{v.pets.find(p=>p.acquisition.source==='standard_gacha')!.acquisition.signatureCard='forbidden';},
  (v:typeof input.value)=>{v.pets[0].race='unknown' as typeof v.pets[0]['race'];},
  (v:typeof input.value)=>Object.assign(v,{publishAllowed:true}),
  (v:typeof input.value)=>{v.pets[1]=v.pets[0];},
 ]){const invalid=structuredClone(input.value);change(invalid);await expect(store.seed(randomUUID(),invalid)).rejects.toBeDefined();}
 expect((await pool.query('SELECT count(*) FROM pet_acquisition_drafts')).rows[0].count).toBe(before);expect(petAcquisitionHash((await store.read(id))!)).toBe(petAcquisitionHash(input.value));
});
it('SQL enforces all acquisition sources, map element references, morphology and unique identities',async()=>{
 const id=randomUUID();await store.seed(id,input.value);const standard=input.value.pets.find(p=>p.acquisition.source==='standard_gacha')!,regular=input.value.pets.find(p=>p.acquisition.source==='map_regular')!,limited=input.value.pets.find(p=>p.acquisition.source==='limited_event_gacha')!;
 for(const [pet,change] of [[standard.id,"signature_card='forbidden'"],[standard.id,"map_id='missing'"],[standard.id,"awakening_enabled=false"],[regular.id,"rank='S'"],[regular.id,"required_unique_wins=5"],[limited.id,'signature_card=NULL'],[regular.id,"rig='rig_unknown'"],[regular.id,"race='unknown'"],[regular.id,"map_id='missing'"]])await expect(pool.query(`UPDATE pet_acquisition_species SET ${change} WHERE draft_id=$1 AND species_id=$2`,[id,pet])).rejects.toBeDefined();
 await expect(pool.query('UPDATE pet_acquisition_drafts SET enabled=true WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'});await expect(pool.query('UPDATE pet_acquisition_drafts SET publish_allowed=true WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query('UPDATE pet_acquisition_species SET display_name=$3 WHERE draft_id=$1 AND species_id=$2',[id,regular.id,standard.name.toUpperCase()])).rejects.toMatchObject({code:'23505'});
});
it('corrupted or incomplete durable rows fail read and retry instead of being mistaken for successful import',async()=>{
 const id=randomUUID();await store.seed(id,input.value);const standard=input.value.pets.find(p=>p.acquisition.source==='standard_gacha')!;
 await pool.query("UPDATE pet_acquisition_species SET legacy_rarity='rare' WHERE draft_id=$1 AND species_id=$2",[id,standard.id]);await expect(store.read(id)).rejects.toThrow('integrity mismatch');await expect(store.seed(id,input.value)).rejects.toThrow('integrity mismatch');
 await pool.query('DELETE FROM pet_acquisition_species WHERE draft_id=$1 AND species_id=$2',[id,standard.id]);await expect(store.read(id)).rejects.toBeDefined();expect(await store.read(randomUUID())).toBeNull();
});
it('late insert failure rolls back the complete draft and every map/species row',async()=>{
 const id=randomUUID();await pool.query("CREATE FUNCTION acquisition_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'late acquisition failure'; END $$");await pool.query("CREATE TRIGGER acquisition_failure BEFORE INSERT ON pet_acquisition_species FOR EACH ROW WHEN(NEW.source='standard_gacha') EXECUTE FUNCTION acquisition_failure()");
 try{await expect(store.seed(id,input.value)).rejects.toThrow('late acquisition failure');for(const [table,column] of [['pet_acquisition_drafts','id'],['pet_acquisition_maps','draft_id'],['pet_acquisition_species','draft_id']])expect((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`,[id])).rows[0].n).toBe(0);}finally{await pool.query('DROP TRIGGER acquisition_failure ON pet_acquisition_species');await pool.query('DROP FUNCTION acquisition_failure()');}
});
it('lost COMMIT acknowledgement retries once after restart without duplicate data',async()=>{
 const id=randomUUID();let lost=false;const flaky={query:pool.query.bind(pool),connect:async()=>{const tx=await pool.connect();return new Proxy(tx,{get(target,key){if(key==='query')return async(sql:string,values?:unknown[])=>{const result=await target.query(sql,values);if(sql==='COMMIT'&&!lost){lost=true;throw Error('lost acknowledgement');}return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}}) as PoolClient;}};
 await expect(new PetAcquisitionDraftStore(flaky,input.upstream).seed(id,input.value)).rejects.toThrow('lost acknowledgement');expect(await store.seed(id,input.value)).toEqual({id,hash:petAcquisitionHash(input.value),created:false});expect((await store.read(id))!.pets).toHaveLength(240);
});
it('PUBLIC and a runtime-like role cannot read or mutate draft relations even with schema usage',async()=>{
 const role='pet240_role_'+randomUUID().replaceAll('-','');await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
 try{await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);await pool.query(`GRANT SELECT,INSERT,UPDATE ON game_native_matches TO "${role}"`);for(const table of ['pet_acquisition_drafts','pet_acquisition_maps','pet_acquisition_species'])for(const sql of [`SELECT * FROM ${table}`,`DELETE FROM ${table}`,`TRUNCATE ${table}`,`INSERT INTO ${table} DEFAULT VALUES`,`UPDATE ${table} SET ${table==='pet_acquisition_drafts'?'id=id':'draft_id=draft_id'}`]){const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query(`SET LOCAL ROLE "${role}"`);await expect(tx.query(sql)).rejects.toMatchObject({code:'42501'});}finally{await tx.query('ROLLBACK');tx.release();}}}finally{await pool.query(`REVOKE ALL ON game_native_matches FROM "${role}"`);await pool.query(`REVOKE USAGE ON SCHEMA "${schema}" FROM "${role}"`);await admin.query(`DROP ROLE "${role}"`);}
});
