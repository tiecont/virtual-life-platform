import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';

// Elevated fixture writes simulate damaged restore inputs while the runtime
// itself retains its restricted PostgreSQL role. No production repair path.
export async function nativeRecoveryScenarios({pool,matchId,rejectHost,record}){
 const original=(await pool.query('SELECT audit_hash,sealed_snapshot FROM game_native_matches WHERE id=$1',[matchId])).rows[0];
 const fingerprint=async()=>{
  const hash=createHash('sha256');
  for(const table of ['game_native_matches','game_native_events','game_native_receipts','game_native_settlements','game_native_outbox','platform_native_reward_inbox','platform_native_reward_ledger']){
   const rows=(await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows;
   hash.update(table);hash.update(JSON.stringify(rows));
  }
  return hash.digest('hex');
 };
 const denied=async overrides=>{
  const before=await fingerprint();await rejectHost(overrides);
  assert.equal(await fingerprint(),before,'Failed recovery must preserve all game and settlement records');
 };
 for(const overrides of [
  {activeStorageKey:'replacement',storageKeys:{replacement:Array.from(randomBytes(32))}},
  {storageKeys:{current:Array.from(randomBytes(32))}},
  {engineHash:Array(32).fill(0x65)},
 ])await denied(overrides);
 record('recovery-missing-key-wrong-key-and-incompatible-engine-deny-before-listen-without-writes');
 try{
  const badAudit=Buffer.from(original.audit_hash);badAudit[0]^=1;
  await pool.query('UPDATE game_native_matches SET audit_hash=$2 WHERE id=$1',[matchId,badAudit]);
  await denied();
  const badSnapshot=Buffer.from(original.sealed_snapshot);badSnapshot[0]^=1;
  await pool.query('UPDATE game_native_matches SET audit_hash=$2,sealed_snapshot=$3 WHERE id=$1',[matchId,original.audit_hash,badSnapshot]);
  await denied();
 }finally{
  await pool.query('UPDATE game_native_matches SET audit_hash=$2,sealed_snapshot=$3 WHERE id=$1',[matchId,original.audit_hash,original.sealed_snapshot]);
 }
 record('recovery-audit-hash-and-ciphertext-corruption-deny-without-abort-reward-or-private-output');
 for(const [table,versionColumn,hashColumn,sealedColumn]of [
  ['game_native_receipts','committed_version','receipt_hash','sealed_receipt'],
  ['game_native_events','state_version','event_hash','sealed_event'],
 ]){
  const row=(await pool.query(`SELECT * FROM ${table} WHERE match_id=$1 ORDER BY ${versionColumn} LIMIT 1`,[matchId])).rows[0];
  assert(row,'Committed match must contain historical recovery inputs');
  const where=`match_id=$1 AND ${versionColumn}=$2`+(table==='game_native_events'?' AND event_index=0':'');
  if(table==='game_native_events')assert.equal(row.event_index,0);
  for(const column of [hashColumn,sealedColumn,'key_id']){
   const damaged=column==='key_id'?'missing-history-key':Buffer.from(row[column]);
   if(Buffer.isBuffer(damaged))damaged[0]^=1;
   try{
    await pool.query(`UPDATE ${table} SET ${column}=$3 WHERE ${where}`,[matchId,row[versionColumn],damaged]);
    await denied();
   }finally{await pool.query(`UPDATE ${table} SET ${column}=$3 WHERE ${where}`,[matchId,row[versionColumn],row[column]]);}
  }
 }
 record('recovery-authenticates-historical-receipt-and-event-hashes-ciphertexts-and-required-keys');
 // Simulate a backup missing the latest receipt and its cascading events. Keep
 // exact rows in connection-local temporary tables for fixture-only restoration.
 const db=await pool.connect();
 try{
  await db.query('CREATE TEMP TABLE saved_recovery_receipt AS SELECT * FROM game_native_receipts WHERE match_id=$1 AND committed_version=(SELECT state_version FROM game_native_matches WHERE id=$1)',[matchId]);
  await db.query('CREATE TEMP TABLE saved_recovery_events AS SELECT * FROM game_native_events WHERE match_id=$1 AND state_version=(SELECT state_version FROM game_native_matches WHERE id=$1)',[matchId]);
  try{
   assert.equal((await db.query('DELETE FROM game_native_receipts WHERE match_id=$1 AND committed_version=(SELECT state_version FROM game_native_matches WHERE id=$1)',[matchId])).rowCount,1);
   await denied();
  }finally{
   await db.query('INSERT INTO game_native_receipts SELECT * FROM saved_recovery_receipt');
   await db.query('INSERT INTO game_native_events SELECT * FROM saved_recovery_events');
  }
 }finally{
  await db.query('DROP TABLE IF EXISTS saved_recovery_receipt,saved_recovery_events');db.release();
 }
 record('recovery-rejects-incomplete-receipt-history-without-changing-checkpoint-or-settlement');
}
