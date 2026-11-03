import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { RoomAckSchema, RoomsListSchema, MeSchema, type Me, type RoomSnapshot, type RoomJoin } from '@virtual-city/contracts';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import { defineWorld, applyRoomDelta } from '@virtual-city/world-sdk';
import { DISCONNECT_GRACE_MS } from '../../apps/platform-api/src/rooms/service';

let pool: Pool; let admin: Pool; let app: Awaited<ReturnType<typeof createApp>>; let url: string; let offset = 0; let serial = 1;
const clients = new Set<Socket>(); const origin = 'http://127.0.0.1:3300';
let socketSerial = 1;
const schema = 'rooms_test_' + randomUUID().replaceAll('-', ''); const now = () => Date.now() + offset;
const config = () => readConfig({ NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, SESSION_SECRET: 'room-test-only-session-secret-000000001' });
type User = { cookie: string; me: Me };
beforeAll(async () => {
  const connection = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || !/^virtual_city_test(?:_|$)/.test(connection.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: connection.toString() }); await admin.query(`CREATE SCHEMA "${schema}"`);
  connection.searchParams.set('options', '-c search_path=' + schema); pool = new Pool({ connectionString: connection.toString() }); await migrate(pool);
  app = await createApp(config(), pool, false, { now, worlds: { modules: [defineWorld({
    schemaVersion: 1, apiVersion: 1, slug: 'seat-contention-fixture', version: '1.0.0', title: '100-seat contention fixture (not a playable world)', kind: 'sandbox',
    sceneRef: { key: 'seat-fixture', version: '1.0.0' }, capacity: 100, seatIds: ['shared-seat', 'alternate-seat'], capabilities: ['presence', 'seating'],
    accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: 0.5, y: 0.5 }, icon: 'flask' },
  }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {} })] } }); await app.app.listen(0, '127.0.0.1'); url = await app.app.getUrl();
  await app.worlds.registry.setEnabled('sdk-sandbox', true);
  await app.worlds.registry.setEnabled('seat-contention-fixture', true);
});
afterEach(async () => {
  for (const client of clients) client.close(); clients.clear();
  await app.worlds.registry.setEnabled('sdk-sandbox', false); await app.rooms.maintain(); await app.worlds.registry.setEnabled('sdk-sandbox', true);
  await app.worlds.registry.setEnabled('seat-contention-fixture', false); await app.rooms.maintain(); await app.worlds.registry.setEnabled('seat-contention-fixture', true);
});
afterAll(async () => { for (const client of clients) client.close(); await app?.app.close(); await pool?.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } });
async function guest(): Promise<User> {
  const response = await app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: '127.7.' + Math.floor(serial / 250) + '.' + (serial++ % 250 + 1), headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Room Test Visitor', avatarKey: 'mint' } });
  expect(response.statusCode).toBe(201); return { cookie: String(response.headers['set-cookie']).split(';')[0], me: MeSchema.parse(response.json()) };
}
function connect(user: User, target = url) {
  // Independent visitors use actual loopback source addresses; unchanged production IP limits remain active.
  const localAddress = '127.21.' + Math.floor(socketSerial / 250) + '.' + (socketSerial++ % 250 + 1);
  const client = io(target, { forceNew: true, autoConnect: false, reconnection: false, timeout: 2000, transports: ['websocket'], transportOptions: { websocket: { localAddress } }, extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }); clients.add(client);
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
async function setPresence(user: User, visibility: 'hidden' | 'public') {
  const response = await app.http.inject({ method: 'PATCH', url: '/v1/me/privacy', headers: { origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': randomUUID() }, payload: { presence: visibility, analyticsConsent: false, worldVisibility: { dating: 'hidden' } } });
  expect(response.statusCode).toBe(200);
}
async function block(actor: User, target: User) {
  const response = await app.http.inject({ method: 'POST', url: '/v1/blocks', headers: { origin, cookie: actor.cookie, 'x-csrf-token': actor.me.csrfToken, 'idempotency-key': randomUUID() }, payload: { targetId: target.me.profile.id, blocked: true } });
  expect(response.statusCode).toBe(200);
}
describe('M06-01 real PostgreSQL identity + Socket.IO authoritative room allocator slice', () => {
  it('joins, snapshots and leaves via guarded network commands without disclosing other profiles', async () => {
    const user = await guest(); const client = await connect(user); const snapshot = await join(client);
    expect(snapshot.self.accountId).toBe(user.me.profile.id); expect(snapshot.occupancy).toBe(1); expect(snapshot.capacity).toBe(8);
    const latest = await command(client, 'room.snapshot', ownInput(snapshot)); expect(latest.ok).toBe(true);
    expect(JSON.stringify(latest)).not.toMatch(/csrfToken|connections|sessionId/);
    if (latest.ok && latest.result.type === 'snapshot') expect(latest.result.participants).toHaveLength(1);
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
    offset += DISCONNECT_GRACE_MS + 1; await app.rooms.maintain();
    expect((await list(owner)).rooms[0].occupancy).toBe(1);
    offset = 0;
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
  it('claims/releases seats over real sockets, enforces ownership and makes old receipt replay non-mutating', async () => {
    const a = await guest(); const b = await guest(); const ca = await connect(a); const cb = await connect(b); const first = await join(ca); const second = await join(cb);
    const claim = ownInput(first, { seatId: 'seat-1' }); const claimed = await command(ca, 'seat.claim', claim); expect(claimed.ok).toBe(true);
    if (!claimed.ok || claimed.result.type !== 'snapshot') throw new Error('Expected snapshot');
    expect(claimed.result.self.seatId).toBe('seat-1'); expect(claimed.result.seats[0]).toEqual({ seatId: 'seat-1', state: 'occupied', mine: true });
    expect(await command(ca, 'seat.claim', claim)).toEqual(claimed);
    const taken = await command(cb, 'seat.claim', ownInput(second, { seatId: 'seat-1' })); expect(taken.ok).toBe(false); if (!taken.ok) expect(taken.error.code).toBe('SEAT_TAKEN');
    expect((await command(cb, 'seat.release', ownInput(second, { seatId: 'seat-1' }))).ok).toBe(false);
    expect((await command(cb, 'seat.claim', ownInput(first, { seatId: 'seat-2' }))).ok).toBe(false);
    const double = await command(ca, 'seat.claim', ownInput(first, { seatId: 'seat-2' })); expect(double.ok).toBe(false); if (!double.ok) expect(double.error.code).toBe('ALREADY_SEATED');
    expect((await command(ca, 'seat.claim', ownInput(first, { seatId: 'missing' }))).ok).toBe(false);
    expect((await command(ca, 'seat.release', ownInput(first, { seatId: 'seat-1' }))).ok).toBe(true);
    const replay = await command(ca, 'seat.claim', claim); expect(replay.ok).toBe(true); if (replay.ok && replay.result.type === 'snapshot') expect(replay.result.self.seatId).toBe(null);
    expect((await command(cb, 'seat.claim', ownInput(second, { seatId: 'seat-1' }))).ok).toBe(true);
  });
  it('holds a seat during disconnect grace, resumes the same membership and expires it without a phantom owner', async () => {
    const a = await guest(); const b = await guest(); const ca = await connect(a); const cb = await connect(b); const snapshot = await join(ca); const other = await join(cb);
    await command(ca, 'seat.claim', ownInput(snapshot, { seatId: 'seat-1' }));
    const oldConnection = ca.id!; ca.close(); await app.rooms.detach(oldConnection);
    const held = await command(cb, 'room.snapshot', ownInput(other)); expect(held.ok).toBe(true); if (held.ok && held.result.type === 'snapshot') expect(held.result.seats[0]).toEqual({ seatId: 'seat-1', state: 'held', mine: false });
    expect((await command(cb, 'seat.claim', ownInput(other, { seatId: 'seat-1' }))).ok).toBe(false);
    const resumed = await connect(a); const recovered = await join(resumed); expect(recovered.membershipId).toBe(snapshot.membershipId); expect(recovered.self.seatId).toBe('seat-1');
    const nextConnection = resumed.id!; resumed.close(); await app.rooms.detach(nextConnection);
    offset += DISCONNECT_GRACE_MS + 1; await app.rooms.maintain();
    const released = await command(cb, 'seat.claim', ownInput(other, { seatId: 'seat-1' })); expect(released.ok).toBe(true);
    const fresh = await connect(a); const freshMembership = await join(fresh); expect(freshMembership.membershipId).not.toBe(snapshot.membershipId); expect(freshMembership.self.seatId).toBe(null); offset = 0;
  });
  it('revocation releases seats immediately even for a member currently in grace', async () => {
    const a = await guest(); const b = await guest(); const ca = await connect(a); const cb = await connect(b); const snapshot = await join(ca); const other = await join(cb);
    await command(ca, 'seat.claim', ownInput(snapshot, { seatId: 'seat-1' })); const oldConnection = ca.id!; ca.close(); await app.rooms.detach(oldConnection);
    const logout = await app.http.inject({ method: 'POST', url: '/v1/session/logout', headers: { origin, cookie: a.cookie, 'x-csrf-token': a.me.csrfToken, 'idempotency-key': randomUUID() }, payload: {} }); expect(logout.statusCode).toBe(200);
    const released = await command(cb, 'seat.claim', ownInput(other, { seatId: 'seat-1' })); expect(released.ok).toBe(true);
  });
  it('a disconnected older session plus logout of the last live session cannot hold a seat forever', async () => {
    const initial = await guest(); const loginName = 'room_' + randomUUID().replaceAll('-', '').slice(0, 16); const password = 'room-tests-only-account-password';
    const upgraded = await app.http.inject({ method: 'POST', url: '/v1/session/upgrade', headers: { origin, cookie: initial.cookie, 'x-csrf-token': initial.me.csrfToken, 'idempotency-key': randomUUID() }, payload: { loginName, password } }); expect(upgraded.statusCode).toBe(200);
    const first = { cookie: String(upgraded.headers['set-cookie']).split(';')[0], me: MeSchema.parse(upgraded.json()) };
    const loggedIn = await app.http.inject({ method: 'POST', url: '/v1/session/login', headers: { origin }, payload: { requestId: randomUUID(), loginName, password } }); expect(loggedIn.statusCode).toBe(200);
    const second = { cookie: String(loggedIn.headers['set-cookie']).split(';')[0], me: MeSchema.parse(loggedIn.json()) };
    const a = await connect(first); const b = await connect(second); const snapshot = await join(a); await join(b);
    await command(a, 'seat.claim', ownInput(snapshot, { seatId: 'seat-1' })); const firstConnection = a.id!; a.close(); await app.rooms.detach(firstConnection);
    expect((await command(b, 'room.snapshot', ownInput(snapshot))).ok).toBe(true);
    const closed = new Promise(resolve => b.once('disconnect', resolve));
    const loggedOut = await app.http.inject({ method: 'POST', url: '/v1/session/logout', headers: { origin, cookie: second.cookie, 'x-csrf-token': second.me.csrfToken, 'idempotency-key': randomUUID() }, payload: {} }); expect(loggedOut.statusCode).toBe(200); await closed;
    offset += DISCONNECT_GRACE_MS + 1; await app.rooms.maintain();
    expect((await list(first)).rooms.every(room => room.occupancy === 0)).toBe(true); offset = 0;
  });
  it('one hundred simultaneous real-session seat claims produce exactly one owner', async () => {
    const visitors: { token: string; connectionId: string; snapshot: RoomSnapshot }[] = [];
    for (let i = 0; i < 100; i++) {
      const user = await guest(); const token = await credential(user); const connectionId = 'seat-fixture-' + i;
      const snapshot = await app.rooms.join(token, connectionId, joinInput({ worldSlug: 'seat-contention-fixture' }) as RoomJoin, () => true); visitors.push({ token, connectionId, snapshot });
    }
    expect(new Set(visitors.map(visitor => visitor.snapshot.roomId)).size).toBe(1);
    const results = await Promise.allSettled(visitors.map(visitor => app.rooms.seat(visitor.token, visitor.connectionId, { ...ownInput(visitor.snapshot), seatId: 'shared-seat' }, 'seat.claim')));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected').every(result => result.status === 'rejected' && result.reason.code === 'SEAT_TAKEN')).toBe(true);
    const final = await app.rooms.snapshot(visitors[0].token, visitors[0].connectionId, ownInput(visitors[0].snapshot)); expect(final.seats.filter(seat => seat.state === 'occupied')).toHaveLength(1);
    expect(final.occupancy).toBe(100);
  });
  it('shares one session command budget across room and seat events and rejects invalid action/role claims', async () => {
    const user = await guest(); const client = await connect(user); const snapshot = await join(client);
    for (const extra of [{ action: 'grant-admin' }, { role: 'moderator' }, { accountId: randomUUID() }, { schemaVersion: 99 }]) {
      const invalid = await command(client, 'seat.claim', ownInput(snapshot, { seatId: 'seat-1', ...extra })); expect(invalid.ok).toBe(false); if (!invalid.ok) expect(invalid.error.code).toBe('INVALID_REQUEST');
    }
    for (let i = 0; i < 59; i++) expect((await command(client, 'room.snapshot', ownInput(snapshot))).ok).toBe(true);
    const limited = await command(client, 'seat.claim', ownInput(snapshot, { seatId: 'seat-1' })); expect(limited.ok).toBe(false); if (!limited.ok) expect(limited.error.code).toBe('RATE_LIMITED');
    expect(client.connected).toBe(true);
  });
  it('bounds pending commands on a slow world hook before allowing an unbounded queue', async () => {
    let began!: () => void; let finish!: () => void; let limited!: () => void;
    const started = new Promise<void>(resolve => { began = resolve; }); const delayed = new Promise<void>(resolve => { finish = resolve; }); const rateSeen = new Promise<void>(resolve => { limited = resolve; });
    const world = defineWorld({ schemaVersion: 1, apiVersion: 1, slug: 'queue-bound-fixture', version: '1.0.0', title: 'Queue bound fixture', kind: 'sandbox', sceneRef: { key: 'queue-fixture', version: '1.0.0' }, capacity: 8, capabilities: ['presence'], accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: 0.5, y: 0.5 }, icon: 'flask' } }, {
      bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => { began(); await delayed; }, onLeave: async () => {}, onCommand: async () => {},
    });
    app.worlds.registry.register(world); await app.worlds.registry.setEnabled(world.definition.slug, true);
    try {
      const user = await guest(); const client = await connect(user); const first = command(client, 'room.join', joinInput({ worldSlug: world.definition.slug })); await started;
      const more = Array.from({ length: 9 }, () => command(client, 'room.join', joinInput({ worldSlug: world.definition.slug })).then(result => { if (!result.ok && result.error.code === 'RATE_LIMITED') limited(); return result; }));
      await rateSeen; finish();
      const results = await Promise.all([first, ...more]); expect(results.filter(result => result.ok)).toHaveLength(8); expect(results.filter(result => !result.ok)).toHaveLength(2);
      expect(results.filter(result => result.ok).every(result => result.ok && result.result.type === 'snapshot' && result.result.occupancy === 1)).toBe(true);
    } finally { finish(); await app.worlds.registry.setEnabled(world.definition.slug, false); }
  });
  it('idle session expiry immediately frees ownership instead of extending a disconnected seat hold', async () => {
    const user = await guest(); const observer = await guest(); const other = await connect(observer); const otherSnapshot = await join(other);
    await pool.query('UPDATE identity_sessions SET expires_at=$2 WHERE account_id=$1', [user.me.profile.id, new Date(now() + 1000)]);
    const client = await connect(user); const snapshot = await join(client); expect((await command(client, 'seat.claim', ownInput(snapshot, { seatId: 'seat-1' }))).ok).toBe(true);
    const closed = new Promise(resolve => client.once('disconnect', resolve)); await closed; await app.rooms.maintain();
    expect((await command(other, 'seat.claim', ownInput(otherSnapshot, { seatId: 'seat-1' }))).ok).toBe(true);
  });
  it('projects room peers through privacy and bilateral block policy, then emits a viewer-safe delta', async () => {
    const a = await guest(); const b = await guest(); await setPresence(a, 'public');
    const ca = await connect(a); const cb = await connect(b);
    const aSnapshot = await join(ca); const bSnapshot = await join(cb, { roomId: aSnapshot.roomId });
    expect(bSnapshot.participants.map(participant => participant.profile.id)).toContain(a.me.profile.id);
    const delta = new Promise<unknown>(resolve => cb.once('room.delta', resolve));
    await block(a, b);
    const event = await delta;
    const projected = applyRoomDelta(bSnapshot, event); expect(projected.applied).toBe(true); expect(projected.gap).toBe(false);
    expect(projected.state.participants.map(participant => participant.profile.id)).toEqual([b.me.profile.id]);
    const blocked = await command(cb, 'room.snapshot', ownInput(bSnapshot)); expect(blocked.ok).toBe(true);
    if (blocked.ok && blocked.result.type === 'snapshot') expect(blocked.result.participants.map(participant => participant.profile.id)).toEqual([b.me.profile.id]);
    const aView = await command(ca, 'room.snapshot', ownInput(aSnapshot)); expect(aView.ok).toBe(true);
    if (aView.ok && aView.result.type === 'snapshot') expect(aView.result.participants.map(participant => participant.profile.id)).toEqual([a.me.profile.id]);
  });
  it('rejoins after transport loss with the same membership and seat', async () => {
    const user = await guest(); const client = await connect(user); const initial = await join(client); await command(client, 'seat.claim', ownInput(initial, { seatId: 'seat-1' }));
    const oldConnection = client.id!; client.close(); await app.rooms.detach(oldConnection);
    const resumed = await connect(user); const recovered = await join(resumed); expect(recovered.membershipId).toBe(initial.membershipId); expect(recovered.self.seatId).toBe('seat-1');

  });
  it('delivers contiguous seat, detach, reconnect and grace-expiry deltas to another tab', async () => {
    const user = await guest(); const observer = await guest(); const a = await connect(user); const b = await connect(observer);
    const own = await join(a); let state = await join(b);
    async function change(run: () => Promise<unknown>) {
      const event = new Promise<unknown>(resolve => b.once('room.delta', resolve)); await run();
      const result = applyRoomDelta(state, await event); expect(result.applied).toBe(true); expect(result.gap).toBe(false); state = result.state;
    }
    await change(() => command(a, 'seat.claim', ownInput(own, { seatId: 'seat-1' })));
    const old = a.id!; await change(async () => { a.close(); await app.rooms.detach(old); });
    expect(state.seats[0].state).toBe('held');
    const resumed = await connect(user); await change(() => join(resumed));
    expect(state.seats[0].state).toBe('occupied');
    const next = resumed.id!; await change(async () => { resumed.close(); await app.rooms.detach(next); });
    try {
      offset += DISCONNECT_GRACE_MS + 1; await change(() => app.rooms.maintain());
      expect(state.occupancy).toBe(1); expect(state.seats[0].state).toBe('available');
    } finally { offset = 0; }
  });
  it('drops replaceable deltas for a controlled non-writable transport and resyncs without leaking diagnostics', async () => {
    const user = await guest(); const observer = await guest(); const a = await connect(user); const b = await connect(observer);
    const own = await join(a); const peer = await join(b); const serverPeer = app.gateway.io.of('/').sockets.get(b.id!)!;
    const before = app.diagnostics(); const transport = serverPeer.conn.transport;
    // Controlled transport pressure, not a claim about WAN kernel buffering.
    const writable = Object.getOwnPropertyDescriptor(transport, 'writable')!;
    Object.defineProperty(transport, 'writable', { configurable: true, get: () => false, set: () => {} });
    try { expect((await command(a, 'seat.claim', ownInput(own, { seatId: 'seat-1' }))).ok).toBe(true); }
    finally { Object.defineProperty(transport, 'writable', writable); }
    expect(app.diagnostics().realtime.droppedDeltas).toBeGreaterThan(before.realtime.droppedDeltas);
    const snapshot = await command(b, 'room.snapshot', ownInput(peer)); expect(snapshot.ok).toBe(true);
    if (snapshot.ok && snapshot.result.type === 'snapshot') expect(snapshot.result.seats[0].state).toBe('occupied');
    const metrics = app.diagnostics(); expect(metrics.sockets).toBe(2); expect(metrics.rooms.memberships).toBe(2);
    expect(JSON.stringify(metrics)).not.toMatch(new RegExp([user.me.profile.id, own.roomId, own.membershipId, user.me.csrfToken].join('|')));
    expect((await app.http.inject({ url: '/metrics' })).statusCode).toBe(404);
  });
  it('coalesces repeated maintenance and profile refresh requests behind a slow hook', async () => {
    let release!: () => void; let began!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; }); const started = new Promise<void>(resolve => { began = resolve; });
    const world = defineWorld({ schemaVersion: 1, apiVersion: 1, slug: 'control-queue-fixture', version: '1.0.0', title: 'Control queue fixture', kind: 'sandbox', sceneRef: { key: 'control-queue', version: '1.0.0' }, capacity: 8, capabilities: ['presence'], accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: 0.5, y: 0.5 }, icon: 'flask' } }, {
      bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => { began(); await delayed; }, onLeave: async () => {}, onCommand: async () => {},
    });
    app.worlds.registry.register(world); await app.worlds.registry.setEnabled(world.definition.slug, true);
    const actor = await guest(); const client = await connect(actor); await join(client);
    const other = await connect(await guest()); const joining = command(other, 'room.join', joinInput({ worldSlug: world.definition.slug })); await started;
    try {
      const queued = Array.from({ length: 2000 }, () => [app.rooms.maintain(), app.rooms.refreshAccounts([actor.me.profile.id])]).flat();
      expect(app.rooms.diagnostics().controlKeys).toBe(2); expect(app.rooms.diagnostics().pending).toBe(3);
      release(); expect((await joining).ok).toBe(true); await Promise.all(queued);
      expect(app.rooms.diagnostics().controlKeys).toBe(0); expect(app.rooms.diagnostics().pending).toBe(0);
    } finally { release(); await app.worlds.registry.setEnabled(world.definition.slug, false); }
  });
});
