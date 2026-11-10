import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {ProgressionPolicySchema, RewardObservationSchema, ProgressionWorldSchema, type ProgressionPolicy} from '@virtual-city/contracts';
import type {HospitalityCompletionSink} from '../../../../hospitality/modules/service/application/jobs';
import {DEFAULT_PROGRESSION_POLICY, assessReward} from '../domain/policy';
type Db = Pick<PoolClient, 'query'>;
// Shared transactional reward implementation. No identity/session/focus/room root.
export class ProgressionLedger {
  readonly policy: ProgressionPolicy;
  constructor(private eligible: (db: Db, account: string, world: string) => Promise<boolean>, policy: unknown = DEFAULT_PROGRESSION_POLICY, private now = Date.now) {this.policy = ProgressionPolicySchema.parse(policy);}
  async balance(db:Db,account:string){return (await db.query('SELECT ((SELECT coalesce(sum(xp),0) FROM engine_progression_ledger WHERE account_id=$1)-(SELECT coalesce(sum(revoked_xp),0) FROM engine_progression_corrections WHERE account_id=$1))::int AS total',[account])).rows[0].total as number;}
  async syncEntitlements(db:Db,account:string){const total=await this.balance(db,account);for(const item of this.policy.cosmetics){if(total>=item.lifetimeXp)await db.query('INSERT INTO engine_progression_entitlements VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[account,item.key,new Date(this.now())]);else await db.query('DELETE FROM engine_progression_entitlements WHERE account_id=$1 AND cosmetic_key=$2',[account,item.key]);}}
  async apply(db: Db, raw: unknown) {
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
    await this.syncEntitlements(db,event.accountId);
  }
  hospitalitySink(): HospitalityCompletionSink { return { key:'progression-completion-v1',apply:async (db,event) => {
    if (!ProgressionWorldSchema.safeParse(event.worldSlug).success || !this.policy.enabled) return;
    // Outbox already holds both participant account locks in canonical order.
    for (const [accountId,partnerId] of [[event.customerId,event.staffId],[event.staffId,event.customerId]]) await this.apply(db,{ schemaVersion:1,kind:'hospitality-completed',sourceId:event.orderId,worldSlug:event.worldSlug,accountId,partnerId,completedAt:event.completedAt });
  } }; }
}
