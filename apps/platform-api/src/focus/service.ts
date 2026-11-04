import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { FocusStartSchema, FocusResultSchema, FocusSessionSchema, FocusHistoryQuerySchema, FocusHistorySchema, FocusSummaryQuerySchema, FocusSummarySchema, type FocusSession } from '@virtual-city/contracts';
import type { IdentityContext, IdentityService } from '../identity/service';
import type { RoomService } from '../rooms/service';
import { DomainError } from '../common/errors';
import { advanceFocus, remainingFocus, startFocus, type FocusState, type FocusAction } from './lifecycle';
type Row = { id: string; account_id: string; world_slug: string; room_id: string; seat_id: string; source_epoch: string; source_membership_id: string; phase: FocusSession['phase']; duration_seconds: 900 | 1500 | 3000; started_at: Date; changed_at: Date; ends_at: Date | null; paused_until: Date | null; remaining_ms: number; can_pause: boolean; pause_budget_ms: number };
const uuid = z.uuid().transform(value => value.toLowerCase()), DAY = 86400000;
const unavailable = () => new DomainError('NOT_AVAILABLE', 404, 'This timer is unavailable');
export class FocusService {
  #maintenance?: Promise<void>; #closed = false;
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private rooms: RoomService, private now = Date.now) {}
  private async tx<T>(token: string, work: (db: PoolClient, actor: IdentityContext) => Promise<T>) {
    if (this.#closed) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Focus is unavailable');
    const initial = await this.identity.authenticate(token), db = await this.pool.connect();
    try { await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'"); await this.identity.lockAccounts(db, [initial.accountId]); const actor = await this.identity.contextInTransaction(db, token); const result = await work(db, actor); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private state(row: Row): FocusState { return { phase: row.phase, durationSeconds: row.duration_seconds, startedAt: row.started_at.getTime(), changedAt: row.changed_at.getTime(), endsAt: row.ends_at?.getTime() ?? null, pausedUntil: row.paused_until?.getTime() ?? null, remainingMs: row.remaining_ms, canPause: row.can_pause, pauseBudgetMs: row.pause_budget_ms }; }
  private view(row: Row) { return FocusSessionSchema.parse({ schemaVersion: 1, id: row.id, phase: row.phase, durationSeconds: row.duration_seconds, startedAt: row.started_at.toISOString(), changedAt: row.changed_at.toISOString(), endsAt: row.ends_at?.toISOString() ?? null, pausedUntil: row.paused_until?.toISOString() ?? null, remainingMs: remainingFocus(this.state(row), this.now()), canPause: row.can_pause, pauseBudgetMs: row.pause_budget_ms, origin: { worldSlug: row.world_slug, roomId: row.room_id, seatId: row.seat_id } }); }
  private result(row: Row | null) { return FocusResultSchema.parse({ schemaVersion: 1, serverTime: new Date(this.now()).toISOString(), session: row ? this.view(row) : null }); }
  // Trusted owner port: only phase labels leave this engine. No timer IDs,
  // timestamps, durations, task text or completion writes are exposed here.
  async studyPhases(scope:{worldSlug:string;roomId:string;epoch:string;opensAt:string;endsAt:string},members:readonly {accountId:string;membershipId:string}[]){
    if(this.#closed||members.length>8)throw new DomainError('WORLD_UNAVAILABLE',503,'Study progress unavailable');
    const result=new Map<string,'active'|'paused'|'completed'|'idle'>();if(!members.length)return result;
    const rows=(await this.pool.query<Row>('SELECT DISTINCT ON(account_id) * FROM engine_focus_sessions WHERE account_id=ANY($1::uuid[]) AND world_slug=$2 AND room_id=$3 AND source_epoch=$4 ORDER BY account_id,creation_order DESC',[members.map(member=>member.accountId),scope.worldSlug,scope.roomId,scope.epoch])).rows;
    for(const member of members){const row=rows.find(row=>row.account_id===member.accountId&&row.source_membership_id===member.membershipId&&row.started_at.getTime()>=Date.parse(scope.opensAt)&&row.started_at.getTime()<Date.parse(scope.endsAt));const phase=row?advanceFocus(this.state(row),'read',this.now()).phase:'cancelled';result.set(member.accountId,phase==='cancelled'?'idle':phase);}
    return result;
  }
  private async transition(db: PoolClient, row: Row, action: FocusAction = 'read') {
    const next = advanceFocus(this.state(row), action, this.now());
    if (next.phase !== row.phase || next.changedAt !== row.changed_at.getTime()) {
      row.phase = next.phase; row.changed_at = new Date(next.changedAt); row.ends_at = next.endsAt === null ? null : new Date(next.endsAt); row.paused_until = next.pausedUntil === null ? null : new Date(next.pausedUntil); row.remaining_ms = next.remainingMs; row.pause_budget_ms = next.pauseBudgetMs;
      await db.query('UPDATE engine_focus_sessions SET phase=$2,changed_at=$3,ends_at=$4,paused_until=$5,remaining_ms=$6,pause_budget_ms=$7 WHERE id=$1', [row.id, row.phase, row.changed_at, row.ends_at, row.paused_until, row.remaining_ms, row.pause_budget_ms]);
    } return row;
  }
  private async own(db: PoolClient, actor: IdentityContext, id: string) { const row = (await db.query<Row>('SELECT * FROM engine_focus_sessions WHERE id=$1 AND account_id=$2 FOR UPDATE', [id, actor.accountId])).rows[0]; if (!row) throw unavailable(); return row; }
  private async prior(db: PoolClient, actor: IdentityContext, key: string, fingerprint: string) {
    const old = (await db.query<{ fingerprint: string; focus_id: string }>('SELECT fingerprint,focus_id FROM engine_focus_mutations WHERE actor_id=$1 AND request_id=$2', [actor.accountId, key])).rows[0];
    if (old && old.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
    return old ? this.transition(db, await this.own(db, actor, old.focus_id)) : null;
  }
  private async budget(db: PoolClient, actor: IdentityContext, starting = false) {
    if ((await db.query('SELECT count(*)::int AS count FROM engine_focus_mutations WHERE actor_id=$1 AND created_at>$2', [actor.accountId, new Date(this.now() - 3600000)])).rows[0].count >= 120) throw new DomainError('RATE_LIMITED', 429, 'Please wait before changing the timer');
    if (starting && (await db.query('SELECT count(*)::int AS count FROM engine_focus_sessions WHERE account_id=$1 AND started_at>$2', [actor.accountId, new Date(this.now() - 3600000)])).rows[0].count >= 12) throw new DomainError('RATE_LIMITED', 429, 'Please wait before starting more timers');
  }
  private remember(db: PoolClient, actor: IdentityContext, key: string, fingerprint: string, operation: string, id: string) { return db.query('INSERT INTO engine_focus_mutations VALUES($1,$2,$3,$4,$5,$6)', [actor.accountId, key, id, operation, fingerprint, new Date(this.now())]); }
  async start(token: string, requestKey: string, raw: unknown) {
    const input = FocusStartSchema.parse(raw), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'focus.start', input });
    const old = await this.tx(token, async (db, actor) => { const prior = await this.prior(db, actor, key, fingerprint); return prior ? this.result(prior) : null; }); if (old) return old;
    return this.rooms.focusStart(token, input.source, (_context, origin, valid) => this.tx(token, async (db, actor) => {
      const prior = await this.prior(db, actor, key, fingerprint); if (prior) return this.result(prior);
      const running = (await db.query<Row>("SELECT * FROM engine_focus_sessions WHERE account_id=$1 AND phase IN ('active','paused') FOR UPDATE", [actor.accountId])).rows;
      for (const row of running) if (['active', 'paused'].includes((await this.transition(db, row)).phase)) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'An existing timer must finish or be cancelled first');
      await this.budget(db, actor, true); const at = this.now(); if (!valid() || at >= actor.expiresAt) throw new DomainError('NOT_IN_ROOM', 409, 'Your current seat could not be confirmed');
      const state = startFocus(at, input.durationSeconds, origin.canPause), id = randomUUID();
      const row = (await db.query<Row>('INSERT INTO engine_focus_sessions(id,account_id,world_slug,room_id,seat_id,source_epoch,source_membership_id,phase,duration_seconds,started_at,changed_at,ends_at,paused_until,remaining_ms,can_pause,pause_budget_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *', [id, actor.accountId, origin.worldSlug, origin.roomId, origin.seatId, origin.epoch, origin.membershipId, state.phase, state.durationSeconds, new Date(state.startedAt), new Date(state.changedAt), new Date(state.endsAt!), null, state.remainingMs, state.canPause, state.pauseBudgetMs])).rows[0];
      await this.remember(db, actor, key, fingerprint, 'start', id); if (!valid()) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Your visit changed'); return this.result(row);
    }));
  }
  current(token: string) { return this.tx(token, async (db, actor) => { const row = (await db.query<Row>("SELECT * FROM engine_focus_sessions WHERE account_id=$1 ORDER BY (phase IN ('active','paused')) DESC,creation_order DESC LIMIT 1 FOR UPDATE", [actor.accountId])).rows[0]; return this.result(row ? await this.transition(db, row) : null); }); }
  completion<T>(token: string, id: string, work: (db: PoolClient, completion: { accountId: string; sourceId: string; worldSlug: string; completedAt: string }) => Promise<T>) {
    id = uuid.parse(id); return this.tx(token, async (db, actor) => {
      const row = await this.transition(db, await this.own(db, actor, id)); if (row.phase !== 'completed') throw unavailable();
      return work(db, { accountId: actor.accountId, sourceId: row.id, worldSlug: row.world_slug, completedAt: row.changed_at.toISOString() });
    });
  }
  get(token: string, id: string) { id = uuid.parse(id); return this.tx(token, async (db, actor) => this.result(await this.transition(db, await this.own(db, actor, id)))); }
  history(token: string, raw: unknown) {
    const query = FocusHistoryQuerySchema.parse(raw);
    return this.tx(token, async (db, actor) => {
      let before: string | null = null;
      if (query.cursor) {
        const cursor = (await db.query<{ creation_order: string }>('SELECT creation_order FROM engine_focus_sessions WHERE account_id=$1 AND id=$2 AND ($3::text IS NULL OR world_slug=$3)', [actor.accountId, query.cursor, query.worldSlug ?? null])).rows[0];
        if (!cursor) throw unavailable(); before = cursor.creation_order;
      }
      const rows = (await db.query<Row>('SELECT * FROM engine_focus_sessions WHERE account_id=$1 AND ($2::bigint IS NULL OR creation_order<$2) AND ($3::text IS NULL OR world_slug=$3) ORDER BY creation_order DESC LIMIT $4 FOR UPDATE', [actor.accountId, before, query.worldSlug ?? null, query.limit + 1])).rows;
      const items = []; for (const row of rows.slice(0, query.limit)) items.push(this.view(await this.transition(db, row)));
      return FocusHistorySchema.parse({ schemaVersion: 1, serverTime: new Date(this.now()).toISOString(), items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null });
    });
  }
  mutate(token: string, id: string, requestKey: string, action: Exclude<FocusAction, 'read'>) {
    id = uuid.parse(id); const key = uuid.parse(requestKey);
    return this.tx(token, async (db, actor) => {
      const fingerprint = this.identity.fingerprint({ operation: 'focus.' + action, id }), old = await this.prior(db, actor, key, fingerprint); if (old) return this.result(old);
      await this.budget(db, actor); const row = await this.transition(db, await this.own(db, actor, id), action); await this.remember(db, actor, key, fingerprint, action, id); return this.result(row);
    });
  }
  summary(token: string, raw: unknown) {
    const query = FocusSummaryQuerySchema.parse(raw);
    return this.tx(token, async (db, actor) => {
      const invalid = () => new DomainError('INVALID_REQUEST', 422, 'Choose a valid recent date range and IANA time zone');
      if (query.timeZone !== 'UTC' && !query.timeZone.includes('/')) throw invalid();
      if (!(await db.query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [query.timeZone])).rowCount) throw invalid();
      const at = new Date(this.now()), dates = (await db.query<{ today: string; available_from: string }>("SELECT (($1::timestamptz AT TIME ZONE $2)::date)::text AS today, ((($1::timestamptz-interval '2160 hours') AT TIME ZONE $2)::date+1)::text AS available_from", [at, query.timeZone])).rows[0];
      const span = (Date.parse(query.to) - Date.parse(query.from)) / DAY;
      if (span < 0 || span >= 31 || query.to > dates.today || query.from < dates.available_from) throw invalid();
      const active = (await db.query<Row>("SELECT * FROM engine_focus_sessions WHERE account_id=$1 AND phase IN ('active','paused') FOR UPDATE", [actor.accountId])).rows;
      for (const row of active) await this.transition(db, row);
      // Build consecutive local midnights before converting to UTC; DST days are not fixed24h intervals.
      const rows = (await db.query<{ date: string; starts_at: Date; ends_at: Date; completed_count: number; focus_seconds: number }>(`WITH days AS (
        SELECT ($2::date+n)::text AS date, ($2::date+n)::timestamp AT TIME ZONE $4 AS starts_at, ($2::date+n+1)::timestamp AT TIME ZONE $4 AS ends_at
        FROM generate_series(0,$3::date-$2::date) AS n
      ) SELECT d.date,d.starts_at,d.ends_at,count(f.id)::int AS completed_count,coalesce(sum(f.duration_seconds),0)::int AS focus_seconds
      FROM days d LEFT JOIN engine_focus_sessions f ON f.account_id=$1 AND f.phase='completed' AND f.changed_at>=d.starts_at AND f.changed_at<d.ends_at AND ($5::text IS NULL OR f.world_slug=$5)
      GROUP BY d.date,d.starts_at,d.ends_at ORDER BY d.date`, [actor.accountId, query.from, query.to, query.timeZone, query.worldSlug ?? null])).rows;
      const days = rows.map(row => ({ date: row.date, startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString(), completedCount: row.completed_count, focusSeconds: row.focus_seconds }));
      return FocusSummarySchema.parse({ schemaVersion: 1, serverTime: at.toISOString(), from: query.from, to: query.to, availableFrom: dates.available_from, timeZone: query.timeZone, worldSlug: query.worldSlug ?? null, days, totals: days.reduce((sum, day) => ({ completedCount: sum.completedCount + day.completedCount, focusSeconds: sum.focusSeconds + day.focusSeconds }), { completedCount: 0, focusSeconds: 0 }) });
    });
  }
  async exportAccount(id: string, db: PoolClient) {
    const rows = (await db.query<Row>('SELECT * FROM engine_focus_sessions WHERE account_id=$1 ORDER BY creation_order DESC LIMIT 101', [id])).rows, items = [];
    for (const row of rows.slice(0, 100)) items.push(this.view(await this.transition(db, row)));
    return { schemaVersion: 1, items, truncated: rows.length > 100 };
  }
  maintain() {
    if (this.#closed) return Promise.resolve();
    if (!this.#maintenance) this.#maintenance = this.pool.query("UPDATE engine_focus_sessions SET phase='completed',changed_at=ends_at,remaining_ms=0 WHERE phase='active' AND ends_at<=$1 AND id IN (SELECT id FROM engine_focus_sessions WHERE phase='active' AND ends_at<=$1 ORDER BY ends_at LIMIT 100 FOR UPDATE SKIP LOCKED)", [new Date(this.now())])
      .then(() => this.pool.query("UPDATE engine_focus_sessions SET phase='cancelled',changed_at=paused_until,paused_until=NULL,pause_budget_ms=0 WHERE phase='paused' AND paused_until<=$1 AND id IN (SELECT id FROM engine_focus_sessions WHERE phase='paused' AND paused_until<=$1 ORDER BY paused_until LIMIT 100 FOR UPDATE SKIP LOCKED)", [new Date(this.now())]))
      .then(() => this.pool.query("DELETE FROM engine_focus_sessions WHERE id IN (SELECT id FROM engine_focus_sessions WHERE phase IN ('completed','cancelled') AND changed_at<=$1 ORDER BY changed_at LIMIT 100 FOR UPDATE SKIP LOCKED)", [new Date(this.now() - 90 * DAY)]))
      .then(() => {}).finally(() => { this.#maintenance = undefined; });
    return this.#maintenance;
  }
  async close() { this.#closed = true; await this.#maintenance; }
}
