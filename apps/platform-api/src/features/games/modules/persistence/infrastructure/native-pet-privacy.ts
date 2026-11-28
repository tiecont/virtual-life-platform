import type {PoolClient} from 'pg';
import {DomainError} from '../../../../../shared/common/errors';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';

type Match = {
  id:string; created_at:Date; updated_at:Date; state_version:string;
  outcome:'won'|'lost'|null; delivery_outcome:'granted'|'declined'|null;
  settlement_id:string|null; reward_key:string|null; granted_at:Date|null;
};
const unavailable=()=>new DomainError('WORLD_UNAVAILABLE',503,'Native Pet privacy unavailable');

async function requireIndexed(db:PoolClient) {
  const current=await db.query(`SELECT 1 FROM game_native_pet_database_guard WHERE singleton
    AND database_identity=game_native_pet_database_identity()`);
  if(!current.rowCount)throw unavailable();
  const {rowCount}=await db.query(`
    SELECT 1 FROM game_native_matches m
    WHERE m.ruleset_id='pet-arena-pve'
      AND (NOT EXISTS (SELECT 1 FROM game_native_pet_participants p WHERE p.match_id=m.id)
        OR EXISTS (SELECT 1 FROM game_native_receipts r
          WHERE r.match_id=m.id AND NOT EXISTS (
            SELECT 1 FROM game_native_pet_participants p WHERE p.match_id=m.id AND p.account_id=r.actor_id
          )))
    LIMIT 1`);
  if(rowCount)throw unavailable();
}

export function registerNativePetPrivacy(identity:IdentityService,offline:boolean) {
  identity.registerExportOwner('nativePetGameplay',async(account,db)=>{
    await requireIndexed(db);
    const {rows}=await db.query<Match>(`
      SELECT m.id,m.created_at,m.updated_at,m.state_version,s.settlement_id,
        CASE WHEN s.proposal->>'outcome' IN ('won','lost') THEN s.proposal->>'outcome' END AS outcome,
        o.delivery_outcome,g.reward_key,g.granted_at
      FROM game_native_pet_participants p JOIN game_native_matches m ON m.id=p.match_id
      LEFT JOIN game_native_settlements s ON s.match_id=m.id
      LEFT JOIN game_native_outbox o ON o.match_id=s.match_id AND o.settlement_id=s.settlement_id
      LEFT JOIN platform_native_reward_ledger g ON g.settlement_id=s.settlement_id AND g.account_id=p.account_id
      WHERE p.account_id=$1 AND m.ruleset_id='pet-arena-pve'
      ORDER BY m.created_at,m.id`,[account]);
    if(rows.length&&!offline)throw unavailable();
    return rows.length?{schemaVersion:1,matches:rows.map(row=>({
      matchId:row.id,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),
      stateVersion:row.state_version,
      ...(row.settlement_id?{settlement:{
        id:row.settlement_id,outcome:row.outcome,delivery:row.delivery_outcome??'pending',
        ...(row.reward_key&&row.granted_at?{rewardKey:row.reward_key,grantedAt:row.granted_at.toISOString()}:{}),
      }}:{}),
    }))}:undefined;
  });
  identity.registerDeletionOwner('nativePetGameplay',async(account,db)=>{
    await requireIndexed(db);
    // Identity already holds account:<id>. Admission and the Rust writer
    // follow account -> admission -> match; the worker follows account -> outbox.
    const hasMatch=(await db.query('SELECT 1 FROM game_native_pet_participants WHERE account_id=$1 LIMIT 1',[account])).rowCount;
    if(!hasMatch)return;
    if(!offline)throw unavailable();
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('native-admission-v1',0))");
    await db.query('DELETE FROM platform_native_admissions WHERE account_id=$1',[account]);
    await db.query('DELETE FROM platform_native_ticket_uses WHERE account_id=$1',[account]);
    await db.query('SELECT game_native_pet_erase($1)',[account]);
  });
}
