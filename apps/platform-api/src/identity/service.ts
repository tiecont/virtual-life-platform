import { createHash, createHmac, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { PrivacySchema, type Me, type Privacy, type ProfileInput, type PublicProfile, type UpgradeInput } from '@virtual-city/contracts';
import type { Config } from '../config';
import { IdentityError, unauthorized } from './errors';
import { PasswordHasher, type PasswordRecord } from './passwords';
import { canViewPresence } from './policy';
import {lockAccounts} from './account-locks';
type DB = Pick<Pool, 'query'> | PoolClient;
type Session = { id: string; account_id: string; expires_at: Date; revoked_at: Date | null; revoked_reason: string | null; kind: 'guest' | 'registered'; status:'active'|'suspended'; display_name: string; avatar_key: PublicProfile['avatarKey'] };
export type IdentityContext = Readonly<{ accountId: string; sessionId: string; kind: 'guest' | 'registered'; expiresAt: number }>;
const defaults: Privacy = { presence: 'hidden', analyticsConsent: false, worldVisibility: { dating: 'hidden' } };
export class IdentityService {
  private exportOwners = new Map<string, (accountId: string, db: PoolClient) => Promise<unknown>>();
  registerExportOwner(owner: string, reader: (accountId: string, db: PoolClient) => Promise<unknown>) { if (this.exportOwners.has(owner)) throw new Error('Duplicate export owner'); this.exportOwners.set(owner, reader); }
  private deletionOwners = new Map<string, (id: string, db: PoolClient) => Promise<void>>();
  registerDeletionOwner(owner: string, handler: (id: string, db: PoolClient) => Promise<void>) { if (this.deletionOwners.has(owner)) throw new Error('Duplicate deletion owner'); this.deletionOwners.set(owner, handler); }
  private passwords = new PasswordHasher();
  private subscribers = new Set<(event: { accountId: string; sessionIds: string[] }) => void>();
  private changes = new Set<(accountId: string) => void>();
  private controlChanges=new Set<(accountId:string)=>void>();
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
  onChanged(listener: (accountId: string) => void) { this.changes.add(listener); return () => { this.changes.delete(listener); }; }
  onAccountControl(listener:(accountId:string)=>void){this.controlChanges.add(listener);return()=>{this.controlChanges.delete(listener);};}
  private changed(accountId: string) { for (const listener of this.changes) { try { listener(accountId); } catch { /* Readers always apply current identity policy. */ } } }
  private notify(accountId: string, sessionIds: string[]) { if (sessionIds.length === 0) return; for (const listener of this.subscribers) { try { listener({ accountId, sessionIds }); } catch { /* DB remains authoritative even if a consumer fails. */ } } }
  // Trusted operator adapter calls this only after its auth/effect/audit COMMIT.
  afterOperatorControl(accountId:string,sessionIds:string[],changed=true){
    this.notify(accountId,sessionIds);
    // Replays reconcile live transport from canonical session state after an
    // uncertain COMMIT acknowledgement, without storing session IDs in audit.
    for(const listener of this.controlChanges){try{listener(accountId);}catch{/* A later replay/command still rechecks canonical identity. */}}
    if(changed)this.changed(accountId);
  }
  private async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async lock(client: PoolClient, key: string) { await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]); }
  private async session(token: string, db: DB = this.pool, allowRevoked = false): Promise<Session> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw unauthorized();
    const result = await db.query<Session>('SELECT s.*, a.kind, a.status, p.display_name, p.avatar_key FROM identity_sessions s JOIN identity_accounts a ON a.id=s.account_id JOIN identity_profiles p ON p.account_id=a.id WHERE s.token_hash=$1', [this.hash(token)]);
    const row = result.rows[0];
    if (!row || row.status!=='active' || row.expires_at.getTime() <= this.now() || (!allowRevoked && row.revoked_at)) throw unauthorized();
    return row;
  }
  private async lockedSession(db: PoolClient, token: string, allowRevoked = false) {
    const initial = await this.session(token, db, true);
    await this.lockAccounts(db, [initial.account_id]);
    return this.session(token, db, allowRevoked);
  }
  // Internal platform transaction ports. Never handed to world/client modules.
  async lockAccounts(db: PoolClient, ids: string[]) {await lockAccounts(db, ids);}
  async contextInTransaction(db: PoolClient, token: string): Promise<IdentityContext> { const s = await this.session(token, db); return Object.freeze({ accountId: s.account_id, sessionId: s.id, kind: s.kind, expiresAt: s.expires_at.getTime() }); }
  async hasConnectedSession(accountId: string, sessionIds: string[]) { return Boolean((await this.pool.query("SELECT 1 FROM identity_sessions s JOIN identity_accounts a ON a.id=s.account_id WHERE s.account_id=$1 AND s.id=ANY($2::uuid[]) AND a.status='active' AND s.revoked_at IS NULL AND s.expires_at>$3 LIMIT 1", [accountId, sessionIds, new Date(this.now())])).rowCount); }
  // Trusted activity owner port. Called under the participant account lock.
  async connectedAuthority(db: PoolClient, accountId: string, sessionIds: string[]) {
    const row = (await db.query<{ until: Date | null }>("SELECT max(s.expires_at) AS until FROM identity_sessions s JOIN identity_accounts a ON a.id=s.account_id WHERE s.account_id=$1 AND s.id=ANY($2::uuid[]) AND a.kind='registered' AND a.status='active' AND s.revoked_at IS NULL AND s.expires_at>$3", [accountId, sessionIds, new Date(this.now())])).rows[0];
    return row.until?.getTime() ?? 0;
  }
  fingerprint(value: unknown) { return this.keyed('mutation:v1:' + JSON.stringify(value)); }
  async publicProfiles(ids: string[], db: DB = this.pool): Promise<PublicProfile[]> {
    if (ids.length > 100) throw new IdentityError('INVALID_REQUEST', 422, 'Too many profiles requested');
    return (await db.query<{ account_id: string; display_name: string; avatar_key: PublicProfile['avatarKey'] }>('SELECT account_id,display_name,avatar_key FROM identity_profiles WHERE account_id=ANY($1::uuid[])', [ids])).rows.map(row => ({ id: row.account_id, displayName: row.display_name, avatarKey: row.avatar_key }));
  }
  async presenceVisible(viewer: string, target: string, world: string, relationship: { blocked: boolean; friends: boolean }, db: DB = this.pool) {
    const row = (await db.query('SELECT choices FROM identity_privacy WHERE account_id=$1', [target])).rows[0];
    return row ? canViewPresence(viewer, target, world, PrivacySchema.parse(row.choices), relationship) : false;
  }
  async visibleRoomProfiles(viewer: string, ids: string[], world: string, relationships: Map<string, { blocked: boolean; friends: boolean }>): Promise<PublicProfile[]> {
    if (ids.length > 100) throw new Error('Room profile projection limit');
    const rows = await this.pool.query<{ account_id: string; display_name: string; avatar_key: PublicProfile['avatarKey']; choices: unknown }>('SELECT p.account_id,p.display_name,p.avatar_key,c.choices FROM identity_profiles p JOIN identity_privacy c ON c.account_id=p.account_id WHERE p.account_id=ANY($1::uuid[])', [ids]);
    return rows.rows.filter(row => canViewPresence(viewer, row.account_id, world, PrivacySchema.parse(row.choices), relationships.get(row.account_id) ?? { blocked: true, friends: false }))
      .map(row => ({ id: row.account_id, displayName: row.display_name, avatarKey: row.avatar_key }));
  }
  private public(session: Session): PublicProfile { return { id: session.account_id, displayName: session.display_name, avatarKey: session.avatar_key }; }
  private view(session: Session, token: string): Me { return { profile: this.public(session), kind: session.kind, expiresAt: session.expires_at.toISOString(), csrfToken: this.csrf(token) }; }
  async authenticate(token: string): Promise<IdentityContext> { const s = await this.session(token); return Object.freeze({ accountId: s.account_id, sessionId: s.id, kind: s.kind, expiresAt: s.expires_at.getTime() }); }
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
    const result = await this.tx(async db => {
      const session = await this.lockedSession(db, token);
      const old = await this.previous(db, session, requestId, 'profile', input);
      if (old !== undefined) return { ...this.view(session, token), profile: old as PublicProfile };
      const profile: PublicProfile = { id: session.account_id, displayName: input.displayName ?? session.display_name, avatarKey: input.avatarKey ?? session.avatar_key };
      await db.query('UPDATE identity_profiles SET display_name=$2,avatar_key=$3 WHERE account_id=$1', [session.account_id, profile.displayName, profile.avatarKey]);
      await this.remember(db, session, requestId, 'profile', input, profile);
      return { ...this.view(session, token), profile };
    });
    this.changed(result.profile.id); return result;
  }
  async privacy(token: string): Promise<Privacy> { const s = await this.session(token); return PrivacySchema.parse((await this.pool.query('SELECT choices FROM identity_privacy WHERE account_id=$1', [s.account_id])).rows[0].choices); }
  async updatePrivacy(token: string, requestId: string, input: Privacy): Promise<Privacy> {
    let accountId = '';
    const result = await this.tx(async db => {
      const s = await this.lockedSession(db, token); const prior = await this.previous(db, s, requestId, 'privacy', input);
      accountId = s.account_id;
      if (prior !== undefined) return PrivacySchema.parse(prior);
      await db.query('UPDATE identity_privacy SET choices=$2 WHERE account_id=$1', [s.account_id, input]);
      await db.query('INSERT INTO identity_consents VALUES($1,$2,$3,$4)', [randomUUID(), s.account_id, 'privacy.updated.v1', new Date(this.now())]);
      await this.remember(db, s, requestId, 'privacy', input, input); return input;
    });
    this.changed(accountId); return result;
  }
  async rotate(token: string, requestId: string) {
    const result = await this.tx(async db => {
      const old = await this.lockedSession(db, token, true);
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
      const s = await this.lockedSession(db, token, true); const prior = await this.previous(db, s, requestId, 'logout', {});
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
      const s = await this.lockedSession(db, token);
      return this.exportForPrivacy(db,s.account_id);
    });
  }
  // Trusted identity-owned privacy port; caller holds the canonical account lock
  // and has separately verified the request's owner, purpose and approval.
  async exportForPrivacy(db:PoolClient,accountId:string){
    const profile=(await db.query<{kind:'guest'|'registered';display_name:string;avatar_key:PublicProfile['avatarKey']}>('SELECT a.kind,p.display_name,p.avatar_key FROM identity_accounts a JOIN identity_profiles p ON p.account_id=a.id WHERE a.id=$1',[accountId])).rows[0];if(!profile)throw unauthorized();
      const choices = (await db.query('SELECT choices FROM identity_privacy WHERE account_id=$1', [accountId])).rows[0].choices;
      const consents = (await db.query('SELECT action,created_at FROM identity_consents WHERE account_id=$1 ORDER BY created_at', [accountId])).rows;
      const credentials = (await db.query<{ login_name: string }>('SELECT login_name FROM identity_credentials WHERE account_id=$1', [accountId])).rows[0];
      const domains: Record<string, unknown> = {};
      for (const [owner, reader] of this.exportOwners) domains[owner] = await reader(accountId, db);
      return { schemaVersion: 1, profile: {id:accountId,displayName:profile.display_name,avatarKey:profile.avatar_key}, kind: profile.kind, privacy: PrivacySchema.parse(choices), consents, ...(Object.keys(domains).length ? { domains } : {}), ...(credentials ? { signInName: credentials.login_name } : {}) };
  }
  async eraseForPrivacy(db:PoolClient,accountId:string){
    const sessions=(await db.query<{id:string}>('SELECT id FROM identity_sessions WHERE account_id=$1',[accountId])).rows.map(row=>row.id);
    for(const handler of this.deletionOwners.values())await handler(accountId,db);
    await db.query('DELETE FROM identity_accounts WHERE id=$1',[accountId]);return sessions;
  }
  async verifyPrivacyOwner(loginName:string,password:string){
    const row=(await this.pool.query<PasswordRecord & {account_id:string;login_name:string}>('SELECT account_id,login_name,salt,digest FROM identity_credentials WHERE login_name=$1',[loginName])).rows[0];
    return await this.passwords.verify(password,row)?row:undefined;
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
      const s = await this.lockedSession(db, token);
      const sessions = (await db.query<{ id: string }>('SELECT id FROM identity_sessions WHERE account_id=$1', [s.account_id])).rows.map(row => row.id);
      await db.query('INSERT INTO identity_deletion_receipts VALUES($1,$2,$3)', [this.hash(token), receiptHash, new Date(this.now() + 86400000)]);
      for (const handler of this.deletionOwners.values()) await handler(s.account_id, db);
      await db.query('DELETE FROM identity_accounts WHERE id=$1', [s.account_id]);
      return { accountId: s.account_id, sessions };
    });
    if (result) this.notify(result.accountId, result.sessions); return { deleted: true };
  }
  async upgrade(token: string, requestId: string, input: UpgradeInput) {
    const original = await this.session(token, this.pool, true);
    const nextToken = this.keyed('upgrade-token:v1:' + token + ':' + requestId);
    const prior = await this.previous(this.pool, original, requestId, 'upgrade', input);
    if (prior !== undefined) {
      if (original.revoked_reason !== 'upgrade') throw unauthorized();
      return { token: nextToken, me: this.view(await this.session(nextToken), nextToken) };
    }
    if (original.revoked_at) throw unauthorized();
    if (original.kind !== 'guest') throw new IdentityError('INVALID_REQUEST', 409, 'This identity is already registered');
    const credential = await this.passwords.hash(input.password);
    let result;
    try {
      result = await this.tx(async db => {
        const old = await this.lockedSession(db, token, true);
        const prior = await this.previous(db, old, requestId, 'upgrade', input);
        if (prior !== undefined) {
          if (old.revoked_reason !== 'upgrade') throw unauthorized();
          return { token: nextToken, me: this.view(await this.session(nextToken, db), nextToken), accountId: old.account_id, revoked: [] as string[] };
        }
        if (old.revoked_at) throw unauthorized();
        if (old.kind !== 'guest') throw new IdentityError('INVALID_REQUEST', 409, 'This identity is already registered');
        await db.query('INSERT INTO identity_credentials(account_id,login_name,salt,digest) VALUES($1,$2,$3,$4)', [old.account_id, input.loginName, credential.salt, credential.digest]);
        await db.query("UPDATE identity_accounts SET kind='registered' WHERE id=$1", [old.account_id]);
        const revoked = (await db.query<{ id: string }>("UPDATE identity_sessions SET revoked_at=$2,revoked_reason='upgrade' WHERE account_id=$1 AND revoked_at IS NULL RETURNING id", [old.account_id, new Date(this.now())])).rows.map(row => row.id);
        const id = randomUUID();
        await db.query('INSERT INTO identity_sessions(id,account_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5)', [id, old.account_id, this.hash(nextToken), new Date(this.now() + this.config.SESSION_TTL_SECONDS * 1000), new Date(this.now())]);
        await this.remember(db, old, requestId, 'upgrade', input, { sessionId: id });
        await db.query('INSERT INTO identity_consents VALUES($1,$2,$3,$4)', [randomUUID(), old.account_id, 'account.upgraded.password.v1', new Date(this.now())]);
        return { token: nextToken, me: this.view(await this.session(nextToken, db), nextToken), accountId: old.account_id, revoked };
      });
    } catch (error) {
      if (typeof error === 'object' && error && 'constraint' in error && error.constraint === 'identity_credentials_login_name_key') throw new IdentityError('NAME_UNAVAILABLE', 409, 'That sign-in name is unavailable');
      throw error;
    }
    this.notify(result.accountId, result.revoked); return result;
  }
  async login(input: UpgradeInput & { requestId: string }, existingToken?: string) {
    const record = (await this.pool.query<PasswordRecord & { account_id: string }>('SELECT account_id,salt,digest FROM identity_credentials WHERE login_name=$1', [input.loginName])).rows[0];
    if (!await this.passwords.verify(input.password, record)) throw unauthorized();
    const requestHash = this.keyed('login-request:v1:' + input.loginName + ':' + input.requestId);
    const fingerprint = this.keyed('login-input:v1:' + JSON.stringify(input));
    const result = await this.tx(async db => {
      await this.lock(db, 'login:' + requestHash);
      let old: Session | undefined;
      if (existingToken) { try { old = await this.session(existingToken, db); } catch (e) { if (!(e instanceof IdentityError)) throw e; } }
      for (const id of [...new Set([record.account_id, ...(old ? [old.account_id] : [])])].sort()) await this.lock(db, 'account:' + id);
      const current = (await db.query<PasswordRecord>('SELECT salt,digest FROM identity_credentials WHERE account_id=$1', [record.account_id])).rows[0];
      if (!current || current.salt !== record.salt || current.digest !== record.digest) throw unauthorized();
      if(!(await db.query("SELECT 1 FROM identity_accounts WHERE id=$1 AND status='active'",[record.account_id])).rowCount)throw unauthorized();
      const previous = (await db.query('SELECT * FROM identity_login_requests WHERE request_hash=$1', [requestHash])).rows[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new IdentityError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
        if (!previous.session_id || previous.expires_at.getTime() <= this.now()) throw unauthorized();
        const token = this.keyed('login-token:v1:' + requestHash + ':' + previous.server_nonce);
        return { token, me: this.view(await this.session(token, db), token), revocations: [] as { accountId: string; sessionIds: string[] }[] };
      }
      const nonce = randomBytes(32).toString('hex'); const token = this.keyed('login-token:v1:' + requestHash + ':' + nonce);
      const expires = new Date(this.now() + this.config.SESSION_TTL_SECONDS * 1000); const id = randomUUID();
      const revocations: { accountId: string; sessionIds: string[] }[] = [];
      if (old) {
        const revoked = await db.query<{ id: string }>("UPDATE identity_sessions SET revoked_at=$2,revoked_reason='login' WHERE id=$1 AND revoked_at IS NULL RETURNING id", [old.id, new Date(this.now())]);
        if (revoked.rows.length) revocations.push({ accountId: old.account_id, sessionIds: [old.id] });
      }
      const active = (await db.query<{ id: string }>('SELECT id FROM identity_sessions WHERE account_id=$1 AND revoked_at IS NULL AND expires_at>$2 ORDER BY creation_order', [record.account_id, new Date(this.now())])).rows;
      const removed = active.slice(0, Math.max(0, active.length - 9)).map(row => row.id);
      if (removed.length) { await db.query("UPDATE identity_sessions SET revoked_at=$2,revoked_reason='login' WHERE id=ANY($1::uuid[])", [removed, new Date(this.now())]); revocations.push({ accountId: record.account_id, sessionIds: removed }); }
      await db.query('INSERT INTO identity_sessions(id,account_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5)', [id, record.account_id, this.hash(token), expires, new Date(this.now())]);
      await db.query('INSERT INTO identity_login_requests VALUES($1,$2,$3,$4,$5)', [requestHash, nonce, fingerprint, id, expires]);
      return { token, me: this.view(await this.session(token, db), token), revocations };
    });
    for (const revoked of result.revocations) this.notify(revoked.accountId, revoked.sessionIds);
    return result;
  }
  async purgeExpired() {
    const expired = await this.tx(async db => {
      await this.lock(db, 'identity:maintenance');
      const expired = (await db.query<{ id: string; account_id: string }>('DELETE FROM identity_sessions WHERE expires_at <= $1 RETURNING id,account_id', [new Date(this.now())])).rows;
      await db.query('DELETE FROM identity_login_requests WHERE expires_at <= $1', [new Date(this.now())]);
      await db.query('DELETE FROM identity_bootstraps WHERE expires_at <= $1', [new Date(this.now())]);
      await db.query('DELETE FROM identity_deletion_receipts WHERE expires_at <= $1', [new Date(this.now())]);
      await db.query('DELETE FROM identity_mutations WHERE created_at < $1', [new Date(this.now() - 86400000)]);
      const stale = (await db.query<{ id: string }>("SELECT a.id FROM identity_accounts a WHERE kind='guest' AND NOT EXISTS(SELECT 1 FROM identity_sessions s WHERE s.account_id=a.id AND s.revoked_at IS NULL AND s.expires_at>$1) ORDER BY a.id", [new Date(this.now())])).rows;
      for (const account of stale) {
        await this.lockAccounts(db, [account.id]);
        const stillStale = (await db.query("SELECT 1 FROM identity_accounts a WHERE a.id=$1 AND a.kind='guest' AND NOT EXISTS(SELECT 1 FROM identity_sessions s WHERE s.account_id=a.id AND s.revoked_at IS NULL AND s.expires_at>$2)", [account.id, new Date(this.now())])).rowCount;
        if (!stillStale) continue;
        for (const handler of this.deletionOwners.values()) await handler(account.id, db);
        await db.query('DELETE FROM identity_accounts WHERE id=$1', [account.id]);
      }
      return expired;
    });
    for (const session of expired) this.notify(session.account_id, [session.id]);
    return expired.length;
  }

}
