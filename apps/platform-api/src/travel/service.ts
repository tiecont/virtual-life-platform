import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { TravelIntentInputSchema, TravelIntentReceiptSchema, TravelRequestSchema, TravelResultSchema, type TravelResult, type TravelSource, type TravelDestination, type TravelPhase } from '@virtual-city/contracts';
import type { IdentityContext, IdentityService } from '../identity/service';
import type { RoomService } from '../rooms/service';
import { DomainError } from '../common/errors';
import { createTravelLifecycle, advanceTravelLifecycle, TravelLifecycleSchema, TRAVEL_MAX_TTL_MS } from './lifecycle';

type Row = { id: string; account_id: string; session_id: string; owner_epoch: string; source: TravelSource | null; destination: TravelDestination; scope_fingerprint: string; capability_digest: string; phase: TravelPhase; created_at: Date; expires_at: Date; changed_at: Date; redeemed_at: Date | null; redemption_key: string | null; target_room_id?: string | null; target_membership_id?: string | null };
const uuid = z.uuid().transform(value => value.toLowerCase());
const unavailable = () => new DomainError('NOT_AVAILABLE', 404, 'This travel authorization is unavailable');
const conflict = () => new DomainError('IDEMPOTENCY_CONFLICT', 409, 'This travel request conflicts with an earlier action');
const DAY = 86400000;
export class TravelService {
  #maintenance?: Promise<number>; #closed = false;
  #jobs = new Map<string, { sessionId: string; key: string; connectionId: string; digest: string; promise: Promise<TravelResult> }>();
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private rooms: RoomService, private now = Date.now) {}
  private async tx<T>(token: string, work: (db: PoolClient, actor: IdentityContext) => Promise<T>) {
    if (this.#closed) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Travel service unavailable');
    const initial = await this.identity.authenticate(token), db = await this.pool.connect();
    try { await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'"); await this.identity.lockAccounts(db, [initial.accountId]); const actor = await this.identity.contextInTransaction(db, token); const result = await work(db, actor); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private capability(row: Row) { return this.identity.fingerprint({ purpose: 'travel-capability:v1', id: row.id, accountId: row.account_id, sessionId: row.session_id, scope: row.scope_fingerprint, epoch: row.owner_epoch, expiresAt: row.expires_at.getTime() }); }
  private receipt(row: Row, issue = false) {
    return TravelIntentReceiptSchema.parse({ schemaVersion: 1, intentId: row.id, phase: row.phase, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(), destination: row.destination, redeemed: !!row.redeemed_at, capability: issue && row.phase === 'CREATED' && !row.redeemed_at ? this.capability(row) : null });
  }
  private async sync(db: PoolClient, row: Row) {
    const state = TravelLifecycleSchema.parse({ schemaVersion: 1, phase: row.phase, createdAt: row.created_at.getTime(), expiresAt: row.expires_at.getTime(), changedAt: row.changed_at.getTime() });
    const next = advanceTravelLifecycle(state, row.owner_epoch !== this.rooms.epoch ? 'FAIL' : 'TIMEOUT', this.now());
    if (next.phase !== row.phase) { row.phase = next.phase; row.changed_at = new Date(next.changedAt); await db.query('UPDATE travel_intents SET phase=$2,changed_at=$3 WHERE id=$1', [row.id, row.phase, row.changed_at]); }
    return row;
  }
  private async own(db: PoolClient, actor: IdentityContext, id: string) {
    const row = (await db.query<Row>('SELECT * FROM travel_intents WHERE id=$1 AND account_id=$2 AND session_id=$3 FOR UPDATE', [id, actor.accountId, actor.sessionId])).rows[0];
    if (!row) throw unavailable(); return this.sync(db, row);
  }
  private async prior(db: PoolClient, actor: IdentityContext, key: string, fingerprint: string) {
    const row = (await db.query<{ intent_id: string; fingerprint: string }>('SELECT intent_id,fingerprint FROM travel_mutations WHERE actor_id=$1 AND request_id=$2', [actor.accountId, key])).rows[0];
    if (row && row.fingerprint !== fingerprint) throw conflict(); return row ? this.own(db, actor, row.intent_id) : null;
  }
  private remember(db: PoolClient, actor: IdentityContext, key: string, fingerprint: string, operation: string, id: string) {
    return db.query('INSERT INTO travel_mutations VALUES($1,$2,$3,$4,$5,$6)', [actor.accountId, key, id, operation, fingerprint, new Date(this.now())]);
  }
  async create(token: string, requestKey: string, raw: unknown) {
    const input = TravelIntentInputSchema.parse(raw), key = uuid.parse(requestKey), initial = await this.identity.authenticate(token);
    const fingerprint = this.identity.fingerprint({ operation: 'travel.create', sessionId: initial.sessionId, input });
    const previous = await this.tx(token, async (db, actor) => { const row = await this.prior(db, actor, key, fingerprint); return row ? this.receipt(row, true) : null; }); if (previous) return previous;
    const context = await this.rooms.travelContext(token, input.source, input.destination);
    return this.tx(token, async (db, actor) => {
      const old = await this.prior(db, actor, key, fingerprint); if (old) return this.receipt(old, true);
      if (context.actor.sessionId !== actor.sessionId || context.epoch !== this.rooms.epoch) throw unavailable();
      await db.query("UPDATE travel_intents SET phase=CASE WHEN expires_at<=$2 THEN 'EXPIRED' ELSE 'FAILED' END,changed_at=$2 WHERE account_id=$1 AND phase IN ('CREATED','READY') AND (expires_at<=$2 OR owner_epoch<>$3)", [actor.accountId, new Date(this.now()), this.rooms.epoch]);
      if ((await db.query("SELECT 1 FROM travel_intents WHERE account_id=$1 AND phase IN ('CREATED','READY')", [actor.accountId])).rowCount) throw conflict();
      if ((await db.query('SELECT count(*)::int AS count FROM travel_intents WHERE account_id=$1 AND created_at>$2', [actor.accountId, new Date(this.now() - 60000)])).rows[0].count >= 6) throw new DomainError('RATE_LIMITED', 429, 'Please wait before creating another travel request');
      const at = this.now(); if (at >= actor.expiresAt) throw new DomainError('UNAUTHENTICATED', 401, 'Session ended');
      const state = createTravelLifecycle(at, Math.min(TRAVEL_MAX_TTL_MS, actor.expiresAt - at));
      const row: Row = { id: randomUUID(), account_id: actor.accountId, session_id: actor.sessionId, owner_epoch: context.epoch, source: input.source, destination: input.destination, scope_fingerprint: fingerprint, capability_digest: '', phase: state.phase, created_at: new Date(state.createdAt), expires_at: new Date(state.expiresAt), changed_at: new Date(state.changedAt), redeemed_at: null, redemption_key: null };
      row.capability_digest = this.identity.hash(this.capability(row));
      await db.query('INSERT INTO travel_intents(id,account_id,session_id,owner_epoch,source,destination,scope_fingerprint,capability_digest,phase,created_at,expires_at,changed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [row.id, row.account_id, row.session_id, row.owner_epoch, row.source && JSON.stringify(row.source), JSON.stringify(row.destination), fingerprint, row.capability_digest, row.phase, row.created_at, row.expires_at, row.changed_at]);
      await this.remember(db, actor, key, fingerprint, 'create', row.id); return this.receipt(row, true);
    });
  }
  get(token: string, id: string) { return this.tx(token, async (db, actor) => this.receipt(await this.own(db, actor, uuid.parse(id)))); }
  async cancel(token: string, id: string, requestKey: string) {
    id = uuid.parse(id); const key = uuid.parse(requestKey);
    const result = await this.tx(token, async (db, actor) => {
      const fingerprint = this.identity.fingerprint({ operation: 'travel.cancel', sessionId: actor.sessionId, id });
      const previous = await this.prior(db, actor, key, fingerprint); if (previous) return this.receipt(previous);
      const row = await this.own(db, actor, id), state = advanceTravelLifecycle({ schemaVersion: 1, phase: row.phase, createdAt: row.created_at.getTime(), expiresAt: row.expires_at.getTime(), changedAt: row.changed_at.getTime() }, 'CANCEL', this.now());
      row.phase = state.phase; row.changed_at = new Date(state.changedAt); await db.query('UPDATE travel_intents SET phase=$2,changed_at=$3 WHERE id=$1', [id, row.phase, row.changed_at]);
      await this.remember(db, actor, key, fingerprint, 'cancel', id); return this.receipt(row);
    });
    if (result.phase !== 'COMMITTED') await this.rooms.abortTravel(id); return result;
  }
  // Trusted coordinator port only. Redemption consumes authorization, not room
  // capacity or membership. M09-04 must revalidate again at its actual switch.
  async redeem(token: string, id: string, requestKey: string, rawCapability: string) {
    id = uuid.parse(id); const key = uuid.parse(requestKey), capability = z.string().regex(/^[a-f0-9]{64}$/).parse(rawCapability);
    const observed = await this.tx(token, (db, actor) => this.own(db, actor, id));
    if (observed.phase !== 'CREATED') throw unavailable();
    if (!timingSafeEqual(Buffer.from(this.identity.hash(capability)), Buffer.from(observed.capability_digest))) throw unavailable();
    const context = await this.rooms.travelContext(token, observed.source, observed.destination);
    return this.tx(token, async (db, actor) => {
      const row = await this.own(db, actor, id);
      if (row.phase !== 'CREATED' || context.epoch !== row.owner_epoch || context.actor.sessionId !== actor.sessionId) throw unavailable();
      const fingerprint = this.identity.fingerprint({ operation: 'travel.redeem', sessionId: actor.sessionId, id, capabilityDigest: row.capability_digest });
      const previous = await this.prior(db, actor, key, fingerprint);
      if (!previous) {
        if (row.redeemed_at) throw conflict();
        const at = this.now(); if (at >= row.expires_at.getTime()) throw unavailable();
        row.redeemed_at = new Date(at); row.redemption_key = key;
        await db.query('UPDATE travel_intents SET redeemed_at=$2,redemption_key=$3 WHERE id=$1', [id, row.redeemed_at, key]); await this.remember(db, actor, key, fingerprint, 'redeem', id);
      } else if (row.redemption_key !== key) throw conflict();
      return Object.freeze({ intentId: row.id, redemptionId: key, accountId: actor.accountId, sessionId: actor.sessionId, ownerEpoch: row.owner_epoch, source: row.source, destination: row.destination, expiresAt: row.expires_at.getTime() });
    });
  }
  async request(token: string, connectionId: string, raw: unknown, connected: () => boolean): Promise<TravelResult> {
    const input = TravelRequestSchema.parse(raw), actor = await this.identity.authenticate(token), digest = this.identity.hash(input.capability);
    const row = await this.tx(token, (db, context) => this.own(db, context, input.intentId));
    if (!timingSafeEqual(Buffer.from(digest), Buffer.from(row.capability_digest))) throw unavailable();
    if (row.redemption_key && row.redemption_key !== input.requestId) throw conflict();
    if (row.phase === 'COMMITTED') {
      const snapshot = row.owner_epoch === this.rooms.epoch && row.target_room_id && row.target_membership_id ? await this.rooms.travelResult(token, connectionId, row.target_room_id, row.target_membership_id) : null;
      return TravelResultSchema.parse({ schemaVersion: 1, receipt: this.receipt(row), snapshot });
    }
    const existing = this.#jobs.get(row.id);
    if (existing) { if (existing.sessionId !== actor.sessionId || existing.key !== input.requestId || existing.connectionId !== connectionId || existing.digest !== digest) throw conflict(); return existing.promise; }
    if (row.phase !== 'CREATED' || this.#closed) throw unavailable();
    if (this.#jobs.size >= 64) throw new DomainError('RATE_LIMITED', 429, 'Travel service busy');
    const promise = this.coordinate(token, connectionId, input, connected).finally(() => this.#jobs.delete(row.id));
    this.#jobs.set(row.id, { sessionId: actor.sessionId, key: input.requestId, connectionId, digest, promise }); return promise;
  }
  private async coordinate(token: string, connectionId: string, input: ReturnType<typeof TravelRequestSchema.parse>, connected: () => boolean): Promise<TravelResult> {
    try {
      const authorization = await this.redeem(token, input.intentId, input.requestId, input.capability);
      await this.rooms.prepareTravel(token, connectionId, authorization, connected);
      await this.tx(token, async (db, actor) => {
        const row = await this.own(db, actor, input.intentId);
        if (row.phase !== 'CREATED' || row.redemption_key !== input.requestId) throw unavailable();
        const next = advanceTravelLifecycle({ schemaVersion: 1, phase: row.phase, createdAt: row.created_at.getTime(), expiresAt: row.expires_at.getTime(), changedAt: row.changed_at.getTime() }, 'TARGET_READY', this.now());
        if (next.phase !== 'READY') throw unavailable();
        await db.query('UPDATE travel_intents SET phase=$2,changed_at=$3 WHERE id=$1', [row.id, next.phase, new Date(next.changedAt)]);
      });
      const snapshot = await this.rooms.commitTravel(token, input.intentId, connected, (target, apply) => this.tx(token, async (db, actor) => {
        const row = await this.own(db, actor, input.intentId);
        if (row.phase !== 'READY' || row.redemption_key !== input.requestId || row.owner_epoch !== this.rooms.epoch) throw unavailable();
        const next = advanceTravelLifecycle({ schemaVersion: 1, phase: row.phase, createdAt: row.created_at.getTime(), expiresAt: row.expires_at.getTime(), changedAt: row.changed_at.getTime() }, 'TARGET_COMMITTED', this.now());
        if (next.phase !== 'COMMITTED') throw unavailable();
        await db.query('UPDATE travel_intents SET phase=$2,changed_at=$3,target_room_id=$4,target_membership_id=$5 WHERE id=$1', [row.id, next.phase, new Date(next.changedAt), target.roomId, target.membershipId]);
        apply();
      }));
      return TravelResultSchema.parse({ schemaVersion: 1, receipt: await this.get(token, input.intentId), snapshot });
    } catch (error) {
      await this.rooms.abortTravel(input.intentId).catch(() => {});
      await this.tx(token, async (db, actor) => {
        const row = await this.own(db, actor, input.intentId);
        const next = advanceTravelLifecycle({ schemaVersion: 1, phase: row.phase, createdAt: row.created_at.getTime(), expiresAt: row.expires_at.getTime(), changedAt: row.changed_at.getTime() }, 'FAIL', this.now());
        await db.query('UPDATE travel_intents SET phase=$2,changed_at=$3 WHERE id=$1', [row.id, next.phase, new Date(next.changedAt)]);
      }).catch(() => {});
      throw error;
    }
  }
  async exportAccount(id: string, db: PoolClient) {
    const rows = (await db.query<Row>('SELECT * FROM travel_intents WHERE account_id=$1 ORDER BY created_at DESC,id LIMIT 101', [id])).rows;
    const items = []; for (const row of rows.slice(0, 100)) items.push(this.receipt(await this.sync(db, row)));
    return { schemaVersion: 1, items, truncated: rows.length > 100 };
  }
  maintain() {
    if (this.#closed) return Promise.resolve(0);
    if (!this.#maintenance) this.#maintenance = this.pool.query("UPDATE travel_intents SET phase='EXPIRED',changed_at=$1 WHERE id IN (SELECT id FROM travel_intents WHERE phase IN ('CREATED','READY') AND expires_at<=$1 ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)", [new Date(this.now())])
      .then(() => this.pool.query("DELETE FROM travel_intents WHERE id IN (SELECT id FROM travel_intents WHERE phase NOT IN ('CREATED','READY') AND created_at<=$1 ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED)", [new Date(this.now() - DAY)]))
      .then(result => result.rowCount ?? 0).finally(() => { this.#maintenance = undefined; });
    return this.#maintenance;
  }
  async close() { this.#closed = true; await Promise.allSettled([...this.#jobs.values()].map(job => job.promise)); await this.#maintenance; }
}
