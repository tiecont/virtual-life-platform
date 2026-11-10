import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ReservationPlaceSchema, ReservationResultSchema, ReservationViewSchema, ReservationPageSchema, WaitlistResultSchema, TravelSourceSchema, type EventSchedule, type ReservationPhase, type TravelSource } from '@virtual-city/contracts';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import type { SocialService } from '../../../../social/modules/relationships/application/service';
import type { RoomService } from '../../../../rooms/modules/presence/application/service';
import { DomainError } from '../../../../../shared/common/errors';
import { EventService, type EventBookingContext } from '../../calendar/application/service';
import { advanceReservation, createReservation, type ReservationState } from '../../calendar/domain/lifecycle';

type Row = { id: string; event_id: string; account_id: string; world_slug: string; resource_key: string; phase: ReservationPhase; party_size: number; schedule: EventSchedule; created_at: Date; changed_at: Date; hold_expires_at: Date };
type Waiter = { id: string; event_id: string; account_id: string; party_size: number; phase: 'WAITING' | 'CLAIMED' | 'EXPIRED' | 'CANCELLED'; expires_at: Date };
const uuid = z.uuid().transform(value => value.toLowerCase());
const absent = () => new DomainError('NOT_AVAILABLE', 404, 'This reservation is unavailable');
const conflict = () => new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Refresh this reservation before trying again');
export class ReservationService {
  constructor(private pool: Pick<Pool, 'query'>, private identity: IdentityService, private social: SocialService, private rooms: RoomService, private events: EventService, private now = Date.now) {}
  async participants(db: Pick<Pool, 'query'>, eventId: string) { return (await db.query<{ account_id: string }>("SELECT account_id FROM engine_reservations WHERE event_id=$1 AND phase IN ('HELD','CONFIRMED','CHECKED_IN') UNION SELECT account_id FROM engine_reservation_waitlist WHERE event_id=$1 AND phase='WAITING' UNION SELECT m.account_id FROM engine_reservation_members m JOIN engine_reservations r ON r.id=m.reservation_id WHERE r.event_id=$1 AND m.phase='IN' UNION SELECT i.recipient_id AS account_id FROM engine_reservation_invitations i JOIN engine_reservations r ON r.id=i.reservation_id WHERE r.event_id=$1 AND i.access_until>$2 AND (i.phase='ACCEPTED' OR (i.phase='PENDING' AND i.expires_at>$2))", [eventId,new Date(this.now())])).rows.map(row => row.account_id); }
  private async closeParties(db:PoolClient,eventId:string,terminal=false){await db.query("UPDATE engine_reservations SET party_open=false WHERE event_id=$1 AND (phase<>'CHECKED_IN' OR $2)",[eventId,terminal]);await db.query("UPDATE engine_reservation_members m SET phase='REVOKED',changed_at=greatest(m.changed_at,$2) FROM engine_reservations r WHERE r.id=m.reservation_id AND r.event_id=$1 AND (r.phase<>'CHECKED_IN' OR $3) AND m.phase='IN'",[eventId,new Date(this.now()),terminal]);await db.query("UPDATE engine_reservation_invitations i SET phase=CASE WHEN r.party_open THEN 'EXPIRED' ELSE 'CANCELLED' END,changed_at=greatest(i.changed_at,$2) FROM engine_reservations r WHERE r.id=i.reservation_id AND r.event_id=$1 AND i.phase IN ('PENDING','ACCEPTED') AND (NOT r.party_open OR i.access_until<=$2 OR (i.phase='PENDING' AND i.expires_at<=$2))",[eventId,new Date(this.now())]);await db.query("UPDATE engine_reservation_members m SET phase='REVOKED',changed_at=greatest(m.changed_at,$2) FROM engine_reservations r WHERE r.id=m.reservation_id AND r.event_id=$1 AND r.party_visibility='invited' AND m.account_id<>r.account_id AND m.phase='IN' AND NOT EXISTS(SELECT 1 FROM engine_reservation_invitations i WHERE i.reservation_id=r.id AND i.recipient_id=m.account_id AND i.phase='ACCEPTED' AND i.access_until>$2)",[eventId,new Date(this.now())]);}
  async revoke(db: PoolClient, ids: string[], account: string) {
    await db.query("UPDATE engine_reservations SET phase='CANCELLED',changed_at=greatest(changed_at,$3) WHERE event_id=ANY($1::uuid[]) AND account_id=$2 AND phase IN ('HELD','CONFIRMED','CHECKED_IN')", [ids, account, new Date(this.now())]);
    await db.query("UPDATE engine_reservation_waitlist SET phase='CANCELLED' WHERE event_id=ANY($1::uuid[]) AND account_id=$2 AND phase='WAITING'", [ids, account]);
    await db.query("UPDATE engine_reservation_members SET phase='REVOKED',changed_at=greatest(changed_at,$3) WHERE reservation_id IN(SELECT id FROM engine_reservations WHERE event_id=ANY($1::uuid[])) AND account_id=$2 AND phase='IN'",[ids,account,new Date(this.now())]);
    for(const id of ids)await this.closeParties(db,id);
  }
  private state(row: Row): ReservationState { return { schemaVersion: 1, phase: row.phase, partySize: row.party_size, schedule: row.schedule, createdAt: row.created_at.getTime(), changedAt: row.changed_at.getTime(), holdExpiresAt: row.hold_expires_at.getTime() }; }
  private view(row: Row) { return ReservationViewSchema.parse({ id: row.id, eventId: row.event_id, worldSlug: row.world_slug, resourceKey: row.resource_key, phase: row.phase, partySize: row.party_size, schedule: row.schedule, createdAt: row.created_at.toISOString(), changedAt: row.changed_at.toISOString(), holdExpiresAt: row.hold_expires_at.toISOString() }); }
  private result(row: Row) { return ReservationResultSchema.parse({ schemaVersion: 1, reservation: this.view(row) }); }
  private waitResult(row: Waiter) { return WaitlistResultSchema.parse({ schemaVersion: 1, entry: { id: row.id, eventId: row.event_id, partySize: row.party_size, phase: row.phase, expiresAt: row.expires_at.toISOString() } }); }
  private policy(context: EventBookingContext) {
    const policy = context.definition?.eventPolicy?.reservations;
    if (!context.resourceKey || !policy?.resources.some(resource => resource.key === context.resourceKey && resource.capacity >= context.capacity)) throw absent();
    return { schemaVersion: 1 as const, capacity: context.capacity, maxPartySize: Math.min(context.capacity, policy.maxPartySize), holdSeconds: policy.holdSeconds, overbooking: 0 as const, waitlist: policy.waitlist };
  }
  private async quota(db: PoolClient, actor: string) {
    const count = (await db.query('SELECT count(*) FILTER(WHERE created_at>$2)::int AS minute,count(*)::int AS hour FROM engine_reservation_mutations WHERE actor_id=$1 AND created_at>$3', [actor, new Date(this.now() - 60000), new Date(this.now() - 3600000)])).rows[0];
    if (count.minute >= 30 || count.hour >= 60) throw new DomainError('RATE_LIMITED', 429, 'Please wait before changing another reservation');
  }
  private async prior(db: PoolClient, actor: string, key: string, fingerprint: string) {
    const row = (await db.query<{ reservation_id: string | null; waitlist_id: string | null; fingerprint: string }>('SELECT * FROM engine_reservation_mutations WHERE actor_id=$1 AND request_id=$2', [actor, key])).rows[0];
    if (row && row.fingerprint !== fingerprint) throw conflict(); return row;
  }
  private remember(db: PoolClient, actor: string, key: string, context: EventBookingContext, operation: string, fingerprint: string, reservation: string | null, waiter: string | null = null) { return db.query('INSERT INTO engine_reservation_mutations VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [actor, key, context.id, reservation, waiter, operation, fingerprint, new Date(this.now())]); }
  private async own(db: Pick<Pool, 'query'>, id: string, actor: string) { const row = (await db.query<Row>('SELECT * FROM engine_reservations WHERE id=$1 AND account_id=$2', [id, actor])).rows[0]; if (!row) throw absent(); return row; }
  private async reference(token: string, rawId: string) { const id = uuid.parse(rawId), actor = await this.identity.authenticate(token); return this.own(this.pool, id, actor.accountId); }
  async observed(db: PoolClient, context: EventBookingContext, now: number) {
    if (!context.resourceKey) return;
    const rows = (await db.query<Row>("SELECT * FROM engine_reservations WHERE event_id=$1 AND phase IN ('HELD','CONFIRMED','CHECKED_IN') FOR UPDATE", [context.id])).rows;
    for (const row of rows) { const next = advanceReservation(this.state(row), 'observe', now, context.phase); if (next.phase !== row.phase) await db.query('UPDATE engine_reservations SET phase=$2,changed_at=$3 WHERE id=$1', [row.id, next.phase, new Date(next.changedAt)]); }
    await db.query("UPDATE engine_reservation_waitlist SET phase=$2 WHERE event_id=$1 AND phase='WAITING' AND (expires_at<=$3 OR $4)", [context.id, context.phase === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED', new Date(now), ['ENDED', 'CANCELLED'].includes(context.phase)]);
    await this.closeParties(db,context.id,['ENDED','CANCELLED'].includes(context.phase));
  }
  async place(token: string, requestKey: string, raw: unknown) {
    const input = ReservationPlaceSchema.parse(raw), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'reservation.hold', input });
    return this.events.withBooking(token, input.eventId, async (db, actor, context) => {
      const previous = await this.prior(db, actor.accountId, key, fingerprint); if (previous?.reservation_id) return this.result(await this.own(db, previous.reservation_id, actor.accountId));
      const policy = this.policy(context); await this.quota(db, actor.accountId);
      const state = createReservation(context.schedule, policy, input.partySize, this.now());
      if (!['SCHEDULED', 'OPEN'].includes(context.phase)) throw conflict();
      const current = (await db.query<Row>("SELECT * FROM engine_reservations WHERE event_id=$1 AND phase IN ('HELD','CONFIRMED','CHECKED_IN')", [context.id])).rows[0];
      if (current) { if (current.account_id !== actor.accountId || current.party_size !== input.partySize) throw conflict(); await this.remember(db, actor.accountId, key, context, 'hold', fingerprint, current.id); return this.result(current); }
      const head = (await db.query<Waiter>("SELECT * FROM engine_reservation_waitlist WHERE event_id=$1 AND phase='WAITING' ORDER BY queue_order LIMIT 1", [context.id])).rows[0];
      if (head && (head.account_id !== actor.accountId || head.party_size !== input.partySize)) throw conflict();
      if ((await db.query("SELECT count(*)::int AS n FROM engine_reservations WHERE account_id=$1 AND phase IN ('HELD','CONFIRMED','CHECKED_IN') AND allocation_ends_at>$2", [actor.accountId, new Date(this.now())])).rows[0].n >= 5) throw new DomainError('RATE_LIMITED', 429, 'Please finish or cancel another reservation');
      const row = (await db.query<Row>("INSERT INTO engine_reservations(id,event_id,account_id,phase,party_size,schedule,world_slug,resource_key,created_at,changed_at,hold_expires_at,allocation_ends_at) VALUES($1,$2,$3,'HELD',$4,$5,$6,$7,$8,$8,$9,$10) RETURNING *", [randomUUID(), context.id, actor.accountId, input.partySize, JSON.stringify(context.schedule), context.worldSlug, context.resourceKey, new Date(state.createdAt), new Date(state.holdExpiresAt), context.schedule.endsAt])).rows[0];
      if (head) await db.query("UPDATE engine_reservation_waitlist SET phase='CLAIMED' WHERE id=$1", [head.id]);
      await this.remember(db, actor.accountId, key, context, 'hold', fingerprint, row.id);
      if (this.now() >= state.holdExpiresAt) throw conflict(); return this.result(row);
    });
  }
  async mutate(token: string, rawId: string, requestKey: string, operation: 'confirm' | 'check-in' | 'cancel', source?: TravelSource) {
    const reference = await this.reference(token, rawId), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'reservation.' + operation, id: reference.id, ...(source ? { source } : {}) });
    // Exact receipts only observe private state, even after a room restart.
    const prior = await this.events.withBooking(token, reference.event_id, async (db, actor) => await this.prior(db, actor.accountId, key, fingerprint) ? this.result(await this.own(db, reference.id, actor.accountId)) : null, true); if (prior) return prior;
    const run = (valid?: () => boolean) => this.events.withBooking(token, reference.event_id, async (db, actor, context) => {
      const row = await this.own(db, reference.id, actor.accountId), previous = await this.prior(db, actor.accountId, key, fingerprint);
      if (previous) return this.result(row); if (operation !== 'cancel') this.policy(context);
      await this.quota(db, actor.accountId); const next = advanceReservation(this.state(row), operation === 'cancel' ? 'cancel' : operation, this.now(), context.phase);
      if (valid && !valid()) throw conflict();
      const updated = (await db.query<Row>('UPDATE engine_reservations SET phase=$2,changed_at=$3 WHERE id=$1 RETURNING *', [row.id, next.phase, new Date(next.changedAt)])).rows[0];
      await this.remember(db, actor.accountId, key, context, operation, fingerprint, row.id); if (valid && !valid()) throw conflict();
      // A deadline crossed during awaited SQL must not commit a late confirmation/check-in.
      const final = advanceReservation(this.state(updated), 'observe', this.now(), context.phase);
      const cutoff = operation === 'confirm' && row.phase === 'HELD' ? row.hold_expires_at.getTime() : operation === 'check-in' && row.phase === 'CONFIRMED' ? Date.parse(row.schedule.checkInClosesAt) : null;
      if (cutoff !== null && this.now() >= cutoff) { updated.phase = 'EXPIRED'; updated.changed_at = new Date(cutoff); await db.query("UPDATE engine_reservations SET phase='EXPIRED',changed_at=$2 WHERE id=$1", [row.id, updated.changed_at]); return this.result(updated); }
      if (final.phase !== updated.phase) { updated.phase = final.phase; updated.changed_at = new Date(final.changedAt); await db.query('UPDATE engine_reservations SET phase=$2,changed_at=$3 WHERE id=$1', [row.id, final.phase, updated.changed_at]); }
      await this.closeParties(db,context.id);return this.result(updated);
    }, operation === 'cancel', valid);
    return operation === 'check-in' ? this.rooms.reservationCheckIn(token, TravelSourceSchema.parse(source), reference.world_slug, run) : run();
  }
  async get(token: string, id: string) { const reference = await this.reference(token, id); return this.events.withBooking(token, reference.event_id, async (db, actor) => this.result(await this.own(db, reference.id, actor.accountId)), true); }
  async list(token: string) {
    const actor = await this.identity.authenticate(token), rows = (await this.pool.query<{ id: string }>('SELECT id FROM engine_reservations WHERE account_id=$1 ORDER BY creation_order DESC LIMIT 51', [actor.accountId])).rows, items = [];
    for (const row of rows.slice(0, 50)) items.push((await this.get(token, row.id)).reservation); return ReservationPageSchema.parse({ schemaVersion: 1, items, truncated: rows.length > 50 });
  }
  async waitlist(token: string, requestKey: string, raw: unknown) {
    const input = ReservationPlaceSchema.parse(raw), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'reservation.waitlist', input });
    return this.events.withBooking(token, input.eventId, async (db, actor, context) => {
      const previous = await this.prior(db, actor.accountId, key, fingerprint);
      if (previous?.waitlist_id) { const row = (await db.query<Waiter>('SELECT * FROM engine_reservation_waitlist WHERE id=$1 AND account_id=$2', [previous.waitlist_id, actor.accountId])).rows[0]; if (!row) throw absent(); return this.waitResult(row); }
      const policy = this.policy(context); if (policy.waitlist !== 'fifo') throw absent(); createReservation(context.schedule, policy, input.partySize, this.now()); await this.quota(db, actor.accountId);
      if (!['SCHEDULED', 'OPEN'].includes(context.phase)) throw conflict();
      if ((await db.query("SELECT 1 FROM engine_reservations WHERE event_id=$1 AND account_id=$2 AND phase IN ('HELD','CONFIRMED','CHECKED_IN')", [context.id, actor.accountId])).rowCount) throw conflict();
      let row = (await db.query<Waiter>("SELECT * FROM engine_reservation_waitlist WHERE event_id=$1 AND account_id=$2 AND phase='WAITING'", [context.id, actor.accountId])).rows[0];
      if (row && row.party_size !== input.partySize) throw conflict();
      if (!row) {
        if ((await db.query("SELECT count(*)::int AS n FROM engine_reservation_waitlist WHERE event_id=$1 AND phase='WAITING'", [context.id])).rows[0].n >= 50 || (await db.query("SELECT count(*)::int AS n FROM engine_reservation_waitlist WHERE account_id=$1 AND phase='WAITING' AND expires_at>$2", [actor.accountId, new Date(this.now())])).rows[0].n >= 5) throw new DomainError('RATE_LIMITED', 429, 'The waitlist is full');
        row = (await db.query<Waiter>("INSERT INTO engine_reservation_waitlist(id,event_id,account_id,party_size,phase,created_at,expires_at) VALUES($1,$2,$3,$4,'WAITING',$5,$6) RETURNING *", [randomUUID(), context.id, actor.accountId, input.partySize, new Date(this.now()), new Date(Math.min(this.now() + 300000, Date.parse(context.schedule.startsAt)))])).rows[0];
      }
      await this.remember(db, actor.accountId, key, context, 'waitlist', fingerprint, null, row.id); return this.waitResult(row);
    });
  }
  async leaveWaitlist(token: string, rawId: string, requestKey: string) {
    const id = uuid.parse(rawId), key = uuid.parse(requestKey), actor = await this.identity.authenticate(token), reference = (await this.pool.query<Waiter>('SELECT * FROM engine_reservation_waitlist WHERE id=$1 AND account_id=$2', [id, actor.accountId])).rows[0]; if (!reference) throw absent();
    const fingerprint = this.identity.fingerprint({ operation: 'reservation.leave-waitlist', id });
    return this.events.withBooking(token, reference.event_id, async (db, current, context) => {
      const row = (await db.query<Waiter>('SELECT * FROM engine_reservation_waitlist WHERE id=$1 AND account_id=$2', [id, current.accountId])).rows[0]; if (!row) throw absent();
      if (!await this.prior(db, current.accountId, key, fingerprint)) { await this.quota(db, current.accountId); if (row.phase === 'WAITING') { row.phase = 'CANCELLED'; await db.query("UPDATE engine_reservation_waitlist SET phase='CANCELLED' WHERE id=$1", [id]); } await this.remember(db, current.accountId, key, context, 'leave-waitlist', fingerprint, null, id); } return this.waitResult(row);
    }, true);
  }
  async withdrawContact(db: PoolClient, a: string, b: string) {
    if (!await this.social.isBlocked(a, b, db)) return;
    // Match observation/stop ordering: headers before member rows. A block may
    // race the event scheduler, which already owns the event then its header.
    await db.query("SELECT id FROM engine_reservations WHERE id IN(SELECT id FROM engine_reservations WHERE account_id=ANY($1::uuid[]) AND party_open UNION SELECT reservation_id FROM engine_reservation_members WHERE account_id=ANY($1::uuid[]) AND phase='IN') ORDER BY id FOR UPDATE",[[a,b]]);
    for(const account of [a,b])await db.query('INSERT INTO engine_reservation_consent VALUES($1,1) ON CONFLICT(account_id) DO UPDATE SET revision=engine_reservation_consent.revision+1',[account]);
    await db.query("UPDATE engine_reservation_members m SET phase='REVOKED',changed_at=greatest(m.changed_at,$3) FROM engine_reservations r WHERE r.id=m.reservation_id AND m.phase='IN' AND ((r.account_id=$1 AND m.account_id=$2) OR (r.account_id=$2 AND m.account_id=$1) OR (m.account_id=ANY($4::uuid[]) AND EXISTS(SELECT 1 FROM engine_reservation_members other WHERE other.reservation_id=m.reservation_id AND other.account_id=ANY($4::uuid[]) AND other.account_id<>m.account_id AND other.phase='IN')))",[a,b,new Date(this.now()),[a,b]]);
    await db.query("UPDATE engine_reservations r SET party_open=false WHERE account_id=ANY($1::uuid[]) AND party_open AND NOT EXISTS(SELECT 1 FROM engine_reservation_members m WHERE m.reservation_id=r.id AND m.account_id=r.account_id AND m.phase='IN')",[[a,b]]);
    await db.query("UPDATE engine_reservation_members m SET phase='REVOKED',changed_at=greatest(m.changed_at,$1) FROM engine_reservations r WHERE r.id=m.reservation_id AND r.account_id=ANY($2::uuid[]) AND NOT r.party_open AND m.phase='IN'",[new Date(this.now()),[a,b]]);
    // Event owner supplies IDs through its port, rather than reading its tables here.
    for (const [owner, participant] of [[a, b], [b, a]]) await this.events.forOrganizer(db, owner, async ids => {
      await db.query("UPDATE engine_reservations SET phase='CANCELLED',changed_at=greatest(changed_at,$3) WHERE event_id=ANY($1::uuid[]) AND account_id=$2 AND phase IN ('HELD','CONFIRMED','CHECKED_IN')", [ids, participant, new Date(this.now())]);
      await db.query("UPDATE engine_reservation_waitlist SET phase='CANCELLED' WHERE event_id=ANY($1::uuid[]) AND account_id=$2 AND phase='WAITING'", [ids, participant]);
      for(const id of ids)await this.closeParties(db,id);
    });
  }
  async exportAccount(id: string, db: PoolClient) {
    const members=(await db.query<{reservation_id:string;phase:string;created_at:Date;changed_at:Date}>('SELECT reservation_id,phase,created_at,changed_at FROM engine_reservation_members WHERE account_id=$1 ORDER BY changed_at DESC,reservation_id LIMIT 101',[id])).rows;
    const rows = (await db.query<Row>('SELECT * FROM engine_reservations WHERE account_id=$1 ORDER BY creation_order DESC LIMIT 101', [id])).rows, waiters = (await db.query<Waiter>('SELECT * FROM engine_reservation_waitlist WHERE account_id=$1 ORDER BY queue_order DESC LIMIT 101', [id])).rows;
    return { schemaVersion: 1, partyMemberships:members.slice(0,100).map(row=>({reservationId:row.reservation_id,consent:row.phase,createdAt:row.created_at.toISOString(),changedAt:row.changed_at.toISOString()})),partyMembershipsTruncated:members.length>100,items: rows.slice(0, 100).map(row => {
      const phase = this.now() >= Date.parse(row.schedule.endsAt) ? 'ENDED' : this.now() >= Date.parse(row.schedule.startsAt) ? 'LIVE' : this.now() >= Date.parse(row.schedule.opensAt) ? 'OPEN' : 'SCHEDULED', next = advanceReservation(this.state(row), 'observe', this.now(), phase);
      return this.view({ ...row, phase: next.phase, changed_at: new Date(next.changedAt) });
    }), truncated: rows.length > 100, waitlist: waiters.slice(0, 100).map(row => this.waitResult(row.phase === 'WAITING' && row.expires_at.getTime() <= this.now() ? { ...row, phase: 'EXPIRED' } : row).entry), waitlistTruncated: waiters.length > 100 };
  }
}
