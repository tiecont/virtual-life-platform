import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { SanctionInputSchema, SanctionRevokeSchema, SanctionSummarySchema, SanctionResultSchema, OwnSanctionsSchema, CaseSanctionsSchema, AppealInputSchema, AppealReceiptSchema, CaseAppealsSchema, AppealReviewInputSchema, AppealDispositionSchema, type SafetyPolicy } from '@virtual-city/contracts';
import type { IdentityService, IdentityContext } from '../identity/service';
import type { RoomService } from '../rooms/service';
import { DomainError } from '../common/errors';
import type { ReportService } from './reports';
import { EvidenceCipher } from './evidence';

const unavailable = () => new DomainError('NOT_AVAILABLE', 404, 'This safety action is unavailable');
const HOUR = 3600000;
type Sanction = { id: string; case_id: string; subject_id: string | null; issuer_id: string | null; kind: 'warn' | 'mute' | 'room-eject' | 'world-ban' | 'platform-ban'; category: string; world_slug: string | null; room_id: string | null; effective_at: Date; expires_at: Date; revoked_at: Date | null; appeal_until: Date };
type Appeal = { id: string; sanction_id: string; subject_id: string | null; created_at: Date; evidence_id: string; status: 'received' | 'upheld' | 'revoked'; reviewed_at: Date | null };

// Enforcement deliberately has no dependency on the evidence key or staff feature gates.
export class SanctionPolicy {
  constructor(private pool: Pick<Pool, 'query'>, private now = Date.now) {}
  async permits(account: string, world: string, room?: string, chat = false) {
    const result = await this.pool.query(`SELECT 1 FROM safety_sanctions WHERE subject_id=$1 AND revoked_at IS NULL AND effective_at<=$3 AND expires_at>$3 AND
      (kind='platform-ban' OR (world_slug=$2 AND (kind='world-ban' OR ($4::uuid IS NOT NULL AND kind='room-eject' AND room_id=$4) OR ($5 AND kind='mute')))) LIMIT 1`, [account, world, new Date(this.now()), room ?? null, chat]);
    return result.rowCount === 0;
  }
  async assert(account: string, world: string, room?: string, chat = false) { if (!await this.permits(account, world, room, chat)) throw new DomainError('FORBIDDEN', 403, 'This activity is unavailable under an active safety restriction'); }
}

export class SanctionService {
  #cipher?: EvidenceCipher;
  #maintenance?: Promise<number>;
  #listeners = new Set<(accountId: string) => void>();
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private reports: ReportService, private rooms: RoomService, private policy: SafetyPolicy, environment: 'development' | 'test' | 'production', key?: string, keyId = 'local-v1', private now = Date.now) {
    if (environment !== 'production' && key) this.#cipher = new EvidenceCipher(key, keyId);
  }
  private enabled() { if (!this.#cipher || !this.reports.available()) throw new DomainError('SAFETY_UNAVAILABLE', 503, 'Confidential safety review is unavailable'); }
  onChanged(listener: (accountId: string) => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  private changed(accountId: string) { for (const listener of this.#listeners) { try { listener(accountId); } catch { /* Committed state is authoritative. */ } } }
  private async tx<T>(token: string, targets: string[], work: (db: PoolClient, actor: IdentityContext) => Promise<T>) {
    const initial = await this.identity.authenticate(token); const db = await this.pool.connect();
    try {
      await db.query('BEGIN'); await this.identity.lockAccounts(db, [initial.accountId, ...targets]);
      const actor = await this.identity.contextInTransaction(db, token);
      const result = await work(db, actor); await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private summary(row: Sanction) {
    return SanctionSummarySchema.parse({ id: row.id, kind: row.kind, category: row.category, worldSlug: row.world_slug, roomId: row.room_id, effectiveAt: row.effective_at.toISOString(), expiresAt: row.expires_at.toISOString(), state: row.revoked_at ? 'revoked' : row.expires_at.getTime() <= this.now() ? 'expired' : 'active', appealUntil: row.appeal_until.toISOString() });
  }
  private audit(db: PoolClient, row: Sanction, actor: string, action: string, reason: string) {
    return db.query('INSERT INTO safety_audit_events(event_id,case_id,actor_digest,action,reason,created_at) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), row.case_id, this.identity.fingerprint({ auditActor: actor }), action, reason, new Date(this.now())]);
  }
  private async prior(db: PoolClient, actor: string, key: string, fingerprint: string) {
    const row = (await db.query('SELECT fingerprint,result FROM safety_sanction_mutations WHERE actor_id=$1 AND request_id=$2', [actor, key])).rows[0];
    if (row && row.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
    return row?.result as unknown;
  }
  private remember(db: PoolClient, actor: string, key: string, fingerprint: string, operation: string, result: unknown) {
    return db.query('INSERT INTO safety_sanction_mutations VALUES($1,$2,$3,$4,$5,$6)', [actor, key, fingerprint, operation, JSON.stringify(result), new Date(this.now())]);
  }
  private async currentResult(db: PoolClient, previous: unknown) {
    const prior = SanctionResultSchema.parse(previous);
    const row = (await db.query<Sanction>('SELECT * FROM safety_sanctions WHERE id=$1', [prior.sanction.id])).rows[0]; if (!row) throw unavailable();
    return SanctionResultSchema.parse({ schemaVersion: 1, sanction: this.summary(row) });
  }
  private note(db: PoolClient, sanction: string, purpose: string, text: string) {
    const id = randomUUID(), sealed = this.#cipher!.seal('sanction-note:' + id, { text });
    return db.query('INSERT INTO safety_sanction_notes VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [id, sanction, purpose, sealed.keyId, sealed.iv, sealed.tag, sealed.ciphertext, new Date(this.now() + this.policy.draftRetentionHours.reportEvidence * HOUR)]);
  }
  async issue(token: string, caseId: string, key: string, raw: unknown) {
    const input = SanctionInputSchema.parse(raw); await this.identity.authenticate(token); this.enabled();
    const subject = (await this.pool.query('SELECT subject_id FROM safety_cases WHERE id=$1', [caseId])).rows[0]?.subject_id as string | undefined; if (!subject) throw unavailable();
    const result = await this.rooms.safetyMutation(async () => {
      const result = await this.tx(token, [subject], async (db, actor) => {
        this.enabled(); const { row: context, admin } = await this.reports.reviewContext(db, actor, caseId);
        const fingerprint = this.identity.fingerprint({ operation: 'sanction.issue', caseId, input });
        const previous = await this.prior(db, actor.accountId, key, fingerprint); if (previous) return this.currentResult(db, previous);
        const evidence = await this.reports.evidenceInTransaction(db, caseId);
        if (context.subject_id !== subject || !this.policy.severities[context.severity].allowedSanctions.includes(input.kind) || (input.kind === 'platform-ban' && !admin)) throw unavailable();
        if (!admin && (await db.query('SELECT 1 FROM safety_staff_grants g JOIN identity_accounts a ON a.id=g.account_id WHERE g.account_id=$1 AND g.expires_at>$2 AND a.kind=\'registered\' LIMIT 1', [subject, new Date(this.now())])).rowCount) throw unavailable();
        const hours = input.kind === 'mute' ? this.policy.sanctions.maxMuteHours : input.kind === 'platform-ban' ? this.policy.sanctions.maxTemporaryPlatformBanHours : this.policy.sanctions.maxWorldBanHours;
        if (input.durationMinutes > hours * 60) throw new DomainError('INVALID_REQUEST', 422, 'Duration exceeds the policy limit');
        const count = (await db.query("SELECT count(*)::int AS count FROM safety_sanction_mutations WHERE actor_id=$1 AND operation='issue' AND created_at>$2", [actor.accountId, new Date(this.now() - 24 * HOUR)])).rows[0].count;
        if (count >= 30) throw new DomainError('RATE_LIMITED', 429, 'Please wait before issuing another restriction');
        if(input.kind==='room-eject'&&evidence.source.kind==='reservation-invitation')throw new DomainError('NOT_AVAILABLE',409,'Invitation evidence does not establish a room visit');
        const roomId = input.kind === 'room-eject' ? evidence.source.kind === 'room' ? evidence.source.roomId : evidence.source.kind==='messages'?evidence.source.messages[0].roomId:null : null;
        const row = (await db.query<Sanction>('INSERT INTO safety_sanctions(id,case_id,subject_id,issuer_id,kind,category,world_slug,room_id,effective_at,expires_at,appeal_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [randomUUID(), caseId, subject, actor.accountId, input.kind, context.category, input.kind === 'platform-ban' ? null : context.world_slug, roomId, new Date(this.now()), new Date(this.now() + input.durationMinutes * 60000), new Date(this.now() + this.policy.appeals.windowDays * 24 * HOUR)])).rows[0];
        await this.note(db, row.id, 'issue', input.privateReason); await this.audit(db, row, actor.accountId, 'sanction.issued', 'reviewed-case');
        const result = SanctionResultSchema.parse({ schemaVersion: 1, sanction: this.summary(row) }); await this.remember(db, actor.accountId, key, fingerprint, 'issue', result); return result;
      });
      return { result, interruption: ['room-eject', 'world-ban', 'platform-ban'].includes(result.sanction.kind) && result.sanction.state === 'active' ? { accountId: subject, worldSlug: result.sanction.worldSlug, roomId: result.sanction.roomId } : undefined };
    });
    this.changed(subject); return result;
  }
  async revoke(token: string, id: string, key: string, raw: unknown) {
    const input = SanctionRevokeSchema.parse(raw); await this.identity.authenticate(token); this.enabled();
    const initial = (await this.pool.query<Sanction>('SELECT * FROM safety_sanctions WHERE id=$1', [id])).rows[0]; if (!initial?.subject_id) throw unavailable();
    const result = await this.rooms.safetyMutation(async () => ({ result: await this.tx(token, [initial.subject_id!], async (db, actor) => {
      this.enabled(); const { admin } = await this.reports.reviewContext(db, actor, initial.case_id);
      const row = (await db.query<Sanction>('SELECT * FROM safety_sanctions WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (row.issuer_id === actor.accountId || (row.kind === 'platform-ban' && !admin)) throw unavailable();
      const fingerprint = this.identity.fingerprint({ operation: 'sanction.revoke', id, input }); const previous = await this.prior(db, actor.accountId, key, fingerprint); if (previous) return this.currentResult(db, previous);
      if (!row.revoked_at) {
        await db.query('UPDATE safety_sanctions SET revoked_at=$2 WHERE id=$1', [id, new Date(this.now())]); row.revoked_at = new Date(this.now());
        await this.note(db, id, 'revoke', input.privateReason); await this.audit(db, row, actor.accountId, 'sanction.revoked', 'independent-reversal');
      }
      const result = SanctionResultSchema.parse({ schemaVersion: 1, sanction: this.summary(row) }); await this.remember(db, actor.accountId, key, fingerprint, 'revoke', result); return result;
    }) }));
    this.changed(initial.subject_id); return result;
  }
  own(token: string) { return this.tx(token, [], (db, actor) => this.exportAccount(actor.accountId, db)); }
  caseSanctions(token: string, id: string) {
    this.enabled();
    return this.tx(token, [], async (db, actor) => {
      await this.reports.reviewContext(db, actor, id);
      const rows = (await db.query<Sanction>('SELECT * FROM safety_sanctions WHERE case_id=$1 ORDER BY effective_at DESC,id LIMIT 101', [id])).rows;
      return CaseSanctionsSchema.parse({ schemaVersion: 1, items: rows.slice(0, 100).map(row => this.summary(row)), truncated: rows.length > 100 });
    });
  }
  async exportAccount(id: string, db: PoolClient) {
    const rows = (await db.query<Sanction>('SELECT * FROM safety_sanctions WHERE subject_id=$1 ORDER BY effective_at DESC,id LIMIT 101', [id])).rows;
    const appeals = (await db.query<Appeal>('SELECT * FROM safety_appeals WHERE subject_id=$1 ORDER BY created_at DESC LIMIT 100', [id])).rows.map(row => ({ ...AppealReceiptSchema.parse({ schemaVersion: 1, receiptId: row.id, status: 'received', createdAt: row.created_at.toISOString() }), sanctionId: row.sanction_id, status: row.status, reviewedAt: row.reviewed_at?.toISOString() ?? null }));
    return OwnSanctionsSchema.parse({ schemaVersion: 1, items: rows.slice(0, 100).map(row => this.summary(row)), truncated: rows.length > 100, appeals });
  }
  async appeal(token: string, id: string, key: string, raw: unknown) {
    const input = AppealInputSchema.parse(raw); this.enabled();
    return this.tx(token, [], async (db, actor) => {
      this.enabled(); const row = (await db.query<Sanction>('SELECT * FROM safety_sanctions WHERE id=$1 AND subject_id=$2 FOR UPDATE', [id, actor.accountId])).rows[0]; if (!row) throw unavailable();
      const fingerprint = this.identity.fingerprint({ operation: 'sanction.appeal', id, input }); const previous = await this.prior(db, actor.accountId, key, fingerprint); if (previous) return AppealReceiptSchema.parse(previous);
      const priorAppeal = (await db.query('SELECT 1 FROM safety_appeals WHERE sanction_id=$1', [id])).rowCount;
      if (priorAppeal) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'An appeal has already been received for this restriction');
      if (row.appeal_until.getTime() <= this.now()) throw unavailable();
      const count = (await db.query('SELECT count(*)::int AS count FROM safety_appeals WHERE subject_id=$1 AND created_at>$2', [actor.accountId, new Date(this.now() - 24 * HOUR)])).rows[0].count;
      if (count >= 5) throw new DomainError('RATE_LIMITED', 429, 'Please wait before submitting another appeal');
      const note = await this.note(db, id, 'appeal', input.note), receiptId = randomUUID();
      await db.query('INSERT INTO safety_appeals(id,sanction_id,subject_id,created_at,evidence_id) VALUES($1,$2,$3,$4,$5)', [receiptId, id, actor.accountId, new Date(this.now()), note.rows[0].id]);
      await this.audit(db, row, actor.accountId, 'appeal.received', 'subject-appeal');
      const result = AppealReceiptSchema.parse({ schemaVersion: 1, receiptId, status: 'received', createdAt: new Date(this.now()).toISOString() }); await this.remember(db, actor.accountId, key, fingerprint, 'appeal', result); return result;
    });
  }
  async redactAccount(id: string, db: PoolClient) {
    // Both case participants' allegations and appeal notes can contain their personal data.
    await db.query('DELETE FROM safety_sanction_notes WHERE sanction_id IN (SELECT s.id FROM safety_sanctions s JOIN safety_cases c ON c.id=s.case_id WHERE s.subject_id=$1 OR s.issuer_id=$1 OR c.reporter_id=$1 OR c.subject_id=$1 OR EXISTS(SELECT 1 FROM safety_appeals a WHERE a.sanction_id=s.id AND a.reviewer_id=$1))', [id]);
  }
  caseAppeals(token: string, caseId: string, cursor?: string) {
    this.enabled();
    return this.tx(token, [], async (db, actor) => {
      const { admin } = await this.reports.reviewContext(db, actor, caseId);
      const rows = (await db.query<Appeal>('SELECT a.* FROM safety_appeals a JOIN safety_sanctions s ON s.id=a.sanction_id WHERE s.case_id=$1 AND s.issuer_id IS DISTINCT FROM $2 AND (s.kind<>\'platform-ban\' OR $4) AND ($3::uuid IS NULL OR a.id>$3) ORDER BY a.id LIMIT 26', [caseId, actor.accountId, cursor ?? null, admin])).rows;
      const items = [];
      for (const row of rows.slice(0, 25)) {
        const sanction = (await db.query<Sanction>('SELECT * FROM safety_sanctions WHERE id=$1', [row.sanction_id])).rows[0];
        const sealed = (await db.query('SELECT * FROM safety_sanction_notes WHERE id=$1 AND expires_at>$2', [row.evidence_id, new Date(this.now())])).rows[0];
        const opened = sealed ? this.#cipher!.open('sanction-note:' + row.evidence_id, { ...sealed, keyId: sealed.key_id }) as { text: string } : null;
        const issue = (await db.query('SELECT * FROM safety_sanction_notes WHERE sanction_id=$1 AND purpose=\'issue\' AND expires_at>$2 ORDER BY id LIMIT 1', [row.sanction_id, new Date(this.now())])).rows[0];
        const issuance = issue ? this.#cipher!.open('sanction-note:' + issue.id, { ...issue, keyId: issue.key_id }) as { text: string } : null;
        await this.audit(db, sanction, actor.accountId, 'appeal.viewed', 'independent-review');
        items.push({ receiptId: row.id, createdAt: row.created_at.toISOString(), status: row.status, sanction: this.summary(sanction), note: opened?.text ?? null, issuanceReason: issuance?.text ?? null, reviewedAt: row.reviewed_at?.toISOString() ?? null });
      }
      return CaseAppealsSchema.parse({ schemaVersion: 1, items, nextCursor: rows.length > 25 ? rows[24].id : null });
    });
  }
  async reviewAppeal(token: string, id: string, key: string, raw: unknown) {
    const input = AppealReviewInputSchema.parse(raw); await this.identity.authenticate(token); this.enabled();
    const initial = (await this.pool.query<Sanction>('SELECT s.* FROM safety_sanctions s JOIN safety_appeals a ON a.sanction_id=s.id WHERE a.id=$1', [id])).rows[0]; if (!initial?.subject_id) throw unavailable();
    const result = await this.rooms.safetyMutation(async () => ({ result: await this.tx(token, [initial.subject_id!], async (db, actor) => {
      this.enabled(); const { admin } = await this.reports.reviewContext(db, actor, initial.case_id);
      const row = (await db.query<Sanction>('SELECT * FROM safety_sanctions WHERE id=$1 FOR UPDATE', [initial.id])).rows[0];
      if (row.issuer_id === actor.accountId || (row.kind === 'platform-ban' && !admin)) throw unavailable();
      const fingerprint = this.identity.fingerprint({ operation: 'appeal.review', id, input }); const previous = await this.prior(db, actor.accountId, key, fingerprint); if (previous) return AppealDispositionSchema.parse(previous);
      const appeal = (await db.query<Appeal>('SELECT * FROM safety_appeals WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (appeal.status !== 'received') throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'This appeal has already been reviewed');
      if (input.decision === 'uphold' && row.revoked_at) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'This restriction has already been revoked');
      // A final disposition requires reading still-authentic, nonexpired subject evidence.
      const sealed = (await db.query('SELECT * FROM safety_sanction_notes WHERE id=$1 AND expires_at>$2', [appeal.evidence_id, new Date(this.now())])).rows[0]; if (!sealed) throw unavailable();
      this.#cipher!.open('sanction-note:' + appeal.evidence_id, { ...sealed, keyId: sealed.key_id });
      if (input.decision === 'uphold') {
        await this.reports.evidenceInTransaction(db, row.case_id);
        const original = (await db.query('SELECT * FROM safety_sanction_notes WHERE sanction_id=$1 AND purpose=\'issue\' AND expires_at>$2 ORDER BY id LIMIT 1', [row.id, new Date(this.now())])).rows[0]; if (!original) throw unavailable();
        this.#cipher!.open('sanction-note:' + original.id, { ...original, keyId: original.key_id });
      }
      await this.note(db, row.id, 'review', input.privateReason);
      if (input.decision === 'revoke' && !row.revoked_at) {
        await db.query('UPDATE safety_sanctions SET revoked_at=$2 WHERE id=$1', [row.id, new Date(this.now())]);
        await this.audit(db, row, actor.accountId, 'sanction.revoked', 'independent-reversal');
      }
      const status = input.decision === 'revoke' ? 'revoked' : 'upheld', reviewedAt = new Date(this.now());
      await db.query('UPDATE safety_appeals SET status=$2,reviewed_at=$3,reviewer_id=$4 WHERE id=$1', [id, status, reviewedAt, actor.accountId]);
      await this.audit(db, row, actor.accountId, 'appeal.reviewed', 'independent-review');
      const result = AppealDispositionSchema.parse({ schemaVersion: 1, receiptId: id, status, reviewedAt: reviewedAt.toISOString() }); await this.remember(db, actor.accountId, key, fingerprint, 'review', result); return result;
    }) }));
    this.changed(initial.subject_id); return result;
  }
  maintain() {
    if (!this.#maintenance) this.#maintenance = this.pool.query('DELETE FROM safety_sanction_notes WHERE id IN (SELECT id FROM safety_sanction_notes WHERE expires_at<=$1 ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)', [new Date(this.now())]).then(result => result.rowCount ?? 0).finally(() => { this.#maintenance = undefined; });
    return this.#maintenance;
  }
}
