import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { ProgressionCorrectionReasonSchema, CosmeticsInventorySchema, ProgressionViewSchema, ProgressionWorldSchema, type ProgressionPolicy } from '@virtual-city/contracts';
import type { IdentityService } from '../identity/service';
import type { FocusService } from '../focus/service';
import type { HospitalityCompletionSink } from '../hospitality/outbox';
import { DEFAULT_PROGRESSION_POLICY } from './policy';
import { DomainError } from '../common/errors';
import {ProgressionLedger} from './ledger';
type Db = Pick<PoolClient, 'query'>;
type Ledger = { id: string; source_kind: string; world_slug: string; xp: number; completed_at: Date };
export class ProgressionService {
  readonly policy: ProgressionPolicy;
  private readonly rewards: ProgressionLedger;
  private readonly correctionOperators:readonly string[];
  constructor(private pool: Pick<Pool,'connect'>, private identity: IdentityService, private focus: FocusService, eligible: (db: Db, account: string, world: string) => Promise<boolean>, policy: unknown = DEFAULT_PROGRESSION_POLICY, private now = Date.now,correctionOperators:readonly string[]=[]) { this.rewards = new ProgressionLedger(eligible, policy, now); this.policy = this.rewards.policy;this.correctionOperators=z.array(z.string().regex(/^[a-z][a-z0-9-]{2,63}$/)).max(8).refine(items=>new Set(items).size===items.length).parse(correctionOperators); }
  private balance(db: Db, account: string) {return this.rewards.balance(db, account);}
  private syncEntitlements(db: Db, account: string) {return this.rewards.syncEntitlements(db, account);}
  private apply(db: Db, raw: unknown) {return this.rewards.apply(db, raw);}
  hospitalitySink(): HospitalityCompletionSink {return this.rewards.hospitalitySink();}
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
