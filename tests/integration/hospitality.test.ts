import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { MeSchema, RoomAckSchema, OrderResultSchema, type Me, type TravelSource } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';
const origin = 'http://127.0.0.1:3300'; let admin: Pool, serial = 0;
const opened: { app: Awaited<ReturnType<typeof createApp>>; pool: Pool; schema: string }[] = [], sockets = new Set<Socket>();
beforeAll(async () => { const url = new URL(process.env.TEST_DATABASE_URL ?? ''); if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database'); admin = new Pool({ connectionString: url.toString() }); });
afterEach(async () => { for (const socket of sockets) socket.close(); sockets.clear(); for (const r of opened.splice(0)) { await r.app.app.close(); await r.pool.end(); await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`); } });
afterAll(async () => { await admin.end(); });
async function open(allowStaff = true, maxQueue = 50) {
  const schema = 'hospitality_test_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`); const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema); const pool = new Pool({ connectionString: url.toString() }); await migrate(pool); let now = Date.now();
  const module = defineWorld({ schemaVersion: 1, apiVersion: 1, slug: 'hospitality-fixture', version: '1.0.0', title: 'Synthetic hospitality test (not actual Maid world)', kind: 'sandbox', sceneRef: { key: 'hospitality-fixture', version: '1.0.0' }, capacity: 32, seatIds: ['seat-1', 'seat-2', 'seat-3'], capabilities: ['presence', 'seating', 'hospitality'], hospitalityPolicy: { version: '1.0.0', itemKeys: ['coffee', 'tea'], maxActivePerStaff: 1, maxQueue }, accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {}, travel: { prepare: async () => {}, abort: async () => {}, depart: async () => {} } });
  const staffIds = new Set<string>(), config = readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'hospitality-local-test-only-session-secret-000001' }), options = { now: () => now, worlds: { modules: [module] }, ...(allowStaff ? { hospitality: { staff: { permits: async (_db: unknown, actor: { accountId: string }) => staffIds.has(actor.accountId) } } } : {}) }, app = await createApp(config, pool, false, options);
  opened.push({ app, pool, schema }); await app.app.listen(0, '127.0.0.1'); await app.worlds.registry.setEnabled('hospitality-fixture', true);
  return { app, pool, options, config, staffIds, url: await app.app.getUrl(), now: () => now, advance: (ms: number) => { now += ms; } };
}
type Runtime = Awaited<ReturnType<typeof open>>; type User = { me: Me; cookie: string };
const headers = (u: User, key = randomUUID()) => ({ origin, cookie: u.cookie, 'x-csrf-token': u.me.csrfToken, 'idempotency-key': key });
const post = (r: Runtime, u: User, path: string, payload: unknown, key = randomUUID()) => r.app.http.inject({ method: 'POST', url: '/v1/' + path, headers: headers(u, key), payload });
const get = (r: Runtime, u: User, path: string) => r.app.http.inject({ url: '/v1/' + path, headers: { cookie: u.cookie } });
async function guest(r: Runtime, staff = false): Promise<User> { const n = serial++, response = await r.app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: `127.71.${Math.floor(n / 250)}.${n % 250 + 1}`, headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Service Visitor', avatarKey: 'mint' } }); expect(response.statusCode).toBe(201); const user = { me: MeSchema.parse(response.json()), cookie: String(response.headers['set-cookie']).split(';')[0] }; if (staff) r.staffIds.add(user.me.profile.id); return user; }
async function join(r: Runtime, user: User, seatId?: string) {
  const n = serial++, socket = io(r.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: `127.72.${Math.floor(n / 250)}.${n % 250 + 1}` } }, extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }); sockets.add(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  const joined = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join', { schemaVersion: 1, requestId: randomUUID(), worldSlug: 'hospitality-fixture', worldVersion: '1.0.0', sceneVersion: '1.0.0' })); if (!joined.ok || joined.result.type !== 'snapshot') throw new Error('Fixture join failed');
  const source = { epoch: joined.result.epoch, roomId: joined.result.roomId, membershipId: joined.result.membershipId }, command = () => ({ schemaVersion: 1, requestId: randomUUID(), ...source });
  if (seatId) expect(RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('seat.claim', { ...command(), seatId })).ok).toBe(true);
  return { socket, source, command };
}
const input = (source: TravelSource) => ({ schemaVersion: 1, source, policyVersion: '1.0.0', itemKey: 'coffee' });
const mutation = (source: TravelSource, expectedVersion = 0) => ({ schemaVersion: 1, source, expectedVersion });
async function place(r: Runtime, u: User, source: TravelSource, key = randomUUID()) { const response = await post(r, u, 'orders', input(source), key); expect(response.statusCode).toBe(201); return OrderResultSchema.parse(response.json()).order; }
const act = (r: Runtime, u: User, id: string, action: string, source: TravelSource, expectedVersion = 0, key = randomUUID()) => post(r, u, `orders/${id}/${action}`, mutation(source, expectedVersion), key);
async function restart(r: Runtime) { await r.app.app.close(); const old = r.app, app = await createApp(r.config, r.pool, false, r.options); opened.find(item => item.app === old)!.app = app; r.app = app; await app.app.listen(0, '127.0.0.1'); r.url = await app.app.getUrl(); await app.worlds.registry.setEnabled('hospitality-fixture', true); }

it('20 actual TCP staff claims produce exactly one assigned staff,version and committed receipt', async () => {
  const r = await open(), customer = await guest(r), visit = await join(r, customer, 'seat-1'), order = await place(r, customer, visit.source), staff = [];
  for (let i = 0; i < 20; i++) { const user = await guest(r, true); staff.push({ user, visit: await join(r, user), key: randomUUID() }); }
  const responses = await Promise.all(staff.map(async peer => { const response = await fetch(r.url + `/v1/orders/${order.id}/claim`, { method: 'POST', headers: { ...headers(peer.user, peer.key), 'content-type': 'application/json' }, body: JSON.stringify(mutation(peer.visit.source)), signal: AbortSignal.timeout(5000) }); return { status: response.status, body: await response.json() }; }));
  expect(responses.filter(response => response.status === 200)).toHaveLength(1); expect(responses.filter(response => response.status === 409)).toHaveLength(19);
  const winner = staff[responses.findIndex(response => response.status === 200)], row = (await r.pool.query('SELECT * FROM engine_hospitality_orders')).rows[0]; expect(row).toMatchObject({ phase: 'ASSIGNED', version: 1, assignee_id: winner.user.me.profile.id }); expect((await r.pool.query("SELECT 1 FROM engine_hospitality_mutations WHERE operation='claim'")).rowCount).toBe(1);
  const retry = await act(r, winner.user, order.id, 'claim', winner.visit.source, 0, winner.key); expect(retry.statusCode).toBe(200); expect(retry.json()).toEqual(responses.find(response => response.status === 200)!.body);
  expect(JSON.stringify(retry.json())).not.toContain(customer.me.profile.id); expect(JSON.stringify(retry.json())).not.toContain(winner.user.me.profile.id);
});

it('requires actual seat/source/policy and rejects caller-selected identity,staff,time,phase or assignee', async () => {
  const r = await open(), u = await guest(r), visit = await join(r, u);
  expect((await post(r, u, 'orders', input(visit.source))).statusCode).toBe(409);
  expect(RoomAckSchema.parse(await visit.socket.timeout(5000).emitWithAck('seat.claim', { ...visit.command(), seatId: 'seat-1' })).ok).toBe(true);
  for (const extra of [{ customerId: u.me.profile.id }, { role: 'staff' }, { assigneeId: u.me.profile.id }, { phase: 'COMPLETED' }, { createdAt: new Date().toISOString() }, { reward: 100 }]) expect((await post(r, u, 'orders', { ...input(visit.source), ...extra })).statusCode).toBe(422);
  expect((await post(r, u, 'orders', { ...input(visit.source), policyVersion: '2.0.0' })).statusCode).toBe(404); expect((await post(r, u, 'orders', { ...input(visit.source), itemKey: 'unknown' })).statusCode).toBe(404);
  for (const source of [{ ...visit.source, epoch: randomUUID() }, { ...visit.source, membershipId: randomUUID() }]) expect((await post(r, u, 'orders', input(source))).statusCode).toBe(409);
  const other = await guest(r); expect((await post(r, other, 'orders', input(visit.source))).statusCode).toBe(409); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_orders')).rowCount).toBe(0);
});

it('denies off-role/self claim and defaults to no trusted staff authority', async () => {
  const r = await open(false), customer = await guest(r, true), c = await join(r, customer, 'seat-1'), order = await place(r, customer, c.source), staff = await guest(r, true), s = await join(r, staff);
  expect((await act(r, staff, order.id, 'claim', s.source)).statusCode).toBe(404); expect((await act(r, customer, order.id, 'claim', c.source)).statusCode).toBe(404);
  expect((await post(r, staff, 'orders/queue', { schemaVersion: 1, source: s.source })).statusCode).toBe(404); expect((await get(r, staff, 'orders/' + order.id)).statusCode).toBe(404);
});

it('keeps participant reads,exports and staff queue private;Origin,CSRF,query and authority injection reject', async () => {
  const r = await open(), customer = await guest(r), c = await join(r, customer, 'seat-1'), order = await place(r, customer, c.source), stranger = await guest(r), s = await join(r, stranger);
  expect((await get(r, stranger, 'orders/' + order.id)).statusCode).toBe(404); expect(JSON.stringify((await get(r, stranger, 'me/export')).json())).not.toContain(order.id);
  expect((await act(r, stranger, order.id, 'cancel', s.source)).statusCode).toBe(404); expect((await post(r, stranger, 'orders/queue', { schemaVersion: 1, source: s.source })).statusCode).toBe(404);
  r.staffIds.add(stranger.me.profile.id); const queue = await post(r, stranger, 'orders/queue', { schemaVersion: 1, source: s.source }); expect(queue.statusCode).toBe(200); expect(queue.json().items[0].id).toBe(order.id); expect(JSON.stringify(queue.json())).not.toContain(customer.me.profile.id);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/orders', headers: { ...headers(customer), origin: 'https://example.invalid' }, payload: input(c.source) })).statusCode).toBe(403);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/orders', headers: { origin, cookie: customer.cookie, 'idempotency-key': randomUUID() }, payload: input(c.source) })).statusCode).toBe(403);
  expect((await get(r, customer, 'orders/' + order.id + '?accountId=' + stranger.me.profile.id)).statusCode).toBe(422); expect((await r.app.http.inject({ url: '/v1/orders/' + order.id })).statusCode).toBe(401);
  expect((await act(r, stranger, order.id, 'claim', s.source, 1)).statusCode).toBe(409); expect((await post(r, stranger, `orders/${order.id}/claim`, { ...mutation(s.source), assigneeId: stranger.me.profile.id })).statusCode).toBe(422);
});

it('serializes pending cancellation against claim, with no terminal reactivation', async () => {
  const r = await open(), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r, true), s = await join(r, staff), order = await place(r, customer, c.source);
  const results = await Promise.all([act(r, customer, order.id, 'cancel', c.source), act(r, staff, order.id, 'claim', s.source)]); expect(results.filter(response => response.statusCode === 200)).toHaveLength(1); expect(results.filter(response => response.statusCode === 409)).toHaveLength(1);
  const row = (await r.pool.query('SELECT * FROM engine_hospitality_orders')).rows[0]; expect(row.version).toBe(1); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_mutations')).rowCount).toBe(2);
  expect((await act(r, row.phase === 'CANCELLED' ? staff : customer, order.id, row.phase === 'CANCELLED' ? 'claim' : 'cancel', row.phase === 'CANCELLED' ? s.source : c.source, 1)).statusCode).toBe(409);
});

it('enforces one active customer,per-staff cap and room queue policy', async () => {
  const r = await open(true, 2), a = await guest(r), av = await join(r, a, 'seat-1'), b = await guest(r), bv = await join(r, b, 'seat-2'), c = await guest(r), cv = await join(r, c, 'seat-3'), staff = await guest(r, true), sv = await join(r, staff), first = await place(r, a, av.source);
  expect((await post(r, a, 'orders', input(av.source))).statusCode).toBe(409); const second = await place(r, b, bv.source); expect((await post(r, c, 'orders', input(cv.source))).statusCode).toBe(429);
  expect((await act(r, staff, first.id, 'claim', sv.source)).statusCode).toBe(200); expect((await act(r, staff, second.id, 'claim', sv.source)).statusCode).toBe(409); expect((await r.pool.query("SELECT 1 FROM engine_hospitality_orders WHERE phase='ASSIGNED'")).rowCount).toBe(1);
});

it('persists exact place retry across API restart and cannot reuse key for changed input', async () => {
  const r = await open(), customer = await guest(r), c = await join(r, customer, 'seat-1'), key = randomUUID(), order = await place(r, customer, c.source, key);
  expect((await post(r, customer, 'orders', { ...input(c.source), itemKey: 'tea' }, key)).statusCode).toBe(409); await restart(r);
  const retry = await post(r, customer, 'orders', input(c.source), key); expect(retry.statusCode).toBe(201); expect(retry.json().order).toEqual(order); expect((await get(r, customer, 'orders/' + order.id)).statusCode).toBe(200); expect((await post(r, customer, 'orders', input(c.source))).statusCode).toBe(409); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_mutations')).rowCount).toBe(1);
});

it('rolls back order and assignment if durable mutation receipt fails', async () => {
  const r = await open(), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r, true), s = await join(r, staff);
  await r.pool.query("CREATE FUNCTION fail_order_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic hospitality receipt failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_order_receipt BEFORE INSERT ON engine_hospitality_mutations FOR EACH ROW EXECUTE FUNCTION fail_order_receipt()');
  expect((await post(r, customer, 'orders', input(c.source))).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_orders')).rowCount).toBe(0); await r.pool.query('DROP TRIGGER fail_order_receipt ON engine_hospitality_mutations');
  const order = await place(r, customer, c.source); await r.pool.query('CREATE TRIGGER fail_order_receipt BEFORE INSERT ON engine_hospitality_mutations FOR EACH ROW EXECUTE FUNCTION fail_order_receipt()'); expect((await act(r, staff, order.id, 'claim', s.source)).statusCode).toBe(503); expect((await r.pool.query('SELECT phase,version,assignee_id FROM engine_hospitality_orders')).rows[0]).toEqual({ phase: 'PENDING', version: 0, assignee_id: null });
});

it('enforces bilateral block and current world closure before service interactions', async () => {
  const r = await open(), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r, true), s = await join(r, staff), order = await place(r, customer, c.source);
  expect((await post(r, customer, 'blocks', { targetId: staff.me.profile.id, blocked: true })).statusCode).toBe(200); expect((await act(r, staff, order.id, 'claim', s.source)).statusCode).toBe(404); expect((await post(r, staff, 'orders/queue', { schemaVersion: 1, source: s.source })).json().items).toEqual([]);
  await r.pool.query("INSERT INTO safety_incident_controls VALUES('hospitality-fixture','world',true,NULL,$1)", [new Date(r.now())]); expect((await act(r, customer, order.id, 'cancel', c.source)).statusCode).toBe(404); expect((await get(r, customer, 'orders/' + order.id)).statusCode).toBe(200);
});

it('invalidates a disable/re-enable generation during awaited authorization', async () => {
  const r = await open(), customer = await guest(r), c = await join(r, customer, 'seat-1'); let began!: () => void, release!: () => void; const started = new Promise<void>(resolve => { began = resolve; }), gate = new Promise<void>(resolve => { release = resolve; }), original = r.app.worlds.registry.authorizeWorld.bind(r.app.worlds.registry); let intercept = true;
  r.app.worlds.registry.authorizeWorld = async (token, slug) => { const result = await original(token, slug); if (intercept) { intercept = false; began(); await gate; } return result; };
  const pending = post(r, customer, 'orders', input(c.source)); await started; await r.app.worlds.registry.setEnabled('hospitality-fixture', false); await r.app.worlds.registry.setEnabled('hospitality-fixture', true); release(); expect((await pending).statusCode).toBe(409); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_orders')).rowCount).toBe(0);
});

it('requeues on staff erasure without retaining staff identity,and customer erasure removes requests/receipts', async () => {
  const r = await open(), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r, true), s = await join(r, staff), order = await place(r, customer, c.source); expect((await act(r, staff, order.id, 'claim', s.source)).statusCode).toBe(200);
  const exported = (await get(r, customer, 'me/export')).json().domains.hospitality; expect(exported.items[0].id).toBe(order.id); expect(JSON.stringify(exported)).not.toMatch(/customer_id|assignee_id|membership|fingerprint/);
  expect((await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(staff), payload: {} })).statusCode).toBe(200); expect((await r.pool.query('SELECT phase,version,assignee_id FROM engine_hospitality_orders')).rows[0]).toEqual({ phase: 'PENDING', version: 2, assignee_id: null });
  expect((await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(customer), payload: {} })).statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_orders')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_mutations')).rowCount).toBe(0);
});

it('bounds durable placement quota while allowing exact retry,and SQL rejects invalid active assignments', async () => {
  const r = await open(), customer = await guest(r), c = await join(r, customer, 'seat-1'); let lastKey = randomUUID();
  for (let i = 0; i < 12; i++) { lastKey = randomUUID(); const order = await place(r, customer, c.source, lastKey); expect((await act(r, customer, order.id, 'cancel', c.source)).statusCode).toBe(200); }
  expect((await post(r, customer, 'orders', input(c.source))).statusCode).toBe(429); expect((await post(r, customer, 'orders', input(c.source), lastKey)).statusCode).toBe(201);
  await expect(r.pool.query("UPDATE engine_hospitality_orders SET phase='ASSIGNED' WHERE id=(SELECT id FROM engine_hospitality_orders LIMIT 1)")).rejects.toMatchObject({ code: '23514' });
});
