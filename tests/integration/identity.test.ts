import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { MeSchema, PrivacySchema, ApiErrorSchema, type Me } from '@virtual-city/contracts';
let pool: Pool; let admin: Pool; let server: Awaited<ReturnType<typeof createApp>>;
let now = Date.now(); let nextIP = 1;
const schema = 'identity_test_' + randomUUID().replaceAll('-', '');
const origin = 'http://127.0.0.1:3300';
const cookie = (response: { headers: Record<string, unknown> }) => String(Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'][0] : response.headers['set-cookie']).split(';')[0];
const key = () => randomUUID();
beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: url.toString() }); await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options', '-c search_path=' + schema);
  pool = new Pool({ connectionString: url.toString() }); await migrate(pool);
  server = await createApp(readConfig({ NODE_ENV: 'test', SESSION_SECRET: 'test-only-session-secret-not-production-0001', SESSION_TTL_SECONDS: '300', DATABASE_URL: url.toString() }), pool, false, { now: () => now });
});
afterAll(async () => { await server?.app.close(); await pool?.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } });
async function guest(displayName = 'City Visitor') {
  const input = { requestId: key(), displayName, avatarKey: 'fern' };
  const response = await server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, remoteAddress: '127.0.1.' + nextIP++, payload: input });
  expect(response.statusCode).toBe(201);
  return { cookie: cookie(response), me: MeSchema.parse(response.json()), input, response };
}
function headers(user: { cookie: string; me: Me }, id = key()) { return { origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': id }; }
describe('M03 identity over HTTP and real PostgreSQL', () => {
  it('concurrent guest retries create one identity, store hashes and return a host-only HttpOnly cookie', async () => {
    const input = { requestId: key(), displayName: 'First Visitor', avatarKey: 'mint' };
    const request = () => server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, remoteAddress: '127.0.3.1', payload: input });
    const replies = await Promise.all([request(), request()]);
    expect(replies.map(r => r.statusCode).sort()).toEqual([200, 201]);
    const a = MeSchema.parse(replies[0].json()); const b = MeSchema.parse(replies[1].json());
    expect(a).toEqual(b); expect(cookie(replies[0])).toBe(cookie(replies[1]));
    const set = String(replies[0].headers['set-cookie']); expect(set).toContain('HttpOnly'); expect(set).toContain('SameSite=Lax'); expect(set).not.toContain('Domain=');
    const rawToken = decodeURIComponent(cookie(replies[0]).split('=')[1]).split('.')[0];
    const rows = (await pool.query('SELECT token_hash FROM identity_sessions WHERE account_id=$1', [a.profile.id])).rows;
    expect(rows).toHaveLength(1); expect(rows[0].token_hash).not.toBe(rawToken); expect(rows[0].token_hash).toBe(server.identity.hash(rawToken));
    const conflict = await server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, remoteAddress: '127.0.3.1', payload: { ...input, displayName: 'Different' } });
    expect(conflict.statusCode).toBe(409);
  });
  it('rejects legacy/tampered credentials and incompatible legacy request bodies', async () => {
    for (const value of ['deadline_session=not-a-city-session', 'maid_session=legacy', 'city_session=tampered']) {
      expect((await server.http.inject({ url: '/v1/me', headers: { cookie: value } })).statusCode).toBe(401);
    }
    const legacy = await server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, payload: { requestId: key(), nickname: 'Visitor', avatar: 'sakura' } });
    expect(legacy.statusCode).toBe(422);
  });
  it('persists one identity across reload and refuses bootstrap identity switching in another tab', async () => {
    const user = await guest();
    expect(MeSchema.parse((await server.http.inject({ url: '/v1/me', headers: { cookie: user.cookie } })).json())).toEqual(user.me);
    const secondTab = await server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin, cookie: user.cookie }, payload: { requestId: key(), displayName: 'Attempted Switch', avatarKey: 'rose' } });
    expect(secondTab.statusCode).toBe(200); expect(secondTab.json().profile.id).toBe(user.me.profile.id); expect(secondTab.json().profile.displayName).toBe(user.me.profile.displayName);
  });
  it('enforces Origin, CSRF, strict payloads and profile idempotency without private response fields', async () => {
    const user = await guest();
    expect((await server.http.inject({ method: 'PATCH', url: '/v1/me', headers: { ...headers(user), origin: 'https://attacker.example' }, payload: { displayName: 'Invalid' } })).statusCode).toBe(403);
    expect((await server.http.inject({ method: 'PATCH', url: '/v1/me', headers: { ...headers(user), 'x-csrf-token': '💥'.repeat(32) }, payload: { displayName: 'Invalid' } })).statusCode).toBe(403);
    const forged = await server.http.inject({ method: 'PATCH', url: '/v1/me', headers: headers(user), payload: { displayName: 'Owner', role: 'moderator', id: key() } });
    expect(forged.statusCode).toBe(422); ApiErrorSchema.parse(forged.json());
    const id = key(); const patch = () => server.http.inject({ method: 'PATCH', url: '/v1/me', headers: headers(user, id), payload: { displayName: 'New Name' } });
    const [a, b] = await Promise.all([patch(), patch()]); expect(a.statusCode).toBe(200); expect(a.json()).toEqual(b.json());
    expect(MeSchema.parse(a.json()).profile.displayName).toBe('New Name');
    const conflict = await server.http.inject({ method: 'PATCH', url: '/v1/me', headers: headers(user, id), payload: { displayName: 'Changed Request' } });
    expect(conflict.statusCode).toBe(409);
    expect((await pool.query('SELECT count(*)::int AS n FROM identity_mutations WHERE account_id=$1', [user.me.profile.id])).rows[0].n).toBe(1);
  });
  it('keeps privacy separate, defaults hidden and exports only own allowlisted data', async () => {
    const user = await guest('Private Visitor'); const other = await guest('Other Visitor');
    const privacy = await server.http.inject({ url: '/v1/me/privacy', headers: { cookie: user.cookie } });
    expect(PrivacySchema.parse(privacy.json()).presence).toBe('hidden');
    const choices = { presence: 'friends', analyticsConsent: false, worldVisibility: { dating: 'hidden', deadline: 'public' } };
    const id = key(); const save = () => server.http.inject({ method: 'PATCH', url: '/v1/me/privacy', headers: headers(user, id), payload: choices });
    expect((await save()).statusCode).toBe(200); expect((await save()).statusCode).toBe(200);
    expect((await pool.query('SELECT count(*)::int AS n FROM identity_consents WHERE account_id=$1', [user.me.profile.id])).rows[0].n).toBe(1);
    expect((await server.http.inject({ method: 'PATCH', url: '/v1/me/privacy', headers: headers(user), payload: { ...choices, worldVisibility: { dating: 'public' } } })).statusCode).toBe(422);
    const exported = await server.http.inject({ url: '/v1/me/export', headers: { cookie: user.cookie } });
    expect(exported.statusCode).toBe(200); expect(exported.json().profile.id).toBe(user.me.profile.id);
    expect(exported.body).not.toContain(other.me.profile.id); expect(exported.body).not.toContain('token_hash'); expect(exported.body).not.toContain('csrfToken'); expect(exported.body).not.toContain('SESSION_SECRET');
    expect((await server.http.inject({ url: '/v1/users/' + other.me.profile.id + '/privacy', headers: { cookie: user.cookie } })).statusCode).toBe(404);
  });
  it('rotates atomically, replays the same rotation and notifies revocation after commit', async () => {
    const user = await guest(); const events: unknown[] = []; const unsub = server.identity.onRevoked(e => events.push(e));
    try {
      const id = key(); const rotate = () => server.http.inject({ method: 'POST', url: '/v1/session/rotate', headers: headers(user, id), payload: {} });
      const [a, b] = await Promise.all([rotate(), rotate()]); expect(a.statusCode).toBe(200); expect(b.statusCode).toBe(200); expect(cookie(a)).toBe(cookie(b));
      expect(a.json().profile.id).toBe(user.me.profile.id); expect(cookie(a)).not.toBe(user.cookie);
      expect((await server.http.inject({ url: '/v1/me', headers: { cookie: user.cookie } })).statusCode).toBe(401);
      expect((await server.http.inject({ url: '/v1/me', headers: { cookie: cookie(a) } })).statusCode).toBe(200);
      expect(events.filter((e: unknown) => (e as { sessionIds: string[] }).sessionIds.length)).toHaveLength(1);
      expect((await server.http.inject({ method: 'POST', url: '/v1/session/rotate', headers: headers(user), payload: {} })).statusCode).toBe(401);
    } finally { unsub(); }
  });
  it('logout revokes immediately and safely accepts a duplicate with its original key', async () => {
    const user = await guest(); const id = key(); const logout = () => server.http.inject({ method: 'POST', url: '/v1/session/logout', headers: headers(user, id), payload: {} });
    expect((await logout()).statusCode).toBe(200); expect((await logout()).statusCode).toBe(200);
    expect((await server.http.inject({ url: '/v1/me', headers: { cookie: user.cookie } })).statusCode).toBe(401);
    expect((await server.http.inject({ method: 'PATCH', url: '/v1/me', headers: headers(user), payload: { displayName: 'Revoked' } })).statusCode).toBe(401);
  });
  it('delete cascades own data, retains only a short-lived anonymous receipt, and cannot restore a deleted bootstrap', async () => {
    const user = await guest(); const other = await guest(); const id = key();
    const remove = () => server.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(user, id) });
    expect((await remove()).json()).toEqual({ deleted: true }); expect((await remove()).json()).toEqual({ deleted: true });
    for (const table of ['identity_accounts', 'identity_profiles', 'identity_privacy', 'identity_sessions', 'identity_mutations', 'identity_consents']) {
      const column = table === 'identity_accounts' ? 'id' : 'account_id';
      expect((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`, [user.me.profile.id])).rows[0].n).toBe(0);
    }
    const replay = await server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, remoteAddress: '127.0.4.1', payload: user.input });
    expect(replay.statusCode).toBe(401);
    expect((await server.http.inject({ url: '/v1/me', headers: { cookie: other.cookie } })).statusCode).toBe(200);
  });
  it('bounds guest creation per IP before issuing another session', async () => {
    for (let i = 0; i < 10; i++) expect((await server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, remoteAddress: '127.0.5.1', payload: { requestId: key(), displayName: 'Limited Visitor', avatarKey: 'fern' } })).statusCode).toBe(201);
    const denied = await server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, remoteAddress: '127.0.5.1', payload: { requestId: key(), displayName: 'Limited Visitor', avatarKey: 'fern' } });
    expect(denied.statusCode).toBe(429); expect(denied.headers['retry-after']).toBe('60');
  });
  it('production cookie is signed, secure and __Host scoped (HTTP injection, not a TLS deployment claim)', async () => {
    const prod = await createApp(readConfig({ NODE_ENV: 'production', DATABASE_URL: process.env.TEST_DATABASE_URL, SESSION_SECRET: 'test-only-session-secret-not-production-0001', WEB_ORIGIN: 'https://city.example' }), pool);
    try {
      const response = await prod.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin: 'https://city.example' }, payload: { requestId: key(), displayName: 'Secure Visitor', avatarKey: 'fern' } });
      expect(response.statusCode).toBe(201); const header = String(response.headers['set-cookie']);
      expect(header).toContain('__Host-city_session='); expect(header).toContain('Secure'); expect(header).toContain('HttpOnly'); expect(header).toContain('Path=/'); expect(header).not.toContain('Domain=');
    } finally { await prod.app.close(); }
  });
  it('expires sessions from the authoritative clock, including privacy/export reads', async () => {
    const user = await guest(); now += 301000;
    for (const url of ['/v1/me', '/v1/me/privacy', '/v1/me/export']) expect((await server.http.inject({ url, headers: { cookie: user.cookie } })).statusCode).toBe(401);
    expect(await server.identity.purgeExpired()).toBeGreaterThan(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM identity_sessions WHERE account_id=$1', [user.me.profile.id])).rows[0].n).toBe(0);
    const fresh = await server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, remoteAddress: '127.0.6.1', payload: user.input });
    expect(fresh.statusCode).toBe(201); expect(fresh.json().profile.id).not.toBe(user.me.profile.id); expect(cookie(fresh)).not.toBe(user.cookie);
    expect((await server.http.inject({ url: '/v1/me', headers: { cookie: user.cookie } })).statusCode).toBe(401);
  });
});
