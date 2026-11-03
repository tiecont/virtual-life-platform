import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ProgressionPolicySchema, ProgressionViewSchema, RewardObservationSchema, ProgressionWorldSchema, type ProgressionPolicy } from '@virtual-city/contracts';
import type { IdentityService } from '../identity/service';
import type { FocusService } from '../focus/service';
import type { HospitalityCompletionSink } from '../hospitality/outbox';
import { DEFAULT_PROGRESSION_POLICY, assessReward } from './policy';
type Db = Pick<PoolClient, 'query'>;
type Ledger = { id: string; source_kind: string; world_slug: string; xp: number; completed_at: Date };
export class ProgressionService {
  readonly policy: ProgressionPolicy;
  constructor(private pool: Pick<Pool,'connect'>, private identity: IdentityService, private focus: FocusService, private eligible: (db: Db, account: string, world: string) => Promise<boolean>, policy: unknown = DEFAULT_PROGRESSION_POLICY, private now = Date.now) { this.policy = ProgressionPolicySchema.parse(policy); }
  private async apply(db: Db, raw: unknown) {
    const event = RewardObservationSchema.parse(raw);
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['account:' + event.accountId]);
    if ((await db.query('SELECT 1 FROM engine_progression_ledger WHERE account_id=$1 AND source_kind=$2 AND source_id=$3', [event.accountId,event.kind,event.sourceId])).rowCount) return;
    const start = event.completedAt.slice(0,10) + 'T00:00:00.000Z', end = new Date(Date.parse(start)+86400000);
    const usage = (await db.query("SELECT coalesce(sum(xp) FILTER(WHERE completed_at>=$2 AND completed_at<$3),0)::int AS account_xp,coalesce(sum(xp) FILTER(WHERE completed_at>=$2 AND completed_at<$3 AND world_slug=$4),0)::int AS world_xp,max(completed_at) AS last_at FROM engine_progression_ledger WHERE account_id=$1", [event.accountId,start,end,event.worldSlug])).rows[0];
    const partners = event.partnerId ? (await db.query('SELECT count(*)::int AS n FROM engine_progression_partners WHERE account_id=$1 AND partner_id=$2 AND completed_at>=$3 AND completed_at<$4',[event.accountId,event.partnerId,start,end])).rows[0].n : 0;
    const decision = assessReward(this.policy,event,{ day: start.slice(0,10),accountXp:usage.account_xp,worldXp:usage.world_xp,partnerCompletions:partners,lastAt:usage.last_at?.getTime()??null },this.now(),await this.eligible(db,event.accountId,event.worldSlug));
    if (!decision.allowed) return;
    const ledgerId=randomUUID(); await db.query('INSERT INTO engine_progression_ledger(id,account_id,source_kind,source_id,world_slug,xp,completed_at,recorded_at,policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [ledgerId,event.accountId,event.kind,event.sourceId,event.worldSlug,decision.xp,event.completedAt,new Date(this.now()),this.policy.version]);
    if(event.partnerId) await db.query('INSERT INTO engine_progression_partners VALUES($1,$2,$3,$4)',[ledgerId,event.accountId,event.partnerId,event.completedAt]);
    const total = (await db.query('SELECT coalesce(sum(xp),0)::int AS total FROM engine_progression_ledger WHERE account_id=$1', [event.accountId])).rows[0].total;
    for (const cosmetic of this.policy.cosmetics) if (total>=cosmetic.lifetimeXp) await db.query('INSERT INTO engine_progression_entitlements VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [event.accountId,cosmetic.key,new Date(this.now())]);
  }
  hospitalitySink(): HospitalityCompletionSink { return { key:'progression-completion-v1',apply:async (db,event) => {
    if (!ProgressionWorldSchema.safeParse(event.worldSlug).success || !this.policy.enabled) return;
    // Outbox already holds both participant account locks in canonical order.
    for (const [accountId,partnerId] of [[event.customerId,event.staffId],[event.staffId,event.customerId]]) await this.apply(db,{ schemaVersion:1,kind:'hospitality-completed',sourceId:event.orderId,worldSlug:event.worldSlug,accountId,partnerId,completedAt:event.completedAt });
  } }; }
  async claimFocus(token: string, id: string) {
    await this.focus.completion(token,id,async (db,event) => { if (ProgressionWorldSchema.safeParse(event.worldSlug).success) await this.apply(db,{ ...event,schemaVersion:1,kind:'focus-completed' }); }); return this.own(token);
  }
  async exportAccount(id: string, db: Db) {
    const history = (await db.query<Ledger>('SELECT * FROM engine_progression_ledger WHERE account_id=$1 ORDER BY creation_order DESC LIMIT 101',[id])).rows, total = (await db.query('SELECT coalesce(sum(xp),0)::int AS total FROM engine_progression_ledger WHERE account_id=$1',[id])).rows[0].total, entitlements = (await db.query<{cosmetic_key:string}>('SELECT cosmetic_key FROM engine_progression_entitlements WHERE account_id=$1 ORDER BY cosmetic_key',[id])).rows.map(row=>row.cosmetic_key);
    return ProgressionViewSchema.parse({ schemaVersion:1,enabled:this.policy.enabled,lifetimeXp:total,entitlements:[...new Set(['casual',...entitlements])],history:history.slice(0,100).map(row=>({id:row.id,kind:row.source_kind,worldSlug:row.world_slug,xp:row.xp,completedAt:row.completed_at.toISOString()})),truncated:history.length>100 });
  }
  async own(token: string) {
    const initial=await this.identity.authenticate(token),db=await this.pool.connect(); try { await db.query('BEGIN');await this.identity.lockAccounts(db,[initial.accountId]);const actor=await this.identity.contextInTransaction(db,token),result=await this.exportAccount(actor.accountId,db);await db.query('COMMIT');return result; } catch(error) { await db.query('ROLLBACK');throw error; } finally { db.release(); }
  }
  async maintain() { const db=await this.pool.connect();try { await db.query('DELETE FROM engine_progression_partners WHERE ledger_id IN(SELECT ledger_id FROM engine_progression_partners WHERE completed_at<$1 ORDER BY completed_at LIMIT 100)',[new Date(this.now()-2*86400000)]);await db.query('DELETE FROM engine_progression_appearance_mutations WHERE (account_id,request_id) IN(SELECT account_id,request_id FROM engine_progression_appearance_mutations WHERE created_at<$1 ORDER BY created_at LIMIT 100)',[new Date(this.now()-90*86400000)]); } finally { db.release(); } }
}
