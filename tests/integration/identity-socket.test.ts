import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { MeSchema, SessionCheckAckSchema, type Me } from '@virtual-city/contracts';
let pool: Pool; let admin: Pool; let server: Awaited<ReturnType<typeof createApp>>; let url: string;
let offset = 0; let ip = 1;
const now = () => Date.now() + offset;
const schema = 'socket_identity_' + randomUUID().replaceAll('-', ''); const clients = new Set<Socket>();
const origin = 'http://127.0.0.1:3300';
const config = () => readConfig({ NODE_ENV: 'test', SESSION_SECRET: 'socket-test-only-secret-not-production-000001', SESSION_TTL_SECONDS: '300', DATABASE_URL: process.env.TEST_DATABASE_URL });
const cookie = (r: { headers: Record<string, unknown> }) => String(Array.isArray(r.headers['set-cookie']) ? r.headers['set-cookie'][0] : r.headers['set-cookie']).split(';')[0];
beforeAll(async () => {
  const connection = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || !/^virtual_city_test(?:_|$)/.test(connection.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: connection.toString() }); await admin.query(`CREATE SCHEMA "${schema}"`);
  connection.searchParams.set('options', '-c search_path=' + schema); pool = new Pool({ connectionString: connection.toString() }); await migrate(pool);
  server = await createApp(config(), pool, false, { now }); await server.app.listen(0, '127.0.0.1'); url = await server.app.getUrl();
});
afterEach(() => { for (const client of clients) client.close(); clients.clear(); });
afterAll(async () => { for (const client of clients) client.close(); await server?.app.close(); await pool?.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } });
async function guest() {
  const response = await server.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, remoteAddress: '127.8.0.' + ip++, payload: { requestId: randomUUID(), displayName: 'Socket Test Visitor', avatarKey: 'fern' } });
  expect(response.statusCode).toBe(201); return { cookie: cookie(response), me: MeSchema.parse(response.json()) };
}
function connect(user: { cookie: string; me: Me }, options: { origin?: string; csrf?: string; auth?: Record<string, unknown>; target?: string } = {}) {
  const client = io(options.target ?? url, { forceNew: true, autoConnect: false, reconnection: false, timeout: 2000, transports: ['websocket'], extraHeaders: { origin: options.origin ?? origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: options.csrf ?? user.me.csrfToken, ...options.auth } });
  clients.add(client);
  return new Promise<Socket>((resolve, reject) => {
    client.once('connect', () => resolve(client)); client.once('connect_error', error => { client.close(); reject(error); }); client.connect();
  });
}
function event(client: Socket, name: string): Promise<unknown> { return new Promise(resolve => client.once(name, resolve)); }
async function check(client: Socket, extra: Record<string, unknown> = {}) {
  return SessionCheckAckSchema.parse(await client.timeout(2000).emitWithAck('session.check', { schemaVersion: 1, requestId: randomUUID(), ...extra }));
}
function headers(user: { cookie: string; me: Me }) { return { origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': randomUUID() }; }
describe('M03 actual Socket.IO network authorization and revocation', () => {
  it('uses only signed cookie identity and rechecks each versioned command', async () => {
    const user = await guest(); const client = await connect(user);
    const result = await check(client); expect(result.ok).toBe(true); if (result.ok) expect(result.result.accountId).toBe(user.me.profile.id);
    const forged = await check(client, { accountId: randomUUID(), role: 'moderator' }); expect(forged.ok).toBe(false); if (!forged.ok) expect(forged.error.code).toBe('INVALID_REQUEST');
    const wrongVersion = await check(client, { schemaVersion: 99 }); expect(wrongVersion.ok).toBe(false);
    expect((await check(client)).ok).toBe(true);
  });
  it('rejects cross-site origins, invalid CSRF, forged handshake authority and non-city cookies', async () => {
    const user = await guest();
    await expect(connect(user, { origin: 'https://attacker.example' })).rejects.toBeDefined();
    await expect(connect(user, { csrf: '0'.repeat(64) })).rejects.toBeDefined();
    await expect(connect(user, { auth: { accountId: randomUUID(), role: 'moderator' } })).rejects.toBeDefined();
    await expect(connect({ ...user, cookie: 'city_session=tampered' })).rejects.toBeDefined();
    await expect(connect({ ...user, cookie: 'deadline_session=legacy-token' })).rejects.toBeDefined();
  });
  it('HTTP logout disconnects both active tabs after the transaction commits', async () => {
    const user = await guest(); const a = await connect(user); const b = await connect(user);
    const closedA = event(a, 'disconnect'); const closedB = event(b, 'disconnect'); const revoked = event(a, 'session.revoked');
    const response = await server.http.inject({ method: 'POST', url: '/v1/session/logout', headers: headers(user), payload: {} }); expect(response.statusCode).toBe(200);
    expect(await revoked).toEqual({ schemaVersion: 1, reason: 'session-ended' }); await Promise.all([closedA, closedB]); expect(a.connected).toBe(false); expect(b.connected).toBe(false);
    await expect(connect(user)).rejects.toBeDefined();
  });
  it('rotation invalidates old sockets and the new cookie can establish a fresh authenticated connection', async () => {
    const user = await guest(); const client = await connect(user); const closed = event(client, 'disconnect');
    const response = await server.http.inject({ method: 'POST', url: '/v1/session/rotate', headers: headers(user), payload: {} }); expect(response.statusCode).toBe(200); await closed;
    const fresh = await connect({ cookie: cookie(response), me: MeSchema.parse(response.json()) }); expect((await check(fresh)).ok).toBe(true);
  });
  it('rejects an externally revoked token on the next command even without the local notification hook', async () => {
    const user = await guest(); const client = await connect(user); const closed = event(client, 'disconnect');
    await pool.query("UPDATE identity_sessions SET revoked_at=now(),revoked_reason='logout' WHERE account_id=$1", [user.me.profile.id]);
    const result = await check(client); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED'); await closed;
  });
  it('caps commands across the authenticated session', async () => {
    const user = await guest(); const client = await connect(user);
    for (let i = 0; i < 60; i++) expect((await check(client)).ok).toBe(true);
    const limited = await check(client); expect(limited.ok).toBe(false); if (!limited.ok) expect(limited.error.code).toBe('RATE_LIMITED');
  });
  it('bounds concurrent sockets per session and releases reservations on disconnect', async () => {
    const user = await guest(); const connected: Socket[] = [];
    for (let i = 0; i < 4; i++) connected.push(await connect(user));
    await expect(connect(user)).rejects.toThrow('RATE_LIMITED');
    const serverSide = server.gateway.io.of('/').sockets.get(connected[0].id!); expect(serverSide).toBeDefined();
    const removed = new Promise<void>(resolve => serverSide!.once('disconnect', () => resolve())); connected[0].close(); await removed;
    const replacement = await connect(user); expect((await check(replacement)).ok).toBe(true);
  });
  it('registered upgrade and deletion each revoke the current socket', async () => {
    const user = await guest(); const client = await connect(user); const closed = event(client, 'disconnect');
    const upgraded = await server.http.inject({ method: 'POST', url: '/v1/session/upgrade', headers: headers(user), payload: { loginName: 'socket_' + randomUUID().replaceAll('-', '').slice(0, 16), password: 'socket-test-only-synthetic-password' } }); expect(upgraded.statusCode).toBe(200); await closed;
    const registered = { cookie: cookie(upgraded), me: MeSchema.parse(upgraded.json()) }; const next = await connect(registered); const removed = event(next, 'disconnect');
    expect((await server.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(registered) })).statusCode).toBe(200); await removed;
  });
  it('server shutdown closes active transports rather than hanging on open upgraded sockets', async () => {
    const user = await guest(); const auxiliary = await createApp(config(), pool, false, { now });
    await auxiliary.app.listen(0, '127.0.0.1');
    try { const client = await connect(user, { target: await auxiliary.app.getUrl() }); const closed = event(client, 'disconnect'); await auxiliary.app.close(); await closed; expect(client.connected).toBe(false); }
    finally { await auxiliary.app.close(); }
  });
  it('disconnects an idle socket when its authoritative session expires', async () => {
    const user = await guest(); await pool.query('UPDATE identity_sessions SET expires_at=$2 WHERE account_id=$1', [user.me.profile.id, new Date(now() + 300)]);
    const client = await connect(user); const closed = event(client, 'disconnect'); await closed; expect(client.connected).toBe(false);
  });
  it('a clock-expired session cannot issue another command', async () => {
    const user = await guest(); const client = await connect(user); const closed = event(client, 'disconnect'); offset += 301000;
    const result = await check(client); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED'); await closed;
  });
});
