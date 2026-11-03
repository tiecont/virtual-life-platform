import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { EventAdjustSchema, EventCancelSchema, EventControlsSchema, EventNoticesSchema, EventScheduleInputSchema, EventScheduleSchema, EventCatalogQuerySchema, EventCatalogSchema, EventResultSchema, EventViewSchema, EventRsvpResultSchema, EventRsvpViewSchema, type EventSchedule, type EventPhase, type WorldDefinition } from '@virtual-city/contracts';
import { WorldError, type WorldRegistry } from '@virtual-city/world-sdk';
import type { IdentityService, IdentityContext } from '../identity/service';
import type { SocialService } from '../social/service';
import { DomainError } from '../common/errors';
import { advanceEvent, createEvent, formatEventSchedule } from './lifecycle';
import type { EventPermissions } from './permissions';

type Row = { id: string; organizer_id: string; world_slug: string; world_version: string; policy_version: string; title: string; audience: 'silent'; visibility: 'listed' | 'private'; capacity: number; time_zone: string; opens_at: Date; starts_at: Date; check_in_closes_at: Date; ends_at: Date; phase: EventPhase; created_at: Date; changed_at: Date; resource_key: string | null; version: number };
export type EventBookingContext = Readonly<{ id: string; organizerId: string; title: string; visibility: 'listed' | 'private'; worldSlug: string; resourceKey: string | null; capacity: number; phase: EventPhase; schedule: EventSchedule; definition?: WorldDefinition }>;
export interface EventReservationObserver { observed(db: PoolClient, context: EventBookingContext, now: number): Promise<void>; participants(db: Pick<Pool, 'query'>, eventId: string): Promise<string[]>; revoke(db: PoolClient, ids: string[], account: string): Promise<void> }
export interface EventInvitationAccess { permits(db: PoolClient, eventId: string, owner: string, viewer: string): Promise<boolean>; observed(db: PoolClient, context: EventBookingContext, now: number): Promise<void>; participants(db: Pick<Pool, 'query'>, id: string): Promise<string[]> }
type Rsvp = { id: string; event_id: string; account_id: string; phase: 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'; created_at: Date; changed_at: Date };
export interface EventOrganizerPort { permits(db: PoolClient, actor: IdentityContext, worldSlug: string): Promise<boolean> }
export interface EventSafetyPort { permits(db: PoolClient, accountId: string, worldSlug: string): Promise<boolean> }
const uuid = z.uuid().transform(value => value.toLowerCase()), DAY = 86400000;
const unavailable = () => new DomainError('NOT_AVAILABLE', 404, 'This event is unavailable');
const conflict = () => new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key conflicts with an earlier action');
export class EventService {
  #closed = false; #maintenance?: Promise<void>;
  #reservations?: EventReservationObserver;
  #invitations?: EventInvitationAccess;
  #noticeListeners = new Set<(accounts: string[]) => void>();
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private social: SocialService, private registry: WorldRegistry, private safety: EventSafetyPort, private organizers?: EventOrganizerPort, private now = Date.now, private permissions?: EventPermissions) {}
  attachReservations(port: EventReservationObserver) { if (this.#reservations) throw new Error('Reservation observer already attached'); this.#reservations = port; }
  attachInvitations(port: EventInvitationAccess) { if (this.#invitations) throw new Error('Invitation access already attached'); this.#invitations = port; }
  onNotice(listener: (accounts: string[]) => void) { this.#noticeListeners.add(listener); return () => { this.#noticeListeners.delete(listener); }; }
  async forOrganizer(db: PoolClient, organizer: string, work: (ids: string[]) => Promise<void>) { const rows = (await db.query<{ id: string }>("SELECT id FROM engine_events WHERE organizer_id=$1 AND phase NOT IN ('ENDED','CANCELLED')", [organizer])).rows; await work(rows.map(row => row.id)); }
  private bookingContext(row: Row, definition?: WorldDefinition): EventBookingContext { return { id: row.id, organizerId: row.organizer_id, title: row.title, visibility: row.visibility, worldSlug: row.world_slug, resourceKey: row.resource_key, capacity: row.capacity, phase: row.phase, schedule: this.scheduleOf(row), definition }; }
  private async tx<T>(token: string, targets: string[], work: (db: PoolClient, actor: IdentityContext) => Promise<T>) {
    if (this.#closed) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Events unavailable');
    const initial = await this.identity.authenticate(token), db = await this.pool.connect();
    try {
      await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'");
      await this.identity.lockAccounts(db, [initial.accountId, ...targets]); const actor = await this.identity.contextInTransaction(db, token);
      const result = await work(db, actor); if (this.now() >= actor.expiresAt) throw unavailable(); await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private async context<T>(token: string, slug: string, work: (world: WorldDefinition, valid: () => boolean) => Promise<T>) {
    try { return await this.registry.authorizedContext(token, slug, (_actor, world, valid) => {
      // Restricted worlds remain closed; private sessions in eligible public worlds use invitation consent.
      if (!world.eventPolicy || !world.capabilities.includes('events') || world.accessPolicy.kind !== 'public' || world.visibility !== 'listed' || slug === 'dating') throw unavailable();
      return work(world, valid);
    }); } catch (error) { if (error instanceof WorldError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code)) throw unavailable(); throw error; }
  }
  private check(valid: () => boolean) { if (!valid()) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Refresh event availability'); }
  private scheduleOf(row: Row): EventSchedule { return EventScheduleSchema.parse({ schemaVersion: 1, timeZone: row.time_zone, opensAt: row.opens_at.toISOString(), startsAt: row.starts_at.toISOString(), checkInClosesAt: row.check_in_closes_at.toISOString(), endsAt: row.ends_at.toISOString() }); }
  private rsvpView(row: Rsvp) { return EventRsvpViewSchema.parse({ id: row.id, phase: row.phase, createdAt: row.created_at.toISOString(), changedAt: row.changed_at.toISOString() }); }
  private async view(db: PoolClient, row: Row, actor: string) {
    const rsvp = (await db.query<Rsvp>('SELECT * FROM engine_event_rsvps WHERE event_id=$1 AND account_id=$2', [row.id, actor])).rows[0], labels = formatEventSchedule(this.scheduleOf(row));
    return EventViewSchema.parse({ id: row.id, worldSlug: row.world_slug, title: row.title, phase: row.phase, version: row.version, createdAt: row.created_at.toISOString(), schedule: this.scheduleOf(row), startsLabel: labels.startsLabel, endsLabel: labels.endsLabel, capacity: row.capacity, mine: row.organizer_id === actor, rsvp: rsvp ? this.rsvpView(rsvp) : null, resourceKey: row.resource_key });
  }
  private async prior(db: PoolClient, actor: string, key: string, fingerprint: string) {
    const previous = (await db.query<{ event_id: string; fingerprint: string }>('SELECT event_id,fingerprint FROM engine_event_mutations WHERE actor_id=$1 AND request_id=$2', [actor, key])).rows[0];
    if (previous && previous.fingerprint !== fingerprint) throw conflict(); return previous;
  }
  private remember(db: PoolClient, actor: string, key: string, id: string, operation: string, fingerprint: string) { return db.query('INSERT INTO engine_event_mutations VALUES($1,$2,$3,$4,$5,$6)', [actor, key, id, operation, fingerprint, new Date(this.now())]); }
  private async quota(db: PoolClient, actor: string, operation: string) {
    const counts = (await db.query("SELECT count(*) FILTER(WHERE created_at>$2)::int AS minute,count(*) FILTER(WHERE operation='rsvp')::int AS joins,count(*) FILTER(WHERE operation='schedule')::int AS schedules FROM engine_event_mutations WHERE actor_id=$1 AND created_at>$3", [actor, new Date(this.now() - 60000), new Date(this.now() - 3600000)])).rows[0];
    if (counts.minute >= 30 || operation === 'rsvp' && counts.joins >= 12 || operation === 'schedule' && counts.schedules >= 12) throw new DomainError('RATE_LIMITED', 429, 'Please wait before changing another event');
  }
  private async observe(db: PoolClient, row: Row) {
    const next = advanceEvent({ schemaVersion: 1, phase: row.phase, schedule: this.scheduleOf(row), createdAt: row.created_at.getTime(), changedAt: row.changed_at.getTime() }, 'observe', this.now());
    row.phase = next.phase; row.changed_at = new Date(next.changedAt);
    await db.query("UPDATE engine_events SET phase=$2,changed_at=$3,checked_order=nextval('engine_event_recovery_sequence') WHERE id=$1", [row.id, row.phase, row.changed_at]);
    if (row.phase === 'ENDED' || row.phase === 'CANCELLED') await db.query("UPDATE engine_event_rsvps SET phase=$2,changed_at=greatest(changed_at,$3) WHERE event_id=$1 AND phase='CONFIRMED'", [row.id, row.phase === 'ENDED' ? 'EXPIRED' : 'CANCELLED', row.changed_at]);
    await this.#reservations?.observed(db, this.bookingContext(row), this.now());
    await this.#invitations?.observed(db, this.bookingContext(row), this.now());
    if (['ENDED', 'CANCELLED'].includes(row.phase)) await db.query('UPDATE engine_event_performer_readiness SET ready=false WHERE event_id=$1 AND ready', [row.id]);
    return row;
  }
  private async allowed(db: PoolClient, actor: IdentityContext, row: Row, world: WorldDefinition, preview = false) {
    if (row.world_version !== world.version || row.policy_version !== world.eventPolicy?.version || row.capacity > world.eventPolicy.maxCapacity || !preview && row.visibility === 'private' && row.organizer_id !== actor.accountId && !await this.#invitations?.permits(db, row.id, row.organizer_id, actor.accountId) || await this.social.isBlocked(actor.accountId, row.organizer_id, db)
      || !await this.safety.permits(db, actor.accountId, row.world_slug) || !await this.safety.permits(db, row.organizer_id, row.world_slug)) throw unavailable();
  }
  // Invoked only by trusted server adapters, with a separately reviewed organizer port.
  async schedule(token: string, requestKey: string, raw: unknown) {
    const input = EventScheduleInputSchema.parse(raw), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'event.schedule', input });
    return this.context(token, input.worldSlug, (world, valid) => this.tx(token, [], async (db, actor) => {
      if (!await this.organizers?.permits(db, actor, input.worldSlug) || !await this.safety.permits(db, actor.accountId, input.worldSlug)) throw unavailable();
      if (input.policyVersion !== world.eventPolicy!.version || input.capacity > world.eventPolicy!.maxCapacity) throw unavailable();
      if (input.resourceKey && (!world.eventPolicy!.reservations?.resources.some(resource => resource.key === input.resourceKey && resource.capacity >= input.capacity))) throw unavailable();
      const previous = await this.prior(db, actor.accountId, key, fingerprint);
      if (previous) { const row = (await db.query<Row>('SELECT * FROM engine_events WHERE id=$1 AND organizer_id=$2 FOR UPDATE', [previous.event_id, actor.accountId])).rows[0]; if (!row) throw unavailable(); const result = EventResultSchema.parse({ schemaVersion: 1, event: await this.view(db, await this.observe(db, row), actor.accountId) }); this.check(valid); return result; }
      createEvent(input.schedule, this.now()); if (Date.parse(input.schedule.opensAt) > this.now() + 30 * DAY) throw unavailable();
      if (!(await db.query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [input.schedule.timeZone])).rowCount) throw unavailable();
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':events:'||$1,0))", [input.worldSlug]);
      if (input.resourceKey && (await db.query("SELECT 1 FROM engine_events WHERE world_slug=$1 AND resource_key=$2 AND phase<>'CANCELLED' AND tstzrange(opens_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1", [input.worldSlug, input.resourceKey, input.schedule.opensAt, input.schedule.endsAt])).rowCount) throw new DomainError('NOT_AVAILABLE', 409, 'This table already has a time slot');
      if ((await db.query("SELECT count(*)::int AS n FROM engine_events WHERE world_slug=$1 AND phase NOT IN ('ENDED','CANCELLED')", [input.worldSlug])).rows[0].n >= 100) throw new DomainError('RATE_LIMITED', 429, 'The schedule is full');
      await this.quota(db, actor.accountId, 'schedule'); const at = new Date(this.now()), s = input.schedule;
      const row = (await db.query<Row>("INSERT INTO engine_events(id,organizer_id,world_slug,world_version,policy_version,title,audience,visibility,capacity,time_zone,opens_at,starts_at,check_in_closes_at,ends_at,phase,created_at,changed_at,resource_key) VALUES($1,$2,$3,$4,$5,$6,'silent',$7,$8,$9,$10,$11,$12,$13,'SCHEDULED',$14,$14,$15) RETURNING *", [randomUUID(), actor.accountId, input.worldSlug, world.version, input.policyVersion, input.title, input.visibility, input.capacity, s.timeZone, s.opensAt, s.startsAt, s.checkInClosesAt, s.endsAt, at, input.resourceKey ?? null])).rows[0];
      await this.remember(db, actor.accountId, key, row.id, 'schedule', fingerprint); const result = EventResultSchema.parse({ schemaVersion: 1, event: await this.view(db, row, actor.accountId) }); this.check(valid); if (this.now() >= row.opens_at.getTime()) throw unavailable(); return result;
    }));
  }
  private async reference(token: string, rawId: string) {
    const id = uuid.parse(rawId); await this.identity.authenticate(token); const row = (await this.pool.query<Row>('SELECT * FROM engine_events WHERE id=$1', [id])).rows[0]; if (!row) throw unavailable(); return row;
  }
  // Internal transaction boundary for reservation-owned SQL, never a public callback.
  async withBooking<T>(token: string, id: string, work: (db: PoolClient, actor: IdentityContext, context: EventBookingContext) => Promise<T>, withdraw = false, admissionValid?: () => boolean, targets: string[] = []): Promise<T> {
    const known = await this.reference(token, id);
    const run = (world?: WorldDefinition, valid?: () => boolean) => this.tx(token, [known.organizer_id, ...targets], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM engine_events WHERE id=$1 FOR UPDATE', [known.id])).rows[0]; if (!row) throw unavailable();
      if (world) await this.allowed(db, actor, row, world); await this.observe(db, row); const result = await work(db, actor, this.bookingContext(row, world)); if (valid) this.check(valid); if (admissionValid && !admissionValid()) throw new DomainError('NOT_IN_ROOM', 409, 'Your visit changed'); return result;
    });
    return withdraw ? run() : this.context(token, known.world_slug, (world, valid) => run(world, valid));
  }
  async withInvitation<T>(token: string, id: string, targets: string[], work: (db: PoolClient, actor: IdentityContext, context: EventBookingContext) => Promise<T>) {
    const known = await this.reference(token, id);
    return this.context(token, known.world_slug, (world, valid) => this.tx(token, [known.organizer_id, ...targets], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM engine_events WHERE id=$1 FOR UPDATE', [known.id])).rows[0]; if (!row) throw unavailable(); await this.allowed(db, actor, row, world, true); await this.observe(db, row);
      const result = await work(db, actor, this.bookingContext(row, world)); this.check(valid); return result;
    }));
  }
  canOrganize(db: PoolClient, actor: IdentityContext, context: EventBookingContext) { return context.organizerId === actor.accountId ? this.organizers?.permits(db, actor, context.worldSlug) ?? Promise.resolve(false) : Promise.resolve(false); }
  eligible(db: PoolClient, account: string, world: string) { return this.safety.permits(db, account, world); }
  async revokePrivate(db: PoolClient, ids: string[], account: string) {
    const rows = (await db.query<{ id: string }>("SELECT id FROM engine_events WHERE id=ANY($1::uuid[]) AND visibility='private'", [ids])).rows, privateIds = rows.map(row => row.id);
    await db.query("UPDATE engine_event_rsvps SET phase='CANCELLED',changed_at=greatest(changed_at,$3) WHERE event_id=ANY($1::uuid[]) AND account_id=$2 AND phase='CONFIRMED'", [privateIds, account, new Date(this.now())]);
    await db.query('UPDATE engine_event_performer_readiness SET ready=false WHERE event_id=ANY($1::uuid[]) AND account_id=$2', [privateIds, account]); await this.#reservations?.revoke(db, privateIds, account);
  }
  private async participants(db: Pick<Pool, 'query'>, id: string) {
    const rows = (await db.query<{ account_id: string }>("SELECT account_id FROM engine_event_rsvps WHERE event_id=$1 AND phase='CONFIRMED' UNION SELECT account_id FROM engine_event_performer_readiness WHERE event_id=$1 AND ready", [id])).rows;
    return [...new Set([...rows.map(row => row.account_id), ...await this.#reservations?.participants(db, id) ?? [], ...await this.#invitations?.participants(db, id) ?? []])];
  }
  async controls(token: string, id: string) {
    return this.withBooking(token, id, async (db, actor, context) => {
      const manage = actor.accountId === context.organizerId && !!await this.organizers?.permits(db, actor, context.worldSlug), moderate = !!await this.permissions?.moderates(db, actor, context.worldSlug), perform = !!await this.permissions?.performs(db, actor, context.worldSlug, context.id), ready = !!(await db.query('SELECT 1 FROM engine_event_performer_readiness WHERE event_id=$1 AND account_id=$2 AND ready', [context.id, actor.accountId])).rowCount;
      return EventControlsSchema.parse({ schemaVersion: 1, canAdjust: manage && context.phase === 'SCHEDULED', canCancel: manage || moderate, canPerform: perform && ['OPEN', 'LIVE'].includes(context.phase), ready: perform && ready });
    });
  }
  async performerReady(token: string, id: string, requestKey: string, ready: boolean) {
    const key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'event.performer-ready', id, ready });
    return this.withBooking(token, id, async (db, actor, context) => {
      const current = (await db.query('SELECT ready FROM engine_event_performer_readiness WHERE event_id=$1 AND account_id=$2', [context.id, actor.accountId])).rows[0];
      if (ready ? !await this.permissions?.performs(db, actor, context.worldSlug, context.id) || !['OPEN', 'LIVE'].includes(context.phase) : !current) throw unavailable();
      if (!await this.prior(db, actor.accountId, key, fingerprint)) { await this.quota(db, actor.accountId, 'performer-ready'); await db.query('INSERT INTO engine_event_performer_readiness VALUES($1,$2,$3,$4) ON CONFLICT(event_id,account_id) DO UPDATE SET ready=$3,changed_at=$4', [context.id, actor.accountId, ready, new Date(this.now())]); await this.remember(db, actor.accountId, key, context.id, 'performer-ready', fingerprint); }
      if (ready && (this.now() >= Date.parse(context.schedule.endsAt) || !await this.permissions?.performs(db, actor, context.worldSlug, context.id))) throw unavailable();
      return { schemaVersion: 1 as const, ready: !!(await db.query('SELECT ready FROM engine_event_performer_readiness WHERE event_id=$1 AND account_id=$2', [context.id, actor.accountId])).rows[0]?.ready };
    }, !ready);
  }
  async govern(token: string, id: string, requestKey: string, action: 'adjust' | 'cancel', raw: unknown) {
    const input = action === 'adjust' ? EventAdjustSchema.parse(raw) : EventCancelSchema.parse(raw), key = uuid.parse(requestKey), known = await this.reference(token, id), fingerprint = this.identity.fingerprint({ operation: 'event.' + action, id: known.id, input });
    // Lock all recipients before event/booking rows. Verify the snapshot under
    // owner lock; changed membership requires retry rather than lock inversion.
    const targets = action === 'cancel' ? await this.participants(this.pool, known.id) : [];
    let notified: string[] = [];
    const run = (world?: WorldDefinition, valid?: () => boolean) => this.tx(token, [known.organizer_id, ...targets], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM engine_events WHERE id=$1 FOR UPDATE', [known.id])).rows[0]; if (!row) throw unavailable();
      const manage = row.organizer_id === actor.accountId && !!await this.organizers?.permits(db, actor, row.world_slug), moderate = action === 'cancel' && !!await this.permissions?.moderates(db, actor, row.world_slug);
      if (!manage && !moderate) throw unavailable(); if (world) await this.allowed(db, actor, row, world);
      await this.observe(db, row); const previous = await this.prior(db, actor.accountId, key, fingerprint);
      if (previous) { const result = EventResultSchema.parse({ schemaVersion: 1, event: await this.view(db, row, actor.accountId) }); if (valid) this.check(valid); return result; }
      await this.quota(db, actor.accountId, action);
      if (!['ENDED', 'CANCELLED'].includes(row.phase)) {
        if (row.version !== input.expectedVersion) throw conflict();
        if (action === 'adjust') {
          if (row.phase !== 'SCHEDULED' || (await this.participants(db, row.id)).length) throw new DomainError('NOT_AVAILABLE', 409, 'Cancel and create a new event after participants have joined');
          const adjustment = EventAdjustSchema.parse(input), schedule = adjustment.schedule ?? this.scheduleOf(row); createEvent(schedule, row.created_at.getTime());
          if (Date.parse(schedule.opensAt) <= this.now() || Date.parse(schedule.opensAt) > this.now() + 30 * DAY || !(await db.query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [schedule.timeZone])).rowCount) throw unavailable();
          await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':events:'||$1,0))", [row.world_slug]);
          if (row.resource_key && (await db.query("SELECT 1 FROM engine_events WHERE world_slug=$1 AND resource_key=$2 AND id<>$3 AND phase<>'CANCELLED' AND tstzrange(opens_at,ends_at,'[)') && tstzrange($4::timestamptz,$5::timestamptz,'[)') LIMIT 1", [row.world_slug, row.resource_key, row.id, schedule.opensAt, schedule.endsAt])).rowCount) throw conflict();
          Object.assign(row, (await db.query<Row>('UPDATE engine_events SET title=$2,time_zone=$3,opens_at=$4,starts_at=$5,check_in_closes_at=$6,ends_at=$7,changed_at=$8,version=version+1 WHERE id=$1 RETURNING *', [row.id, adjustment.title ?? row.title, schedule.timeZone, schedule.opensAt, schedule.startsAt, schedule.checkInClosesAt, schedule.endsAt, new Date(this.now())])).rows[0]);
        } else {
          const recipients = await this.participants(db, row.id); if (recipients.some(account => !targets.includes(account))) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Participation changed; retry this cancellation');
          const state = advanceEvent({ schemaVersion: 1, phase: row.phase, schedule: this.scheduleOf(row), createdAt: row.created_at.getTime(), changedAt: row.changed_at.getTime() }, 'cancel', this.now());
          Object.assign(row, (await db.query<Row>('UPDATE engine_events SET phase=$2,changed_at=$3,version=version+1 WHERE id=$1 RETURNING *', [row.id, state.phase, new Date(state.changedAt)])).rows[0]); await this.observe(db, row);
          if (row.phase === 'CANCELLED') { for (const account of recipients) await db.query("INSERT INTO engine_event_notices VALUES($1,$2,$3,'cancelled',$4) ON CONFLICT(event_id,account_id,kind) DO NOTHING", [randomUUID(), row.id, account, new Date(this.now())]); notified = recipients; }
        }
      }
      await this.remember(db, actor.accountId, key, row.id, action, fingerprint);
      if (action === 'adjust' && (this.now() >= row.opens_at.getTime() || !await this.organizers?.permits(db, actor, row.world_slug))) throw unavailable();
      if (action === 'cancel' && !(row.organizer_id === actor.accountId && await this.organizers?.permits(db, actor, row.world_slug)) && !await this.permissions?.moderates(db, actor, row.world_slug)) throw unavailable();
      const result = EventResultSchema.parse({ schemaVersion: 1, event: await this.view(db, row, actor.accountId) }); if (valid) this.check(valid); return result;
    });
    // Cancellation is consent withdrawal and remains possible while a world is
    // disabled/closed. It never grants admission or new audience interaction.
    const result = await (action === 'cancel' ? run() : this.context(token, known.world_slug, (world, valid) => run(world, valid)));
    if (notified.length) for (const listener of this.#noticeListeners) { try { listener(notified); } catch { /* Durable inbox remains authoritative; hints are replaceable. */ } }
    return result;
  }
  notices(token: string) { return this.tx(token, [], async (db, actor) => {
    const rows = (await db.query<{ id: string; event_id: string; kind: string; created_at: Date }>('SELECT * FROM engine_event_notices WHERE account_id=$1 ORDER BY created_at DESC,id LIMIT 101', [actor.accountId])).rows;
    return EventNoticesSchema.parse({ schemaVersion: 1, items: rows.slice(0, 100).map(row => ({ id: row.id, eventId: row.event_id, kind: row.kind, createdAt: row.created_at.toISOString() })), truncated: rows.length > 100 });
  }); }
  async get(token: string, id: string) {
    const known = await this.reference(token, id);
    return this.context(token, known.world_slug, (world, valid) => this.tx(token, [known.organizer_id], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM engine_events WHERE id=$1 FOR UPDATE', [known.id])).rows[0]; if (!row) throw unavailable(); await this.allowed(db, actor, row, world);
      const result = EventResultSchema.parse({ schemaVersion: 1, event: await this.view(db, await this.observe(db, row), actor.accountId) }); this.check(valid); return result;
    }));
  }
  async catalog(token: string, raw: unknown) {
    const input = EventCatalogQuerySchema.parse(raw);
    const read = async (slugs: string[], valid: () => boolean) => {
      const rows = (await this.pool.query<{ id: string }>("SELECT id FROM engine_events WHERE world_slug=ANY($1::text[]) AND visibility='listed' AND ends_at>$2 AND phase NOT IN ('ENDED','CANCELLED') ORDER BY starts_at,id LIMIT 51", [slugs, new Date(this.now())])).rows, items = [];
      for (const row of rows.slice(0, 50)) { try { items.push((await this.get(token, row.id)).event); } catch (error) { if (!(error instanceof DomainError && error.status === 404)) throw error; } }
      this.check(valid); return EventCatalogSchema.parse({ schemaVersion: 1, items, truncated: rows.length > 50 });
    };
    if (input.worldSlug) return this.context(token, input.worldSlug, (_world, valid) => read([input.worldSlug!], valid));
    const catalog = await this.registry.catalog(token), slugs = catalog.worlds.filter(world => world.availability === 'available' && world.accessHint === 'session-required' && world.capabilities.includes('events') && world.slug !== 'dating').map(world => world.slug);
    return read(slugs, () => !this.#closed && slugs.every(slug => this.registry.permitsActivityDisclosure(slug)));
  }
  async rsvp(token: string, id: string, requestKey: string) {
    const known = await this.reference(token, id), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'event.rsvp', id: known.id });
    return this.context(token, known.world_slug, (world, valid) => this.tx(token, [known.organizer_id], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM engine_events WHERE id=$1 FOR UPDATE', [known.id])).rows[0]; if (!row) throw unavailable(); await this.allowed(db, actor, row, world); await this.observe(db, row);
      if (row.resource_key) throw new DomainError('NOT_AVAILABLE', 409, 'Use a table reservation for this slot');
      const previous = await this.prior(db, actor.accountId, key, fingerprint), current = (await db.query<Rsvp>('SELECT * FROM engine_event_rsvps WHERE event_id=$1 AND account_id=$2', [row.id, actor.accountId])).rows[0];
      if (current && this.now() < current.changed_at.getTime()) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Event clock unavailable');
      if (previous) { if (!current) throw unavailable(); this.check(valid); return EventRsvpResultSchema.parse({ schemaVersion: 1, rsvp: this.rsvpView(current) }); }
      if (!['SCHEDULED', 'OPEN'].includes(row.phase) || this.now() >= row.starts_at.getTime()) throw new DomainError('NOT_AVAILABLE', 409, 'RSVP is closed');
      await this.quota(db, actor.accountId, 'rsvp');
      if (current?.phase !== 'CONFIRMED') {
        if ((await db.query("SELECT count(*)::int AS n FROM engine_event_rsvps WHERE event_id=$1 AND phase='CONFIRMED'", [row.id])).rows[0].n >= row.capacity) throw new DomainError('NOT_AVAILABLE', 409, 'This event is full');
        if ((await db.query("SELECT count(*)::int AS n FROM engine_event_rsvps r JOIN engine_events e ON e.id=r.event_id WHERE r.account_id=$1 AND r.phase='CONFIRMED' AND e.ends_at>$2 AND e.phase NOT IN ('ENDED','CANCELLED')", [actor.accountId, new Date(this.now())])).rows[0].n >= 10) throw new DomainError('RATE_LIMITED', 429, 'Please finish or withdraw an existing RSVP');
      }
      const at = new Date(this.now()), rsvp = (await db.query<Rsvp>("INSERT INTO engine_event_rsvps(id,event_id,account_id,phase,created_at,changed_at) VALUES($1,$2,$3,'CONFIRMED',$4,$4) ON CONFLICT(event_id,account_id) DO UPDATE SET phase='CONFIRMED',changed_at=greatest(engine_event_rsvps.changed_at,$4) RETURNING *", [randomUUID(), row.id, actor.accountId, at])).rows[0];
      await this.remember(db, actor.accountId, key, row.id, 'rsvp', fingerprint); this.check(valid); if (this.now() >= row.starts_at.getTime()) throw new DomainError('NOT_AVAILABLE', 409, 'RSVP is closed'); return EventRsvpResultSchema.parse({ schemaVersion: 1, rsvp: this.rsvpView(rsvp) });
    }));
  }
  async withdraw(token: string, id: string, requestKey: string) {
    const known = await this.reference(token, id), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'event.withdraw', id: known.id });
    return this.tx(token, [known.organizer_id], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM engine_events WHERE id=$1 FOR UPDATE', [known.id])).rows[0]; if (!row) throw unavailable(); await this.observe(db, row);
      const previous = await this.prior(db, actor.accountId, key, fingerprint), rsvp = (await db.query<Rsvp>('SELECT * FROM engine_event_rsvps WHERE event_id=$1 AND account_id=$2 FOR UPDATE', [row.id, actor.accountId])).rows[0]; if (!rsvp) throw unavailable();
      if (this.now() < rsvp.changed_at.getTime()) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Event clock unavailable');
      if (!previous) { await this.quota(db, actor.accountId, 'withdraw'); if (rsvp.phase === 'CONFIRMED') { rsvp.phase = 'CANCELLED'; rsvp.changed_at = new Date(this.now()); await db.query("UPDATE engine_event_rsvps SET phase='CANCELLED',changed_at=$2 WHERE id=$1", [rsvp.id, rsvp.changed_at]); } await this.remember(db, actor.accountId, key, row.id, 'withdraw', fingerprint); }
      return EventRsvpResultSchema.parse({ schemaVersion: 1, rsvp: this.rsvpView(rsvp) });
    });
  }
  async calendar(token: string, id: string) {
    const { event } = await this.get(token, id); if (event.rsvp?.phase !== 'CONFIRMED' || ['ENDED', 'CANCELLED'].includes(event.phase)) throw unavailable();
    const stamp = (value: string) => value.replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
    const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
    // Fold by UTF-8 octets, preserving each code point and the continuation space.
    const fold = (value: string) => { let line = '', bytes = 0, output = ''; for (const char of value) { const size = Buffer.byteLength(char); if (bytes + size > 75) { output += line + '\r\n'; line = ' '; bytes = 1; } line += char; bytes += size; } return output + line; };
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//virtual-life-platform//Silent Events//EN', 'CALSCALE:GREGORIAN', 'X-WR-TIMEZONE:' + event.schedule.timeZone, 'BEGIN:VEVENT', 'UID:' + event.id + '@virtual-life-platform.local', 'DTSTAMP:' + stamp(event.createdAt), 'DTSTART:' + stamp(event.schedule.startsAt), 'DTEND:' + stamp(event.schedule.endsAt), 'SUMMARY:' + escape(event.title), 'DESCRIPTION:' + escape(event.schedule.timeZone + ' | ' + event.startsLabel + ' - ' + event.endsLabel), 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
  }
  async withdrawContact(db: PoolClient, a: string, b: string) {
    if (!await this.social.isBlocked(a, b, db)) return;
    await db.query("UPDATE engine_event_rsvps r SET phase='CANCELLED',changed_at=greatest(r.changed_at,$3) FROM engine_events e WHERE e.id=r.event_id AND r.phase='CONFIRMED' AND ((e.organizer_id=$1 AND r.account_id=$2) OR (e.organizer_id=$2 AND r.account_id=$1))", [a, b, new Date(this.now())]);
    await db.query("UPDATE engine_event_performer_readiness r SET ready=false,changed_at=greatest(r.changed_at,$3) FROM engine_events e WHERE e.id=r.event_id AND r.ready AND ((e.organizer_id=$1 AND r.account_id=$2) OR (e.organizer_id=$2 AND r.account_id=$1))", [a, b, new Date(this.now())]);
  }
  async exportAccount(id: string, db: PoolClient) {
    const rsvps = (await db.query<Rsvp & { ends_at: Date }>('SELECT r.*,e.ends_at FROM engine_event_rsvps r JOIN engine_events e ON e.id=r.event_id WHERE r.account_id=$1 ORDER BY r.created_at DESC,r.id LIMIT 101', [id])).rows, events = (await db.query<Row>('SELECT * FROM engine_events WHERE organizer_id=$1 ORDER BY creation_order DESC LIMIT 101', [id])).rows;
    const grants = (await db.query<{ id: string; world_slug: string; event_id: string | null; role: string; expires_at: Date }>('SELECT * FROM engine_event_grants WHERE account_id=$1 ORDER BY expires_at DESC,id LIMIT 101', [id])).rows, readiness = (await db.query<{ event_id: string; ready: boolean; changed_at: Date }>('SELECT * FROM engine_event_performer_readiness WHERE account_id=$1 ORDER BY changed_at DESC,event_id LIMIT 101', [id])).rows, notices = (await db.query<{ id: string; event_id: string; kind: string; created_at: Date }>('SELECT * FROM engine_event_notices WHERE account_id=$1 ORDER BY created_at DESC,id LIMIT 101', [id])).rows;
    return { schemaVersion: 1, rsvps: rsvps.slice(0, 100).map(row => ({ ...this.rsvpView(row.phase === 'CONFIRMED' && row.ends_at.getTime() <= this.now() ? { ...row, phase: 'EXPIRED', changed_at: row.ends_at } : row), eventId: row.event_id })), rsvpsTruncated: rsvps.length > 100, events: events.slice(0, 100).map(row => ({ id: row.id, worldSlug: row.world_slug, title: row.title, phase: advanceEvent({ schemaVersion: 1, phase: row.phase, schedule: this.scheduleOf(row), createdAt: row.created_at.getTime(), changedAt: row.changed_at.getTime() }, 'observe', this.now()).phase, schedule: this.scheduleOf(row) })), eventsTruncated: events.length > 100,
      grants: grants.slice(0, 100).map(row => ({ id: row.id, worldSlug: row.world_slug, eventId: row.event_id, role: row.role, expiresAt: row.expires_at.toISOString() })), grantsTruncated: grants.length > 100, readiness: readiness.slice(0, 100).map(row => ({ eventId: row.event_id, ready: row.ready, changedAt: row.changed_at.toISOString() })), readinessTruncated: readiness.length > 100, notices: notices.slice(0, 100).map(row => ({ id: row.id, eventId: row.event_id, kind: row.kind, createdAt: row.created_at.toISOString() })), noticesTruncated: notices.length > 100 };
  }
  maintain() {
    if (this.#closed) return Promise.resolve();
    if (!this.#maintenance) this.#maintenance = (async () => {
      const rows = (await this.pool.query<{ id: string }>("SELECT id FROM engine_events WHERE phase NOT IN ('ENDED','CANCELLED') ORDER BY checked_order,creation_order LIMIT 20")).rows;
      for (const item of rows) { const db = await this.pool.connect(); try { await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'"); const row = (await db.query<Row>('SELECT * FROM engine_events WHERE id=$1 FOR UPDATE', [item.id])).rows[0]; if (row) await this.observe(db, row); await db.query('COMMIT'); } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); } }
      await this.pool.query("DELETE FROM engine_events WHERE id IN(SELECT id FROM engine_events WHERE phase IN ('ENDED','CANCELLED') AND changed_at<$1 ORDER BY creation_order LIMIT 100)", [new Date(this.now() - 90 * DAY)]);
    })().finally(() => { this.#maintenance = undefined; }); return this.#maintenance;
  }
  async close() { this.#closed = true; await this.#maintenance; }
}
