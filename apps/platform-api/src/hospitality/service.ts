import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { OrderPlaceSchema, OrderMutationSchema, OrderQueueSchema, OrderPageSchema, OrderResultSchema, OrderViewSchema, type OrderPhase, type HospitalityPolicy } from '@virtual-city/contracts';
import type { IdentityService, IdentityContext } from '../identity/service';
import type { RoomService } from '../rooms/service';
import type { SocialService } from '../social/service';
import { DomainError } from '../common/errors';
import { nextOrderPhase } from './lifecycle';
type Row = { id: string; customer_id: string; assignee_id: string | null; world_slug: string; room_id: string; item_key: string; policy_version: string; phase: OrderPhase; version: number; created_at: Date; updated_at: Date };
type Context = { worldSlug: string; roomId: string; seatId: string | null; policy: HospitalityPolicy };
export interface HospitalityStaffPort { permits(db: PoolClient, actor: IdentityContext, context: Readonly<Context>): Promise<boolean> }
const uuid = z.uuid().transform(value => value.toLowerCase());
const absent = () => new DomainError('NOT_AVAILABLE', 404, 'This order is unavailable');
export class HospitalityService {
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private rooms: RoomService, private social: SocialService, private staff: HospitalityStaffPort = { permits: async () => false }, private now = Date.now) {}
  private view(row: Row, actor: string) { return OrderViewSchema.parse({ schemaVersion: 1, id: row.id, phase: row.phase, version: row.version, worldSlug: row.world_slug, roomId: row.room_id, itemKey: row.item_key, policyVersion: row.policy_version, mine: row.customer_id === actor, assignedToMe: row.assignee_id === actor, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }); }
  private result(row: Row, actor: string) { return OrderResultSchema.parse({ schemaVersion: 1, order: this.view(row, actor) }); }
  private async tx<T>(token: string, targets: string[], work: (db: PoolClient, actor: IdentityContext) => Promise<T>) {
    const initial = await this.identity.authenticate(token), db = await this.pool.connect();
    try { await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'"); await this.identity.lockAccounts(db, [initial.accountId, ...targets]); const actor = await this.identity.contextInTransaction(db, token); const result = await work(db, actor); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private async prior(db: PoolClient, actor: string, key: string, fingerprint: string) {
    const prior = (await db.query<{ order_id: string; fingerprint: string }>('SELECT order_id,fingerprint FROM engine_hospitality_mutations WHERE actor_id=$1 AND request_id=$2', [actor, key])).rows[0];
    if (prior && prior.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
    if (!prior) return null; const row = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1', [prior.order_id])).rows[0]; if (!row || ![row.customer_id, row.assignee_id].includes(actor)) throw absent(); return row;
  }
  private async quota(db: PoolClient, actor: string, place: boolean) {
    if ((await db.query('SELECT count(*)::int AS n FROM engine_hospitality_mutations WHERE actor_id=$1 AND created_at>$2', [actor, new Date(this.now() - 60000)])).rows[0].n >= 30) throw new DomainError('RATE_LIMITED', 429, 'Please wait before changing another order');
    if (place && (await db.query("SELECT count(*)::int AS n FROM engine_hospitality_mutations WHERE actor_id=$1 AND operation='place' AND created_at>$2", [actor, new Date(this.now() - 3600000)])).rows[0].n >= 12) throw new DomainError('RATE_LIMITED', 429, 'Please wait before placing more orders');
  }
  private remember(db: PoolClient, actor: string, key: string, row: Row, fingerprint: string, operation: string) { return db.query('INSERT INTO engine_hospitality_mutations VALUES($1,$2,$3,$4,$5,$6)', [actor, key, row.id, operation, fingerprint, new Date(this.now())]); }
  async place(token: string, requestKey: string, raw: unknown) {
    const input = OrderPlaceSchema.parse(raw), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'order.place', input });
    const old = await this.tx(token, [], async (db, actor) => { const row = await this.prior(db, actor.accountId, key, fingerprint); return row ? this.result(row, actor.accountId) : null; }); if (old) return old;
    return this.rooms.hospitalityContext(token, input.source, true, (_actor, context, valid) => this.tx(token, [], async (db, actor) => {
      const prior = await this.prior(db, actor.accountId, key, fingerprint); if (prior) return this.result(prior, actor.accountId);
      if (input.policyVersion !== context.policy.version || !context.policy.itemKeys.includes(input.itemKey)) throw absent();
      if ((await db.query("SELECT 1 FROM engine_hospitality_orders WHERE customer_id=$1 AND phase NOT IN ('COMPLETED','CANCELLED')", [actor.accountId])).rowCount) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'An existing order must finish or be cancelled first');
      if ((await db.query("SELECT count(*)::int AS n FROM engine_hospitality_orders WHERE room_id=$1 AND phase NOT IN ('COMPLETED','CANCELLED')", [context.roomId])).rows[0].n >= context.policy.maxQueue) throw new DomainError('RATE_LIMITED', 429, 'The service queue is full');
      await this.quota(db, actor.accountId, true); const at = new Date(this.now());
      const row = (await db.query<Row>("INSERT INTO engine_hospitality_orders(id,customer_id,world_slug,room_id,customer_epoch,customer_membership_id,item_key,policy_version,phase,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$9) RETURNING *", [randomUUID(), actor.accountId, context.worldSlug, context.roomId, input.source.epoch, input.source.membershipId, input.itemKey, context.policy.version, at])).rows[0];
      await this.remember(db, actor.accountId, key, row, fingerprint, 'place'); if (!valid() || this.now() >= actor.expiresAt) throw new DomainError('NOT_IN_ROOM', 409, 'Your visit changed'); return this.result(row, actor.accountId);
    }));
  }
  async mutate(token: string, id: string, requestKey: string, action: 'claim' | 'cancel', raw: unknown) {
    id = uuid.parse(id); const key = uuid.parse(requestKey), input = OrderMutationSchema.parse(raw), fingerprint = this.identity.fingerprint({ operation: 'order.' + action, id, input });
    const known = (await this.pool.query<{ customer_id: string }>('SELECT customer_id FROM engine_hospitality_orders WHERE id=$1', [id])).rows[0]; if (!known) { await this.identity.authenticate(token); throw absent(); }
    return this.rooms.hospitalityContext(token, input.source, false, (_actor, context, valid) => this.tx(token, [known.customer_id], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row || row.room_id !== context.roomId || row.world_slug !== context.worldSlug || row.customer_id !== known.customer_id) throw absent();
      const prior = await this.prior(db, actor.accountId, key, fingerprint); if (prior) return this.result(prior, actor.accountId);
      if (action === 'cancel' ? row.customer_id !== actor.accountId : row.customer_id === actor.accountId || !await this.staff.permits(db, actor, context) || await this.social.isBlocked(actor.accountId, row.customer_id, db)) throw absent();
      if (row.version !== input.expectedVersion) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Refresh this order before trying again');
      const phase = nextOrderPhase(row.phase, action); await this.quota(db, actor.accountId, false);
      if (action === 'claim' && (await db.query("SELECT count(*)::int AS n FROM engine_hospitality_orders WHERE assignee_id=$1 AND phase IN ('ASSIGNED','PREPARING','READY')", [actor.accountId])).rows[0].n >= context.policy.maxActivePerStaff) throw new DomainError('NOT_AVAILABLE', 409, 'Your service queue is full');
      const updated = (await db.query<Row>('UPDATE engine_hospitality_orders SET phase=$2,assignee_id=$3,version=version+1,updated_at=$4 WHERE id=$1 RETURNING *', [id, phase, action === 'claim' ? actor.accountId : null, new Date(this.now())])).rows[0];
      await this.remember(db, actor.accountId, key, updated, fingerprint, action); if (!valid() || this.now() >= actor.expiresAt) throw new DomainError('NOT_IN_ROOM', 409, 'Your visit changed'); return this.result(updated, actor.accountId);
    }));
  }
  get(token: string, id: string) { id = uuid.parse(id); return this.tx(token, [], async (db, actor) => { const row = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1 AND (customer_id=$2 OR assignee_id=$2)', [id, actor.accountId])).rows[0]; if (!row) throw absent(); return this.result(row, actor.accountId); }); }
  queue(token: string, raw: unknown) {
    const input = OrderQueueSchema.parse(raw);
    return this.rooms.hospitalityContext(token, input.source, false, (_actor, context, valid) => this.tx(token, [], async (db, actor) => {
      if (!await this.staff.permits(db, actor, context)) throw absent();
      const rows = (await db.query<Row>("SELECT * FROM engine_hospitality_orders WHERE room_id=$1 AND (phase='PENDING' OR assignee_id=$2) AND phase NOT IN ('COMPLETED','CANCELLED') ORDER BY creation_order LIMIT 51", [context.roomId, actor.accountId])).rows, items = [];
      for (const row of rows.slice(0, 50)) if (!await this.social.isBlocked(actor.accountId, row.customer_id, db)) items.push(this.view(row, actor.accountId));
      if (!valid()) throw absent(); return OrderPageSchema.parse({ schemaVersion: 1, items, truncated: rows.length > 50 });
    }));
  }
  async exportAccount(id: string, db: PoolClient) { const rows = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE customer_id=$1 OR assignee_id=$1 ORDER BY creation_order DESC LIMIT 101', [id])).rows; return { schemaVersion: 1, items: rows.slice(0, 100).map(row => this.view(row, id)), truncated: rows.length > 100 }; }
  async redactAccount(id: string, db: PoolClient) {
    // Retain the customer's service request without retaining a deleted staff identity.
    await db.query("DELETE FROM engine_hospitality_orders WHERE assignee_id=$1 AND phase IN ('SERVED','COMPLETED')", [id]);
    await db.query("UPDATE engine_hospitality_orders SET assignee_id=NULL,phase='PENDING',version=version+1,updated_at=greatest(updated_at,$2) WHERE assignee_id=$1", [id, new Date(this.now())]);
  }
}
