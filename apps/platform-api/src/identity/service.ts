import { createHash, createHmac, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { PrivacySchema, type Me, type Privacy, type ProfileInput, type PublicProfile } from '@virtual-city/contracts';
import type { Config } from '../config';
import { IdentityError, unauthorized } from './errors';
type DB = Pick<Pool, 'query'> | PoolClient;
type Session = { id: string; account_id: string; expires_at: Date; revoked_at: Date | null; revoked_reason: string | null; kind: 'guest' | 'registered'; display_name: string; avatar_key: PublicProfile['avatarKey'] };
export type IdentityContext = Readonly<{ accountId: string; sessionId: string; kind: 'guest' | 'registered' }>;
const defaults: Privacy = { presence: 'hidden', analyticsConsent: false, worldVisibility: { dating: 'hidden' } };
export class IdentityService {
  private subscribers = new Set<(event: { accountId: string; sessionIds: string[] }) => void>();
  constructor(readonly pool: Pick<Pool, 'query' | 'connect'>, private config: Config, private now = Date.now) {}
  hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private keyed(value: string) { return createHmac('sha256', this.config.SESSION_SECRET).update(value).digest('hex'); }
  csrf(token: string) { return this.keyed('csrf:v1:' + token); }
  verifyCsrf(token: string, header: unknown) {
    if (typeof header !== 'string') throw new IdentityError('FORBIDDEN', 403, 'CSRF validation failed');
    const actual = Buffer.from(header); const expected = Buffer.from(this.csrf(token));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new IdentityError('FORBIDDEN', 403, 'CSRF validation failed');
  }
  onRevoked(listener: (event: { accountId: string; sessionIds: string[] }) => void) { this.subscribers.add(listener); return () => { this.subscribers.delete(listener); }; }
  private notify(accountId: string, sessionIds: string[]) { if (sessionIds.length === 0) return; for (const listener of this.subscribers) { try { listener({ accountId, sessionIds }); } catch { /* DB remains authoritative even if a consumer fails. */ } } }
  private async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async lock(client: PoolClient, key: string) { await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]); }
  private async session(token: string, db: DB = this.pool, allowRevoked = false): Promise<Session> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw unauthorized();
    const result = await db.query<Session>('SELECT s.*, a.kind, p.display_name, p.avatar_key FROM identity_sessions s JOIN identity_accounts a ON a.id=s.account_id JOIN identity_profiles p ON p.account_id=a.id WHERE s.token_hash=$1', [this.hash(token)]);
    const row = result.rows[0];
    if (!row || row.expires_at.getTime() <= this.now() || (!allowRevoked && row.revoked_at)) throw unauthorized();
    return row;
  }
  private public(session: Session): PublicProfile { return { id: session.account_id, displayName: session.display_name, avatarKey: session.avatar_key }; }
  private view(session: Session, token: string): Me { return { profile: this.public(session), kind: session.kind, expiresAt: session.expires_at.toISOString(), csrfToken: this.csrf(token) }; }
  async authenticate(token: string): Promise<IdentityContext> { const s = await this.session(token); return Object.freeze({ accountId: s.account_id, sessionId: s.id, kind: s.kind }); }
  async me(token: string): Promise<Me> { return this.view(await this.session(token), token); }
  async guest(input: ProfileInput & { requestId: string }, existingToken?: string) {
    if (existingToken) { try { return { me: await this.me(existingToken), token: existingToken, created: false }; } catch (e) { if (!(e instanceof IdentityError)) throw e; } }
    const key = this.keyed('bootstrap:v1:' + input.requestId);
    const fingerprint = this.keyed('profile:' + JSON.stringify({ displayName: input.displayName, avatarKey: input.avatarKey }));
    return this.tx(async db => {
      await this.lock(db, 'bootstrap:' + key);
      const previous = await db.query<{ fingerprint: string; server_nonce: string; session_id: string | null; expires_at: Date }>('SELECT * FROM identity_bootstraps WHERE request_hash=$1', [key]);
      if (previous.rows[0]) {
        const old = previous.rows[0];
        if (old.fingerprint !== fingerprint) throw new IdentityError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
        if (!old.session_id || old.expires_at.getTime() <= this.now()) throw unauthorized();
        const token = this.keyed('guest-token:v1:' + input.requestId + ':' + old.server_nonce);
        return { me: this.view(await this.session(token, db), token), token, created: false };
      }
      const nonce = randomBytes(32).toString('hex');
      const token = this.keyed('guest-token:v1:' + input.requestId + ':' + nonce);
      const account = randomUUID(); const sessionId = randomUUID(); const now = new Date(this.now()); const expires = new Date(this.now() + this.config.SESSION_TTL_SECONDS * 1000);
      await db.query('INSERT INTO identity_accounts(id,created_at) VALUES($1,$2)', [account, now]);
      await db.query('INSERT INTO identity_profiles VALUES($1,$2,$3)', [account, input.displayName, input.avatarKey]);
      await db.query('INSERT INTO identity_privacy VALUES($1,$2)', [account, defaults]);
      await db.query('INSERT INTO identity_sessions(id,account_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5)', [sessionId, account, this.hash(token), expires, now]);
      await db.query('INSERT INTO identity_bootstraps VALUES($1,$2,$3,$4,$5)', [key, nonce, fingerprint, sessionId, expires]);
      return { me: this.view(await this.session(token, db), token), token, created: true };
    });
  }
  private async previous(db: DB, session: Session, requestId: string, operation: string, body: unknown): Promise<unknown | undefined> {
    const fingerprint = this.keyed(operation + ':' + JSON.stringify(body));
    const prior = await db.query('SELECT * FROM identity_mutations WHERE account_id=$1 AND request_id=$2', [session.account_id, requestId]);
    if (!prior.rows[0]) return undefined;
    if (prior.rows[0].operation !== operation || prior.rows[0].fingerprint !== fingerprint || prior.rows[0].session_id !== session.id) throw new IdentityError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
    return prior.rows[0].result;
  }
  private async remember(db: DB, session: Session, requestId: string, operation: string, body: unknown, result: unknown) {
    await db.query('INSERT INTO identity_mutations VALUES($1,$2,$3,$4,$5,$6,$7)', [session.account_id, requestId, session.id, operation, this.keyed(operation + ':' + JSON.stringify(body)), JSON.stringify(result), new Date(this.now())]);
  }
  async updateProfile(token: string, requestId: string, input: Partial<ProfileInput>): Promise<Me> {
    return this.tx(async db => {
      await this.lock(db, 'session:' + this.hash(token));
      const session = await this.session(token, db);
      const old = await this.previous(db, session, requestId, 'profile', input);
      if (old !== undefined) return { ...this.view(session, token), profile: old as PublicProfile };
      const profile: PublicProfile = { id: session.account_id, displayName: input.displayName ?? session.display_name, avatarKey: input.avatarKey ?? session.avatar_key };
      await db.query('UPDATE identity_profiles SET display_name=$2,avatar_key=$3 WHERE account_id=$1', [session.account_id, profile.displayName, profile.avatarKey]);
      await this.remember(db, session, requestId, 'profile', input, profile);
      return { ...this.view(session, token), profile };
    });
  }
  async privacy(token: string): Promise<Privacy> { const s = await this.session(token); return PrivacySchema.parse((await this.pool.query('SELECT choices FROM identity_privacy WHERE account_id=$1', [s.account_id])).rows[0].choices); }
  async updatePrivacy(token: string, requestId: string, input: Privacy): Promise<Privacy> {
    return this.tx(async db => {
      await this.lock(db, 'session:' + this.hash(token));
      const s = await this.session(token, db); const prior = await this.previous(db, s, requestId, 'privacy', input);
      if (prior !== undefined) return PrivacySchema.parse(prior);
      await db.query('UPDATE identity_privacy SET choices=$2 WHERE account_id=$1', [s.account_id, input]);
      await db.query('INSERT INTO identity_consents VALUES($1,$2,$3,$4)', [randomUUID(), s.account_id, 'privacy.updated.v1', new Date(this.now())]);
      await this.remember(db, s, requestId, 'privacy', input, input); return input;
    });
  }
  async rotate(token: string, requestId: string) {
    const result = await this.tx(async db => {
      await this.lock(db, 'session:' + this.hash(token));
      const old = await this.session(token, db, true);
      const prior = await this.previous(db, old, requestId, 'rotate', {});
      const nextToken = this.keyed('rotate-token:v1:' + token + ':' + requestId);
      if (prior !== undefined) {
        if (old.revoked_reason !== 'rotate') throw unauthorized();
        return { me: this.view(await this.session(nextToken, db), nextToken), token: nextToken, accountId: old.account_id, revoked: [] as string[] };
      }
      if (old.revoked_at) throw unauthorized();
      await db.query("UPDATE identity_sessions SET revoked_at=$2,revoked_reason='rotate' WHERE id=$1", [old.id, new Date(this.now())]);
      const newId = randomUUID();
      await db.query('INSERT INTO identity_sessions(id,account_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5)', [newId, old.account_id, this.hash(nextToken), new Date(this.now() + this.config.SESSION_TTL_SECONDS * 1000), new Date(this.now())]);
      await this.remember(db, old, requestId, 'rotate', {}, { sessionId: newId });
      return { me: this.view(await this.session(nextToken, db), nextToken), token: nextToken, accountId: old.account_id, revoked: [old.id] };
    });
    this.notify(result.accountId, result.revoked); return result;
  }
  async logout(token: string, requestId: string) {
    const result = await this.tx(async db => {
      await this.lock(db, 'session:' + this.hash(token));
      const s = await this.session(token, db, true); const prior = await this.previous(db, s, requestId, 'logout', {});
      if (prior !== undefined && s.revoked_reason === 'logout') return { accountId: s.account_id, revoked: [] as string[] };
      if (s.revoked_at) throw unauthorized();
      await db.query("UPDATE identity_sessions SET revoked_at=$2,revoked_reason='logout' WHERE id=$1", [s.id, new Date(this.now())]);
      await this.remember(db, s, requestId, 'logout', {}, { loggedOut: true });
      return { accountId: s.account_id, revoked: [s.id] };
    });
    this.notify(result.accountId, result.revoked); return { loggedOut: true };
  }
  async export(token: string) {
    return this.tx(async db => {
      const s = await this.session(token, db);
      const choices = (await db.query('SELECT choices FROM identity_privacy WHERE account_id=$1', [s.account_id])).rows[0].choices;
      const consents = (await db.query('SELECT action,created_at FROM identity_consents WHERE account_id=$1 ORDER BY created_at', [s.account_id])).rows;
      return { schemaVersion: 1, profile: this.public(s), kind: s.kind, privacy: PrivacySchema.parse(choices), consents };
    });
  }
  async delete(token: string, requestId: string) {
    const receiptHash = this.keyed('delete:v1:' + requestId);
    const result = await this.tx(async db => {
      await this.lock(db, 'session:' + this.hash(token));
      const receipt = await db.query('SELECT * FROM identity_deletion_receipts WHERE token_hash=$1 AND expires_at>$2', [this.hash(token), new Date(this.now())]);
      if (receipt.rows[0]) {
        if (receipt.rows[0].request_hash !== receiptHash) throw unauthorized();
        return null;
      }
      const s = await this.session(token, db);
      const sessions = (await db.query<{ id: string }>('SELECT id FROM identity_sessions WHERE account_id=$1', [s.account_id])).rows.map(row => row.id);
      await db.query('INSERT INTO identity_deletion_receipts VALUES($1,$2,$3)', [this.hash(token), receiptHash, new Date(this.now() + 86400000)]);
      await db.query('DELETE FROM identity_accounts WHERE id=$1', [s.account_id]);
      return { accountId: s.account_id, sessions };
    });
    if (result) this.notify(result.accountId, result.sessions); return { deleted: true };
  }
  async purgeExpired() {
    const expired = await this.tx(async db => {
      await this.lock(db, 'identity:maintenance');
      const expired = (await db.query<{ id: string; account_id: string }>('DELETE FROM identity_sessions WHERE expires_at <= $1 RETURNING id,account_id', [new Date(this.now())])).rows;
      await db.query('DELETE FROM identity_bootstraps WHERE expires_at <= $1', [new Date(this.now())]);
      await db.query('DELETE FROM identity_deletion_receipts WHERE expires_at <= $1', [new Date(this.now())]);
      await db.query('DELETE FROM identity_mutations WHERE created_at < $1', [new Date(this.now() - 86400000)]);
      await db.query("DELETE FROM identity_accounts a WHERE kind='guest' AND NOT EXISTS(SELECT 1 FROM identity_sessions s WHERE s.account_id=a.id AND s.revoked_at IS NULL AND s.expires_at>$1)", [new Date(this.now())]);
      return expired;
    });
    for (const session of expired) this.notify(session.account_id, [session.id]);
    return expired.length;
  }

}
