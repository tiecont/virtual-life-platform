import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { MeSchema, RoomAckSchema, OrderResultSchema, type Me, type TravelSource } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import { HospitalityOutbox, type HospitalityCompletionSink } from '../../apps/platform-api/src/hospitality/outbox';
import { DEFAULT_PROGRESSION_POLICY } from '../../apps/platform-api/src/progression/policy';
const origin = 'http://127.0.0.1:3300'; let admin: Pool, serial = 0;
const opened: { app: Awaited<ReturnType<typeof createApp>>; pool: Pool; schema: string }[] = [], sockets = new Set<Socket>();
beforeAll(async () => { const url = new URL(process.env.TEST_DATABASE_URL ?? ''); if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database'); admin = new Pool({ connectionString: url.toString() }); });
afterEach(async () => { for (const socket of sockets) socket.close(); sockets.clear(); for (const r of opened.splice(0)) { await r.app.app.close(); await r.pool.end(); await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`); } });
afterAll(async () => { await admin.end(); });
async function open(allowStaff = true, maxQueue = 50, voluntary = false, maxStaff = 32, service?: 'coffee' | 'dining' | 'mocktail', progression = false,startAt?:number) {
  const schema = 'hospitality_test_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`); const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema); const pool = new Pool({ connectionString: url.toString() }); await migrate(pool); let now = startAt??Date.now();
  const menu = service ? { items: [{ key: service, label: 'Synthetic ' + service, workflowKey: service + '-workflow' }], workflows: [{ key: service + '-workflow', version: '1.0.0', kind: 'timed-courses', courses: (service === 'dining' ? ['starter', 'main', 'dessert'] : [service]).map(key => ({ key, label: 'Synthetic ' + key, prepareSeconds: 2 })) }] } : undefined;
  const module = defineWorld({ schemaVersion: 1, apiVersion: 1, slug: 'hospitality-fixture', version: '1.0.0', title: 'Synthetic hospitality test (not actual Maid world)', kind: 'sandbox', sceneRef: { key: 'hospitality-fixture', version: '1.0.0' }, capacity: 32, seatIds: ['seat-1', 'seat-2', 'seat-3'], capabilities: ['presence', 'seating', 'hospitality'], hospitalityPolicy: { version: '1.0.0', itemKeys: service ? [service] : ['coffee', 'tea'], maxActivePerStaff: 1, maxQueue, ...(menu ? { menu } : {}), ...(voluntary ? { staffing: { kind: 'voluntary', maxStaff } } : {}) }, accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {}, travel: { prepare: async () => {}, abort: async () => {}, depart: async () => {} } });
  const chosen = progression ? defineWorld({ ...module.definition, slug: 'maid', appearancePolicy:{apron:'on-shift'}, title: 'Synthetic reward fixture, not actual Maid integration' }, { bootstrap:async()=>{},shutdown:async()=>{},onJoin:async()=>{},onLeave:async()=>{},onCommand:async()=>{} }) : module;
  const staffIds = new Set<string>(), config = readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'hospitality-local-test-only-session-secret-000001' }), options = { now: () => now, worlds: { modules: [chosen] }, ...(progression ? { progression: { policy: { ...DEFAULT_PROGRESSION_POLICY, enabled: true } } } : {}), ...(allowStaff ? { hospitality: { staff: { permits: async (_db: unknown, actor: { accountId: string }) => staffIds.has(actor.accountId) } } } : {}) }, app = await createApp(config, pool, false, options);
  opened.push({ app, pool, schema }); await app.app.listen(0, '127.0.0.1'); await app.worlds.registry.setEnabled(chosen.definition.slug, true);
  return { app, pool, options, config, staffIds, slug:chosen.definition.slug, url: await app.app.getUrl(), now: () => now, advance: (ms: number) => { now += ms; } };
}
type Runtime = Awaited<ReturnType<typeof open>>; type User = { me: Me; cookie: string };
const headers = (u: User, key = randomUUID()) => ({ origin, cookie: u.cookie, 'x-csrf-token': u.me.csrfToken, 'idempotency-key': key });
const post = (r: Runtime, u: User, path: string, payload: unknown, key = randomUUID()) => r.app.http.inject({ method: 'POST', url: '/v1/' + path, headers: headers(u, key), payload });
const get = (r: Runtime, u: User, path: string) => r.app.http.inject({ url: '/v1/' + path, headers: { cookie: u.cookie } });
async function guest(r: Runtime, staff = false): Promise<User> { const n = serial++, response = await r.app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: `127.71.${Math.floor(n / 250)}.${n % 250 + 1}`, headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Service Visitor', avatarKey: 'mint' } }); expect(response.statusCode).toBe(201); const user = { me: MeSchema.parse(response.json()), cookie: String(response.headers['set-cookie']).split(';')[0] }; if (staff) r.staffIds.add(user.me.profile.id); return user; }
async function join(r: Runtime, user: User, seatId?: string) {
  const n = serial++, socket = io(r.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: `127.72.${Math.floor(n / 250)}.${n % 250 + 1}` } }, extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }); sockets.add(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  const joined = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join', { schemaVersion: 1, requestId: randomUUID(), worldSlug: r.slug, worldVersion: '1.0.0', sceneVersion: '1.0.0' })); if (!joined.ok || joined.result.type !== 'snapshot') throw new Error('Fixture join failed');
  const source = { epoch: joined.result.epoch, roomId: joined.result.roomId, membershipId: joined.result.membershipId }, command = () => ({ schemaVersion: 1, requestId: randomUUID(), ...source });
  if (seatId) expect(RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('seat.claim', { ...command(), seatId })).ok).toBe(true);
  return { socket, source, command };
}
const input = (source: TravelSource) => ({ schemaVersion: 1, source, policyVersion: '1.0.0', itemKey: 'coffee' });
const mutation = (source: TravelSource, expectedVersion = 0) => ({ schemaVersion: 1, source, expectedVersion });
async function place(r: Runtime, u: User, source: TravelSource, key = randomUUID()) { const response = await post(r, u, 'orders', input(source), key); expect(response.statusCode).toBe(201); return OrderResultSchema.parse(response.json()).order; }
const act = (r: Runtime, u: User, id: string, action: string, source: TravelSource, expectedVersion = 0, key = randomUUID()) => post(r, u, `orders/${id}/${action}`, mutation(source, expectedVersion), key);
it('private cosmetics inventory uses trusted policy and entitlement rather than client XP and hides other owners',async()=>{
 const r=await open(false,50,true,32,'coffee',true),u=await guest(r),other=await guest(r);
 expect((await r.app.http.inject({url:'/v1/me/cosmetics'})).statusCode).toBe(401);
 const first=await get(r,u,'me/cosmetics');expect(first.statusCode).toBe(200);expect(first.json()).toEqual({schemaVersion:1,enabled:true,items:[{key:'casual',requiredXp:0,owned:true},{key:'cafe-apron',requiredXp:10,owned:false}]});
 await r.pool.query("INSERT INTO engine_progression_entitlements VALUES($1,'cafe-apron',$2)",[u.me.profile.id,new Date(r.now())]);
 expect((await get(r,u,'me/cosmetics')).json().items[1].owned).toBe(true);expect((await get(r,u,'me/progression')).json().lifetimeXp).toBe(0);expect((await get(r,other,'me/cosmetics')).json().items[1].owned).toBe(false);
 expect((await get(r,other,'me/cosmetics?accountId='+u.me.profile.id)).statusCode).toBe(422);
 expect((await get(r,other,'me/cosmetics')).body).not.toContain(u.me.profile.id);
});
it('approved outfit requires entitlement and current voluntary shift, falls back per participant and never grants service authority',async()=>{
 const r=await open(false,50,true,32,'coffee',true),u=await guest(r),other=await guest(r),v=await join(r,u),peer=await join(r,other),body={schemaVersion:1,source:v.source,outfit:'cafe-apron'};
 const snapshot=async()=>{const ack=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.snapshot',v.command()));if(!ack.ok||ack.result.type!=='snapshot')throw Error('Snapshot unavailable');return ack.result;};
 expect((await post(r,u,'me/appearance',body)).statusCode).toBe(404);
 await r.pool.query("INSERT INTO engine_progression_entitlements VALUES($1,'cafe-apron',$2)",[u.me.profile.id,new Date(r.now())]);expect((await post(r,u,'me/appearance',body)).statusCode).toBe(404);
 const active=await shift(r,u,v.source),key=randomUUID();expect((await post(r,u,'me/appearance',body,key)).json().outfit).toBe('cafe-apron');expect((await snapshot()).participants.find(p=>p.profile.id===u.me.profile.id)?.outfit).toBe('cafe-apron');
 expect((await post(r,other,'me/appearance',{...body,source:peer.source})).statusCode).toBe(404);expect((await post(r,u,'me/appearance',{...body,role:'staff'})).statusCode).toBe(422);
 const casual={schemaVersion:1,source:v.source,outfit:'casual'};await post(r,u,'me/appearance',casual);expect((await post(r,u,'me/appearance',body,key)).json().outfit).toBe('casual');
 await post(r,u,'me/appearance',body);await post(r,u,'staff/shifts/'+active.id+'/end',{schemaVersion:1});expect((await snapshot()).participants.find(p=>p.profile.id===u.me.profile.id)?.outfit).toBe('casual');expect((await post(r,u,'me/appearance',body)).statusCode).toBe(404);
 expect((await r.pool.query('SELECT 1 FROM engine_hospitality_shifts WHERE account_id=$1 AND ended_at IS NULL',[u.me.profile.id])).rowCount).toBe(0);
});

it('outfit receipt rollback, stale membership and erased entitlement cannot leave an approved uniform',async()=>{
 const r=await open(false,50,true,32,'coffee',true),u=await guest(r),v=await join(r,u);await shift(r,u,v.source);await r.pool.query("INSERT INTO engine_progression_entitlements VALUES($1,'cafe-apron',$2)",[u.me.profile.id,new Date(r.now())]);const body={schemaVersion:1,source:v.source,outfit:'cafe-apron'},key=randomUUID();
 await r.pool.query("CREATE FUNCTION fail_appearance_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outfit receipt failure'; END $$");await r.pool.query('CREATE TRIGGER fail_appearance_receipt BEFORE INSERT ON engine_progression_appearance_mutations FOR EACH ROW EXECUTE FUNCTION fail_appearance_receipt()');expect((await post(r,u,'me/appearance',body,key)).statusCode).toBe(503);expect((await r.pool.query('SELECT 1 FROM engine_progression_appearance')).rowCount).toBe(0);await r.pool.query('DROP TRIGGER fail_appearance_receipt ON engine_progression_appearance_mutations');expect((await post(r,u,'me/appearance',body,key)).statusCode).toBe(200);
 await r.pool.query('DELETE FROM engine_progression_entitlements WHERE account_id=$1',[u.me.profile.id]);const ack=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.snapshot',v.command()));expect(ack.ok&&ack.result.type==='snapshot'&&ack.result.participants.find(p=>p.profile.id===u.me.profile.id)?.outfit).toBe('casual');
 await restart(r);expect((await post(r,u,'me/appearance',body)).statusCode).toBe(409);expect((await get(r,u,'me/export')).json().domains.appearance.selected).toBe('cafe-apron');await r.app.http.inject({method:'DELETE',url:'/v1/me',headers:headers(u),payload:{}});expect((await r.pool.query('SELECT 1 FROM engine_progression_appearance')).rowCount).toBe(0);
});
it.each([{at:'2026-11-05T12:00:00.000Z',expected:4,daily:[{day:'2026-11-05',grants:2}]},{at:'2026-11-05T23:59:00.000Z',expected:6,daily:[{day:'2026-11-05',grants:1},{day:'2026-11-06',grants:2}]}])('reviewed progression outbox consumer grants each participant once and bounds repeated partner farming ($at)', async ({at,expected,daily})=>{
  const r=await open(false,50,true,32,'coffee',true,Date.parse(at)),customer=await guest(r),staff=await guest(r),c=await join(r,customer,'seat-1'),s=await join(r,staff);await shift(r,staff,s.source);
  for(let n=0;n<3;n++){
    const order=await place(r,customer,c.source);await act(r,staff,order.id,'claim',s.source,0);await act(r,staff,order.id,'prepare',s.source,1);r.advance(2000);await act(r,staff,order.id,'ready',s.source,2);await act(r,staff,order.id,'serve',s.source,3);expect((await post(r,customer,'orders/'+order.id+'/complete',{schemaVersion:1,expectedVersion:4})).statusCode).toBe(200);
    await Promise.all([r.app.hospitalityOutbox.drain(),r.app.hospitalityOutbox.drain()]);r.advance(60000);
  }
  expect((await get(r,customer,'me/progression')).json().lifetimeXp).toBe(expected);expect((await get(r,staff,'me/progression')).json().lifetimeXp).toBe(expected);expect((await r.pool.query('SELECT 1 FROM engine_progression_ledger')).rowCount).toBe(expected);expect((await r.pool.query("SELECT 1 FROM engine_hospitality_deliveries WHERE consumer_key='progression-completion-v1'")).rowCount).toBe(3);
  expect((await r.pool.query("SELECT (completed_at AT TIME ZONE 'UTC')::date::text AS day,count(*)::int AS grants FROM engine_progression_ledger WHERE account_id=$1 GROUP BY day ORDER BY day",[customer.me.profile.id])).rows).toEqual(daily);
  await r.app.http.inject({method:'DELETE',url:'/v1/me',headers:headers(customer),payload:{}});expect((await r.pool.query('SELECT 1 FROM engine_progression_partners')).rowCount).toBe(0);expect((await get(r,staff,'me/progression')).json().lifetimeXp).toBe(expected);
});
async function restart(r: Runtime) { await r.app.app.close(); const old = r.app, app = await createApp(r.config, r.pool, false, r.options); opened.find(item => item.app === old)!.app = app; r.app = app; await app.app.listen(0, '127.0.0.1'); r.url = await app.app.getUrl(); await app.worlds.registry.setEnabled(r.slug, true); }
async function shift(r: Runtime, u: User, source: TravelSource, key = randomUUID()) { const response = await post(r, u, 'staff/shifts', { schemaVersion: 1, source, policyVersion: '1.0.0' }, key); expect(response.statusCode).toBe(201); return response.json().shift as { id: string; phase: string }; }

it('20 actual TCP staff claims produce exactly one assigned staff,version and committed receipt', async () => {
  const r = await open(false, 50, true), customer = await guest(r), visit = await join(r, customer, 'seat-1'), order = await place(r, customer, visit.source), staff = [];
  for (let i = 0; i < 20; i++) { const user = await guest(r), visit = await join(r, user); await shift(r, user, visit.source); staff.push({ user, visit, key: randomUUID() }); }
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

it('voluntary active shift alone grants service permission and ending it atomically requeues one unchanged item', async () => {
  const r = await open(false, 50, true), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r), s = await join(r, staff), order = await place(r, customer, c.source);
  expect((await act(r, staff, order.id, 'claim', s.source)).statusCode).toBe(404); const active = await shift(r, staff, s.source); expect(active.phase).toBe('active'); expect((await act(r, staff, order.id, 'claim', s.source)).statusCode).toBe(200);
  const ended = await post(r, staff, `staff/shifts/${active.id}/end`, { schemaVersion: 1 }); expect(ended.statusCode).toBe(200); expect(ended.json().shift).toMatchObject({ phase: 'ended', reason: 'voluntary' });
  expect((await r.pool.query('SELECT id,item_key,phase,version,assignee_id FROM engine_hospitality_orders')).rows).toEqual([{ id: order.id, item_key: 'coffee', phase: 'PENDING', version: 2, assignee_id: null }]); expect((await act(r, staff, order.id, 'claim', s.source, 2)).statusCode).toBe(404);
});

it('actual disconnect preserves assignment inside grace,reconnect resumes the same shift,and timeout requeues without duplicating items', async () => {
  const r = await open(false, 50, true), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r), s = await join(r, staff), active = await shift(r, staff, s.source), order = await place(r, customer, c.source); await act(r, staff, order.id, 'claim', s.source);
  const disconnected = new Promise<void>(resolve => r.app.gateway.io.sockets.sockets.get(s.socket.id!)!.once('disconnect', () => resolve()));
  s.socket.close(); await disconnected;
  // Synchronize the real server disconnect rather than using wall-clock sleeps.
  await r.app.rooms.maintain(); r.advance(14999); await r.app.hospitality.maintain();
  expect((await get(r, staff, 'staff/shift')).json().shift).toMatchObject({ id: active.id, phase: 'interrupted' }); expect((await get(r, customer, 'orders/' + order.id)).json().order.phase).toBe('ASSIGNED');
  const restored = await join(r, staff); expect(restored.source).toEqual(s.source); await r.app.hospitality.maintain(); expect((await get(r, staff, 'staff/shift')).json().shift.phase).toBe('active');
  const dropped = new Promise<void>(resolve => r.app.gateway.io.sockets.sockets.get(restored.socket.id!)!.once('disconnect', () => resolve())); restored.socket.close(); await dropped; await r.app.rooms.maintain(); r.advance(15000); await r.app.hospitality.maintain();
  expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ id: order.id, phase: 'PENDING', version: 2 }); expect((await get(r, staff, 'staff/shift')).json().shift).toMatchObject({ phase: 'ended', reason: 'disconnected' }); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_orders')).rowCount).toBe(1);
  const replacement = await guest(r), replacementVisit = await join(r, replacement); await shift(r, replacement, replacementVisit.source); expect((await act(r, replacement, order.id, 'claim', replacementVisit.source, 0)).statusCode).toBe(409); expect((await act(r, replacement, order.id, 'claim', replacementVisit.source, 2)).statusCode).toBe(200); await r.app.hospitality.maintain(); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'ASSIGNED', version: 3 });
});

it('recovery after restart ends old shifts and cancels abandoned customer work without new admission', async () => {
  const r = await open(false, 50, true), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r), s = await join(r, staff), active = await shift(r, staff, s.source), order = await place(r, customer, c.source); await act(r, staff, order.id, 'claim', s.source); await restart(r); await r.app.hospitality.maintain();
  expect((await get(r, staff, 'staff/shift')).json().shift).toMatchObject({ id: active.id, phase: 'ended', reason: 'restart' }); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'CANCELLED', version: 3 });
  const next = await join(r, staff); await shift(r, staff, next.source); expect((await act(r, staff, order.id, 'claim', next.source, 0)).statusCode).toBe(404); expect((await act(r, staff, order.id, 'claim', next.source, 2)).statusCode).toBe(404);
});

it('shift source/policy/cap are trusted,own retries are durable and peer shifts remain private', async () => {
  const r = await open(false, 50, true, 1), a = await guest(r), av = await join(r, a), b = await guest(r), bv = await join(r, b), key = randomUUID(), active = await shift(r, a, av.source, key);
  expect((await post(r, a, 'staff/shifts', { schemaVersion: 1, source: av.source, policyVersion: '1.0.0' }, key)).json().shift.id).toBe(active.id); expect((await post(r, b, 'staff/shifts', { schemaVersion: 1, source: bv.source, policyVersion: '1.0.0' })).statusCode).toBe(409);
  expect((await post(r, b, `staff/shifts/${active.id}/end`, { schemaVersion: 1 })).statusCode).toBe(404); expect((await get(r, b, 'staff/shift')).json().shift).toBeNull(); expect(JSON.stringify((await get(r, b, 'me/export')).json())).not.toContain(active.id);
  expect((await post(r, a, 'staff/shifts', { schemaVersion: 1, source: av.source, policyVersion: '2.0.0' }, key)).statusCode).toBe(409);
  await post(r, a, `staff/shifts/${active.id}/end`, { schemaVersion: 1 }); const next = await shift(r, b, bv.source); expect(next.id).not.toBe(active.id);
  const exported = (await get(r, a, 'me/export')).json().domains.hospitality; expect(exported.shifts[0].id).toBe(active.id); expect(JSON.stringify(exported)).not.toMatch(/owner_epoch|membership_id|fingerprint/);
});

it('offered staffing is explicit and cannot be added through role or duration fields', async () => {
  const r = await open(false), a = await guest(r), av = await join(r, a); const body = { schemaVersion: 1, source: av.source, policyVersion: '1.0.0' };
  expect((await post(r, a, 'staff/shifts', body)).statusCode).toBe(404); for (const extra of [{ role: 'staff' }, { accountId: a.me.profile.id }, { expiresAt: new Date().toISOString() }, { maxActivePerStaff: 99 }]) expect((await post(r, a, 'staff/shifts', { ...body, ...extra })).statusCode).toBe(422);
});

it('failed end receipt rolls back both shift withdrawal and order requeue;own end works after leaving a closed world', async () => {
  const r = await open(false, 50, true), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r), s = await join(r, staff), active = await shift(r, staff, s.source), order = await place(r, customer, c.source); await act(r, staff, order.id, 'claim', s.source);
  await r.pool.query("CREATE FUNCTION fail_shift_end() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='end' THEN RAISE EXCEPTION 'synthetic shift end receipt failure'; END IF; RETURN NEW; END $$"); await r.pool.query('CREATE TRIGGER fail_shift_end BEFORE INSERT ON engine_hospitality_shift_mutations FOR EACH ROW EXECUTE FUNCTION fail_shift_end()');
  expect((await post(r, staff, `staff/shifts/${active.id}/end`, { schemaVersion: 1 })).statusCode).toBe(503); expect((await get(r, customer, 'orders/' + order.id)).json().order.phase).toBe('ASSIGNED'); expect((await get(r, staff, 'staff/shift')).json().shift.phase).toBe('active'); await r.pool.query('DROP TRIGGER fail_shift_end ON engine_hospitality_shift_mutations');
  await s.socket.timeout(5000).emitWithAck('room.leave', s.command()); await r.app.worlds.registry.setEnabled('hospitality-fixture', false); expect((await post(r, staff, `staff/shifts/${active.id}/end`, { schemaVersion: 1 })).statusCode).toBe(200); expect((await get(r, customer, 'orders/' + order.id)).json().order.phase).toBe('PENDING');
});

it('ending a shift racing a claim cannot leave an assignment owned by off-shift staff,and stale receipt cannot reactivate it', async () => {
  const r = await open(false, 50, true), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r), s = await join(r, staff), active = await shift(r, staff, s.source), order = await place(r, customer, c.source), key = randomUUID();
  const results = await Promise.all([act(r, staff, order.id, 'claim', s.source, 0, key), post(r, staff, `staff/shifts/${active.id}/end`, { schemaVersion: 1 })]); expect(results[1].statusCode).toBe(200); expect([200, 404]).toContain(results[0].statusCode);
  expect((await r.pool.query('SELECT phase,assignee_id FROM engine_hospitality_orders')).rows[0]).toEqual({ phase: 'PENDING', assignee_id: null }); expect((await act(r, staff, order.id, 'claim', s.source, 0, key)).statusCode).toBe(404);
  await shift(r, staff, s.source); expect((await post(r, staff, `staff/shifts/${active.id}/end`, { schemaVersion: 1 })).statusCode).toBe(200); expect((await get(r, staff, 'staff/shift')).json().shift.phase).toBe('active');
});

it('one remaining tab keeps the shift active while expiry ends it and cancels stale customer work', async () => {
  const r = await open(false, 50, true), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r), s = await join(r, staff), tab = await join(r, staff), active = await shift(r, staff, s.source), order = await place(r, customer, c.source); await act(r, staff, order.id, 'claim', tab.source);
  const disconnected = new Promise<void>(resolve => r.app.gateway.io.sockets.sockets.get(s.socket.id!)!.once('disconnect', () => resolve())); s.socket.close(); await disconnected; await r.app.rooms.maintain(); r.advance(15000); await r.app.hospitality.maintain(); expect((await get(r, staff, 'staff/shift')).json().shift).toMatchObject({ id: active.id, phase: 'active' });
  r.advance(4 * 3600000); await r.app.hospitality.maintain(); await r.app.hospitality.maintain(); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'CANCELLED', version: 3 }); expect((await get(r, staff, 'staff/shift')).json().shift).toMatchObject({ phase: 'ended', reason: 'expired' }); expect((await act(r, staff, order.id, 'claim', tab.source, 2)).statusCode).toBe(404);
});

it('bounds shift command receipts durably without charging exact retries or allowing new terminal-end receipt spam', async () => {
  const r = await open(false, 50, true), staff = await guest(r), s = await join(r, staff); let lastId = '', lastKey = randomUUID();
  for (let i = 0; i < 12; i++) { const active = await shift(r, staff, s.source); lastId = active.id; lastKey = randomUUID(); expect((await post(r, staff, `staff/shifts/${active.id}/end`, { schemaVersion: 1 }, lastKey)).statusCode).toBe(200); }
  expect((await post(r, staff, 'staff/shifts', { schemaVersion: 1, source: s.source, policyVersion: '1.0.0' })).statusCode).toBe(429); expect((await post(r, staff, `staff/shifts/${lastId}/end`, { schemaVersion: 1 }, lastKey)).statusCode).toBe(200); expect((await post(r, staff, `staff/shifts/${lastId}/end`, { schemaVersion: 1 })).statusCode).toBe(429); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_shift_mutations')).rowCount).toBe(24);
});

it('erases own shifts/receipts and bounds terminal shift retention to100 rows per batch', async () => {
  const r = await open(false, 50, true), staff = await guest(r), s = await join(r, staff), active = await shift(r, staff, s.source); await post(r, staff, `staff/shifts/${active.id}/end`, { schemaVersion: 1 });
  const ago = new Date(r.now() - 91 * 86400000); await r.pool.query("UPDATE engine_hospitality_shifts SET started_at=$1,expires_at=$1::timestamptz+interval '4 hours',ended_at=$1", [ago]);
  await r.pool.query('INSERT INTO engine_hospitality_shifts(id,account_id,world_slug,room_id,owner_epoch,membership_id,policy_version,started_at,expires_at,ended_at,reason) SELECT md5(n::text)::uuid,account_id,world_slug,room_id,owner_epoch,membership_id,policy_version,started_at,expires_at,ended_at,reason FROM engine_hospitality_shifts CROSS JOIN generate_series(1,104) n WHERE id=$1', [active.id]);
  await r.app.hospitality.maintain(); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_shifts')).rowCount).toBe(5); await r.app.hospitality.maintain(); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_shifts')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_shift_mutations')).rowCount).toBe(0);
  const next = await shift(r, staff, s.source); expect(next.id).not.toBe(active.id); expect((await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(staff), payload: {} })).statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_shifts')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_shift_mutations')).rowCount).toBe(0);
});

it('fair bounded recovery reaches disconnected shifts beyond the first20 even with a frozen test clock', async () => {
  const r = await open(false, 50, true); let last: { staff: User; visit: Awaited<ReturnType<typeof join>>; id: string } | undefined;
  for (let i = 0; i < 21; i++) { const staff = await guest(r), visit = await join(r, staff), active = await shift(r, staff, visit.source); last = { staff, visit, id: active.id }; }
  const target = last!, disconnected = new Promise<void>(resolve => r.app.gateway.io.sockets.sockets.get(target.visit.socket.id!)!.once('disconnect', () => resolve())); target.visit.socket.close(); await disconnected; await r.app.rooms.maintain(); r.advance(15000);
  await r.app.hospitality.maintain(); await r.app.hospitality.maintain(); expect((await r.pool.query('SELECT reason,ended_at FROM engine_hospitality_shifts WHERE id=$1', [target.id])).rows[0]).toMatchObject({ reason: 'disconnected', ended_at: new Date(r.now()) }); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_shifts WHERE ended_at IS NULL')).rowCount).toBe(20);
});

it('concurrent voluntary starts cannot exceed per-room staff capacity', async () => {
  const r = await open(false, 50, true, 1), a = await guest(r), av = await join(r, a), b = await guest(r), bv = await join(r, b);
  const responses = await Promise.all([{ user: a, source: av.source }, { user: b, source: bv.source }].map(async peer => fetch(r.url + '/v1/staff/shifts', { method: 'POST', headers: { ...headers(peer.user), 'content-type': 'application/json' }, body: JSON.stringify({ schemaVersion: 1, source: peer.source, policyVersion: '1.0.0' }), signal: AbortSignal.timeout(5000) })));
  expect(responses.map(response => response.status).sort()).toEqual([201, 409]); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_shifts WHERE ended_at IS NULL')).rowCount).toBe(1);
});

it.each(['coffee', 'dining', 'mocktail'] as const)('one shared workflow engine serves synthetic %s with trusted server steps and one durable row per served course', async kind => {
  const r = await open(false, 50, true, 32, kind), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r), s = await join(r, staff); await shift(r, staff, s.source);
  const catalog = await post(r, customer, 'orders/menu', { schemaVersion: 1, source: c.source }); expect(catalog.statusCode).toBe(200); expect(catalog.json().items[0]).toMatchObject({ key: kind, courseCount: kind === 'dining' ? 3 : 1 }); expect(JSON.stringify(catalog.json())).not.toMatch(/price|customerId|assigneeId/);
  const placed = await post(r, customer, 'orders', { ...input(c.source), itemKey: kind }); expect(placed.statusCode).toBe(201); const order = OrderResultSchema.parse(placed.json()).order;
  let version = (await act(r, staff, order.id, 'claim', s.source)).json().order.version;
  for (let course = 0; course < (kind === 'dining' ? 3 : 1); course++) {
    const prepared = await act(r, staff, order.id, 'prepare', s.source, version); expect(prepared.statusCode).toBe(200); version++; expect(prepared.json().order).toMatchObject({ phase: 'PREPARING', service: { courseNumber: course + 1, coursesServed: course } });
    expect((await act(r, staff, order.id, 'ready', s.source, version)).statusCode).toBe(409); r.advance(2000); expect((await act(r, staff, order.id, 'ready', s.source, version)).statusCode).toBe(200); version++;
    const key = randomUUID(), served = await act(r, staff, order.id, 'serve', s.source, version, key); expect(served.statusCode).toBe(200); expect((await act(r, staff, order.id, 'serve', s.source, version, key)).json()).toEqual(served.json()); version++;
    expect(served.json().order.phase).toBe(kind === 'dining' && course < 2 ? 'ASSIGNED' : 'SERVED');
  }
  expect((await r.pool.query('SELECT 1 FROM engine_hospitality_orders')).rowCount).toBe(1); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_courses')).rowCount).toBe(kind === 'dining' ? 3 : 1); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'SERVED', version, service: { coursesServed: kind === 'dining' ? 3 : 1 } });
});

async function serviceFixture(kind: 'coffee' | 'dining' | 'mocktail' = 'coffee') {
  const r = await open(false, 50, true, 32, kind), customer = await guest(r), c = await join(r, customer, 'seat-1'), staff = await guest(r), s = await join(r, staff); const active = await shift(r, staff, s.source), response = await post(r, customer, 'orders', { ...input(c.source), itemKey: kind }); expect(response.statusCode).toBe(201); const order = OrderResultSchema.parse(response.json()).order; expect((await act(r, staff, order.id, 'claim', s.source)).statusCode).toBe(200); return { r, customer, c, staff, s, active, order };
}

it('only the assigned,current on-shift actor can run server steps;client deadlines,recipes,course or scores confer no authority', async () => {
  const { r, customer, c, staff, s, order } = await serviceFixture(), stranger = await guest(r), v = await join(r, stranger); await shift(r, stranger, v.source);
  expect((await act(r, stranger, order.id, 'prepare', v.source, 1)).statusCode).toBe(404); expect((await act(r, customer, order.id, 'prepare', c.source, 1)).statusCode).toBe(404);
  for (const extra of [{ readyAt: new Date().toISOString() }, { courseIndex: 9 }, { workflow: { kind: 'instant' } }, { ingredients: ['coffee'] }, { score: 100 }, { reward: 100 }]) expect((await post(r, staff, `orders/${order.id}/prepare`, { ...mutation(s.source, 1), ...extra })).statusCode).toBe(422);
  expect((await act(r, staff, order.id, 'serve', s.source, 1)).statusCode).toBe(409); expect((await act(r, staff, order.id, 'ready', s.source, 1)).statusCode).toBe(409);
  expect((await act(r, staff, order.id, 'prepare', s.source, 0)).statusCode).toBe(409); expect((await act(r, staff, order.id, 'prepare', s.source, 1)).statusCode).toBe(200); r.advance(1999); expect((await act(r, staff, order.id, 'ready', s.source, 2)).statusCode).toBe(409); r.advance(1); expect((await act(r, staff, order.id, 'ready', s.source, 2)).statusCode).toBe(200);
});

it('concurrent actual TCP serve retries insert one course receipt and rollback all service state on receipt failure', async () => {
  const { r, staff, s, order } = await serviceFixture(); await act(r, staff, order.id, 'prepare', s.source, 1); r.advance(2000); await act(r, staff, order.id, 'ready', s.source, 2);
  await r.pool.query("CREATE FUNCTION fail_served_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='serve' THEN RAISE EXCEPTION 'synthetic served receipt failure'; END IF; RETURN NEW; END $$"); await r.pool.query('CREATE TRIGGER fail_served_receipt BEFORE INSERT ON engine_hospitality_mutations FOR EACH ROW EXECUTE FUNCTION fail_served_receipt()');
  expect((await act(r, staff, order.id, 'serve', s.source, 3)).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_courses')).rowCount).toBe(0); expect((await get(r, staff, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'READY', version: 3 }); await r.pool.query('DROP TRIGGER fail_served_receipt ON engine_hospitality_mutations');
  const key = randomUUID(), responses = await Promise.all(Array.from({ length: 8 }, () => fetch(r.url + `/v1/orders/${order.id}/serve`, { method: 'POST', headers: { ...headers(staff, key), 'content-type': 'application/json' }, body: JSON.stringify(mutation(s.source, 3)), signal: AbortSignal.timeout(5000) }))); expect(responses.every(response => response.status === 200)).toBe(true);
  expect((await r.pool.query('SELECT * FROM engine_hospitality_courses')).rows[0]).toMatchObject({ order_id: order.id, course_index: 0, course_key: 'coffee', order_version: 4 }); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_courses')).rowCount).toBe(1); expect((await get(r, staff, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'SERVED', version: 4 });
});

it('reassignment after a served course preserves progress but invalidates an in-flight preparation and old staff receipts', async () => {
  const { r, customer, staff, s, active, order } = await serviceFixture('dining'); await act(r, staff, order.id, 'prepare', s.source, 1); r.advance(2000); await act(r, staff, order.id, 'ready', s.source, 2); await act(r, staff, order.id, 'serve', s.source, 3);
  const prepareKey = randomUUID(); expect((await act(r, staff, order.id, 'prepare', s.source, 4, prepareKey)).statusCode).toBe(200); await post(r, staff, `staff/shifts/${active.id}/end`, { schemaVersion: 1 }); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'PENDING', version: 6, service: { courseNumber: 2, coursesServed: 1, readyAt: null } });
  const other = await guest(r), v = await join(r, other); await shift(r, other, v.source); expect((await act(r, other, order.id, 'claim', v.source, 6)).statusCode).toBe(200); expect((await act(r, staff, order.id, 'prepare', s.source, 4, prepareKey)).statusCode).toBe(404); expect((await act(r, other, order.id, 'ready', v.source, 7)).statusCode).toBe(409);
  expect((await act(r, other, order.id, 'prepare', v.source, 7)).statusCode).toBe(200); r.advance(2000); await act(r, other, order.id, 'ready', v.source, 8); expect((await act(r, other, order.id, 'serve', v.source, 9)).statusCode).toBe(200); expect((await r.pool.query('SELECT course_index FROM engine_hospitality_courses ORDER BY course_index')).rows).toEqual([{ course_index: 0 }, { course_index: 1 }]);
});

it.each(['seat-release', 'expired-session', 'block'] as const)('%s stops actual service and relinquishes outstanding assignment', async cause => {
  const { r, customer, c, staff, s, order } = await serviceFixture();
  if (cause === 'seat-release') await c.socket.timeout(5000).emitWithAck('seat.release', { ...c.command(), seatId: 'seat-1' });
  if (cause === 'expired-session') await r.pool.query('UPDATE identity_sessions SET expires_at=$2 WHERE account_id=$1', [customer.me.profile.id, new Date(r.now())]);
  if (cause === 'block') expect((await post(r, customer, 'blocks', { targetId: staff.me.profile.id, blocked: true })).statusCode).toBe(200);
  expect((await act(r, staff, order.id, 'prepare', s.source, 1)).statusCode).toBe(404); expect((await r.pool.query('SELECT phase,version,assignee_id FROM engine_hospitality_orders')).rows[0]).toEqual({ phase: cause === 'block' ? 'PENDING' : 'CANCELLED', version: 2, assignee_id: null });
});

it('persisted workflow snapshots survive API restart and SQL refuses an impossible readiness/course state', async () => {
  const { r, customer, staff, s, order } = await serviceFixture(); await act(r, staff, order.id, 'prepare', s.source, 1); const before = (await r.pool.query('SELECT workflow FROM engine_hospitality_orders')).rows[0].workflow; expect(before).toMatchObject({ key: 'coffee-workflow', courses: [{ prepareSeconds: 2 }] });
  await expect(r.pool.query('UPDATE engine_hospitality_orders SET course_index=7')).rejects.toMatchObject({ code: '23514' }); await expect(r.pool.query('UPDATE engine_hospitality_orders SET ready_at=NULL')).rejects.toMatchObject({ code: '23514' }); await restart(r); await r.app.hospitality.maintain();
  expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'CANCELLED', version: 4, service: { workflowKey: 'coffee-workflow', readyAt: null } }); expect((await r.pool.query('SELECT workflow FROM engine_hospitality_orders')).rows[0].workflow).toEqual(before);
});

it('a backwards trusted clock cannot advance service or write an order/course receipt', async () => {
  const { r, staff, s, order } = await serviceFixture(); r.advance(-1); expect((await act(r, staff, order.id, 'prepare', s.source, 1)).statusCode).toBe(503); expect((await get(r, staff, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'ASSIGNED', version: 1 }); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_courses')).rowCount).toBe(0); expect((await r.pool.query("SELECT 1 FROM engine_hospitality_mutations WHERE operation='prepare'")).rowCount).toBe(0);
});

it('only the customer acknowledges fully served workflow once under actual TCP completion retries', async () => {
  const { r, customer, staff, s, order } = await serviceFixture(); const complete = (user: User, version: number, key = randomUUID()) => post(r, user, `orders/${order.id}/complete`, { schemaVersion: 1, expectedVersion: version }, key);
  expect((await complete(customer, 1)).statusCode).toBe(409); await act(r, staff, order.id, 'prepare', s.source, 1); r.advance(2000); await act(r, staff, order.id, 'ready', s.source, 2); await act(r, staff, order.id, 'serve', s.source, 3);
  expect((await complete(staff, 4)).statusCode).toBe(404); const key = randomUUID(), responses = await Promise.all(Array.from({ length: 8 }, () => fetch(r.url + `/v1/orders/${order.id}/complete`, { method: 'POST', headers: { ...headers(customer, key), 'content-type': 'application/json' }, body: JSON.stringify({ schemaVersion: 1, expectedVersion: 4 }), signal: AbortSignal.timeout(5000) })));
  expect(responses.every(response => response.status === 200)).toBe(true); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'COMPLETED', version: 5 }); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_completions')).rowCount).toBe(1); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_outbox')).rowCount).toBe(1); expect((await r.pool.query("SELECT 1 FROM engine_hospitality_mutations WHERE operation='complete'")).rowCount).toBe(1);
  expect((await complete(customer, 4, key)).statusCode).toBe(200); expect((await complete(customer, 5, key)).statusCode).toBe(409); await restart(r); expect((await complete(customer, 4, key)).statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_completions')).rowCount).toBe(1);
});

async function servedFixture() { const fixture = await serviceFixture(); const { r, staff, s, order } = fixture; await act(r, staff, order.id, 'prepare', s.source, 1); r.advance(2000); await act(r, staff, order.id, 'ready', s.source, 2); await act(r, staff, order.id, 'serve', s.source, 3); return fixture; }
const acknowledge = (r: Runtime, customer: User, id: string, key = randomUUID()) => post(r, customer, `orders/${id}/complete`, { schemaVersion: 1, expectedVersion: 4 }, key);

it('completion,outbox and order receipt commit atomically and failed outbox or receipt leaves the order served', async () => {
  const { r, customer, order } = await servedFixture(), key = randomUUID();
  await r.pool.query("CREATE FUNCTION fail_completion_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_completion_outbox BEFORE INSERT ON engine_hospitality_outbox FOR EACH ROW EXECUTE FUNCTION fail_completion_outbox()');
  expect((await acknowledge(r, customer, order.id, key)).statusCode).toBe(503); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'SERVED', version: 4 }); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_completions')).rowCount).toBe(0); await r.pool.query('DROP TRIGGER fail_completion_outbox ON engine_hospitality_outbox');
  await r.pool.query("CREATE FUNCTION fail_completion_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='complete' THEN RAISE EXCEPTION 'synthetic completion receipt failure'; END IF; RETURN NEW; END $$"); await r.pool.query('CREATE TRIGGER fail_completion_receipt BEFORE INSERT ON engine_hospitality_mutations FOR EACH ROW EXECUTE FUNCTION fail_completion_receipt()');
  expect((await acknowledge(r, customer, order.id, key)).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_completions')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_outbox')).rowCount).toBe(0); await r.pool.query('DROP TRIGGER fail_completion_receipt ON engine_hospitality_mutations'); expect((await acknowledge(r, customer, order.id, key)).statusCode).toBe(200);
});

it('failed transactional hook rolls back its effect and delivery receipt while another consumer succeeds;durable retry survives restart', async () => {
  const { r, customer, staff, order } = await servedFixture(); await acknowledge(r, customer, order.id); await r.pool.query('CREATE TABLE synthetic_progress_effects(consumer text NOT NULL,event_id uuid NOT NULL,staff_id uuid NOT NULL,amount integer NOT NULL,PRIMARY KEY(consumer,event_id))'); let fail = true, attempts = 0;
  const sinks: HospitalityCompletionSink[] = ['retry-progress', 'other-progress'].map(key => ({ key, apply: async (db, event) => { if (key === 'retry-progress') attempts++; expect(event).toMatchObject({ type: 'OrderCompleted', orderId: order.id, customerId: customer.me.profile.id, staffId: staff.me.profile.id, coursesServed: 1 }); expect(Object.isFrozen(event)).toBe(true); await db.query('INSERT INTO synthetic_progress_effects VALUES($1,$2,$3,1)', [key, event.id, event.staffId]); if (key === 'retry-progress' && fail) throw new Error('synthetic consumer unavailable'); } }));
  const first = new HospitalityOutbox(r.pool, r.app.identity, sinks, r.now); await expect(first.drain()).rejects.toThrow('delivery unavailable'); expect((await r.pool.query('SELECT consumer FROM synthetic_progress_effects')).rows).toEqual([{ consumer: 'other-progress' }]); expect((await r.pool.query('SELECT consumer_key FROM engine_hospitality_deliveries')).rows).toEqual([{ consumer_key: 'other-progress' }]); await first.drain(); expect(attempts).toBe(1); r.advance(1000); await expect(first.drain()).rejects.toThrow(); expect((await r.pool.query('SELECT attempts,next_at FROM engine_hospitality_delivery_retries')).rows[0]).toEqual({ attempts: 2, next_at: new Date(r.now() + 2000) }); await first.close(); await restart(r);
  fail = false; r.advance(2000); const recovered = new HospitalityOutbox(r.pool, r.app.identity, sinks, r.now); await recovered.drain(); await recovered.drain(); expect((await r.pool.query('SELECT 1 FROM synthetic_progress_effects')).rowCount).toBe(2); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_deliveries')).rowCount).toBe(2); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_delivery_retries')).rowCount).toBe(0); expect(attempts).toBe(3); await recovered.close();
});

it('independent concurrent outbox dispatchers apply a DB hook once and rollback an effect when its delivery receipt fails', async () => {
  const { r, customer, order } = await servedFixture(); await acknowledge(r, customer, order.id); await r.pool.query('CREATE TABLE synthetic_once(event_id uuid PRIMARY KEY,amount integer NOT NULL)');
  const sinks: HospitalityCompletionSink[] = [{ key: 'once-progress', apply: async (db, event) => { await db.query('INSERT INTO synthetic_once VALUES($1,1)', [event.id]); } }];
  await r.pool.query("CREATE FUNCTION fail_delivery_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic delivery receipt failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_delivery_receipt BEFORE INSERT ON engine_hospitality_deliveries FOR EACH ROW EXECUTE FUNCTION fail_delivery_receipt()');
  const one = new HospitalityOutbox(r.pool, r.app.identity, sinks, r.now); await expect(one.drain()).rejects.toThrow(); expect((await r.pool.query('SELECT 1 FROM synthetic_once')).rowCount).toBe(0); await r.pool.query('DROP TRIGGER fail_delivery_receipt ON engine_hospitality_deliveries'); r.advance(1000);
  const two = new HospitalityOutbox(r.pool, r.app.identity, sinks, r.now); await Promise.all([one.drain(), two.drain()]); expect((await r.pool.query('SELECT amount FROM synthetic_once')).rows).toEqual([{ amount: 1 }]); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_deliveries')).rowCount).toBe(1); await one.close(); await two.close();
});

it('a committed completion lost response is privately retryable after leave/restart,and no caller can post arbitrary events or rewards', async () => {
  const { r, customer, c, staff, order } = await servedFixture(), key = randomUUID(), stranger = await guest(r);
  for (const extra of [{ reward: 100 }, { staffId: staff.me.profile.id }, { completedAt: new Date().toISOString() }, { coursesServed: 5 }, { event: 'OrderCompleted' }]) expect((await post(r, customer, `orders/${order.id}/complete`, { schemaVersion: 1, expectedVersion: 4, ...extra })).statusCode).toBe(422);
  expect((await acknowledge(r, stranger, order.id)).statusCode).toBe(404); await c.socket.timeout(5000).emitWithAck('room.leave', c.command()); await r.app.worlds.registry.setEnabled('hospitality-fixture', false); expect((await acknowledge(r, customer, order.id, key)).statusCode).toBe(200); await restart(r); expect((await acknowledge(r, customer, order.id, key)).json().order.phase).toBe('COMPLETED');
  expect((await r.app.http.inject({ url: '/v1/orders/outbox', headers: { cookie: customer.cookie } })).statusCode).toBe(422); expect(JSON.stringify((await get(r, stranger, 'me/export')).json())).not.toContain(order.id); expect(JSON.stringify((await get(r, customer, 'me/export')).json().domains.hospitality)).not.toMatch(/customerId|staffId|consumer_key|fingerprint/);
});

it('account erasure cascades completion,outbox,delivery and retry metadata;no remaining handler can grant an erased reward', async () => {
  const { r, customer, order } = await servedFixture(); await acknowledge(r, customer, order.id); const dispatcher = new HospitalityOutbox(r.pool, r.app.identity, [{ key: 'failed-progress', apply: async () => { throw new Error('synthetic failure'); } }], r.now); await expect(dispatcher.drain()).rejects.toThrow();
  expect((await r.pool.query('SELECT 1 FROM engine_hospitality_delivery_retries')).rowCount).toBe(1); expect((await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(customer), payload: {} })).statusCode).toBe(200);
  for (const table of ['engine_hospitality_orders', 'engine_hospitality_courses', 'engine_hospitality_completions', 'engine_hospitality_outbox', 'engine_hospitality_deliveries', 'engine_hospitality_delivery_retries']) expect((await r.pool.query('SELECT 1 FROM ' + table)).rowCount).toBe(0); r.advance(1000); await dispatcher.drain(); await dispatcher.close();
});

it('bounds outbox delivery to20 events per consumer batch and terminal retention cascades completion/consumer metadata', async () => {
  const { r, customer, order } = await servedFixture(); await acknowledge(r, customer, order.id);
  await r.pool.query("INSERT INTO engine_hospitality_orders(id,customer_id,assignee_id,world_slug,room_id,customer_epoch,customer_membership_id,item_key,policy_version,phase,version,created_at,updated_at,workflow,course_index) SELECT gen_random_uuid(),customer_id,assignee_id,world_slug,room_id,customer_epoch,customer_membership_id,item_key,policy_version,phase,version,created_at,updated_at,workflow,course_index FROM engine_hospitality_orders CROSS JOIN generate_series(1,24) n WHERE id=$1", [order.id]);
  await r.pool.query('INSERT INTO engine_hospitality_completions SELECT gen_random_uuid(),id,$1 FROM engine_hospitality_orders WHERE id<>$2', [new Date(r.now()), order.id]); await r.pool.query('INSERT INTO engine_hospitality_outbox(event_id) SELECT id FROM engine_hospitality_completions ON CONFLICT DO NOTHING'); await r.pool.query('CREATE TABLE synthetic_progress_ticks(event_id uuid PRIMARY KEY REFERENCES engine_hospitality_completions(id) ON DELETE CASCADE)');
  const dispatcher = new HospitalityOutbox(r.pool, r.app.identity, [{ key: 'bounded-progress', apply: async (db, event) => { await db.query('INSERT INTO synthetic_progress_ticks VALUES($1)', [event.id]); } }], r.now);
  await dispatcher.drain(); expect((await r.pool.query('SELECT 1 FROM synthetic_progress_ticks')).rowCount).toBe(20); await dispatcher.drain(); expect((await r.pool.query('SELECT 1 FROM synthetic_progress_ticks')).rowCount).toBe(25); await dispatcher.close();
  await r.pool.query('UPDATE engine_hospitality_orders SET created_at=$1,updated_at=$1', [new Date(r.now() - 91 * 86400000)]); await r.app.hospitality.maintain(); for (const table of ['engine_hospitality_completions', 'engine_hospitality_outbox', 'engine_hospitality_deliveries', 'synthetic_progress_ticks']) expect((await r.pool.query('SELECT 1 FROM ' + table)).rowCount).toBe(0);
});

it('staff may refuse assigned work and the customer cannot force a refused staff to reclaim it', async () => {
  const { r, customer, c, staff, s, order } = await serviceFixture(), key = randomUUID(), refused = await post(r, staff, `orders/${order.id}/refuse`, { schemaVersion: 1, expectedVersion: 1 }, key);
  expect(refused.statusCode).toBe(200); expect(refused.json()).toEqual({ schemaVersion: 1, refused: true }); expect((await post(r, staff, `orders/${order.id}/refuse`, { schemaVersion: 1, expectedVersion: 1 }, key)).json()).toEqual(refused.json());
  expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'PENDING', version: 2 }); expect((await act(r, staff, order.id, 'claim', s.source, 2)).statusCode).toBe(404); expect((await post(r, staff, 'orders/queue', { schemaVersion: 1, source: s.source })).json().items).toEqual([]);
  expect((await post(r, customer, `orders/${order.id}/refuse`, { schemaVersion: 1, expectedVersion: 2 })).statusCode).toBe(404); expect((await post(r, customer, `orders/${order.id}/claim`, { ...mutation(c.source, 2), assigneeId: staff.me.profile.id })).statusCode).toBe(422);
  await post(r, customer, 'blocks', { targetId: staff.me.profile.id, blocked: true }); await post(r, customer, 'blocks', { targetId: staff.me.profile.id, blocked: false }); expect((await act(r, staff, order.id, 'claim', s.source, 2)).statusCode).toBe(404);
  expect((await get(r, staff, 'me/export')).json().domains.hospitality.refusals).toEqual([{ orderId: order.id, createdAt: new Date(r.now()).toISOString() }]); expect((await get(r, customer, 'me/export')).json().domains.hospitality.refusals).toEqual([]);
  const other = await guest(r), ov = await join(r, other); await shift(r, other, ov.source); expect((await act(r, other, order.id, 'claim', ov.source, 2)).statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_orders')).rowCount).toBe(1); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_completions')).rowCount).toBe(0);
});

it('blocking an assigned participant transactionally requeues outstanding work and clears preparation without losing served courses', async () => {
  const { r, customer, staff, s, order } = await serviceFixture('dining'); await act(r, staff, order.id, 'prepare', s.source, 1); r.advance(2000); await act(r, staff, order.id, 'ready', s.source, 2); await act(r, staff, order.id, 'serve', s.source, 3); await act(r, staff, order.id, 'prepare', s.source, 4);
  expect((await post(r, customer, 'blocks', { targetId: staff.me.profile.id, blocked: true })).statusCode).toBe(200); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'PENDING', version: 6, service: { coursesServed: 1, readyAt: null } }); expect((await act(r, staff, order.id, 'claim', s.source, 6)).statusCode).toBe(404); expect((await get(r, staff, 'orders/' + order.id)).statusCode).toBe(404);
});

it('own customer withdrawal works after leaving/closure and cannot be forged by staff or a stranger', async () => {
  const { r, customer, c, staff, order } = await serviceFixture(), stranger = await guest(r), body = { schemaVersion: 1, expectedVersion: 1 }, key = randomUUID();
  for (const user of [staff, stranger]) expect((await post(r, user, `orders/${order.id}/withdraw`, body)).statusCode).toBe(404);
  await c.socket.timeout(5000).emitWithAck('room.leave', c.command()); await r.app.worlds.registry.setEnabled('hospitality-fixture', false); const withdrawn = await post(r, customer, `orders/${order.id}/withdraw`, body, key); expect(withdrawn.statusCode).toBe(200); expect(withdrawn.json().order).toMatchObject({ phase: 'CANCELLED', version: 2 }); expect((await post(r, customer, `orders/${order.id}/withdraw`, body, key)).json()).toEqual(withdrawn.json()); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_completions')).rowCount).toBe(0);
});

it('refusal and block requeue failures rollback the full transaction and do not leave half-written consent', async () => {
  const { r, customer, staff, order } = await serviceFixture(); await r.pool.query("CREATE FUNCTION fail_refusal_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='refuse' THEN RAISE EXCEPTION 'synthetic refusal receipt failure'; END IF; RETURN NEW; END $$"); await r.pool.query('CREATE TRIGGER fail_refusal_receipt BEFORE INSERT ON engine_hospitality_mutations FOR EACH ROW EXECUTE FUNCTION fail_refusal_receipt()');
  expect((await post(r, staff, `orders/${order.id}/refuse`, { schemaVersion: 1, expectedVersion: 1 })).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_refusals')).rowCount).toBe(0); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'ASSIGNED', version: 1 });
  await r.pool.query("CREATE FUNCTION fail_contact_requeue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.phase='PENDING' THEN RAISE EXCEPTION 'synthetic block requeue failure'; END IF; RETURN NEW; END $$"); await r.pool.query('CREATE TRIGGER fail_contact_requeue BEFORE UPDATE ON engine_hospitality_orders FOR EACH ROW EXECUTE FUNCTION fail_contact_requeue()'); expect((await post(r, customer, 'blocks', { targetId: staff.me.profile.id, blocked: true })).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM social_blocks')).rowCount).toBe(0); expect((await get(r, customer, 'orders/' + order.id)).json().order.phase).toBe('ASSIGNED');
});

it.each(['customer', 'staff'] as const)('current world-ban on %s stops service and cancels/requeues work through shared safety policy', async subject => {
  const { r, customer, staff, s, order } = await serviceFixture(), target = subject === 'customer' ? customer : staff, reporter = subject === 'customer' ? staff : customer, caseId = randomUUID();
  await r.pool.query("INSERT INTO safety_cases(id,receipt_id,reporter_id,subject_id,request_id,fingerprint,world_slug,category,severity,created_at) VALUES($1,$2,$3,$4,$5,'synthetic-safety-fixture','hospitality-fixture','harassment','high',$6)", [caseId, randomUUID(), reporter.me.profile.id, target.me.profile.id, randomUUID(), new Date(r.now())]);
  await r.pool.query("INSERT INTO safety_sanctions(id,case_id,subject_id,kind,category,world_slug,effective_at,expires_at,appeal_until) VALUES($1,$2,$3,'world-ban','harassment','hospitality-fixture',$4,$5,$5)", [randomUUID(), caseId, target.me.profile.id, new Date(r.now()), new Date(r.now() + 3600000)]);
  expect([403, 404]).toContain((await act(r, staff, order.id, 'prepare', s.source, 1)).statusCode); expect((await r.pool.query('SELECT phase,assignee_id FROM engine_hospitality_orders')).rows[0]).toEqual({ phase: subject === 'customer' ? 'CANCELLED' : 'PENDING', assignee_id: null });
  if (subject === 'staff') { expect((await get(r, staff, 'staff/shift')).json().shift).toMatchObject({ phase: 'ended', reason: 'restricted' }); r.advance(3600000); expect((await act(r, staff, order.id, 'claim', s.source, 2)).statusCode).toBe(404); }
  expect((await r.pool.query('SELECT 1 FROM engine_hospitality_completions')).rowCount).toBe(0);
});

it('customer reconnect inside grace retains the same order,but last-connection timeout cancels once with no phantom active order', async () => {
  const { r, customer, c, staff, s, order } = await serviceFixture(), disconnected = new Promise<void>(resolve => r.app.gateway.io.sockets.sockets.get(c.socket.id!)!.once('disconnect', () => resolve())); c.socket.close(); await disconnected; await r.app.rooms.maintain(); r.advance(14999); await r.app.hospitality.maintain(); expect((await get(r, customer, 'orders/' + order.id)).json().order.phase).toBe('ASSIGNED'); expect((await act(r, staff, order.id, 'prepare', s.source, 1)).statusCode).toBe(404);
  const restored = await join(r, customer, 'seat-1'); expect(restored.source).toEqual(c.source); expect((await act(r, staff, order.id, 'prepare', s.source, 1)).statusCode).toBe(200);
  const dropped = new Promise<void>(resolve => r.app.gateway.io.sockets.sockets.get(restored.socket.id!)!.once('disconnect', () => resolve())); restored.socket.close(); await dropped; await r.app.rooms.maintain(); r.advance(15000); await r.app.hospitality.maintain(); await r.app.hospitality.maintain(); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'CANCELLED', version: 3 }); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_orders')).rowCount).toBe(1);
});

it('block versus serve race permits no subsequent contact or duplicate course/outcome', async () => {
  const { r, customer, staff, s, order } = await serviceFixture(); await act(r, staff, order.id, 'prepare', s.source, 1); r.advance(2000); await act(r, staff, order.id, 'ready', s.source, 2);
  const results = await Promise.all([act(r, staff, order.id, 'serve', s.source, 3), post(r, customer, 'blocks', { targetId: staff.me.profile.id, blocked: true })]); expect(results[1].statusCode).toBe(200); expect([200, 404]).toContain(results[0].statusCode); expect((await act(r, staff, order.id, 'prepare', s.source, 4)).statusCode).toBe(404); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_courses')).rowCount).toBeLessThanOrEqual(1); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_completions')).rowCount).toBe(0);
});

it('two-hour unserved order TTL frees the active-customer slot and exact old placement retry cannot reactivate it', async () => {
  const r = await open(false, 50, true), customer = await guest(r), c = await join(r, customer, 'seat-1'), key = randomUUID(), order = await place(r, customer, c.source, key); r.advance(2 * 3600000 - 1); await r.app.hospitality.maintain(); expect((await get(r, customer, 'orders/' + order.id)).json().order.phase).toBe('PENDING'); r.advance(1); await r.app.hospitality.maintain(); expect((await get(r, customer, 'orders/' + order.id)).json().order).toMatchObject({ phase: 'CANCELLED', version: 1 }); expect((await post(r, customer, 'orders', input(c.source), key)).json().order.phase).toBe('CANCELLED'); const next = await place(r, customer, c.source); expect(next.id).not.toBe(order.id);
});

it('customer withdrawal racing final service never creates completion or leaves cancelled work assigned', async () => {
  const { r, customer, staff, s, order } = await serviceFixture(); await act(r, staff, order.id, 'prepare', s.source, 1); r.advance(2000); await act(r, staff, order.id, 'ready', s.source, 2);
  const results = await Promise.all([post(r, customer, `orders/${order.id}/withdraw`, { schemaVersion: 1, expectedVersion: 3 }), act(r, staff, order.id, 'serve', s.source, 3)]); expect(results.filter(result => result.statusCode === 200)).toHaveLength(1); expect((await r.pool.query('SELECT phase,assignee_id FROM engine_hospitality_orders')).rows[0]).toMatchObject(results[0].statusCode === 200 ? { phase: 'CANCELLED', assignee_id: null } : { phase: 'SERVED', assignee_id: staff.me.profile.id }); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_completions')).rowCount).toBe(0);
});

it('refusal history remains private and erasure removes only the refused staff record without cancelling customer work', async () => {
  const { r, customer, staff, order } = await serviceFixture(); await post(r, staff, `orders/${order.id}/refuse`, { schemaVersion: 1, expectedVersion: 1 }); const other = await guest(r); expect((await get(r, other, 'me/export')).json().domains.hospitality.refusals).toEqual([]);
  expect((await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(staff), payload: {} })).statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_refusals')).rowCount).toBe(0); expect((await get(r, customer, 'orders/' + order.id)).json().order.phase).toBe('PENDING');
});
