import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { EventInviteInputSchema, EventInviteReceiptSchema, EventInvitesPageSchema } from '@virtual-city/contracts';
import { WorldError } from '@virtual-city/world-sdk';
import type { IdentityService } from '../identity/service';
import type { InvitationService } from '../invitations/service';
import { DomainError } from '../common/errors';
import { EventService, type EventBookingContext } from './service';
type Row = { id: string; event_id: string; sender_id: string; recipient_id: string; phase: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED'; expires_at: Date; access_until: Date; created_at: Date; changed_at: Date };
const uuid = z.uuid().transform(value => value.toLowerCase());
const absent = () => new DomainError('NOT_AVAILABLE', 404, 'This event invitation is unavailable');
export class EventInvitationService {
  #listeners = new Set<(ids: string[]) => void>();
  constructor(private pool: Pick<Pool, 'query'>, private identity: IdentityService, private contact: InvitationService, private events: EventService, private now = Date.now) {}
  onChanged(listener: (ids: string[]) => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  private notify(ids: string[]) { for (const listener of this.#listeners) { try { listener([...new Set(ids)]); } catch { /* Refresh hint cannot replace current policy checks. */ } } }
  private receipt(row: Row) { return EventInviteReceiptSchema.parse({ schemaVersion: 1, id: row.id, eventId: row.event_id, phase: row.phase, expiresAt: row.expires_at.toISOString() }); }
  async permits(db: PoolClient, event: string, owner: string, viewer: string) { return !!(await db.query("SELECT 1 FROM engine_event_invitations WHERE event_id=$1 AND sender_id=$2 AND recipient_id=$3 AND phase='ACCEPTED' AND access_until>$4", [event, owner, viewer, new Date(this.now())])).rowCount && await this.contact.permitsContact(db, owner, viewer); }
  async participants(db: Pick<Pool, 'query'>, event: string) { return (await db.query<{ recipient_id: string }>("SELECT recipient_id FROM engine_event_invitations WHERE event_id=$1 AND phase IN ('PENDING','ACCEPTED') AND access_until>$2", [event, new Date(this.now())])).rows.map(row => row.recipient_id); }
  async observed(db: PoolClient, context: EventBookingContext, now: number) { await db.query("UPDATE engine_event_invitations SET phase=CASE WHEN $3 THEN 'CANCELLED' ELSE 'EXPIRED' END,changed_at=greatest(changed_at,$2) WHERE event_id=$1 AND phase IN ('PENDING','ACCEPTED') AND ((phase='PENDING' AND expires_at<=$2) OR access_until<=$2 OR $4)", [context.id, new Date(now), context.phase === 'CANCELLED', ['ENDED','CANCELLED'].includes(context.phase)]); }
  private async prior(db: PoolClient, actor: string, key: string, fingerprint: string) {
    const prior = (await db.query<{ fingerprint: string; invitation_id: string }>('SELECT * FROM engine_event_invite_mutations WHERE actor_id=$1 AND request_id=$2', [actor, key])).rows[0];
    if (prior && prior.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input'); return prior;
  }
  private async own(db: Pick<Pool, 'query'>, id: string, account: string) { const row = (await db.query<Row>('SELECT * FROM engine_event_invitations WHERE id=$1 AND (sender_id=$2 OR recipient_id=$2)', [id, account])).rows[0]; if (!row) throw absent(); return row; }
  private remember(db: PoolClient, actor: string, key: string, fingerprint: string, id: string) { return db.query('INSERT INTO engine_event_invite_mutations VALUES($1,$2,$3,$4,$5)', [actor, key, id, fingerprint, new Date(this.now())]); }
  private async quota(db: PoolClient, actor: string, create = false) {
    const n = (await db.query('SELECT count(*) FILTER(WHERE created_at>$2)::int AS minute,count(*)::int AS hour FROM engine_event_invite_mutations WHERE actor_id=$1 AND created_at>$3', [actor, new Date(this.now() - 60000), new Date(this.now() - 3600000)])).rows[0];
    if (n.minute >= 30 || n.hour >= (create ? 20 : 60)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before changing another invitation');
  }
  async create(token: string, eventId: string, requestKey: string, raw: unknown) {
    const input = EventInviteInputSchema.parse(raw), key = uuid.parse(requestKey), id = uuid.parse(eventId), fingerprint = this.identity.fingerprint({ operation: 'event.invite', id, input }); let changed = false;
    const result = await this.events.withInvitation(token, id, [input.recipientId], async (db, actor, context) => {
      if (!await this.events.canOrganize(db, actor, context) || !await this.contact.permitsContact(db, actor.accountId, input.recipientId) || !await this.events.eligible(db, input.recipientId, context.worldSlug)) throw absent();
      const prior = await this.prior(db, actor.accountId, key, fingerprint); if (prior) return this.receipt(await this.own(db, prior.invitation_id, actor.accountId));
      if (!['SCHEDULED','OPEN'].includes(context.phase) || this.now() >= Date.parse(context.schedule.startsAt)) throw absent();
      await this.quota(db, actor.accountId, true);
      let row = (await db.query<Row>("SELECT * FROM engine_event_invitations WHERE event_id=$1 AND recipient_id=$2 AND phase IN ('PENDING','ACCEPTED')", [id, input.recipientId])).rows[0];
      if (!row) {
        if ((await db.query("SELECT count(*)::int AS n FROM engine_event_invitations WHERE event_id=$1 AND phase IN ('PENDING','ACCEPTED')", [id])).rows[0].n >= 50 || (await db.query("SELECT count(*)::int AS n FROM engine_event_invitations WHERE recipient_id=$1 AND phase='PENDING' AND expires_at>$2", [input.recipientId, new Date(this.now())])).rows[0].n >= 50) throw new DomainError('RATE_LIMITED', 429, 'The invitation inbox is full');
        row = (await db.query<Row>("INSERT INTO engine_event_invitations(id,event_id,sender_id,recipient_id,phase,created_at,changed_at,expires_at,access_until) VALUES($1,$2,$3,$4,'PENDING',$5,$5,$6,$7) RETURNING *", [randomUUID(), id, actor.accountId, input.recipientId, new Date(this.now()), new Date(Math.min(this.now() + 120000, Date.parse(context.schedule.startsAt))), context.schedule.endsAt])).rows[0]; changed = true;
      }
      await this.remember(db, actor.accountId, key, fingerprint, row.id);
      if (!await this.events.canOrganize(db, actor, context) || !await this.events.eligible(db, input.recipientId, context.worldSlug) || row.phase === 'PENDING' && this.now() >= row.expires_at.getTime()) throw absent();
      return this.receipt(row);
    }); if (changed) this.notify([input.recipientId]); return result;
  }
  async respond(token: string, rawId: string, requestKey: string, action: 'accept' | 'decline' | 'cancel') {
    const id = uuid.parse(rawId), key = uuid.parse(requestKey), actor = await this.identity.authenticate(token), known = await this.own(this.pool, id, actor.accountId), fingerprint = this.identity.fingerprint({ operation: 'event.invite.respond', id, action }); let changed = false;
    const work = async (db: PoolClient, current: typeof actor, context: EventBookingContext) => {
      const row = await this.own(db, id, current.accountId); if (action === 'cancel' ? row.sender_id !== current.accountId : row.recipient_id !== current.accountId) throw absent();
      if (this.now() < row.changed_at.getTime()) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Invitation clock unavailable');
      const prior = await this.prior(db, current.accountId, key, fingerprint); if (prior) return this.receipt(row);
      if (action === 'accept' && (!await this.contact.permitsContact(db, row.sender_id, row.recipient_id) || ['ENDED','CANCELLED'].includes(context.phase))) throw absent();
      await this.quota(db, current.accountId);
      const accepting = row.phase === 'PENDING' && action === 'accept';
      if (row.phase === 'PENDING' || row.phase === 'ACCEPTED' && action !== 'accept') {
        if (action !== 'accept') await this.events.revokePrivate(db, [row.event_id], row.recipient_id);
        row.phase = action === 'accept' ? 'ACCEPTED' : action === 'decline' ? 'DECLINED' : 'CANCELLED'; row.changed_at = new Date(this.now());
        if (action === 'accept' && this.now() >= row.expires_at.getTime()) row.phase = 'EXPIRED';
        await db.query('UPDATE engine_event_invitations SET phase=$2,changed_at=$3 WHERE id=$1', [id, row.phase, row.changed_at]); changed = true;
      }
      await this.remember(db, current.accountId, key, fingerprint, id);
      // A deadline crossed while awaiting SQL cannot commit a late acceptance.
      if (accepting && row.phase === 'ACCEPTED' && this.now() >= row.expires_at.getTime()) { row.phase = 'EXPIRED'; row.changed_at = new Date(row.expires_at); await db.query("UPDATE engine_event_invitations SET phase='EXPIRED',changed_at=$2 WHERE id=$1", [id, row.changed_at]); }
      return this.receipt(row);
    };
    const result = action === 'accept' ? await this.events.withInvitation(token, known.event_id, [known.sender_id, known.recipient_id], work) : await this.events.withBooking(token, known.event_id, work, true, undefined, [known.sender_id, known.recipient_id]);
    if (changed) this.notify([known.sender_id, known.recipient_id]); return result;
  }
  async list(token: string) {
    const actor = await this.identity.authenticate(token), rows = (await this.pool.query<Row>('SELECT * FROM engine_event_invitations WHERE sender_id=$1 OR recipient_id=$1 ORDER BY creation_order DESC LIMIT 51', [actor.accountId])).rows, items = [];
    for (const known of rows.slice(0, 50)) {
      try { const item = await this.events.withInvitation(token, known.event_id, [known.sender_id, known.recipient_id], async (db, current, context) => {
        const row = await this.own(db, known.id, current.accountId); if (!['PENDING','ACCEPTED'].includes(row.phase) || !await this.contact.permitsContact(db, row.sender_id, row.recipient_id)) throw absent();
        return { ...this.receipt(row), direction: current.accountId === row.recipient_id ? 'incoming' as const : 'outgoing' as const, event: { title: context.title, worldSlug: context.worldSlug, schedule: context.schedule } };
      }); items.push(item); } catch (error) { if (!(error instanceof DomainError && error.status === 404) && !(error instanceof WorldError && ['NOT_FOUND','WORLD_UNAVAILABLE'].includes(error.code))) throw error; }
    }
    return EventInvitesPageSchema.parse({ schemaVersion: 1, items, truncated: rows.length > 50 });
  }
  async withdrawContact(db: PoolClient, a: string, b: string) {
    const rows = (await db.query<Row>("SELECT * FROM engine_event_invitations WHERE ((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)) AND phase IN ('PENDING','ACCEPTED')", [a, b])).rows;
    for (const recipient of [a,b]) await this.events.revokePrivate(db, rows.filter(row => row.recipient_id === recipient).map(row => row.event_id), recipient);
    await db.query("UPDATE engine_event_invitations SET phase='CANCELLED',changed_at=greatest(changed_at,$3) WHERE ((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)) AND phase IN ('PENDING','ACCEPTED')", [a, b, new Date(this.now())]);
  }
  async withdrawAll(db: PoolClient, recipient: string) {
    const rows = (await db.query<Row>("SELECT * FROM engine_event_invitations WHERE recipient_id=$1 AND phase IN ('PENDING','ACCEPTED')", [recipient])).rows; await this.events.revokePrivate(db, rows.map(row => row.event_id), recipient);
    await db.query("UPDATE engine_event_invitations SET phase='CANCELLED',changed_at=greatest(changed_at,$2) WHERE recipient_id=$1 AND phase IN ('PENDING','ACCEPTED')", [recipient, new Date(this.now())]);
  }
  async exportAccount(id: string, db: PoolClient) { const rows = (await db.query<Row>('SELECT * FROM engine_event_invitations WHERE sender_id=$1 OR recipient_id=$1 ORDER BY creation_order DESC LIMIT 101', [id])).rows; return { schemaVersion: 1, items: rows.slice(0,100).map(row => ({ ...this.receipt(row), direction: row.recipient_id === id ? 'incoming' : 'outgoing' })), truncated: rows.length > 100 }; }
}
