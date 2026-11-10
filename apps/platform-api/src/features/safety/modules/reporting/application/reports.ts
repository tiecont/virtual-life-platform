import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ReportInputSchema, ReportReceiptSchema, ReportEvidenceSchema, CaseSummarySchema, CasePageSchema, CaseDetailSchema, CaseAssignmentSchema, CaseSearchSchema, type ReportInput, type ReportReceipt, type ReportEvidence, type SafetyPolicy } from '@virtual-city/contracts';
import type { IdentityService, IdentityContext } from '../../../../identity/modules/accounts/application/service';
import type { RoomService } from '../../../../rooms/modules/presence/application/service';
import { DomainError } from '../../../../../shared/common/errors';
import { EvidenceCipher, MessageEvidenceCache } from './evidence';

type CaseRow = { id: string; receipt_id: string; reporter_id: string | null; subject_id: string | null; fingerprint: string; world_slug: string; category: ReportInput['category']; severity: 'low' | 'medium' | 'high' | 'critical'; status: 'open'; assigned_to: string | null; created_at: Date };
const unavailable = () => new DomainError('NOT_AVAILABLE', 404, 'This safety action is unavailable');
const HOUR = 3600000;
export interface ReservationInvitationReportPort {resolve(token:string,id:string):Promise<{worldSlug:string;subjectId:string;reservationId:string;invitationId:string}>}
export interface PrivateDateReportPort {resolve(token:string,id:string):Promise<{worldSlug:string;subjectId:string;dateId:string}>}
export class ReportService {
  #privateDate?:PrivateDateReportPort;
  setPrivateDateContext(port:PrivateDateReportPort){if(this.#privateDate)throw Error('Private report context already attached');this.#privateDate=port;}
  #reservationInvitation?:ReservationInvitationReportPort;
  setReservationInvitationContext(port:ReservationInvitationReportPort){if(this.#reservationInvitation)throw Error('Reservation report context already attached');this.#reservationInvitation=port;}
  readonly cache?: MessageEvidenceCache;
  #cipher?: EvidenceCipher; #closed = false; #maintenance?: Promise<number>;
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private rooms: RoomService, private policy: SafetyPolicy, environment: 'development' | 'test' | 'production', key?: string, keyId = 'local-v1', private now = Date.now, productionEvidence=false) {
    if ((environment !== 'production'||productionEvidence) && key) { this.#cipher = new EvidenceCipher(key, keyId); this.cache = new MessageEvidenceCache(this.#cipher, now); }
  }
  available() { return !!this.#cipher && !this.#closed; }
  private enabled() { if (!this.available()) throw new DomainError('SAFETY_UNAVAILABLE', 503, 'Confidential reporting is unavailable'); }
  private async tx<T>(token: string, targets: string[], work: (db: PoolClient, actor: IdentityContext) => Promise<T>) {
    const initial = await this.identity.authenticate(token); this.enabled(); const db = await this.pool.connect();
    try {
      await db.query('BEGIN'); await this.identity.lockAccounts(db, [initial.accountId, ...targets]);
      const actor = await this.identity.contextInTransaction(db, token); this.enabled();
      const result = await work(db, actor); await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private audit(db: PoolClient, caseId: string, actor: string, action: string, reason: string) {
    return db.query('INSERT INTO safety_audit_events(event_id,case_id,actor_digest,action,reason,created_at) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), caseId, this.identity.fingerprint({ auditActor: actor }), action, reason, new Date(this.now())]);
  }
  private receipt(row: CaseRow): ReportReceipt { return ReportReceiptSchema.parse({ schemaVersion: 1, receiptId: row.receipt_id, status: 'received', createdAt: row.created_at.toISOString() }); }
  private summary(row: CaseRow) { return CaseSummarySchema.parse({ id: row.id, worldSlug: row.world_slug, category: row.category, severity: row.severity, status: row.status, assignedTo: row.assigned_to, createdAt: row.created_at.toISOString() }); }
  private async prior(db: PoolClient, actor: IdentityContext, key: string, fingerprint: string) {
    const row = (await db.query<CaseRow>('SELECT * FROM safety_cases WHERE reporter_id=$1 AND request_id=$2', [actor.accountId, key])).rows[0];
    if (row && row.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
    return row ? this.receipt(row) : null;
  }
  async submit(token: string, key: string, raw: ReportInput) {
    const input = ReportInputSchema.parse(raw); const initial = await this.identity.authenticate(token); this.enabled();
    const fingerprint = this.identity.fingerprint(input);
    const old = await this.tx(token, [], (db, actor) => this.prior(db, actor, key, fingerprint)); if (old) return old;
    let worldSlug: string, subjectId: string, source: ReportEvidence['source'];
    if (input.source.kind === 'room') {
      const context = await this.rooms.reportContext(token, input.source); worldSlug = context.worldSlug; subjectId = context.subjectId;
      source = { kind: 'room', epoch: input.source.epoch, roomId: input.source.roomId, targetId: subjectId };
    } else if(input.source.kind==='messages') {
      const context = this.cache!.read(initial.accountId, input.source.messageIds); worldSlug = context.worldSlug; subjectId = context.messages[0].sender.id;
      source = { kind: 'messages', messages: context.messages };
    }else if(input.source.kind==='private-date'){
      if(!this.#privateDate)throw unavailable();const context=await this.#privateDate.resolve(token,input.source.dateId);worldSlug=context.worldSlug;subjectId=context.subjectId;source={kind:'private-date',dateId:context.dateId};
    }else{
      if(!this.#reservationInvitation)throw unavailable();const context=await this.#reservationInvitation.resolve(token,input.source.invitationId);worldSlug=context.worldSlug;subjectId=context.subjectId;source={kind:'reservation-invitation',invitationId:context.invitationId,reservationId:context.reservationId};
    }
    if (!this.policy.contexts[worldSlug] || input.note.length > this.policy.evidence.maxReporterNoteChars || (source.kind === 'messages' && source.messages.length > this.policy.evidence.maxMessageReferences)) throw unavailable();
    return this.tx(token, [subjectId], async (db, actor) => {
      const previous = await this.prior(db, actor, key, fingerprint); if (previous) return previous;
      if (actor.accountId === subjectId || !(await db.query('SELECT 1 FROM identity_accounts WHERE id=$1', [subjectId])).rowCount) throw unavailable();
      // Persistent shared-account budget: switching sessions or restarting cannot reset it.
      const count = (await db.query('SELECT count(*)::int AS count FROM safety_cases WHERE reporter_id=$1 AND created_at>$2', [actor.accountId, new Date(this.now() - 24 * HOUR)])).rows[0].count;
      if (count >= 5) throw new DomainError('RATE_LIMITED', 429, 'Please wait before submitting another report');
      const id = randomUUID(), receiptId = randomUUID(); const created = new Date(this.now());
      const evidence = ReportEvidenceSchema.parse({ schemaVersion: 1, note: input.note, attribution: 'reporter-allegation-not-a-finding', source });
      const sealed = this.#cipher!.seal('case:' + id, evidence);
      const row = (await db.query<CaseRow>('INSERT INTO safety_cases(id,receipt_id,reporter_id,subject_id,request_id,fingerprint,world_slug,category,severity,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [id, receiptId, actor.accountId, subjectId, key, fingerprint, worldSlug, input.category, this.policy.categories[input.category].defaultSeverity, created])).rows[0];
      await db.query('INSERT INTO safety_report_evidence VALUES($1,$2,$3,$4,$5,$6)', [id, sealed.keyId, sealed.iv, sealed.tag, sealed.ciphertext, new Date(this.now() + this.policy.draftRetentionHours.reportEvidence * HOUR)]);
      await this.audit(db, id, actor.accountId, 'report.created', 'submitted'); return this.receipt(row);
    });
  }
  receiptFor(token: string, id: string) {
    return this.tx(token, [], async (db, actor) => {
      const row = (await db.query<CaseRow>('SELECT * FROM safety_cases WHERE reporter_id=$1 AND receipt_id=$2', [actor.accountId, id])).rows[0]; if (!row) throw unavailable(); return this.receipt(row);
    });
  }
  private async grant(db: PoolClient, actorId: string, world?: string) {
    const grants = (await db.query<{ world_slug: string; role: 'moderator' | 'safety-admin'; expires_at: Date }>(`SELECT g.world_slug,g.role,g.expires_at FROM safety_staff_grants g JOIN identity_accounts a ON a.id=g.account_id WHERE g.account_id=$1 AND a.kind='registered' AND g.expires_at>$2 AND ($3::text IS NULL OR g.world_slug=$3) FOR SHARE OF g`, [actorId, new Date(this.now()), world ?? null])).rows;
    if (!grants.length) throw unavailable(); return grants;
  }
  // Trusted staff gate remains usable for emergency closure when evidence access is unavailable.
  grantsInTransaction(db: PoolClient, actorId: string, world?: string) { return this.grant(db, actorId, world); }
  async reviewContext(db: PoolClient, actor: IdentityContext, caseId: string) {
    this.enabled();
    const row = (await db.query<CaseRow>('SELECT * FROM safety_cases WHERE id=$1 FOR UPDATE', [caseId])).rows[0]; if (!row) throw unavailable();
    const grants = await this.grant(db, actor.accountId, row.world_slug);
    if (!row.subject_id || row.assigned_to !== actor.accountId || [row.reporter_id, row.subject_id].includes(actor.accountId) || (row.category === 'staff-abuse' && !grants.some(grant => grant.role === 'safety-admin'))) throw unavailable();
    return { row, admin: grants.some(grant => grant.role === 'safety-admin') };
  }
  async evidenceInTransaction(db: PoolClient, caseId: string) {
    this.enabled(); const sealed = (await db.query<{ key_id: string; iv: Buffer; tag: Buffer; ciphertext: Buffer; expires_at: Date }>('SELECT * FROM safety_report_evidence WHERE case_id=$1', [caseId])).rows[0];
    if (!sealed || sealed.expires_at.getTime() <= this.now()) throw unavailable();
    return ReportEvidenceSchema.parse(this.#cipher!.open('case:' + caseId, { ...sealed, keyId: sealed.key_id }));
  }
  cases(token: string, search?: unknown) {
    const query = CaseSearchSchema.parse(typeof search === 'string' ? { cursor: search } : search ?? {});
    return this.tx(token, [], async (db, actor) => {
      const grants = await this.grant(db, actor.accountId);
      const scopes = grants.map(grant => grant.world_slug), adminScopes = grants.filter(grant => grant.role === 'safety-admin').map(grant => grant.world_slug);
      const rows = (await db.query<CaseRow>(`SELECT * FROM safety_cases WHERE world_slug=ANY($1::text[]) AND reporter_id IS DISTINCT FROM $2 AND subject_id IS DISTINCT FROM $2 AND (assigned_to=$2 OR world_slug=ANY($3::text[])) AND (category<>'staff-abuse' OR world_slug=ANY($3::text[])) AND ($4::uuid IS NULL OR id>$4) AND ($5::uuid IS NULL OR id=$5) AND ($6::text IS NULL OR world_slug=$6) AND ($7::text IS NULL OR category=$7) AND ($8::text IS NULL OR severity=$8) ORDER BY id LIMIT 26`, [scopes, actor.accountId, adminScopes, query.cursor ?? null, query.id ?? null, query.world ?? null, query.category ?? null, query.severity ?? null])).rows;
      return CasePageSchema.parse({ schemaVersion: 1, items: rows.slice(0, 25).map(row => this.summary(row)), nextCursor: rows.length > 25 ? rows[24].id : null });
    });
  }
  assign(token: string, id: string, key: string, raw: unknown) {
    const input = CaseAssignmentSchema.parse(raw);
    return this.tx(token, [input.assigneeId], async (db, actor) => {
      const row = (await db.query<CaseRow>('SELECT * FROM safety_cases WHERE id=$1 FOR UPDATE', [id])).rows[0]; if (!row) throw unavailable();
      const grants = await this.grant(db, actor.accountId, row.world_slug); if (!grants.some(grant => grant.role === 'safety-admin')) throw unavailable();
      if ([row.reporter_id, row.subject_id].includes(actor.accountId) || [row.reporter_id, row.subject_id].includes(input.assigneeId)) throw unavailable();
      const assignee = await this.grant(db, input.assigneeId, row.world_slug); if (row.category === 'staff-abuse' && !assignee.some(grant => grant.role === 'safety-admin')) throw unavailable();
      const fingerprint = this.identity.fingerprint({ operation: 'case.assign', id, input });
      const previous = (await db.query('SELECT fingerprint,result FROM safety_case_mutations WHERE actor_id=$1 AND request_id=$2', [actor.accountId, key])).rows[0];
      if (previous) { if (previous.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input'); return previous.result as { schemaVersion: 1; case: ReturnType<ReportService['summary']> }; }
      if (row.assigned_to !== input.assigneeId) {
        await db.query('UPDATE safety_cases SET assigned_to=$2 WHERE id=$1', [id, input.assigneeId]); row.assigned_to = input.assigneeId;
        await this.audit(db, id, actor.accountId, 'case.assigned', input.reason);
      }
      const result = { schemaVersion: 1 as const, case: this.summary(row) };
      await db.query('INSERT INTO safety_case_mutations VALUES($1,$2,$3,$4,$5)', [actor.accountId, key, fingerprint, JSON.stringify(result), new Date(this.now())]);
      return result;
    });
  }
  detail(token: string, id: string) {
    return this.tx(token, [], async (db, actor) => {
      const row = (await db.query<CaseRow>('SELECT * FROM safety_cases WHERE id=$1 FOR UPDATE', [id])).rows[0]; if (!row) throw unavailable();
      const grants = await this.grant(db, actor.accountId, row.world_slug);
      if ([row.reporter_id, row.subject_id].includes(actor.accountId) || row.assigned_to !== actor.accountId || (row.category === 'staff-abuse' && !grants.some(grant => grant.role === 'safety-admin'))) throw unavailable();
      const sealed = (await db.query<{ key_id: string; iv: Buffer; tag: Buffer; ciphertext: Buffer; expires_at: Date }>('SELECT * FROM safety_report_evidence WHERE case_id=$1', [id])).rows[0];
      let evidence: ReportEvidence | null = null;
      if (sealed && sealed.expires_at.getTime() > this.now()) evidence = ReportEvidenceSchema.parse(this.#cipher!.open('case:' + id, { ...sealed, keyId: sealed.key_id }));
      await this.audit(db, id, actor.accountId, 'case.viewed', 'assigned-review');
      return CaseDetailSchema.parse({ schemaVersion: 1, case: this.summary(row), subjectId: row.subject_id, evidence, evidenceExpiresAt: evidence ? sealed.expires_at.toISOString() : null });
    });
  }
  // Private transaction hooks: no report data from others is added to target exports.
  async exportAccount(id: string, db: PoolClient) {
    const rows = (await db.query<CaseRow>('SELECT * FROM safety_cases WHERE reporter_id=$1 ORDER BY created_at LIMIT 101', [id])).rows;
    return { submittedReports: rows.slice(0, 100).map(row => this.receipt(row)), reportsTruncated: rows.length > 100, protectedEvidence: 'Excluded pending privacy-owner review' };
  }
  async redactAccount(id: string, db: PoolClient) {
    const rows = (await db.query<{ id: string }>('SELECT c.id FROM safety_cases c JOIN safety_report_evidence e ON e.case_id=c.id WHERE c.reporter_id=$1 OR c.subject_id=$1 ORDER BY c.id FOR UPDATE OF c', [id])).rows;
    for (const row of rows) { await db.query('DELETE FROM safety_report_evidence WHERE case_id=$1', [row.id]); await this.audit(db, row.id, 'identity-deletion', 'evidence.purged', 'identity-deleted'); }
    this.cache?.forget(id);
  }
  maintain() {
    if (this.#closed) return Promise.resolve(0);
    this.cache?.maintain();
    if (!this.#maintenance) this.#maintenance = this.purgeExpiredEvidence().finally(() => { this.#maintenance = undefined; });
    return this.#maintenance;
  }
  async purgeExpiredEvidence() {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const rows = (await db.query<{ case_id: string }>('DELETE FROM safety_report_evidence WHERE case_id IN (SELECT case_id FROM safety_report_evidence WHERE expires_at<=$1 ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING case_id', [new Date(this.now())])).rows;
      for (const row of rows) await this.audit(db, row.case_id, 'retention', 'evidence.purged', 'expired');
      await db.query('COMMIT'); return rows.length;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  async close() { this.#closed = true; this.cache?.close(); await this.#maintenance; }
}
