import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool,type PoolClient} from 'pg';
import {randomUUID,randomBytes} from 'node:crypto';
import {migrate,migrationManifest} from '../../apps/platform-api/src/shared/database/migrations';

const schema='native_game_'+randomUUID().replaceAll('-','');
let admin:Pool,pool:Pool;
const hash=()=>randomBytes(32),nonce=()=>randomBytes(12),tag=()=>randomBytes(16);
beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))||url.search||url.hash)throw Error('Disposable local DB required');
 admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);
 url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString(),max:12});
 await Promise.all([migrate(pool),migrate(pool)]);
});
afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function match(){
 const id=randomUUID(),boot=randomUUID();
 await pool.query(`INSERT INTO game_native_matches(id,world_id,ruleset_id,ruleset_version,content_hash,engine_hash,owner_boot_id,epoch,server_tick,logical_time_ms,rng_cursor,status,seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot,protocol_version,canonical_version,rng_version)
 VALUES($1,'native:fixture','fixture-only',1,$2,$3,$4,1,0,1000,0,'ACTIVE',$5,$6,'fixture-key',$7,$8,$9,1,1,1)`,[id,hash(),hash(),boot,hash(),hash(),nonce(),tag(),randomBytes(32)]);
 return {id,boot};
}
async function receipt(db:Pick<PoolClient,'query'>,id:string,version:number,epoch=1,actor=randomUUID(),command=randomUUID()){
 await db.query(`INSERT INTO game_native_receipts(match_id,actor_id,command_id,payload_fingerprint,committed_version,epoch,receipt_hash,key_id,nonce,tag,sealed_receipt)
 VALUES($1,$2,$3,$4,$5,$6,$7,'fixture-key',$8,$9,$10)`,[id,actor,command,hash(),version,epoch,hash(),nonce(),tag(),randomBytes(20)]);
 return {actor,command};
}
async function transaction<T>(work:(db:PoolClient)=>Promise<T>){const db=await pool.connect();try{await db.query('BEGIN');const result=await work(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
async function counts(id:string){return Promise.all(['game_native_receipts','game_native_events','game_native_settlements','game_native_outbox'].map(async table=>Number((await pool.query(`SELECT count(*) AS n FROM ${table} WHERE match_id=$1`,[id])).rows[0].n)));}

it('two real concurrent migrators preserve the current manifest and native storage checksum in one journal',async()=>{
 const manifest=await migrationManifest(),rows=(await pool.query('SELECT name,checksum FROM city_schema_migrations ORDER BY name')).rows;
 expect(rows).toHaveLength(Object.keys(manifest).length);expect(Object.fromEntries(rows.map(r=>[r.name,r.checksum]))).toEqual(manifest);
 expect(manifest['0048_native_game_storage.sql']).toBe('8c54c14ba85ed9278b0f5239d9fa0c2a20b2e5ea029913047c78b3dafc8d964a');
 expect((await pool.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name LIKE 'game_native_%'",[schema])).rows[0].n).toBe('5');
});

it('eight competing finalizations commit exactly one checkpoint receipt event settlement and outbox',async()=>{
 const m=await match(),actor=randomUUID(),command=randomUUID(),fingerprint=hash();
 const outcomes=await Promise.all(Array.from({length:8},()=>transaction(async db=>{
  const changed=await db.query("UPDATE game_native_matches SET state_version=1,status='SETTLING',server_tick=1,logical_time_ms=1001,rng_cursor=1 WHERE id=$1 AND owner_boot_id=$2 AND epoch=1 AND state_version=0 AND status='ACTIVE' RETURNING id",[m.id,m.boot]);
  if(!changed.rowCount)return false;
  await db.query(`INSERT INTO game_native_receipts(match_id,actor_id,command_id,payload_fingerprint,committed_version,epoch,receipt_hash,key_id,nonce,tag,sealed_receipt) VALUES($1,$2,$3,$4,1,1,$5,'fixture-key',$6,$7,$8)`,[m.id,actor,command,fingerprint,hash(),nonce(),tag(),randomBytes(20)]);
  await db.query(`INSERT INTO game_native_events VALUES($1,1,1,0,$2,'fixture-key',$3,$4,$5)`,[m.id,hash(),nonce(),tag(),randomBytes(20)]);
  const settlement=randomUUID();await db.query(`INSERT INTO game_native_settlements(match_id,state_version,epoch,settlement_id,proposal_hash,proposal) VALUES($1,1,1,$2,$3,'{"outcome":"fixture-only"}')`,[m.id,settlement,hash()]);
  await db.query(`INSERT INTO game_native_outbox(event_id,match_id,settlement_id,effect_type) VALUES($1,$2,$3,'game.settlement.v1')`,[randomUUID(),m.id,settlement]);return true;
 })));
 expect(outcomes.filter(Boolean)).toHaveLength(1);expect(await counts(m.id)).toEqual([1,1,1,1]);
 const stored=(await pool.query('SELECT * FROM game_native_receipts WHERE match_id=$1 AND actor_id=$2 AND command_id=$3',[m.id,actor,command])).rows[0];
 expect(stored.payload_fingerprint).toEqual(fingerprint);expect(stored.committed_version).toBe('1');
 await expect(receipt(pool,m.id,1,1,actor,command)).rejects.toMatchObject({code:'23505'});
 await expect(pool.query(`INSERT INTO game_native_settlements(match_id,state_version,epoch,settlement_id,proposal_hash,proposal) VALUES($1,1,1,$2,$3,'{}')`,[m.id,randomUUID(),hash()])).rejects.toMatchObject({code:'23505'});
});

it('stale owner/epoch/version cannot update after owner takeover and trigger refuses stale receipt',async()=>{
 const m=await match(),boot2=randomUUID();
 await pool.query('UPDATE game_native_matches SET epoch=2,owner_boot_id=$2 WHERE id=$1',[m.id,boot2]);
 expect((await pool.query('UPDATE game_native_matches SET state_version=1 WHERE id=$1 AND epoch=1 AND owner_boot_id=$2',[m.id,m.boot])).rowCount).toBe(0);
 await pool.query('UPDATE game_native_matches SET state_version=1 WHERE id=$1 AND epoch=2 AND owner_boot_id=$2',[m.id,boot2]);
 await expect(receipt(pool,m.id,1,1)).rejects.toMatchObject({code:'23514'});
 await expect(receipt(pool,m.id,2,2)).rejects.toMatchObject({code:'23514'});
 await receipt(pool,m.id,1,2);expect(await counts(m.id)).toEqual([1,0,0,0]);
 await expect(pool.query('UPDATE game_native_matches SET epoch=1 WHERE id=$1',[m.id])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query('UPDATE game_native_matches SET owner_boot_id=$2 WHERE id=$1',[m.id,randomUUID()])).rejects.toMatchObject({code:'23514'});
});

it('failed event or settlement rolls back checkpoint receipt and every effect',async()=>{
 for(const failure of ['event','settlement']){
  const m=await match();
  await expect(transaction(async db=>{
   await db.query('UPDATE game_native_matches SET state_version=1 WHERE id=$1',[m.id]);await receipt(db,m.id,1);
   if(failure==='event')await db.query(`INSERT INTO game_native_events VALUES($1,1,1,512,$2,'fixture-key',$3,$4,$5)`,[m.id,hash(),nonce(),tag(),randomBytes(20)]);
   else await db.query(`INSERT INTO game_native_settlements(match_id,state_version,epoch,settlement_id,proposal_hash,proposal) VALUES($1,1,1,$2,$3,'{}')`,[m.id,randomUUID(),hash()]);
  })).rejects.toMatchObject({code:'23514'});
  expect((await pool.query('SELECT state_version,status FROM game_native_matches WHERE id=$1',[m.id])).rows[0]).toEqual({state_version:'0',status:'ACTIVE'});
  expect(await counts(m.id)).toEqual([0,0,0,0]);
 }
});

it('frozen rules, clocks, seed commitment and terminal lifecycle cannot regress',async()=>{
 const m=await match();
 for(const update of ["world_id='deadline'","ruleset_version=2","content_hash=decode(repeat('00',32),'hex')","seed_commitment=decode(repeat('00',32),'hex')","logical_time_ms=999","rng_cursor=-1","server_tick=18446744073709551616"]){
  await expect(pool.query(`UPDATE game_native_matches SET ${update} WHERE id=$1`,[m.id])).rejects.toMatchObject({code:'23514'});
 }
 await pool.query("UPDATE game_native_matches SET status='ABORTED' WHERE id=$1",[m.id]);
 await expect(pool.query("UPDATE game_native_matches SET status='ACTIVE' WHERE id=$1",[m.id])).rejects.toMatchObject({code:'23514'});
 await pool.query('UPDATE game_native_matches SET rng_cursor=18446744073709551615,server_tick=18446744073709551615 WHERE id=$1',[m.id]);
 expect((await pool.query('SELECT rng_cursor,server_tick FROM game_native_matches WHERE id=$1',[m.id])).rows[0]).toEqual({rng_cursor:'18446744073709551615',server_tick:'18446744073709551615'});
});

it('orphan effects and mismatched epochs fail while new storage stays outside legacy tables',async()=>{
 const m=await match();await pool.query('UPDATE game_native_matches SET state_version=1 WHERE id=$1',[m.id]);await receipt(pool,m.id,1);
 await expect(pool.query(`INSERT INTO game_native_events VALUES($1,1,2,0,$2,'fixture-key',$3,$4,$5)`,[m.id,hash(),nonce(),tag(),randomBytes(20)])).rejects.toMatchObject({code:'23503'});
 await expect(pool.query(`INSERT INTO game_native_outbox(event_id,match_id,settlement_id,effect_type) VALUES($1,$2,$3,'game.settlement.v1')`,[randomUUID(),m.id,randomUUID()])).rejects.toMatchObject({code:'23503'});
 const foreign=(await pool.query(`SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE connamespace=$1::regnamespace AND contype='f' AND conrelid::regclass::text LIKE 'game_native_%'`,[schema])).rows;
 expect(foreign.length).toBeGreaterThan(0);expect(foreign.every(r=>r.target.startsWith('game_native_'))).toBe(true);
 expect((await pool.query('SELECT count(*) AS n FROM engine_game_matches')).rows[0].n).toBe('0');
});
