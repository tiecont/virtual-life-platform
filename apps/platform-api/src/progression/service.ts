import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { ProgressionCorrectionReasonSchema, CosmeticsInventorySchema, ProgressionPolicySchema, ProgressionViewSchema, RewardObservationSchema, ProgressionWorldSchema, type ProgressionPolicy } from '@virtual-city/contracts';
import type { IdentityService } from '../identity/service';
import type { FocusService } from '../focus/service';
import type { HospitalityCompletionSink } from '../hospitality/outbox';
import { DEFAULT_PROGRESSION_POLICY, assessReward } from './policy';
import { DomainError } from '../common/errors';
type Db = Pick<PoolClient, 'query'>;
type Ledger = { id: string; source_kind: string; world_slug: string; xp: number; completed_at: Date };
export class ProgressionService {
  readonly policy: ProgressionPolicy;
  private readonly correctionOperators:readonly string[];
  constructor(private pool: Pick<Pool,'connect'>, private identity: IdentityService, private focus: FocusService, private eligible: (db: Db, account: string, world: string) => Promise<boolean>, policy: unknown = DEFAULT_PROGRESSION_POLICY, private now = Date.now,correctionOperators:readonly string[]=[]) { this.policy = ProgressionPolicySchema.parse(policy);this.correctionOperators=z.array(z.string().regex(/^[a-z][a-z0-9-]{2,63}$/)).max(8).refine(items=>new Set(items).size===items.length).parse(correctionOperators); }
  private async balance(db:Db,account:string){return (await db.query('SELECT ((SELECT coalesce(sum(xp),0) FROM engine_progression_ledger WHERE account_id=$1)-(SELECT coalesce(sum(revoked_xp),0) FROM engine_progression_corrections WHERE account_id=$1))::int AS total',[account])).rows[0].total as number;}
  private async syncEntitlements(db:Db,account:string){const total=await this.balance(db,account);for(const item of this.policy.cosmetics){if(total>=item.lifetimeXp)await db.query('INSERT INTO engine_progression_entitlements VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[account,item.key,new Date(this.now())]);else await db.query('DELETE FROM engine_progression_entitlements WHERE account_id=$1 AND cosmetic_key=$2',[account,item.key]);}}
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
    await this.syncEntitlements(db,event.accountId);
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
    const corrections=(await db.query('SELECT id,ledger_id,revoked_xp,reason_code,created_at FROM engine_progression_corrections WHERE account_id=$1 ORDER BY creation_order DESC LIMIT 101',[id])).rows;
    return ProgressionViewSchema.parse({ schemaVersion:1,enabled:this.policy.enabled,lifetimeXp:await this.balance(db,id),awardedXp:total,entitlements:[...new Set(['casual',...entitlements])],history:history.slice(0,100).map(row=>({id:row.id,kind:row.source_kind,worldSlug:row.world_slug,xp:row.xp,completedAt:row.completed_at.toISOString()})),corrections:corrections.slice(0,100).map(row=>({id:row.id,grantId:row.ledger_id,xp:-row.revoked_xp,reason:row.reason_code,createdAt:row.created_at.toISOString()})),truncated:history.length>100||corrections.length>100 });
  }
  // Trusted in-process operation only. Operator labels are registered at composition,
  // never accepted from an HTTP/socket caller as authentication or authorization.
  async correct(operator:string,raw:unknown){
    if(!this.correctionOperators.includes(operator))throw new DomainError('FORBIDDEN',403,'Correction operator unavailable');
    const input=z.strictObject({schemaVersion:z.literal(1),accountId:z.uuid(),grantId:z.uuid(),requestId:z.uuid(),reason:ProgressionCorrectionReasonSchema}).parse(raw),fingerprint=this.identity.fingerprint({operation:'progression.correct',operator,input});
    const db=await this.pool.connect();try{await db.query('BEGIN');await this.identity.lockAccounts(db,[input.accountId]);
      const prior=(await db.query('SELECT id,fingerprint FROM engine_progression_corrections WHERE id=$1',[input.requestId])).rows[0];if(prior){if(prior.fingerprint!==fingerprint)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Correction key already used');await db.query('COMMIT');return {schemaVersion:1,correctionId:prior.id};}
      const grant=(await db.query('SELECT id,xp,recorded_at FROM engine_progression_ledger WHERE id=$1 AND account_id=$2 FOR UPDATE',[input.grantId,input.accountId])).rows[0];if(!grant)throw new DomainError('NOT_AVAILABLE',404,'Grant unavailable');
      if((await db.query('SELECT 1 FROM engine_progression_corrections WHERE ledger_id=$1',[grant.id])).rowCount)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Grant already corrected; use original correction key');
      if(this.now()<grant.recorded_at.getTime())throw new DomainError('WORLD_UNAVAILABLE',503,'Correction clock unavailable');
      await db.query('INSERT INTO engine_progression_corrections(id,ledger_id,account_id,revoked_xp,reason_code,operator_key,fingerprint,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[input.requestId,grant.id,input.accountId,grant.xp,input.reason,operator,fingerprint,new Date(this.now())]);
      await this.syncEntitlements(db,input.accountId);await db.query('COMMIT');return {schemaVersion:1,correctionId:input.requestId};
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  async own(token: string) {
    const initial=await this.identity.authenticate(token),db=await this.pool.connect(); try { await db.query('BEGIN');await this.identity.lockAccounts(db,[initial.accountId]);const actor=await this.identity.contextInTransaction(db,token),result=await this.exportAccount(actor.accountId,db);await db.query('COMMIT');return result; } catch(error) { await db.query('ROLLBACK');throw error; } finally { db.release(); }
  }
  async inventory(token:string) { const view=await this.own(token);return CosmeticsInventorySchema.parse({schemaVersion:1,enabled:this.policy.enabled,items:this.policy.cosmetics.map(item=>({key:item.key,requiredXp:item.lifetimeXp,owned:view.entitlements.includes(item.key)}))}); }
  async maintain() { const db=await this.pool.connect();try { await db.query('DELETE FROM engine_progression_partners WHERE ledger_id IN(SELECT ledger_id FROM engine_progression_partners WHERE completed_at<$1 ORDER BY completed_at LIMIT 100)',[new Date(this.now()-2*86400000)]);await db.query('DELETE FROM engine_progression_appearance_mutations WHERE (account_id,request_id) IN(SELECT account_id,request_id FROM engine_progression_appearance_mutations WHERE created_at<$1 ORDER BY created_at LIMIT 100)',[new Date(this.now()-90*86400000)]); } finally { db.release(); } }
}
