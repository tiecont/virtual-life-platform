import {validateTestDatabaseURL} from './test-environment.mjs';

const unavailable=()=>Error('Native Pet recovery requires the original, current disposable database');

// The original database is authoritative for absence; no reusable list of
// erased account identifiers is retained. Both databases are disposable.
// This is a single-source offline cutover, not a disaster recovery procedure.
export async function reconcileNativePetRestore({source,sourceUrl,target,targetUrl}){
 try{
  const original=new URL(validateTestDatabaseURL(sourceUrl));
  const restored=new URL(targetUrl);
  if(!['postgres:','postgresql:'].includes(restored.protocol)||restored.hostname!=='127.0.0.1'
    ||restored.pathname!=='/virtual_city_restore_test'||restored.port===original.port)throw unavailable();
  // Source loss is deliberately indistinguishable from an invalid restore.
  // Never proceed to target mutation when the authoritative DB is unavailable.
  const before=await source.connect();
  try{
   const after=await target.connect();
   try{
    await before.query('BEGIN');
    await after.query('BEGIN');
    const guard=`SELECT database_identity,game_native_pet_database_identity() AS actual,current_database() AS database
      FROM game_native_pet_database_guard WHERE singleton`;
    const [{rows:[origin]},{rows:[destination]}]=await Promise.all([before.query(guard),after.query(guard)]);
    if(!origin||!destination||origin.database!==original.pathname.slice(1)||destination.database!=='virtual_city_restore_test'
      ||origin.actual!==origin.database_identity||origin.actual===destination.actual
      ||origin.actual!==destination.database_identity||destination.actual===destination.database_identity)throw unavailable();
    if((await after.query(`SELECT 1 FROM game_native_matches m WHERE m.ruleset_id='pet-arena-pve'
        AND (NOT EXISTS(SELECT 1 FROM game_native_pet_participants p WHERE p.match_id=m.id)
        OR EXISTS(SELECT 1 FROM game_native_receipts r WHERE r.match_id=m.id AND NOT EXISTS(
           SELECT 1 FROM game_native_pet_participants p WHERE p.match_id=m.id AND p.account_id=r.actor_id
        ))) LIMIT 1`)).rowCount)throw unavailable();
    for(const {id} of (await after.query('SELECT id FROM identity_accounts ORDER BY id')).rows){
     await before.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account:'+id]);
     if((await before.query('SELECT 1 FROM identity_accounts WHERE id=$1',[id])).rowCount)continue;
     await after.query('SELECT game_native_pet_erase($1)',[id]);
     await after.query('DELETE FROM identity_accounts WHERE id=$1',[id]);
    }
    // Restore alone never conveys a lease. The allocator must issue new scope.
    await after.query("UPDATE platform_native_worlds SET enabled=false,lease_until=clock_timestamp()");
    await after.query('DELETE FROM platform_native_admissions');
    await after.query('DELETE FROM platform_native_ticket_uses');
    await after.query('UPDATE game_native_pet_database_guard SET database_identity=game_native_pet_database_identity() WHERE singleton');
    await after.query('COMMIT');
    await before.query('COMMIT');
   }catch(error){
    await Promise.allSettled([before.query('ROLLBACK'),after.query('ROLLBACK')]);
    throw error;
   }finally{after.release();}
  }finally{before.release();}
 }catch(error){
  // Do not expose connection, schema, or query details from the source.
  if(error?.message==='Native Pet recovery requires the original, current disposable database')throw error;
  throw unavailable();
 }
}
