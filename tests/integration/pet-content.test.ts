import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate,migrationNames} from '../../apps/platform-api/src/shared/database/migrations';
import {PetDraftStore,petDraftHash} from '../../apps/platform-api/src/features/pets/modules/content/infrastructure/draft-store';
import {petDesignDraft} from '../../scripts/pet-content-draft-seed.mjs';
import {PetContentDraftSchema} from '@aetheria/contracts';

const schema='pet_content_'+randomUUID().replaceAll('-','');let admin:Pool,pool:Pool,store:PetDraftStore;
beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL!);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test/.test(url.pathname.slice(1)))throw Error('Disposable local DB required');
 admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);store=new PetDraftStore(pool);
});
afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
it('migrates additively and concurrent idempotent seed persists all 19 elements and 114 unpublished species',async()=>{
 await migrate(pool);expect((await pool.query('SELECT count(*)::int AS n FROM city_schema_migrations')).rows[0].n).toBe((await migrationNames()).length);
 const id=randomUUID(),input=await petDesignDraft(),results=await Promise.all([store.seed(id,input),store.seed(id,input)]);
 expect(results.filter(r=>r.created)).toHaveLength(1);expect(results[0].hash).toBe(results[1].hash);
 const value=(await store.read(id))!;expect(value.elements).toHaveLength(19);expect(value.effectiveness).toHaveLength(361);expect(value.species).toHaveLength(114);expect(value.species.every(p=>p.assetState==='MISSING'&&!p.productionReady)).toBe(true);
 expect(value.species.find(p=>p.id==='fire-emberloom')).toMatchObject({element:'fire',skills:['mend','cleanse']});expect(petDraftHash(value)).toBe(results[0].hash);
 const restarted=new PetDraftStore(pool);expect(await restarted.read(id)).toEqual(value);expect(await store.read(randomUUID())).toBeNull();
 const altered=globalThis.structuredClone(input);altered.species[0].displayName='Changed';await expect(store.seed(id,altered)).rejects.toThrow('Draft seed conflict');expect(await store.read(id)).toEqual(value);
});
it('rejects duplicate identifiers broken references scripts and invalid numeric fields atomically',async()=>{
 const input=await petDesignDraft(),before=(await pool.query('SELECT count(*)::int AS n FROM pet_content_drafts')).rows[0].n;
 for(const mutate of [
  (c:Record<string,unknown>)=>{c.script='evil';},
  (c:typeof input)=>{c.species[0].skills=['missing'];},
  (c:typeof input)=>{c.profiles[0].attack=1201;},
  (c:typeof input)=>{c.elements[1]=c.elements[0];},
  (c:typeof input)=>{c.effectiveness[1]=c.effectiveness[0];},
  (c:typeof input)=>{c.species[0].skills=['strike','strike'];},
 ]){const invalid=globalThis.structuredClone(input);mutate(invalid);expect(PetContentDraftSchema.safeParse(invalid).success).toBe(false);await expect(store.seed(randomUUID(),invalid)).rejects.toBeDefined();}
 expect((await pool.query('SELECT count(*)::int AS n FROM pet_content_drafts')).rows[0].n).toBe(before);
});
it('PostgreSQL denies unbounded profiles publication and cross-version references',async()=>{
 const id=randomUUID(),input=await petDesignDraft();await store.seed(id,input);
 await expect(pool.query("UPDATE pet_content_profiles SET attack=1201 WHERE draft_id=$1",[id])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query("UPDATE pet_content_drafts SET state='published' WHERE id=$1",[id])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query('UPDATE pet_content_species SET production_ready=true WHERE draft_id=$1',[id])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query("UPDATE pet_content_species SET growth_id='missing' WHERE draft_id=$1",[id])).rejects.toMatchObject({code:'23503'});
 expect(petDraftHash(input)).toMatch(/^[a-f0-9]{64}$/);
});
it('detects altered durable metadata instead of accepting a duplicate seed as proof of integrity',async()=>{
 const id=randomUUID(),input=await petDesignDraft();await store.seed(id,input);
 await pool.query("UPDATE pet_content_species SET display_name='Tampered' WHERE draft_id=$1 AND species_id=$2",[id,input.species[0].id]);
 await expect(store.seed(id,input)).rejects.toThrow('Draft integrity mismatch');
 await expect(store.read(id)).rejects.toThrow('Draft integrity mismatch');
});
it('rolls back every seed row when a durable species insert fails after catalog dependencies were inserted',async()=>{
 const id=randomUUID(),input=await petDesignDraft();input.species[0].displayName='Force failure';
 await pool.query("CREATE FUNCTION pet_seed_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test seed failure'; END $$");
 await pool.query("CREATE TRIGGER pet_seed_failure BEFORE INSERT ON pet_content_species FOR EACH ROW WHEN(NEW.display_name='Force failure') EXECUTE FUNCTION pet_seed_failure()");
 try{await expect(store.seed(id,input)).rejects.toThrow('test seed failure');expect(await store.read(id)).toBeNull();expect((await pool.query('SELECT count(*)::int AS n FROM pet_content_elements WHERE draft_id=$1',[id])).rows[0].n).toBe(0);}
 finally{await pool.query('DROP TRIGGER pet_seed_failure ON pet_content_species');await pool.query('DROP FUNCTION pet_seed_failure()');}
});
it('does not give a restricted runtime role content reads or writes through PUBLIC',async()=>{
 const role='pet_role_'+randomUUID().replaceAll('-','');await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
 try{
  await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
  for(const sql of ['SELECT * FROM pet_content_species','DELETE FROM pet_content_drafts']){
   const tx=await pool.connect();
   try{await tx.query('BEGIN');await tx.query(`SET LOCAL ROLE "${role}"`);await expect(tx.query(sql)).rejects.toMatchObject({code:'42501'});}
   finally{await tx.query('ROLLBACK');tx.release();}
  }
 }finally{await pool.query(`REVOKE USAGE ON SCHEMA "${schema}" FROM "${role}"`);await admin.query(`DROP ROLE "${role}"`);}
});
