import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { InvitationInputSchema, InvitationReceiptSchema, InvitationSettingsSchema, InvitationsPageSchema, InvitationGroupInputSchema, InvitationGroupSchema, type InvitationDestination, type InvitationReceipt } from '@virtual-city/contracts';
import { WorldError, type WorldRegistry } from '@virtual-city/world-sdk';
import type { IdentityContext, IdentityService } from '../identity/service';
import type { SocialService } from '../social/service';
import { DomainError } from '../common/errors';

type Row = { id: string; sender_id: string; recipient_id: string; destination: InvitationDestination; state: InvitationReceipt['state']; created_at: Date; expires_at: Date; changed_at: Date };
type GroupRow = { id: string; actor_id: string; request_id: string; fingerprint: string; recipient_count: number; created_at: Date; expires_at: Date };
type GroupItem = { position: number; outcome: 'SENT' | 'UNAVAILABLE' | 'RATE_LIMITED' | 'CONFLICT' | 'EXPIRED' | null; invitation_id: string | null };
const uuid = z.uuid().transform(value => value.toLowerCase()), DAY = 86400000;
const unavailable = () => new DomainError('NOT_AVAILABLE', 404, 'This invitation is unavailable');
const conflict = () => new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key conflicts with an earlier action');
export class InvitationService {
  #listeners = new Set<(ids: string[], event: 'invitation.received' | 'invitation.responded') => void>();
  #maintenance?: Promise<void>; #closed = false;
  #consentWithdrawals = new Set<(db: PoolClient, account: string) => Promise<void>>();
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private social: SocialService, private registry: WorldRegistry, private now = Date.now,private roomTargets?:{invitationTarget(token:string,destination:InvitationDestination):Promise<void>}) {}
  onChanged(listener: (ids: string[], event: 'invitation.received' | 'invitation.responded') => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  permitsContact(db: PoolClient, sender: string, recipient: string) { return this.allowed(db, sender, recipient); }
  onConsentWithdrawn(listener: (db: PoolClient, account: string) => Promise<void>) { this.#consentWithdrawals.add(listener); return () => { this.#consentWithdrawals.delete(listener); }; }
  private notify(ids: string[], event: 'invitation.received' | 'invitation.responded' = 'invitation.responded') { for (const listener of this.#listeners) { try { listener([...new Set(ids)], event); } catch { /* Refresh hints never grant authority. */ } } }
  private async tx<T>(token: string, ids: string[], work: (db: PoolClient, actor: IdentityContext) => Promise<T>) {
    if (this.#closed) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Invitations unavailable');
    const initial = await this.identity.authenticate(token), db = await this.pool.connect();
    try { await db.query('BEGIN'); await this.identity.lockAccounts(db, [initial.accountId, ...ids]); const actor = await this.identity.contextInTransaction(db, token); const result = await work(db, actor); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private receipt(row: Row) { return InvitationReceiptSchema.parse({ schemaVersion: 1, id: row.id, state: row.state, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString() }); }
  private async allowed(db: PoolClient, a: string, b: string) {
    if (!await this.social.invitationRelationship(a, b, db)) return false;
    return !!(await db.query('SELECT 1 FROM invitation_preferences WHERE account_id=$1 AND allow_invitations=true', [b])).rowCount;
  }
  private publicTarget(destination: InvitationDestination) { if (!this.registry.permitsActivityDisclosure(destination.worldSlug)) throw unavailable(); }
  private async target(token: string, destination: InvitationDestination) {
    this.publicTarget(destination);
    const { definition } = await this.registry.authorizeWorld(token, destination.worldSlug).catch(error => { if (error instanceof WorldError) throw unavailable(); throw error; });
    if (destination.worldVersion !== definition.version || destination.sceneVersion !== definition.sceneRef.version) throw new DomainError('WORLD_VERSION_MISMATCH', 409, 'Refresh world assets');
    if(destination.roomId){if(!this.roomTargets)throw unavailable();await this.roomTargets.invitationTarget(token,destination);}
    this.publicTarget(destination);
  }
  private async expire(db: PoolClient, row: Row) {
    if (row.state === 'PENDING' && row.expires_at.getTime() <= this.now()) { row.state = 'EXPIRED'; row.changed_at = new Date(this.now()); await db.query("UPDATE invitations SET state='EXPIRED',changed_at=$2 WHERE id=$1 AND state='PENDING'", [row.id, row.changed_at]); }
    return row;
  }
  private async prior(db: PoolClient, actor: IdentityContext, key: string, fingerprint: string) {
    const previous = (await db.query<{ fingerprint: string; invitation_id: string | null; result: unknown }>('SELECT fingerprint,invitation_id,result FROM invitation_mutations WHERE actor_id=$1 AND request_id=$2', [actor.accountId, key])).rows[0];
    if (previous && previous.fingerprint !== fingerprint) throw conflict(); return previous;
  }
  private remember(db: PoolClient, actor: IdentityContext, key: string, operation: string, fingerprint: string, invitationId: string | null, result: unknown = null) {
    return db.query('INSERT INTO invitation_mutations VALUES($1,$2,$3,$4,$5,$6,$7)', [actor.accountId, key, operation, fingerprint, invitationId, result && JSON.stringify(result), new Date(this.now())]);
  }
  settings(token: string) { return this.tx(token, [], async (db, actor) => InvitationSettingsSchema.parse({ schemaVersion: 1, allowInvitations: !!(await db.query('SELECT allow_invitations FROM invitation_preferences WHERE account_id=$1', [actor.accountId])).rows[0]?.allow_invitations })); }
  async updateSettings(token: string, requestKey: string, allowInvitations: boolean) {
    const key = uuid.parse(requestKey), input = InvitationSettingsSchema.parse({ schemaVersion: 1, allowInvitations }); let changed = false, accountId = '';
    const result = await this.tx(token, [], async (db, actor) => {
      accountId = actor.accountId;
      const fingerprint = this.identity.fingerprint({ operation: 'invitations.settings', input }), previous = await this.prior(db, actor, key, fingerprint);
      if (previous) return InvitationSettingsSchema.parse(previous.result);
      await db.query('INSERT INTO invitation_preferences VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET allow_invitations=$2', [actor.accountId, input.allowInvitations]);
      if (!input.allowInvitations) await db.query("UPDATE invitations SET state='CANCELLED',changed_at=$2 WHERE recipient_id=$1 AND state='PENDING'", [actor.accountId, new Date(this.now())]);
      if (!input.allowInvitations) for (const listener of this.#consentWithdrawals) await listener(db, actor.accountId);
      await this.remember(db, actor, key, 'settings', fingerprint, null, input); changed = true; return input;
    }); if (changed) this.notify([accountId]); return result;
  }
  async create(token: string, requestKey: string, raw: unknown, groupDeadline?: number) {
    const input = InvitationInputSchema.parse(raw), key = uuid.parse(requestKey); let changed = false; let sender = '';
    // Registry authorization uses its own pool. Observe it before holding pair
    // locks, then recheck synchronous public disclosure inside the transaction.
    // Acceptance is consent metadata; actual travel must authorize again.
    await this.target(token, input.destination);
    const result = await this.tx(token, [input.recipientId], async (db, actor) => {
      sender = actor.accountId;
      if (!await this.allowed(db, actor.accountId, input.recipientId)) throw unavailable();
      this.publicTarget(input.destination);
      const fingerprint = this.identity.fingerprint({ operation: 'invitations.create', input }), previous = await this.prior(db, actor, key, fingerprint);
      if (previous) { const old = (await db.query<Row>('SELECT * FROM invitations WHERE id=$1', [previous.invitation_id])).rows[0]; if (!old) throw unavailable(); return this.receipt(await this.expire(db, old)); }
      await db.query("UPDATE invitations SET state='EXPIRED',changed_at=$3 WHERE sender_id=$1 AND recipient_id=$2 AND state='PENDING' AND expires_at<=$3", [actor.accountId, input.recipientId, new Date(this.now())]);
      if ((await db.query("SELECT 1 FROM invitations WHERE sender_id=$1 AND recipient_id=$2 AND state='PENDING'", [actor.accountId, input.recipientId])).rowCount) throw conflict();
      const budget = (await db.query('SELECT count(*) FILTER(WHERE created_at>$2)::int AS minute,count(*)::int AS hour FROM invitations WHERE sender_id=$1 AND created_at>$3', [actor.accountId, new Date(this.now() - 60000), new Date(this.now() - 3600000)])).rows[0];
      if (budget.minute >= 6 || budget.hour >= 20) throw new DomainError('RATE_LIMITED', 429, 'Please wait before sending another invitation');
      if (Number((await db.query("SELECT count(*) FROM invitations WHERE recipient_id=$1 AND state='PENDING' AND expires_at>$2", [input.recipientId, new Date(this.now())])).rows[0].count) >= 50) throw unavailable();
      const at = new Date(this.now()); if (groupDeadline !== undefined && at.getTime() >= groupDeadline) throw unavailable();
      const row: Row = { id: randomUUID(), sender_id: actor.accountId, recipient_id: input.recipientId, destination: input.destination, state: 'PENDING', created_at: at, changed_at: at, expires_at: new Date(Math.min(at.getTime() + 120000, groupDeadline ?? Infinity)) };
      await db.query('INSERT INTO invitations VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [row.id, row.sender_id, row.recipient_id, JSON.stringify(row.destination), row.state, row.created_at, row.expires_at, row.changed_at]);
      await this.remember(db, actor, key, 'create', fingerprint, row.id); changed = true; return this.receipt(row);
    });
    if (changed) this.notify([sender, input.recipientId], 'invitation.received'); return result;
  }
  async respond(token: string, requestKey: string, invitationId: string, action: 'accept' | 'decline' | 'cancel') {
    const id = uuid.parse(invitationId), key = uuid.parse(requestKey), initial = await this.identity.authenticate(token);
    const reference = (await this.pool.query<Row>('SELECT * FROM invitations WHERE id=$1 AND (sender_id=$2 OR recipient_id=$2)', [id, initial.accountId])).rows[0]; if (!reference) throw unavailable();
    if (action === 'accept') await this.target(token, reference.destination);
    let changed = false;
    const result = await this.tx(token, [reference.sender_id, reference.recipient_id], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM invitations WHERE id=$1 FOR UPDATE', [id])).rows[0]; if (!row) throw unavailable();
      if ((action === 'cancel' && actor.accountId !== row.sender_id) || (action !== 'cancel' && actor.accountId !== row.recipient_id)) throw new DomainError('FORBIDDEN', 403, 'This action is not permitted');
      if (!await this.allowed(db, row.sender_id, row.recipient_id)) throw unavailable();
      if (action === 'accept') this.publicTarget(row.destination);
      const fingerprint = this.identity.fingerprint({ operation: 'invitations.respond', id, action }), previous = await this.prior(db, actor, key, fingerprint);
      await this.expire(db, row);
      if (previous) return this.receipt(row);
      if (row.state === 'PENDING') { const at = this.now(); row.state = at >= row.expires_at.getTime() ? 'EXPIRED' : action === 'accept' ? 'ACCEPTED' : action === 'decline' ? 'DECLINED' : 'CANCELLED'; row.changed_at = new Date(at); await db.query('UPDATE invitations SET state=$2,changed_at=$3 WHERE id=$1', [id, row.state, row.changed_at]); changed = true; }
      await this.remember(db, actor, key, 'respond', fingerprint, id); return this.receipt(row);
    }); if (changed) this.notify([reference.sender_id, reference.recipient_id]); return result;
  }
  async list(token: string, cursor?: string, limit = 20) {
    const catalog = await this.registry.catalog(token);
    return this.tx(token, [], async (db, actor) => {
      const rows = (await db.query<Row>('SELECT * FROM invitations WHERE (sender_id=$1 OR recipient_id=$1) AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3', [actor.accountId, cursor ?? null, limit + 1])).rows;
      const items = [];
      for (const row of rows.slice(0, limit)) {
        if (!await this.allowed(db, row.sender_id, row.recipient_id)) continue;
        if (!this.registry.permitsActivityDisclosure(row.destination.worldSlug)) continue;
        const card = catalog.worlds.find(world => world.slug === row.destination.worldSlug);
        if (!card || card.availability !== 'available' || card.accessHint !== 'session-required' || card.version !== row.destination.worldVersion || card.sceneRef.version !== row.destination.sceneVersion) continue;
        const profile = (await this.identity.publicProfiles([row.sender_id === actor.accountId ? row.recipient_id : row.sender_id], db))[0]; if (!profile) continue;
        items.push({ ...this.receipt(await this.expire(db, row)), direction: row.recipient_id === actor.accountId ? 'incoming' : 'outgoing', contact: profile, destination: row.destination });
      }
      return InvitationsPageSchema.parse({ schemaVersion: 1, items, nextCursor: rows.length > limit ? rows[limit - 1].id : null });
    });
  }
  private groupKey(id: string, position: number) {
    const hash = this.identity.fingerprint({ purpose: 'invitation-group-child:v1', id, position });
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }
  async createGroup(token: string, requestKey: string, raw: unknown) {
    const input = InvitationGroupInputSchema.parse(raw), key = uuid.parse(requestKey);
    await this.target(token, input.destination);
    const group = await this.tx(token, [], async (db, actor) => {
      const fingerprint = this.identity.fingerprint({ operation: 'invitation-group.create', input });
      const old = (await db.query<GroupRow>('SELECT * FROM invitation_groups WHERE actor_id=$1 AND request_id=$2', [actor.accountId, key])).rows[0];
      if (old) { if (old.fingerprint !== fingerprint) throw conflict(); return old; }
      if ((await db.query('SELECT count(*)::int AS count FROM invitation_groups WHERE actor_id=$1 AND created_at>$2', [actor.accountId, new Date(this.now() - 60000)])).rows[0].count >= 3) throw new DomainError('RATE_LIMITED', 429, 'Please wait before sending more group invitations');
      const createdAt = this.now();
      const group: GroupRow = { id: randomUUID(), actor_id: actor.accountId, request_id: key, fingerprint, recipient_count: input.recipientIds.length, created_at: new Date(createdAt), expires_at: new Date(createdAt + 120000) };
      await db.query('INSERT INTO invitation_groups VALUES($1,$2,$3,$4,$5,$6,$7)', [group.id, group.actor_id, group.request_id, group.fingerprint, group.recipient_count, group.created_at, group.expires_at]);
      for (let position = 0; position < input.recipientIds.length; position++) await db.query('INSERT INTO invitation_group_items(group_id,position) VALUES($1,$2)', [group.id, position]); return group;
    });
    // Per-recipient durable child keys allow resuming an interrupted fan-out.
    // No account transaction is held across the ordinary invitation port.
    for (const [position, recipientId] of input.recipientIds.entries()) {
      const item = (await this.pool.query<GroupItem>('SELECT * FROM invitation_group_items WHERE group_id=$1 AND position=$2', [group.id, position])).rows[0]; if (!item || item.outcome) continue;
      let outcome: GroupItem['outcome'] = 'EXPIRED', invitationId: string | null = null;
      if (this.now() < group.expires_at.getTime()) {
        try { const receipt = await this.create(token, this.groupKey(group.id, position), { schemaVersion: 1, recipientId, destination: input.destination }, group.expires_at.getTime()); outcome = 'SENT'; invitationId = receipt.id; }
        catch (error) {
          if (!(error instanceof DomainError)) throw error;
          if (this.now() >= group.expires_at.getTime()) outcome = 'EXPIRED'; else if (error.status === 429) outcome = 'RATE_LIMITED'; else if (error.status === 409) outcome = 'CONFLICT'; else if ([403, 404].includes(error.status)) outcome = 'UNAVAILABLE'; else throw error;
        }
      }
      await this.tx(token, [recipientId], async (db, actor) => {
        if (actor.accountId !== group.actor_id) throw unavailable();
        await db.query('UPDATE invitation_group_items SET outcome=$3,invitation_id=$4 WHERE group_id=$1 AND position=$2 AND outcome IS NULL', [group.id, position, outcome, invitationId]);
      });
    }
    return this.group(token, group.id);
  }
  group(token: string, rawId: string) {
    const id = uuid.parse(rawId);
    return this.tx(token, [], async (db, actor) => {
      const group = (await db.query<GroupRow>('SELECT * FROM invitation_groups WHERE id=$1 AND actor_id=$2', [id, actor.accountId])).rows[0]; if (!group) throw unavailable();
      const rows = (await db.query<GroupItem>('SELECT * FROM invitation_group_items WHERE group_id=$1 ORDER BY position', [id])).rows, items = [];
      for (const item of rows) {
        let status: string = item.outcome === 'SENT' ? 'UNAVAILABLE' : item.outcome ?? (group.expires_at.getTime() <= this.now() ? 'EXPIRED' : 'PENDING'), invitationId: string | null = null;
        if (item.invitation_id) {
          const row = (await db.query<Row>('SELECT * FROM invitations WHERE id=$1 AND sender_id=$2', [item.invitation_id, actor.accountId])).rows[0];
          if (row && this.registry.permitsActivityDisclosure(row.destination.worldSlug) && await this.allowed(db, row.sender_id, row.recipient_id)) { status = (await this.expire(db, row)).state; invitationId = row.id; }
        }
        items.push({ position: item.position, status, invitationId });
      }
      const acceptedCount = items.filter(item => item.status === 'ACCEPTED').length, pendingCount = items.filter(item => item.status === 'PENDING').length;
      return InvitationGroupSchema.parse({ schemaVersion: 1, id, expiresAt: group.expires_at.toISOString(), completion: acceptedCount === group.recipient_count ? 'ALL_ACCEPTED' : acceptedCount ? 'PARTIAL' : pendingCount ? 'PENDING' : 'CLOSED', acceptedCount, pendingCount, items });
    });
  }
  // Called inside social's already pair-locked transaction; failure rolls back
  // both consent withdrawal and pending invitations without cross-owner SQL.
  async withdrawContact(db: PoolClient, a: string, b: string) { await db.query("UPDATE invitations SET state='CANCELLED',changed_at=$3 WHERE ((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)) AND state='PENDING'", [a, b, new Date(this.now())]); }
  async exportAccount(id: string, db: PoolClient) {
    const settings = (await db.query('SELECT allow_invitations FROM invitation_preferences WHERE account_id=$1', [id])).rows[0];
    const rows = (await db.query<Row>('SELECT * FROM invitations WHERE sender_id=$1 OR recipient_id=$1 ORDER BY created_at DESC,id LIMIT 101', [id])).rows;
    const groups = (await db.query('SELECT id,recipient_count,created_at,expires_at FROM invitation_groups WHERE actor_id=$1 ORDER BY created_at DESC LIMIT 101', [id])).rows;
    return { schemaVersion: 1, allowInvitations: !!settings?.allow_invitations, items: rows.slice(0, 100).map(row => ({ ...this.receipt(row), state: row.state === 'PENDING' && row.expires_at.getTime() <= this.now() ? 'EXPIRED' : row.state, direction: row.sender_id === id ? 'outgoing' : 'incoming', destination: row.destination })), truncated: rows.length > 100, groups: groups.slice(0, 100), groupsTruncated: groups.length > 100 };
  }
  maintain() {
    if (this.#closed) return Promise.resolve();
    if (!this.#maintenance) this.#maintenance = this.pool.query("UPDATE invitations SET state='EXPIRED',changed_at=$1 WHERE id IN (SELECT id FROM invitations WHERE state='PENDING' AND expires_at<=$1 ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)", [new Date(this.now())])
      .then(() => this.pool.query("DELETE FROM invitations WHERE id IN (SELECT id FROM invitations WHERE state<>'PENDING' AND created_at<=$1 ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED)", [new Date(this.now() - DAY)]))
      .then(() => this.pool.query("DELETE FROM invitation_mutations WHERE (actor_id,request_id) IN (SELECT actor_id,request_id FROM invitation_mutations WHERE operation='settings' AND created_at<=$1 LIMIT 100)", [new Date(this.now() - DAY)]))
      .then(() => this.pool.query('DELETE FROM invitation_groups WHERE id IN (SELECT id FROM invitation_groups WHERE created_at<=$1 ORDER BY created_at LIMIT 100)', [new Date(this.now() - DAY)]))
      .then(() => {}).finally(() => { this.#maintenance = undefined; });
    return this.#maintenance;
  }
  async close() { this.#closed = true; this.#listeners.clear(); await this.#maintenance; }
}
