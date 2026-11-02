import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { FriendRequestResultSchema, SocialSettingsSchema, SharedActivitySchema, type FriendRequestResult, type SharedActivity, type SocialSettings } from '@virtual-city/contracts';
import { IdentityService, type IdentityContext } from '../identity/service';
import { DomainError } from '../common/errors';
export interface SocialPresencePort { visibleActivity(viewerId: string, targetId: string): Promise<SharedActivity | null> }
type RequestRow = { id: string; from_id: string; to_id: string; state: FriendRequestResult['state']; expires_at: Date; target_code_hint: string };
const DAY = 86400000;
const unavailable = () => new DomainError('NOT_AVAILABLE', 404, 'This social action is unavailable');
export class SocialService {
  private changes = new Set<(accounts: string[]) => void>();
  private abuse = new Set<(event: { actorId: string; code: 'REQUEST_LIMITED' }) => void>();
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private presence: SocialPresencePort = { visibleActivity: async () => null }, private now = Date.now) {}
  onChanged(listener: (accounts: string[]) => void) { this.changes.add(listener); return () => { this.changes.delete(listener); }; }
  onAbuse(listener: (event: { actorId: string; code: 'REQUEST_LIMITED' }) => void) { this.abuse.add(listener); return () => { this.abuse.delete(listener); }; }
  private notify(accounts: string[]) { if (!accounts.length) return; for (const listener of this.changes) { try { listener([...new Set(accounts)]); } catch { /* Readers query authoritative policy on every action. */ } } }
  private async actorTx<T>(token: string, targets: string[], work: (db: PoolClient, actor: IdentityContext) => Promise<T>): Promise<T> {
    const initial = await this.identity.authenticate(token); const db = await this.pool.connect();
    try {
      await db.query('BEGIN'); await this.identity.lockAccounts(db, [initial.accountId, ...targets]);
      const actor = await this.identity.contextInTransaction(db, token);
      const result = await work(db, actor); await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  private async mutation<T>(token: string, key: string, operation: string, body: unknown, targets: string[], work: (db: PoolClient, actor: IdentityContext) => Promise<{ value: T; changed?: string[] }>, guard?: (db: PoolClient, actor: IdentityContext) => Promise<void>): Promise<T> {
    const changed = new Set<string>(); let actorId: string | undefined;
    try {
      const value = await this.actorTx(token, targets, async (db, actor) => {
        actorId = actor.accountId; if (guard) await guard(db, actor); const fingerprint = this.identity.fingerprint({ operation, body });
        const old = (await db.query('SELECT operation,fingerprint,result FROM social_mutations WHERE actor_id=$1 AND request_id=$2', [actor.accountId, key])).rows[0];
        if (old) { if (old.operation !== operation || old.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input'); return old.result as T; }
        const result = await work(db, actor);
        await db.query('INSERT INTO social_mutations VALUES($1,$2,$3,$4,$5,$6)', [actor.accountId, key, operation, fingerprint, JSON.stringify(result.value), new Date(this.now())]);
        result.changed?.forEach(id => changed.add(id)); return result.value;
      });
      this.notify([...changed]); return value;
    } catch (error) {
      if (actorId && error instanceof DomainError && error.code === 'RATE_LIMITED') for (const listener of this.abuse) { try { listener({ actorId, code: 'REQUEST_LIMITED' }); } catch { /* Hook is not authorization. */ } }
      throw error;
    }
  }
  private pair(a: string, b: string) { return [a, b].sort(); }
  private result(row: RequestRow): FriendRequestResult { return FriendRequestResultSchema.parse({ schemaVersion: 1, id: row.id, state: row.state, expiresAt: row.expires_at.toISOString() }); }
  private async ensureSettings(db: PoolClient, actor: string): Promise<SocialSettings> {
    await db.query('INSERT INTO social_preferences(account_id) VALUES($1) ON CONFLICT(account_id) DO NOTHING', [actor]);
    const row = (await db.query('SELECT contact_code,request_policy FROM social_preferences WHERE account_id=$1', [actor])).rows[0];
    return SocialSettingsSchema.parse({ schemaVersion: 1, contactCode: row.contact_code, requestPolicy: row.request_policy });
  }
  settings(token: string) { return this.actorTx(token, [], (db, actor) => this.ensureSettings(db, actor.accountId)); }
  updateSettings(token: string, key: string, requestPolicy: 'code' | 'none') {
    return this.mutation(token, key, 'settings', { requestPolicy }, [], async (db, actor) => {
      await this.ensureSettings(db, actor.accountId);
      await db.query('UPDATE social_preferences SET request_policy=$2,updated_at=$3 WHERE account_id=$1', [actor.accountId, requestPolicy, new Date(this.now())]);
      const cancelled = requestPolicy === 'none' ? (await db.query<{ from_id: string }>("UPDATE social_friend_requests SET state='CANCELLED' WHERE to_id=$1 AND state='PENDING' RETURNING from_id", [actor.accountId])).rows.map(r => r.from_id) : [];
      return { value: await this.ensureSettings(db, actor.accountId), changed: [actor.accountId, ...cancelled] };
    });
  }
  rotateCode(token: string, key: string) {
    return this.mutation(token, key, 'contact-code.rotate', {}, [], async (db, actor) => {
      await this.ensureSettings(db, actor.accountId);
      await db.query("UPDATE social_preferences SET contact_code='VL-' || upper(replace(gen_random_uuid()::text,'-','')),updated_at=$2 WHERE account_id=$1", [actor.accountId, new Date(this.now())]);
      const cancelled = (await db.query<{ from_id: string }>("UPDATE social_friend_requests SET state='CANCELLED' WHERE to_id=$1 AND state='PENDING' RETURNING from_id", [actor.accountId])).rows.map(r => r.from_id);
      return { value: await this.ensureSettings(db, actor.accountId), changed: [actor.accountId, ...cancelled] };
    });
  }
  async isBlocked(a: string, b: string, db: Pick<Pool, 'query'> | PoolClient = this.pool): Promise<boolean> {
    return (await db.query('SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1', [a, b])).rows.length > 0;
  }
  async canContact(a: string, b: string): Promise<boolean> { return a !== b && !await this.isBlocked(a, b); }
  async roomRelationships(viewer: string, targets: string[]) {
    if (targets.length > 100) throw new Error('Room relationship projection limit');
    const result = await this.pool.query<{ id: string; blocked: boolean; friends: boolean }>(`SELECT target AS id,
      EXISTS(SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=target) OR (blocker_id=target AND blocked_id=$1)) AS blocked,
      EXISTS(SELECT 1 FROM social_friendships WHERE low_id=LEAST($1::uuid,target) AND high_id=GREATEST($1::uuid,target)) AS friends
      FROM unnest($2::uuid[]) AS target`, [viewer, targets]);
    return new Map(result.rows.map(row => [row.id, { blocked: row.blocked, friends: row.friends }]));
  }
  private async requireCapacity(db: PoolClient, a: string, b: string) {
    for (const id of [a, b]) if (Number((await db.query('SELECT count(*) FROM social_friendships WHERE low_id=$1 OR high_id=$1', [id])).rows[0].count) >= 500) throw unavailable();
  }
  private async accept(db: PoolClient, row: RequestRow) {
    await this.requireCapacity(db, row.from_id, row.to_id); const [low, high] = this.pair(row.from_id, row.to_id);
    await db.query('INSERT INTO social_friendships VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [low, high, new Date(this.now())]);
    return (await db.query<RequestRow>("UPDATE social_friend_requests SET state='ACCEPTED' WHERE id=$1 RETURNING *", [row.id])).rows[0];
  }
  async request(token: string, key: string, contactCode: string): Promise<FriendRequestResult> {
    const target = (await this.pool.query<{ account_id: string }>('SELECT account_id FROM social_preferences WHERE contact_code=$1', [contactCode])).rows[0];
    if (!target) throw unavailable();
    return this.mutation(token, key, 'request', { contactCode }, [target.account_id], async (db, actor) => {
      const recipient = target.account_id;
      if (actor.accountId === recipient || await this.isBlocked(actor.accountId, recipient, db)) throw unavailable();
      const settings = (await db.query('SELECT request_policy FROM social_preferences WHERE account_id=$1 AND contact_code=$2', [recipient, contactCode])).rows[0];
      if (!settings || settings.request_policy !== 'code') throw unavailable();
      const [low, high] = this.pair(actor.accountId, recipient); const now = new Date(this.now());
      await db.query("UPDATE social_friend_requests SET state='EXPIRED' WHERE pair_low=$1 AND pair_high=$2 AND state='PENDING' AND expires_at<=$3", [low, high, now]);
      const pending = (await db.query<RequestRow>("SELECT * FROM social_friend_requests WHERE pair_low=$1 AND pair_high=$2 AND state='PENDING'", [low, high])).rows[0];
      if (pending) {
        const row = pending.from_id === actor.accountId ? pending : await this.accept(db, pending);
        return { value: this.result(row), changed: [actor.accountId, recipient] };
      }
      if (Number((await db.query("SELECT count(*) FROM social_friend_requests WHERE to_id=$1 AND state='PENDING' AND expires_at>$2", [recipient, now])).rows[0].count) >= 100) throw unavailable();
      const recent = (await db.query('SELECT count(*)::int AS count,min(created_at) AS earliest FROM social_friend_requests WHERE from_id=$1 AND created_at>$2', [actor.accountId, new Date(this.now() - DAY)])).rows[0];
      if (recent.count >= 20) throw new DomainError('RATE_LIMITED', 429, 'Please wait before sending more friend requests', Math.max(1, Math.ceil((new Date(recent.earliest).getTime() + DAY - this.now()) / 1000)));
      const friendship = (await db.query('SELECT 1 FROM social_friendships WHERE low_id=$1 AND high_id=$2', [low, high])).rows.length > 0;
      const row = (await db.query<RequestRow>('INSERT INTO social_friend_requests(id,from_id,to_id,state,target_code_hint,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [randomUUID(), actor.accountId, recipient, friendship ? 'ACCEPTED' : 'PENDING', contactCode.slice(-6), now, new Date(this.now() + 7 * DAY)])).rows[0];
      return { value: this.result(row), changed: [actor.accountId, recipient] };
    }, async (db, actor) => {
      if (actor.accountId === target.account_id || await this.isBlocked(actor.accountId, target.account_id, db)) throw unavailable();
      const current = (await db.query('SELECT request_policy FROM social_preferences WHERE account_id=$1 AND contact_code=$2', [target.account_id, contactCode])).rows[0];
      if (!current || current.request_policy !== 'code') throw unavailable();
    });
  }
  async respond(token: string, key: string, requestId: string, action: 'accept' | 'decline' | 'cancel'): Promise<FriendRequestResult> {
    const initial = await this.identity.authenticate(token);
    const reference = (await this.pool.query<RequestRow>('SELECT * FROM social_friend_requests WHERE id=$1 AND (from_id=$2 OR to_id=$2)', [requestId, initial.accountId])).rows[0];
    if (!reference) throw unavailable();
    return this.mutation(token, key, 'respond', { requestId, action }, [reference.from_id, reference.to_id], async (db, actor) => {
      let row = (await db.query<RequestRow>('SELECT * FROM social_friend_requests WHERE id=$1', [requestId])).rows[0]; if (!row) throw unavailable();
      if ((action === 'cancel' && actor.accountId !== row.from_id) || (action !== 'cancel' && actor.accountId !== row.to_id)) throw new DomainError('FORBIDDEN', 403, 'This action is not permitted');
      if (await this.isBlocked(row.from_id, row.to_id, db)) throw unavailable();
      if (row.state !== 'PENDING') return { value: this.result(row) };
      if (row.expires_at.getTime() <= this.now()) row = (await db.query<RequestRow>("UPDATE social_friend_requests SET state='EXPIRED' WHERE id=$1 RETURNING *", [row.id])).rows[0];
      else if (action === 'accept') row = await this.accept(db, row);
      else row = (await db.query<RequestRow>('UPDATE social_friend_requests SET state=$2 WHERE id=$1 RETURNING *', [row.id, action === 'decline' ? 'DECLINED' : 'CANCELLED'])).rows[0];
      return { value: this.result(row), changed: [row.from_id, row.to_id] };
    }, async db => { if (await this.isBlocked(reference.from_id, reference.to_id, db)) throw unavailable(); });
  }
  unfriend(token: string, key: string, targetId: string) {
    return this.mutation(token, key, 'unfriend', { targetId }, [targetId], async (db, actor) => {
      const [low, high] = this.pair(actor.accountId, targetId); await db.query('DELETE FROM social_friendships WHERE low_id=$1 AND high_id=$2', [low, high]);
      return { value: { removed: true }, changed: [actor.accountId, targetId] };
    });
  }
  block(token: string, key: string, targetId: string, blocked: boolean) {
    return this.mutation(token, key, 'block', { targetId, blocked }, [targetId], async (db, actor) => {
      if (actor.accountId === targetId) throw new DomainError('INVALID_REQUEST', 422, 'Choose another contact');
      const [low, high] = this.pair(actor.accountId, targetId);
      if (blocked) {
        const exists = (await this.identity.publicProfiles([targetId], db))[0];
        if (exists) {
          if (Number((await db.query('SELECT count(*) FROM social_blocks WHERE blocker_id=$1', [actor.accountId])).rows[0].count) >= 500 && !(await db.query('SELECT 1 FROM social_blocks WHERE blocker_id=$1 AND blocked_id=$2', [actor.accountId, targetId])).rows.length) throw new DomainError('RATE_LIMITED', 429, 'Block list limit reached');
          const known = (await db.query("SELECT 1 FROM social_friendships WHERE low_id=$1 AND high_id=$2 UNION ALL SELECT 1 FROM social_friend_requests WHERE from_id=$3 AND to_id=$4 AND state='PENDING' LIMIT 1", [low, high, targetId, actor.accountId])).rows.length > 0;
          await db.query('INSERT INTO social_blocks VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [actor.accountId, targetId, known ? exists.displayName : null, new Date(this.now())]);
        }
        await db.query('DELETE FROM social_friendships WHERE low_id=$1 AND high_id=$2', [low, high]);
        await db.query("UPDATE social_friend_requests SET state='CANCELLED' WHERE pair_low=$1 AND pair_high=$2 AND state='PENDING'", [low, high]);
      } else await db.query('DELETE FROM social_blocks WHERE blocker_id=$1 AND blocked_id=$2', [actor.accountId, targetId]);
      return { value: { blocked }, changed: [actor.accountId, targetId] };
    });
  }
  requests(token: string, cursor: string | undefined, limit: number) {
    return this.actorTx(token, [], async (db, actor) => {
      await db.query("UPDATE social_friend_requests SET state='EXPIRED' WHERE (from_id=$1 OR to_id=$1) AND state='PENDING' AND expires_at<=$2", [actor.accountId, new Date(this.now())]);
      const rows = (await db.query<RequestRow>("SELECT * FROM social_friend_requests WHERE (from_id=$1 OR to_id=$1) AND state='PENDING' AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3", [actor.accountId, cursor ?? null, limit + 1])).rows;
      const page = rows.slice(0, limit);
      const profiles = await this.identity.publicProfiles(page.filter(r => r.to_id === actor.accountId).map(r => r.from_id), db);
      return { schemaVersion: 1, nextCursor: rows.length > limit ? page.at(-1)!.id : null, items: page.map(row => ({ ...this.result(row), direction: row.to_id === actor.accountId ? 'incoming' : 'outgoing', sender: row.to_id === actor.accountId ? profiles.find(p => p.id === row.from_id) ?? null : null, codeHint: row.to_id === actor.accountId ? null : row.target_code_hint })) };
    });
  }
  friends(token: string, cursor: string | undefined, limit: number) {
    return this.actorTx(token, [], async (db, actor) => {
      const ids = (await db.query<{ id: string }>('SELECT CASE WHEN low_id=$1 THEN high_id ELSE low_id END AS id FROM social_friendships WHERE (low_id=$1 OR high_id=$1) AND ($2::uuid IS NULL OR (CASE WHEN low_id=$1 THEN high_id ELSE low_id END)>$2::uuid) ORDER BY id LIMIT $3', [actor.accountId, cursor ?? null, limit + 1])).rows.map(r => r.id);
      const page = ids.slice(0, limit); const profiles = await this.identity.publicProfiles(page, db); const items = [];
      for (const id of page) {
        if (await this.isBlocked(actor.accountId, id, db)) continue;
        const profile = profiles.find(p => p.id === id); if (!profile) continue;
        let activity: SharedActivity | null = null;
        try {
          const candidate = await this.presence.visibleActivity(actor.accountId, id);
          if (candidate && await this.identity.presenceVisible(actor.accountId, id, candidate.worldSlug, { friends: true, blocked: false }, db)) activity = SharedActivitySchema.parse(candidate);
        } catch { /* Unknown/unavailable activity is never reported as online/offline. */ }
        items.push({ profile, activity });
      }
      return { schemaVersion: 1, items, nextCursor: ids.length > limit ? page.at(-1)! : null };
    });
  }
  blocks(token: string) { return this.actorTx(token, [], async (db, actor) => ({ schemaVersion: 1, items: (await db.query('SELECT blocked_id AS "targetId",display_name_snapshot AS label FROM social_blocks WHERE blocker_id=$1 ORDER BY created_at DESC LIMIT 500', [actor.accountId])).rows })); }
  async exportAccount(accountId: string, db: PoolClient) {
    return { settings: (await db.query('SELECT contact_code,request_policy FROM social_preferences WHERE account_id=$1', [accountId])).rows[0] ?? null,
      requests: (await db.query('SELECT id,from_id,to_id,state,created_at,expires_at FROM social_friend_requests WHERE from_id=$1 OR to_id=$1', [accountId])).rows,
      friends: (await db.query('SELECT low_id,high_id,created_at FROM social_friendships WHERE low_id=$1 OR high_id=$1', [accountId])).rows,
      blocks: (await db.query('SELECT blocked_id,display_name_snapshot,created_at FROM social_blocks WHERE blocker_id=$1', [accountId])).rows };
  }
  async purgeExpired() {
    await this.pool.query("UPDATE social_friend_requests SET state='EXPIRED' WHERE state='PENDING' AND expires_at<=$1", [new Date(this.now())]);
    await this.pool.query("DELETE FROM social_friend_requests WHERE state<>'PENDING' AND expires_at<$1", [new Date(this.now() - 30 * DAY)]);
    await this.pool.query('DELETE FROM social_mutations WHERE created_at<$1', [new Date(this.now() - DAY)]);
  }
}
