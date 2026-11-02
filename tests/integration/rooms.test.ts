import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { RoomAckSchema, RoomsListSchema, MeSchema, type Me, type RoomSnapshot, type RoomJoin } from '@virtual-city/contracts';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';

let pool: Pool; let admin: Pool; let app: Awaited<ReturnType<typeof createApp>>; let url: string; let offset = 0; let serial = 1;
const clients = new Set<Socket>(); const origin = 'http://127.0.0.1:3300';
const schema = 'rooms_test_' + randomUUID().replaceAll('-', ''); const now = () => Date.now() + offset;
const config = () => readConfig({ NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, SESSION_SECRET: 'room-test-only-session-secret-000000001' });
type User = { cookie: string; me: Me };
beforeAll(async () => {
  const connection = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || !/^virtual_city_test(?:_|$)/.test(connection.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: connection.toString() }); await admin.query(`CREATE SCHEMA "${schema}"`);
  connection.searchParams.set('options', '-c search_path=' + schema); pool = new Pool({ connectionString: connection.toString() }); await migrate(pool);
  app = await createApp(config(), pool, false, { now }); await app.app.listen(0, '127.0.0.1'); url = await app.app.getUrl();
  await app.worlds.registry.setEnabled('sdk-sandbox', true);
});
afterEach(async () => {
  for (const client of clients) client.close(); clients.clear();
  await app.worlds.registry.setEnabled('sdk-sandbox', false); await app.rooms.maintain(); await app.worlds.registry.setEnabled('sdk-sandbox', true);
});
afterAll(async () => { for (const client of clients) client.close(); await app?.app.close(); await pool?.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } });
async function guest(): Promise<User> {
  const response = await app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: '127.7.' + Math.floor(serial / 250) + '.' + (serial++ % 250 + 1), headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Room Test Visitor', avatarKey: 'mint' } });
  expect(response.statusCode).toBe(201); return { cookie: String(response.headers['set-cookie']).split(';')[0], me: MeSchema.parse(response.json()) };
}
function connect(user: User) {
  const client = io(url, { forceNew: true, autoConnect: false, reconnection: false, timeout: 2000, transports: ['websocket'], extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }); clients.add(client);
  return new Promise<Socket>((resolve, reject) => { client.once('connect', () => resolve(client)); client.once('connect_error', reject); client.connect(); });
}
const joinInput = (extra: Record<string, unknown> = {}) => ({ schemaVersion: 1, requestId: randomUUID(), worldSlug: 'sdk-sandbox', worldVersion: '1.0.0', sceneVersion: '1.0.0', ...extra });
const ownInput = (snapshot: RoomSnapshot, extra: Record<string, unknown> = {}) => ({ schemaVersion: 1, requestId: randomUUID(), epoch: snapshot.epoch, roomId: snapshot.roomId, membershipId: snapshot.membershipId, ...extra });
const command = async (client: Socket, event: string, input: unknown) => RoomAckSchema.parse(await client.timeout(5000).emitWithAck(event, input));
async function join(client: Socket, extra: Record<string, unknown> = {}): Promise<RoomSnapshot> {
  const ack = await command(client, 'room.join', joinInput(extra)); expect(ack.ok).toBe(true);
  if (!ack.ok || ack.result.type !== 'snapshot') throw new Error('Expected join snapshot'); return ack.result;
}
async function credential(user: User) { const signed = app.http.parseCookie(user.cookie).city_session; const parsed = app.http.unsignCookie(signed); if (!parsed.value) throw new Error('Invalid test cookie'); return parsed.value; }
async function list(user: User) { const response = await app.http.inject({ url: '/v1/worlds/sdk-sandbox/rooms', headers: { cookie: user.cookie } }); expect(response.statusCode).toBe(200); return RoomsListSchema.parse(response.json()); }
describe('M06-01 real PostgreSQL identity + Socket.IO authoritative room allocator slice', () => {
  it('joins, snapshots and leaves via guarded network commands without disclosing other profiles', async () => {
    const user = await guest(); const client = await connect(user); const snapshot = await join(client);
    expect(snapshot.self.accountId).toBe(user.me.profile.id); expect(snapshot.occupancy).toBe(1); expect(snapshot.capacity).toBe(8);
    const latest = await command(client, 'room.snapshot', ownInput(snapshot)); expect(latest.ok).toBe(true);
    expect(JSON.stringify(latest)).not.toMatch(/csrfToken|Room Test Visitor|connections|sessionId/);
    expect((await list(user)).rooms).toEqual([{ roomId: snapshot.roomId, capacity: 8, occupancy: 1 }]);
    const leave = ownInput(snapshot); const left = await command(client, 'room.leave', leave); expect(left.ok).toBe(true);
    expect(await command(client, 'room.leave', leave)).toEqual(left);
    expect((await command(client, 'room.snapshot', ownInput(snapshot))).ok).toBe(false);
    offset += 60001; await app.rooms.maintain(); expect((await list(user)).rooms).toEqual([]); offset = 0;
  });
  it('serializes 100 simultaneous real-session joins into one target room without overcapacity', async () => {
    const owner = await guest(); const client = await connect(owner); const snapshot = await join(client);
    const visitors: { user: User; token: string }[] = [];
    for (let i = 0; i < 100; i++) { const user = await guest(); visitors.push({ user, token: await credential(user) }); }
    // Real sessions and authoritative service; unique connection IDs are a controlled transport fixture for 100-way concurrency.
    const attempts = await Promise.allSettled(visitors.map((visitor, i) => app.rooms.join(visitor.token, 'concurrency-fixture-' + i, joinInput({ roomId: snapshot.roomId }) as RoomJoin, () => true)));
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(7);
    expect(attempts.filter(result => result.status === 'rejected').every(result => result.status === 'rejected' && result.reason.code === 'ROOM_FULL')).toBe(true);
    expect((await list(owner)).rooms).toEqual([{ roomId: snapshot.roomId, capacity: 8, occupancy: 8 }]);
    await Promise.all(visitors.map((_visitor, i) => app.rooms.detach('concurrency-fixture-' + i)));
    expect((await list(owner)).rooms[0].occupancy).toBe(1);
  });
  it('uses one account membership across tabs, handles retries and rejects mutation-key conflicts', async () => {
    const user = await guest(); const a = await connect(user); const b = await connect(user); const input = joinInput();
    const first = await command(a, 'room.join', input); expect(first.ok).toBe(true); if (!first.ok || first.result.type !== 'snapshot') throw new Error();
    const snapshot = first.result; expect(await command(a, 'room.join', input)).toEqual(first);
    const second = await join(b); expect(second.membershipId).toBe(snapshot.membershipId); expect(second.occupancy).toBe(1);
    const changed = await command(a, 'room.join', { ...input, roomId: randomUUID() }); expect(changed.ok).toBe(false); if (!changed.ok) expect(changed.error.code).toBe('IDEMPOTENCY_CONFLICT');
    a.close(); await app.rooms.maintain(); expect((await command(b, 'room.snapshot', ownInput(snapshot))).ok).toBe(true);
    const ended = new Promise(resolve => b.once('room.ended', resolve)); const left = await command(b, 'room.leave', ownInput(snapshot)); expect(left.ok).toBe(true); await ended;
    const replay = await command(b, 'room.join', input); expect(replay.ok).toBe(false); if (!replay.ok) expect(replay.error.code).toBe('NOT_IN_ROOM');
  });
  it('rejects forged room/membership/authority, stale assets, unknown/disabled worlds and revoked sessions', async () => {
    const a = await guest(); const b = await guest(); const ca = await connect(a); const cb = await connect(b); const snapshot = await join(ca);
    for (const extra of [{ accountId: b.me.profile.id }, { role: 'admin' }, { sceneVersion: '2.0.0' }, { worldVersion: '2.0.0' }, { worldSlug: 'dating' }]) expect((await command(cb, 'room.join', joinInput(extra))).ok).toBe(false);
    expect((await command(cb, 'room.snapshot', ownInput(snapshot))).ok).toBe(false);
    expect((await command(ca, 'room.snapshot', ownInput(snapshot, { epoch: randomUUID() }))).ok).toBe(false);
    expect((await command(ca, 'room.snapshot', ownInput(snapshot, { membershipId: randomUUID() }))).ok).toBe(false);
    await pool.query('UPDATE identity_sessions SET revoked_at=now() WHERE account_id=$1', [a.me.profile.id]);
    const closed = new Promise(resolve => ca.once('disconnect', resolve)); const denied = await command(ca, 'room.snapshot', ownInput(snapshot)); expect(denied.ok).toBe(false); if (!denied.ok) expect(denied.error.code).toBe('UNAUTHENTICATED'); await closed;
    const ended = new Promise(resolve => cb.once('room.ended', resolve)); const bs = await join(cb);
    await app.worlds.registry.setEnabled('sdk-sandbox', false); await ended; await app.rooms.maintain();
    expect((await command(cb, 'room.snapshot', ownInput(bs))).ok).toBe(false);
    expect((await command(cb, 'room.join', joinInput())).ok).toBe(false);
  });
  it('logout removes live room membership and shutdown never preserves a phantom successful membership', async () => {
    const user = await guest(); const client = await connect(user); const snapshot = await join(client); const closed = new Promise(resolve => client.once('disconnect', resolve));
    const response = await app.http.inject({ method: 'POST', url: '/v1/session/logout', headers: { origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': randomUUID() }, payload: {} }); expect(response.statusCode).toBe(200); await closed;
    await app.rooms.maintain();
    expect(app.rooms.hasMembership({ accountId: user.me.profile.id, sessionId: 'untrusted', kind: 'guest', expiresAt: Date.now() + 1000 }, 'sdk-sandbox', snapshot.membershipId)).toBe(false);
    const observer = await guest(); expect((await list(observer)).rooms.every(room => room.occupancy === 0)).toBe(true);
  });
});
