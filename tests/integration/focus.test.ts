import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { FocusResultSchema, MeSchema, RoomAckSchema, type Me, type TravelSource } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';
const origin = 'http://127.0.0.1:3300'; let admin: Pool, serial = 0;
const opened: { app: Awaited<ReturnType<typeof createApp>>; pool: Pool; schema: string }[] = [], sockets = new Set<Socket>();
beforeAll(async () => { const url = new URL(process.env.TEST_DATABASE_URL ?? ''); if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database'); admin = new Pool({ connectionString: url.toString() }); });
afterEach(async () => { for (const socket of sockets) socket.close(); sockets.clear(); for (const r of opened.splice(0)) { await r.app.app.close(); await r.pool.end(); await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`); } });
afterAll(async () => { await admin.end(); });
async function open() {
  const schema = 'focus_test_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`); const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema); const pool = new Pool({ connectionString: url.toString() }); await migrate(pool); let now = Date.now();
  const module = defineWorld({ schemaVersion: 1, apiVersion: 1, slug: 'focus-library-fixture', version: '1.0.0', title: 'Synthetic focus library (not actual Library world)', kind: 'sandbox', sceneRef: { key: 'focus-fixture', version: '1.0.0' }, capacity: 2, seatIds: ['seat-1', 'seat-2'], capabilities: ['presence', 'seating', 'focus'], focusPolicy: { pauseAllowed: true }, accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {}, travel: { prepare: async () => {}, abort: async () => {}, depart: async () => {} } });
  const config = readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'focus-local-test-only-session-secret-000001' }), options = { now: () => now, worlds: { modules: [module] } }, app = await createApp(config, pool, false, options); opened.push({ app, pool, schema }); await app.app.listen(0, '127.0.0.1'); for (const slug of app.worlds.registry.slugs()) await app.worlds.registry.setEnabled(slug, true);
  return { app, pool, options, config, url: await app.app.getUrl(), now: () => now, advance: (ms: number) => { now += ms; } };
}
type Runtime = Awaited<ReturnType<typeof open>>; type User = { me: Me; cookie: string };
const headers = (user: User, key = randomUUID()) => ({ origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': key });
const post = (r: Runtime, user: User, path: string, payload: unknown, key = randomUUID()) => r.app.http.inject({ method: 'POST', url: '/v1/' + path, headers: headers(user, key), payload });
const get = (r: Runtime, user: User, path = 'focus') => r.app.http.inject({ url: '/v1/' + path, headers: { cookie: user.cookie } });
async function guest(r: Runtime): Promise<User> { const n = serial++, response = await r.app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: `127.61.${Math.floor(n / 250)}.${n % 250 + 1}`, headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Focus Visitor', avatarKey: 'mint' } }); expect(response.statusCode).toBe(201); return { me: MeSchema.parse(response.json()), cookie: String(response.headers['set-cookie']).split(';')[0] }; }
async function seat(r: Runtime, user: User, worldSlug = 'sdk-sandbox', claim = true) {
  const n = serial++, socket = io(r.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: `127.62.${Math.floor(n / 250)}.${n % 250 + 1}` } }, extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }); sockets.add(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  const joined = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join', { schemaVersion: 1, requestId: randomUUID(), worldSlug, worldVersion: '1.0.0', sceneVersion: '1.0.0' })); if (!joined.ok || joined.result.type !== 'snapshot') throw new Error('Fixture join failed');
  const source = { epoch: joined.result.epoch, roomId: joined.result.roomId, membershipId: joined.result.membershipId }, command = () => ({ schemaVersion: 1, requestId: randomUUID(), ...source });
  if (claim) { const claimed = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('seat.claim', { ...command(), seatId: 'seat-1' })); expect(claimed.ok).toBe(true); }
  return { socket, source, command };
}
const input = (source: TravelSource, durationSeconds = 900) => ({ schemaVersion: 1, source, durationSeconds });
async function start(r: Runtime, u: User, source: TravelSource, durationSeconds = 900, key = randomUUID()) { const response = await post(r, u, 'focus', input(source, durationSeconds), key); expect(response.statusCode).toBe(201); const result = FocusResultSchema.parse(response.json()); if (!result.session) throw new Error('Expected timer'); return result.session; }
const action = (r: Runtime, u: User, id: string, operation: string, key = randomUUID()) => post(r, u, 'focus/' + id + '/' + operation, { schemaVersion: 1 }, key);
async function restart(r: Runtime) { await r.app.app.close(); const old = r.app, app = await createApp(r.config, r.pool, false, r.options); opened.find(item => item.app === old)!.app = app; r.app = app; await app.app.listen(0, '127.0.0.1'); r.url = await app.app.getUrl(); for (const slug of app.worlds.registry.slugs()) await app.worlds.registry.setEnabled(slug, true); }

it('starts one server-timestamped timer under concurrent actual HTTP retries with trusted seat association', async () => {
  const r = await open(), u = await guest(r), seated = await seat(r, u), key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 10 }, () => fetch(r.url + '/v1/focus', { method: 'POST', headers: { ...headers(u, key), 'content-type': 'application/json' }, body: JSON.stringify(input(seated.source)), signal: AbortSignal.timeout(5000) })));
  expect(responses.every(response => response.status === 201)).toBe(true); const results = await Promise.all(responses.map(async response => FocusResultSchema.parse(await response.json()))); for (const result of results) expect(result).toEqual(results[0]);
  expect(results[0].session).toMatchObject({ phase: 'active', durationSeconds: 900, remainingMs: 900000, canPause: false, origin: { worldSlug: 'sdk-sandbox', roomId: seated.source.roomId, seatId: 'seat-1' } }); expect(Date.parse(results[0].session!.endsAt!) - Date.parse(results[0].session!.startedAt)).toBe(900000);
  expect((await r.pool.query('SELECT 1 FROM engine_focus_sessions')).rowCount).toBe(1); expect((await r.pool.query('SELECT 1 FROM engine_focus_mutations')).rowCount).toBe(1); expect((await post(r, u, 'focus', input(seated.source))).statusCode).toBe(409);
  expect((await post(r, u, 'focus', input(seated.source, 1500), key)).statusCode).toBe(409);
});

it('requires current authenticated room/seat, exact source epoch/member and does not accept arbitrary authority/time/reward', async () => {
  const r = await open(), u = await guest(r), seated = await seat(r, u, 'sdk-sandbox', false);
  expect((await post(r, u, 'focus', input(seated.source))).statusCode).toBe(409);
  for (const extra of [{ accountId: u.me.profile.id }, { role: 'staff' }, { completed: true }, { startedAt: new Date().toISOString() }, { remainingMs: 0 }, { reward: 999999 }, { note: 'private task text not accepted' }, { pauseAllowed: true }]) expect((await post(r, u, 'focus', { ...input(seated.source), ...extra })).statusCode).toBe(422);
  expect((await post(r, u, 'focus', input(seated.source, 1))).statusCode).toBe(422);
  const claimed = RoomAckSchema.parse(await seated.socket.timeout(5000).emitWithAck('seat.claim', { ...seated.command(), seatId: 'seat-1' })); expect(claimed.ok).toBe(true);
  expect((await post(r, u, 'focus', input({ ...seated.source, epoch: randomUUID() }))).statusCode).toBe(409); expect((await post(r, u, 'focus', input({ ...seated.source, membershipId: randomUUID() }))).statusCode).toBe(409);
  const stranger = await guest(r); expect((await post(r, stranger, 'focus', input(seated.source))).statusCode).toBe(409);
  expect((await r.pool.query('SELECT 1 FROM engine_focus_sessions')).rowCount).toBe(0);
});

it('denies Origin/CSRF/unknown query and hides timer identifiers/content from other accounts', async () => {
  const r = await open(), u = await guest(r), peer = await seat(r, u), timer = await start(r, u, peer.source), other = await guest(r);
  expect((await get(r, other, 'focus/' + timer.id)).statusCode).toBe(404); expect((await action(r, other, timer.id, 'cancel')).statusCode).toBe(404); expect((await get(r, other)).json().session).toBeNull();
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/focus/' + timer.id + '/cancel', headers: { ...headers(u), origin: 'https://example.invalid' }, payload: { schemaVersion: 1 } })).statusCode).toBe(403);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/focus/' + timer.id + '/cancel', headers: { origin, cookie: u.cookie, 'idempotency-key': randomUUID() }, payload: { schemaVersion: 1 } })).statusCode).toBe(403);
  expect((await get(r, u, 'focus?accountId=' + other.me.profile.id)).statusCode).toBe(422); expect((await r.app.http.inject({ url: '/v1/focus' })).statusCode).toBe(401);
});

it('rejects early finish, completes exactly at the trusted deadline, and repeated finish/cancel never doubles completion', async () => {
  const r = await open(), u = await guest(r), peer = await seat(r, u), timer = await start(r, u, peer.source);
  expect((await action(r, u, timer.id, 'finish')).statusCode).toBe(409); r.advance(899999); expect((await action(r, u, timer.id, 'finish')).statusCode).toBe(409); r.advance(1);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => action(r, u, timer.id, i % 2 ? 'cancel' : 'finish'))); expect(results.every(response => response.statusCode === 200 && response.json().session.phase === 'completed')).toBe(true); expect(results[0].json().session.changedAt).toBe(timer.endsAt);
  expect((await r.pool.query("SELECT 1 FROM engine_focus_sessions WHERE phase='completed'")).rowCount).toBe(1); expect((await r.pool.query('SELECT 1 FROM engine_focus_sessions')).rowCount).toBe(1);
});

it('continues through seat release, leave and API restart; sleep does not write ticks and current read finalizes persistent deadline', async () => {
  const r = await open(), u = await guest(r), peer = await seat(r, u), timer = await start(r, u, peer.source);
  expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('seat.release', { ...peer.command(), seatId: 'seat-1' })).ok).toBe(true); expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.leave', peer.command())).ok).toBe(true);
  r.advance(450000); const halfway = await get(r, u); expect(halfway.json().session).toMatchObject({ id: timer.id, phase: 'active', remainingMs: 450000 }); expect((await r.pool.query('SELECT remaining_ms FROM engine_focus_sessions')).rows[0].remaining_ms).toBe(900000);
  await restart(r); r.advance(450001); const resumed = await get(r, u); expect(resumed.json().session).toMatchObject({ id: timer.id, phase: 'completed', changedAt: timer.endsAt, remainingMs: 0 }); expect((await r.pool.query('SELECT 1 FROM engine_focus_mutations')).rowCount).toBe(1); expect(r.app.rooms.diagnostics().memberships).toBe(0);
});

it('cancels before deadline without counting completion and old start receipt cannot resurrect it', async () => {
  const r = await open(), u = await guest(r), peer = await seat(r, u), key = randomUUID(), timer = await start(r, u, peer.source, 900, key); r.advance(1000);
  const cancelKey = randomUUID(), cancelled = await action(r, u, timer.id, 'cancel', cancelKey); expect(cancelled.json().session.phase).toBe('cancelled'); expect((await action(r, u, timer.id, 'cancel', cancelKey)).json()).toEqual(cancelled.json()); r.advance(900000);
  expect((await action(r, u, timer.id, 'finish')).json().session.phase).toBe('cancelled'); expect((await post(r, u, 'focus', input(peer.source), key)).json().session.id).toBe(timer.id); expect((await r.pool.query("SELECT 1 FROM engine_focus_sessions WHERE phase='completed'")).rowCount).toBe(0);
});

it('only explicit origin policy can pause/resume and cumulative pause budget expires without awarding completion', async () => {
  const r = await open(), u = await guest(r), deadline = await seat(r, u), timer = await start(r, u, deadline.source);
  expect((await action(r, u, timer.id, 'pause')).statusCode).toBe(403); await action(r, u, timer.id, 'cancel'); await deadline.socket.timeout(5000).emitWithAck('room.leave', deadline.command());
  const library = await seat(r, u, 'focus-library-fixture'), reading = await start(r, u, library.source); r.advance(100000); const key = randomUUID(), paused = await action(r, u, reading.id, 'pause', key); expect(paused.json().session).toMatchObject({ phase: 'paused', remainingMs: 800000, endsAt: null }); r.advance(100000);
  const resumed = await action(r, u, reading.id, 'resume'); expect(resumed.json().session).toMatchObject({ phase: 'active', remainingMs: 800000, pauseBudgetMs: 500000 }); expect(Date.parse(resumed.json().session.endsAt) - Date.parse(reading.startedAt)).toBe(1000000);
  const oldPause = await action(r, u, reading.id, 'pause', key); expect(oldPause.json().session.phase).toBe('active');
  await action(r, u, reading.id, 'pause'); r.advance(500000); expect((await action(r, u, reading.id, 'resume')).json().session).toMatchObject({ phase: 'cancelled', pauseBudgetMs: 0 }); expect((await r.pool.query("SELECT 1 FROM engine_focus_sessions WHERE phase='completed'")).rowCount).toBe(0);
});

it('same account across registration/login sees one timer, logout denies old session but does not fabricate cancellation', async () => {
  const r = await open(), u = await guest(r), peer = await seat(r, u), timer = await start(r, u, peer.source), loginName = 'focus_' + randomUUID().replaceAll('-', '').slice(0, 16), password = 'focus-local-only-test-password';
  const upgraded = await post(r, u, 'session/upgrade', { loginName, password }); expect(upgraded.statusCode).toBe(200); const registered = { cookie: String(upgraded.headers['set-cookie']).split(';')[0], me: MeSchema.parse(upgraded.json()) }; expect(registered.me.profile.id).toBe(u.me.profile.id); expect((await get(r, u)).statusCode).toBe(401);
  const login = await r.app.http.inject({ method: 'POST', url: '/v1/session/login', headers: { origin }, payload: { requestId: randomUUID(), loginName, password } }); expect(login.statusCode).toBe(200); const other = { cookie: String(login.headers['set-cookie']).split(';')[0], me: MeSchema.parse(login.json()) };
  expect((await get(r, registered)).json().session.id).toBe(timer.id); expect((await get(r, other)).json().session.id).toBe(timer.id); await post(r, registered, 'session/logout', {}); expect((await get(r, registered)).statusCode).toBe(401); expect((await get(r, other)).json().session.phase).toBe('active');
});

it('rolls back start when mutation receipt cannot commit, and account erasure cascades own timer/history receipts', async () => {
  const r = await open(), u = await guest(r), peer = await seat(r, u);
  await r.pool.query("CREATE FUNCTION fail_focus_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic focus receipt failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_focus_receipt BEFORE INSERT ON engine_focus_mutations FOR EACH ROW EXECUTE FUNCTION fail_focus_receipt()');
  expect((await post(r, u, 'focus', input(peer.source))).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM engine_focus_sessions')).rowCount).toBe(0); await r.pool.query('DROP TRIGGER fail_focus_receipt ON engine_focus_mutations');
  const timer = await start(r, u, peer.source), exported = await get(r, u, 'me/export'); expect(exported.statusCode).toBe(200); expect(exported.json().domains.focus.items[0].id).toBe(timer.id); expect(JSON.stringify(exported.json().domains.focus)).not.toMatch(/token|fingerprint|source_epoch|source_membership_id/);
  const deleted = await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(u), payload: {} }); expect(deleted.statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM engine_focus_sessions')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_focus_mutations')).rowCount).toBe(0);
});

it('bounds durable start budget, rejects database invalid states and purges terminal history/receipts in batches', async () => {
  const r = await open(), u = await guest(r), peer = await seat(r, u);
  for (let i = 0; i < 12; i++) { const timer = await start(r, u, peer.source); await action(r, u, timer.id, 'cancel'); }
  expect((await post(r, u, 'focus', input(peer.source))).statusCode).toBe(429);
  await expect(r.pool.query('UPDATE engine_focus_sessions SET duration_seconds=1')).rejects.toMatchObject({ code: '23514' }); await expect(r.pool.query("UPDATE engine_focus_sessions SET phase='paused',can_pause=false,ends_at=NULL,paused_until=NULL")).rejects.toMatchObject({ code: '23514' });
  r.advance(90 * 86400000 + 1); await r.app.focus.maintain(); expect((await r.pool.query('SELECT 1 FROM engine_focus_sessions')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_focus_mutations')).rowCount).toBe(0);
});

it('trusted clock moving backwards rejects transition and preserves the original deadline', async () => {
  const r = await open(), u = await guest(r), peer = await seat(r, u), timer = await start(r, u, peer.source); r.advance(-1); expect((await action(r, u, timer.id, 'cancel')).statusCode).toBe(503); const stored = (await r.pool.query('SELECT phase,ends_at FROM engine_focus_sessions')).rows[0]; expect(stored.phase).toBe('active'); expect(stored.ends_at.toISOString()).toBe(timer.endsAt);
});

it('invalidates a source flag generation that changes during awaited focus authorization, even after re-enable', async () => {
  const r = await open(), u = await guest(r), peer = await seat(r, u); let began!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; }), gate = new Promise<void>(resolve => { release = resolve; }), original = r.app.worlds.registry.authorizeWorld.bind(r.app.worlds.registry); let intercept = true;
  r.app.worlds.registry.authorizeWorld = async (token, slug) => { const result = await original(token, slug); if (intercept) { intercept = false; began(); await gate; } return result; };
  const pending = post(r, u, 'focus', input(peer.source)); await started; await r.app.worlds.registry.setEnabled('sdk-sandbox', false); await r.app.worlds.registry.setEnabled('sdk-sandbox', true); release(); expect((await pending).statusCode).toBe(409); expect((await r.pool.query('SELECT 1 FROM engine_focus_sessions')).rowCount).toBe(0);
});
