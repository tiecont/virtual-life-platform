import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { MeSchema, RoomAckSchema, type Me } from '@virtual-city/contracts';
import { io, type Socket } from 'socket.io-client';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';
const origin = 'http://127.0.0.1:3300'; let admin: Pool, serial = 0;
const opened: { app: Awaited<ReturnType<typeof createApp>>; pool: Pool; schema: string }[] = [], sockets = new Set<Socket>();
beforeAll(async () => { const url = new URL(process.env.TEST_DATABASE_URL ?? ''); if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database'); admin = new Pool({ connectionString: url.toString() }); });
afterEach(async () => { for (const socket of sockets) socket.close(); sockets.clear(); for (const r of opened.splice(0)) { await r.app.app.close(); await r.pool.end(); await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`); } });
afterAll(async () => { await admin.end(); });
async function open(trustedOrganizerPort = true) {
  const schema = 'events_test_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`); const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema); const pool = new Pool({ connectionString: url.toString() }); await migrate(pool); let now = Date.parse('2026-11-03T10:00:00.000Z');
  const definition = { schemaVersion: 1, apiVersion: 1, slug: 'event-fixture', version: '1.0.0', title: 'Synthetic silent event fixture', kind: 'sandbox', sceneRef: { key: 'event-fixture', version: '1.0.0' }, capacity: 20, capabilities: ['presence', 'events'], eventPolicy: { schemaVersion: 1, version: '1.0.0', maxCapacity: 20, reservations: { holdSeconds: 30, maxPartySize: 4, waitlist: 'fifo', resources: [{ key: 'table-one', capacity: 4 }] } }, accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } };
  const hooks = { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {} };
  const modules = [defineWorld(definition, hooks), defineWorld({ ...definition, slug:'no-event-fixture',capabilities:['presence'],eventPolicy:undefined },hooks), defineWorld({ ...definition, slug: 'private-event-fixture', visibility: 'hidden', accessPolicy: { kind: 'private', policyKey: 'test.private' } }, hooks), defineWorld({ ...definition, slug: 'dating', visibility: 'hidden', accessPolicy: { kind: 'restricted', policyKey: 'test.adult', requiresAdult: true } }, hooks)];
  const organizers = new Set<string>(), config = readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'events-local-only-test-session-secret-000001' }), options = { now: () => now, worlds: { modules }, events: trustedOrganizerPort ? { organizers: { permits: async (_db: unknown, actor: { accountId: string }) => organizers.has(actor.accountId) } } : {} }, app = await createApp(config, pool, false, options); opened.push({ app, pool, schema }); await app.app.listen(0, '127.0.0.1'); for (const slug of app.worlds.registry.slugs()) await app.worlds.registry.setEnabled(slug, true);
  return { app, pool, config, options, organizers, url: await app.app.getUrl(), now: () => now, advance: (ms: number) => { now += ms; } };
}
type Runtime = Awaited<ReturnType<typeof open>>; type User = { me: Me; cookie: string; token: string };
const headers = (u: User, key = randomUUID()) => ({ origin, cookie: u.cookie, 'x-csrf-token': u.me.csrfToken, 'idempotency-key': key });
const post = (r: Runtime, u: User, path: string, payload: unknown = { schemaVersion: 1 }, key = randomUUID()) => r.app.http.inject({ method: 'POST', url: '/v1/' + path, headers: headers(u, key), payload });
const get = (r: Runtime, u: User, path = 'events?worldSlug=event-fixture') => r.app.http.inject({ url: '/v1/' + path, headers: { cookie: u.cookie } });
async function guest(r: Runtime): Promise<User> { const n = serial++, response = await r.app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: `127.71.${Math.floor(n / 250)}.${n % 250 + 1}`, headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Event Visitor', avatarKey: 'mint' } }); expect(response.statusCode).toBe(201); const cookie = String(response.headers['set-cookie']).split(';')[0], unsigned = r.app.http.unsignCookie(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))); if (!unsigned.valid || !unsigned.value) throw new Error('Invalid fixture cookie'); return { me: MeSchema.parse(response.json()), cookie, token: unsigned.value }; }
const input = (r: Runtime, patch = {}) => ({ schemaVersion: 1, worldSlug: 'event-fixture', policyVersion: '1.0.0', title: 'Synthetic silent study', audience: 'silent', visibility: 'listed', capacity: 2, schedule: { schemaVersion: 1, timeZone: 'Asia/Ho_Chi_Minh', opensAt: new Date(r.now() + 60000).toISOString(), startsAt: new Date(r.now() + 120000).toISOString(), checkInClosesAt: new Date(r.now() + 180000).toISOString(), endsAt: new Date(r.now() + 3600000).toISOString() }, ...patch });
async function schedule(r: Runtime, u: User, patch = {}, key = randomUUID()) { r.organizers.add(u.me.profile.id); return r.app.events.schedule(u.token, key, input(r, patch)); }
async function restart(r: Runtime) { await r.app.app.close(); const old = r.app, app = await createApp(r.config, r.pool, false, r.options); opened.find(item => item.app === old)!.app = app; r.app = app; await app.app.listen(0, '127.0.0.1'); r.url = await app.app.getUrl(); for (const slug of app.worlds.registry.slugs()) await app.worlds.registry.setEnabled(slug, true); }
async function join(r: Runtime, u: User, roomId?: string) {
  const n = serial++, socket = io(r.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: `127.72.${Math.floor(n / 250)}.${n % 250 + 1}` } }, extraHeaders: { origin, cookie: u.cookie }, auth: { schemaVersion: 1, csrfToken: u.me.csrfToken } }); sockets.add(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  const ack = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join', { schemaVersion: 1, requestId: randomUUID(), worldSlug: 'event-fixture', worldVersion: '1.0.0', sceneVersion: '1.0.0', ...(roomId ? { roomId } : {}) }));
  return { socket, ack, source: ack.ok && ack.result.type === 'snapshot' ? { epoch: ack.result.epoch, roomId: ack.result.roomId, membershipId: ack.result.membershipId } : null };
}
async function registered(r: Runtime, u?: User): Promise<User> {
  const user = u ?? await guest(r), response = await post(r, user, 'session/upgrade', { loginName: 'event_' + randomUUID().replaceAll('-', '').slice(0, 12), password: 'events-only-local-test-password-123!' }); expect(response.statusCode).toBe(200);
  user.me = MeSchema.parse(response.json()); user.cookie = String(response.headers['set-cookie']).split(';')[0]; const signed = r.app.http.unsignCookie(decodeURIComponent(user.cookie.slice(user.cookie.indexOf('=') + 1))); if (!signed.value) throw new Error('Invalid registered fixture'); user.token = signed.value; return user;
}
async function grant(r: Runtime, u: User, role: 'organizer' | 'performer', eventId: string | null = null, world = 'event-fixture') { await r.pool.query('INSERT INTO engine_event_grants VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), u.me.profile.id, world, eventId, role, new Date(r.now() + 7200000)]); }
async function befriend(r: Runtime, a: User, b: User) { const code = (await get(r, b, 'social/me')).json().contactCode, request = await post(r, a, 'friends/requests', { contactCode: code }); expect(request.statusCode).toBe(200); expect((await post(r, b, 'friends/requests/' + request.json().id + '/respond', { action: 'accept' })).json().state).toBe('ACCEPTED'); }
const inviteOptIn = (r: Runtime, u: User, enabled: boolean) => r.app.http.inject({ method: 'PATCH', url: '/v1/me/invitations/settings', headers: headers(u), payload: { schemaVersion: 1, allowInvitations: enabled } });

it('serves an authenticated empty catalog and denies ungranted scheduling or automatic calendar access', async () => {
  const r = await open(), u = await guest(r); expect((await get(r, u)).statusCode).toBe(200); expect((await get(r, u)).json().items).toEqual([]);
  expect((await r.app.http.inject({ url: '/v1/events?worldSlug=event-fixture' })).statusCode).toBe(401);
  expect((await post(r, u, 'events', input(r))).statusCode).toBe(404);
});

it('twenty actual TCP accounts competing for two RSVP places never oversell and reveal no attendee list', async () => {
  const r = await open(), owner = await guest(r), event = await schedule(r, owner), users = await Promise.all(Array.from({ length: 20 }, () => guest(r)));
  const responses = await Promise.all(users.map(u => fetch(r.url + '/v1/events/' + event.event.id + '/rsvp', { method: 'POST', headers: { ...headers(u), 'content-type': 'application/json' }, body: JSON.stringify({ schemaVersion: 1 }), signal: AbortSignal.timeout(10000) })));
  expect(responses.filter(response => response.status === 201)).toHaveLength(2); expect(responses.filter(response => response.status === 409)).toHaveLength(18);
  expect((await r.pool.query("SELECT 1 FROM engine_event_rsvps WHERE phase='CONFIRMED'")).rowCount).toBe(2);
  const catalog = await get(r, users[0]); expect(catalog.statusCode).toBe(200); expect(JSON.stringify(catalog.json())).not.toMatch(/accountId|organizerId|attendees|fingerprint|session/); expect(catalog.json().items[0].startsLabel).toContain('17:02:00');
});

it('durable same-key retries allocate once, changed key input conflicts, and withdrawal frees capacity without old-key resurrection', async () => {
  const r = await open(), owner = await guest(r), event = await schedule(r, owner, { capacity: 1 }), a = await guest(r), b = await guest(r), key = randomUUID(), path = 'events/' + event.event.id;
  const replies = await Promise.all(Array.from({ length: 8 }, () => post(r, a, path + '/rsvp', { schemaVersion: 1 }, key))); expect(replies.every(reply => reply.statusCode === 201)).toBe(true);
  expect((await r.pool.query('SELECT 1 FROM engine_event_rsvps')).rowCount).toBe(1); expect((await r.pool.query("SELECT 1 FROM engine_event_mutations WHERE operation='rsvp'")).rowCount).toBe(1);
  expect((await post(r, b, path + '/rsvp')).statusCode).toBe(409); await restart(r); expect((await post(r, a, path + '/rsvp', { schemaVersion: 1 }, key)).json()).toEqual(replies[0].json());
  expect((await post(r, a, path + '/withdraw')).json().rsvp.phase).toBe('CANCELLED'); expect((await post(r, b, path + '/rsvp')).statusCode).toBe(201);
  expect((await post(r, a, path + '/rsvp', { schemaVersion: 1 }, key)).json().rsvp.phase).toBe('CANCELLED'); expect((await post(r, a, path + '/withdraw', { schemaVersion: 1 }, key)).statusCode).toBe(409);
});

it('requires trusted organizer provisioning, explicit world policy and silent audience, with durable schedule retries', async () => {
  const r = await open(), owner = await guest(r), other = await guest(r), key = randomUUID(), body = input(r);
  await expect(r.app.events.schedule(owner.token, key, body)).rejects.toMatchObject({ status: 404 });
  r.organizers.add(owner.me.profile.id);
  const results = await Promise.all(Array.from({ length: 5 }, () => r.app.events.schedule(owner.token, key, body))); expect(results.every(result => result.event.id === results[0].event.id)).toBe(true); expect((await r.pool.query('SELECT 1 FROM engine_events')).rowCount).toBe(1);
  await expect(r.app.events.schedule(owner.token, key, { ...body, title: 'Changed title' })).rejects.toMatchObject({ status: 409 });
  for (const patch of [{ audience: 'interactive' }, { organizerId: other.me.profile.id }, { phase: 'LIVE' }, { address: 'real-world address' }]) await expect(r.app.events.schedule(owner.token, randomUUID(), { ...body, ...patch })).rejects.toThrow();
  for (const patch of [{ capacity: 21 }, { worldSlug: 'no-event-fixture' }, { worldSlug: 'private-event-fixture' }, { policyVersion: '2.0.0' }]) await expect(r.app.events.schedule(owner.token, randomUUID(), { ...body, ...patch })).rejects.toMatchObject({ status: 404 });
  const privateEvent = await schedule(r, owner, { visibility: 'private' }); expect((await get(r, other, 'events/' + privateEvent.event.id)).statusCode).toBe(404); expect((await post(r, other, 'events/' + privateEvent.event.id + '/rsvp')).statusCode).toBe(404); expect((await get(r, other)).json().items).toHaveLength(1);
  expect((await get(r, other, 'events?worldSlug=private-event-fixture')).statusCode).toBe(404);
  await expect(r.pool.query('UPDATE engine_events SET capacity=0')).rejects.toMatchObject({ code: '23514' });
});

it('enforces auth, Origin, CSRF, strict mutation/query input and own withdrawal without leaking peer allocation IDs', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), event = await schedule(r, owner), path = 'events/' + event.event.id;
  for (const body of [{ schemaVersion: 1, accountId: b.me.profile.id }, { schemaVersion: 1, places: 99 }, { schemaVersion: 1, role: 'organizer' }, { schemaVersion: 1, startsAt: '2000-01-01T00:00:00.000Z' }]) expect((await post(r, a, path + '/rsvp', body)).statusCode).toBe(422);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/' + path + '/rsvp', headers: { ...headers(a), origin: 'https://invalid.example' }, payload: { schemaVersion: 1 } })).statusCode).toBe(403);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/' + path + '/rsvp', headers: { cookie: a.cookie, origin, 'idempotency-key': randomUUID() }, payload: { schemaVersion: 1 } })).statusCode).toBe(403);
  expect((await get(r, a, 'events?worldSlug=event-fixture&accountId=' + b.me.profile.id)).statusCode).toBe(422);
  expect((await get(r, a, path + '?attendees=true')).statusCode).toBe(422);
  const receipt = (await post(r, a, path + '/rsvp')).json(); expect((await get(r, b, path)).json().event.rsvp).toBeNull(); expect(JSON.stringify((await get(r, b, path)).json())).not.toContain(receipt.rsvp.id); expect((await post(r, b, path + '/withdraw')).statusCode).toBe(404);
  await post(r, a, 'session/logout', {}); expect((await post(r, a, path + '/rsvp')).statusCode).toBe(401);
});

it('rolls back RSVP and schedule effects if mutation receipts fail, then retries the original key', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner), key = randomUUID(), path = 'events/' + event.event.id;
  await r.pool.query("CREATE FUNCTION fail_event_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic event receipt failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_event_receipt BEFORE INSERT ON engine_event_mutations FOR EACH ROW EXECUTE FUNCTION fail_event_receipt()');
  expect((await post(r, a, path + '/rsvp', { schemaVersion: 1 }, key)).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM engine_event_rsvps')).rowCount).toBe(0);
  await expect(schedule(r, owner)).rejects.toThrow(); expect((await r.pool.query('SELECT 1 FROM engine_events')).rowCount).toBe(1);
  await r.pool.query('DROP TRIGGER fail_event_receipt ON engine_event_mutations'); expect((await post(r, a, path + '/rsvp', { schemaVersion: 1 }, key)).statusCode).toBe(201);
  await expect(r.pool.query("INSERT INTO engine_event_rsvps SELECT $1,event_id,account_id,phase,created_at,changed_at FROM engine_event_rsvps", [randomUUID()])).rejects.toMatchObject({ code: '23505' });
});

it('current block cancels organizer contact in the same transaction and own withdrawal works after closure', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner), path = 'events/' + event.event.id;
  await post(r, a, path + '/rsvp');
  await r.pool.query("CREATE FUNCTION fail_event_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.phase='CANCELLED' THEN RAISE EXCEPTION 'synthetic block rollback'; END IF; RETURN NEW; END $$"); await r.pool.query('CREATE TRIGGER fail_event_withdrawal BEFORE UPDATE ON engine_event_rsvps FOR EACH ROW EXECUTE FUNCTION fail_event_withdrawal()');
  expect((await post(r, a, 'blocks', { targetId: owner.me.profile.id, blocked: true })).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM social_blocks')).rowCount).toBe(0); expect((await get(r, a, path)).statusCode).toBe(200);
  await r.pool.query('DROP TRIGGER fail_event_withdrawal ON engine_event_rsvps'); expect((await post(r, a, 'blocks', { targetId: owner.me.profile.id, blocked: true })).statusCode).toBe(200);
  expect((await get(r, a)).json().items).toEqual([]); expect((await get(r, a, path)).statusCode).toBe(404); expect((await post(r, a, path + '/rsvp')).statusCode).toBe(404); expect((await r.pool.query('SELECT phase FROM engine_event_rsvps')).rows[0].phase).toBe('CANCELLED');
  await r.app.worlds.registry.setEnabled('event-fixture', false); const withdrawal = await post(r, a, path + '/withdraw'); expect(withdrawal.statusCode).toBe(200); expect(JSON.stringify(withdrawal.json())).not.toMatch(/title|worldSlug|organizer/);
});

it.each(['participant', 'organizer'] as const)('shared world-ban on %s prevents RSVP and event disclosure without automatic sanction creation', async subject => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner), target = subject === 'organizer' ? owner : a, reporter = await guest(r), caseId = randomUUID();
  await r.pool.query("INSERT INTO safety_cases(id,receipt_id,reporter_id,subject_id,request_id,fingerprint,world_slug,category,severity,created_at) VALUES($1,$2,$3,$4,$5,'synthetic-event-safety','event-fixture','harassment','high',$6)", [caseId, randomUUID(), reporter.me.profile.id, target.me.profile.id, randomUUID(), new Date(r.now())]);
  await r.pool.query("INSERT INTO safety_sanctions(id,case_id,subject_id,kind,category,world_slug,effective_at,expires_at,appeal_until) VALUES($1,$2,$3,'world-ban','harassment','event-fixture',$4,$5,$5)", [randomUUID(), caseId, target.me.profile.id, new Date(r.now()), new Date(r.now() + 3600000)]);
  expect((await post(r, a, 'events/' + event.event.id + '/rsvp')).statusCode).toBe(404); expect((await get(r, a, 'events/' + event.event.id)).statusCode).toBe(404); expect((await r.pool.query('SELECT 1 FROM engine_event_rsvps')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM safety_sanctions')).rowCount).toBe(1);
});

it('observes server deadlines across restart, ends once, and old retries cannot invent attendance or room membership', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), event = await schedule(r, owner), key = randomUUID(), path = 'events/' + event.event.id;
  await post(r, a, path + '/rsvp', { schemaVersion: 1 }, key); r.advance(60000); expect((await get(r, a, path)).json().event.phase).toBe('OPEN');
  r.advance(60000); expect((await post(r, b, path + '/rsvp')).statusCode).toBe(409); expect((await get(r, a, path)).json().event.phase).toBe('LIVE'); await restart(r);
  r.advance(3480000); await r.app.events.maintain(); const ended = await get(r, a, path); expect(ended.json().event).toMatchObject({ phase: 'ENDED', rsvp: { phase: 'EXPIRED' } });
  expect((await post(r, a, path + '/rsvp', { schemaVersion: 1 }, key)).json().rsvp.phase).toBe('EXPIRED'); expect((await post(r, a, path + '/rsvp')).statusCode).toBe(409); expect(r.app.rooms.diagnostics().memberships).toBe(0);
  const changed = (await r.pool.query('SELECT changed_at FROM engine_events')).rows[0].changed_at.toISOString(); r.advance(1000); await get(r, a, path); expect((await r.pool.query('SELECT changed_at FROM engine_events')).rows[0].changed_at.toISOString()).toBe(changed);
});

it('requires explicit calendar opt-in and confirmed RSVP, with escaped/folded UTF-8 and distinct DST offsets', async () => {
  const r = await open(); r.advance(Date.parse('2026-11-01T04:00:00.000Z') - r.now()); const owner = await guest(r), a = await guest(r), b = await guest(r);
  const event = await schedule(r, owner, { title: 'Sách Việt; ' + 'ă'.repeat(80) + ',study', schedule: { schemaVersion: 1, timeZone: 'America/New_York', opensAt: '2026-11-01T05:00:00.000Z', startsAt: '2026-11-01T05:30:00.123Z', checkInClosesAt: '2026-11-01T06:00:00.000Z', endsAt: '2026-11-01T06:30:00.123Z' } }), path = 'events/' + event.event.id;
  expect(event.event.startsLabel).toContain('GMT-04:00'); expect(event.event.endsLabel).toContain('GMT-05:00'); await post(r, a, path + '/rsvp');
  expect((await get(r, a, path + '/calendar')).statusCode).toBe(404); expect((await post(r, a, path + '/calendar')).statusCode).toBe(422); expect((await post(r, a, path + '/calendar', { schemaVersion: 1, optIn: false })).statusCode).toBe(422); expect((await post(r, b, path + '/calendar', { schemaVersion: 1, optIn: true })).statusCode).toBe(404);
  const downloaded = await post(r, a, path + '/calendar', { schemaVersion: 1, optIn: true }); expect(downloaded.statusCode).toBe(200); expect(downloaded.headers['content-type']).toContain('text/calendar'); expect(downloaded.headers['content-disposition']).toContain('attachment');
  expect((await post(r, a, path + '/calendar', { schemaVersion: 1, optIn: true })).body).toBe(downloaded.body); expect(downloaded.body).toContain('DTSTAMP:20261101T040000Z');
  expect(downloaded.body).toContain('DTSTART:20261101T053000Z'); expect(downloaded.body).toContain('DTEND:20261101T063000Z'); expect(downloaded.body).toContain('X-WR-TIMEZONE:America/New_York'); expect(downloaded.body.replaceAll('\r\n ', '')).toContain('Sách Việt\\;'); expect(downloaded.body.replaceAll('\r\n ', '')).toContain('\\,study');
  for (const line of downloaded.body.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  for (const u of [owner, a, b]) expect(downloaded.body).not.toContain(u.me.profile.id); expect(downloaded.body).not.toContain('ATTENDEE:'); expect((await r.pool.query('SELECT 1 FROM engine_event_mutations')).rowCount).toBe(2);
});

it('exports only own event participation and participant erasure immediately frees capacity without a leaked counter', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), event = await schedule(r, owner, { capacity: 1 }), path = 'events/' + event.event.id;
  const joined = (await post(r, a, path + '/rsvp')).json().rsvp;
  const own = (await get(r, a, 'me/export')).json().domains.events; expect(own.rsvps[0].id).toBe(joined.id); expect(own.events).toEqual([]); expect(JSON.stringify(own)).not.toMatch(/fingerprint|organizer_id|account_id/); expect((await get(r, b, 'me/export')).json().domains.events.rsvps).toEqual([]);
  expect((await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(a), payload: {} })).statusCode).toBe(200); expect((await post(r, b, path + '/rsvp')).statusCode).toBe(201);
  await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(owner), payload: {} }); expect((await r.pool.query('SELECT 1 FROM engine_events')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_event_rsvps')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_event_mutations')).rowCount).toBe(0);
});

it('invalidates the captured world generation during awaited registry authorization, even after re-enable', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner); let began!: () => void, release!: () => void, intercept = true;
  const started = new Promise<void>(resolve => { began = resolve; }), gate = new Promise<void>(resolve => { release = resolve; }), original = r.app.worlds.registry.authorizeWorld.bind(r.app.worlds.registry);
  r.app.worlds.registry.authorizeWorld = async (...args) => { const result = await original(...args); if (intercept) { intercept = false; began(); await gate; } return result; };
  const pending = post(r, a, 'events/' + event.event.id + '/rsvp').then(reply => reply);
  await started; await r.app.worlds.registry.setEnabled('event-fixture', false); await r.app.worlds.registry.setEnabled('event-fixture', true); release();
  expect((await pending).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM engine_event_rsvps')).rowCount).toBe(0);
});

it('rechecks the trusted schedule after waiting for an actual SQL event lock, and rejects backward time', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner), key = randomUUID(), path = 'events/' + event.event.id, blocker = await r.pool.connect();
  await blocker.query('BEGIN'); await blocker.query('SELECT 1 FROM engine_events WHERE id=$1 FOR UPDATE', [event.event.id]);
  const pending = post(r, a, path + '/rsvp', { schemaVersion: 1 }, key).then(reply => reply);
  try {
    await expect.poll(async () => (await r.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM engine_events WHERE id=%' AND pid<>pg_backend_pid()")).rows[0].n, { timeout: 800 }).toBeGreaterThan(0);
    r.advance(120000); await blocker.query('COMMIT');
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  expect((await pending).statusCode).toBe(409); expect((await r.pool.query('SELECT 1 FROM engine_event_rsvps')).rowCount).toBe(0);
  r.advance(-120001); expect((await post(r, a, path + '/rsvp')).statusCode).toBe(409); expect((await r.pool.query('SELECT phase FROM engine_events')).rows[0].phase).toBe('SCHEDULED');
});

it('bounds durable new-key RSVP budgets while exact retries remain valid without duplicate allocation', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner), path = 'events/' + event.event.id, firstKey = randomUUID();
  expect((await post(r, a, path + '/rsvp', { schemaVersion: 1 }, firstKey)).statusCode).toBe(201);
  for (let i = 1; i < 12; i++) expect((await post(r, a, path + '/rsvp')).statusCode).toBe(201);
  expect((await post(r, a, path + '/rsvp')).statusCode).toBe(429); expect((await post(r, a, path + '/rsvp', { schemaVersion: 1 }, firstKey)).statusCode).toBe(201);
  expect((await r.pool.query('SELECT 1 FROM engine_event_rsvps')).rowCount).toBe(1); expect((await r.pool.query("SELECT 1 FROM engine_event_mutations WHERE operation='rsvp'")).rowCount).toBe(12);
});

it('rotates fair twenty-row maintenance batches under frozen time and bounds ninety-day retention cascades', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner); await post(r, a, 'events/' + event.event.id + '/rsvp');
  await r.pool.query("INSERT INTO engine_events(id,organizer_id,world_slug,world_version,policy_version,title,audience,visibility,capacity,time_zone,opens_at,starts_at,check_in_closes_at,ends_at,phase,created_at,changed_at) SELECT gen_random_uuid(),organizer_id,world_slug,world_version,policy_version,title,audience,visibility,capacity,time_zone,opens_at,starts_at,check_in_closes_at,ends_at,phase,created_at,changed_at FROM engine_events CROSS JOIN generate_series(1,24) WHERE id=$1", [event.event.id]);
  r.advance(3600000); await r.app.events.maintain(); expect((await r.pool.query("SELECT 1 FROM engine_events WHERE phase='ENDED'")).rowCount).toBe(20); await r.app.events.maintain(); expect((await r.pool.query("SELECT 1 FROM engine_events WHERE phase='ENDED'")).rowCount).toBe(25);
  await r.pool.query("INSERT INTO engine_events(id,organizer_id,world_slug,world_version,policy_version,title,audience,visibility,capacity,time_zone,opens_at,starts_at,check_in_closes_at,ends_at,phase,created_at,changed_at) SELECT gen_random_uuid(),organizer_id,world_slug,world_version,policy_version,title,audience,visibility,capacity,time_zone,opens_at,starts_at,check_in_closes_at,ends_at,phase,created_at,changed_at FROM engine_events CROSS JOIN generate_series(1,80) WHERE id=$1", [event.event.id]);
  r.advance(90 * 86400000 + 1); await r.app.events.maintain(); expect((await r.pool.query('SELECT 1 FROM engine_events')).rowCount).toBe(5); await r.app.events.maintain(); expect((await r.pool.query('SELECT 1 FROM engine_events')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_event_rsvps')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_event_mutations')).rowCount).toBe(0);
});

it('fails closed on current world kill switch or expired session but permits private consent withdrawal', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), event = await schedule(r, owner), path = 'events/' + event.event.id;
  await post(r, a, path + '/rsvp'); await r.pool.query("INSERT INTO safety_incident_controls VALUES('event-fixture','world',true,NULL,$1)", [new Date(r.now())]);
  expect((await post(r, b, path + '/rsvp')).statusCode).toBe(404); expect((await get(r, a, path)).statusCode).toBe(404); expect((await post(r, a, path + '/withdraw')).statusCode).toBe(200);
  await r.pool.query("UPDATE safety_incident_controls SET closed=false"); await r.pool.query('UPDATE identity_sessions SET expires_at=$2 WHERE account_id=$1', [b.me.profile.id, new Date(r.now())]); expect((await post(r, b, path + '/rsvp')).statusCode).toBe(401); expect((await r.pool.query("SELECT 1 FROM engine_event_rsvps WHERE phase='CONFIRMED'")).rowCount).toBe(0);
});

it('table hold competition commits one slot and confirmation retries do not create a second booking', async () => {
  const r = await open(), owner = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one', capacity: 4 }), users = await Promise.all(Array.from({ length: 12 }, () => guest(r)));
  const responses = await Promise.all(users.map(u => fetch(r.url + '/v1/reservations', { method: 'POST', headers: { ...headers(u), 'content-type': 'application/json' }, body: JSON.stringify({ schemaVersion: 1, eventId: event.event.id, partySize: 2 }), signal: AbortSignal.timeout(10000) })));
  expect(responses.filter(reply => reply.status === 201)).toHaveLength(1); expect(responses.filter(reply => reply.status === 409)).toHaveLength(11); const winnerIndex = responses.findIndex(reply => reply.status === 201), booking = (await responses[winnerIndex].json()).reservation, winner = users[winnerIndex], key = randomUUID();
  const confirmed = await Promise.all(Array.from({ length: 8 }, () => post(r, winner, 'reservations/' + booking.id + '/confirm', { schemaVersion: 1 }, key))); expect(confirmed.every(reply => reply.statusCode === 200 && reply.json().reservation.phase === 'CONFIRMED')).toBe(true);
  expect((await r.pool.query('SELECT 1 FROM engine_reservations')).rowCount).toBe(1); expect((await post(r, owner, 'events/' + event.event.id + '/rsvp')).statusCode).toBe(409);
});

it('table holds expire at exact TTL, old retries cannot revive them and a cancelled hold releases the slot', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), key = randomUUID(), body = { schemaVersion: 1, eventId: event.event.id, partySize: 2 };
  const held = (await post(r, a, 'reservations', body, key)).json().reservation; r.advance(30000);
  const expired = await post(r, a, 'reservations/' + held.id + '/confirm'); expect(expired.statusCode).toBe(200); expect(expired.json().reservation.phase).toBe('EXPIRED');
  const next = await post(r, b, 'reservations', body); expect(next.statusCode).toBe(201); expect((await post(r, a, 'reservations', body, key)).json().reservation.phase).toBe('EXPIRED');
  const cancelled = await post(r, b, 'reservations/' + next.json().reservation.id + '/cancel'); expect(cancelled.json().reservation.phase).toBe('CANCELLED'); expect((await post(r, a, 'reservations', body)).statusCode).toBe(201);
});

it('FIFO waitlist requires an explicit claim and cannot silently confirm or jump the first eligible entry', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), c = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), body = { schemaVersion: 1, eventId: event.event.id, partySize: 1 };
  const first = (await post(r, a, 'reservations', body)).json().reservation;
  const waiting = await post(r, b, 'reservations/waitlist', body); expect(waiting.statusCode).toBe(201); expect(waiting.json().entry.phase).toBe('WAITING'); await post(r, c, 'reservations/waitlist', body);
  await post(r, a, 'reservations/' + first.id + '/cancel'); expect((await post(r, c, 'reservations', body)).statusCode).toBe(409); expect((await r.pool.query("SELECT 1 FROM engine_reservations WHERE phase='CONFIRMED'")).rowCount).toBe(0);
  expect((await post(r, b, 'reservations', body)).statusCode).toBe(201); expect((await r.pool.query("SELECT phase FROM engine_reservation_waitlist WHERE account_id=$1", [b.me.profile.id])).rows[0].phase).toBe('CLAIMED');
});

it('check-in requires actual current room admission, a confirmed booking and the original trusted interval', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), held = (await post(r, a, 'reservations', { schemaVersion: 1, eventId: event.event.id, partySize: 2 })).json().reservation, path = 'reservations/' + held.id;
  const admitted = await join(r, a); expect(admitted.source).not.toBeNull();
  expect((await post(r, a, path + '/check-in', { schemaVersion: 1, source: admitted.source })).statusCode).toBe(409);
  await post(r, a, path + '/confirm'); expect((await post(r, a, path + '/check-in', { schemaVersion: 1, source: admitted.source })).statusCode).toBe(409);
  r.advance(60000); const forged = { ...admitted.source, membershipId: randomUUID() }; expect((await post(r, a, path + '/check-in', { schemaVersion: 1, source: forged })).statusCode).toBe(409); expect((await post(r, b, path + '/check-in', { schemaVersion: 1, source: admitted.source })).statusCode).toBe(404);
  const key = randomUUID(), body = { schemaVersion: 1, source: admitted.source }; const replies = await Promise.all(Array.from({ length: 6 }, () => post(r, a, path + '/check-in', body, key))); expect(replies.every(reply => reply.statusCode === 200 && reply.json().reservation.phase === 'CHECKED_IN')).toBe(true);
  await restart(r); expect((await post(r, a, path + '/check-in', body, key)).json().reservation.phase).toBe('CHECKED_IN'); expect(r.app.rooms.diagnostics().memberships).toBe(0); expect((await r.pool.query("SELECT 1 FROM engine_reservation_mutations WHERE operation='check-in'")).rowCount).toBe(1);
});

it('a full specified room cannot be bypassed by a reservation; failed check-in retains the confirmed booking', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), held = (await post(r, a, 'reservations', { schemaVersion: 1, eventId: event.event.id, partySize: 1 })).json().reservation;
  await post(r, a, 'reservations/' + held.id + '/confirm'); let fullRoom = '';
  for (let i = 0; i < 20; i++) { const visitor = await guest(r), admitted = await join(r, visitor, fullRoom || undefined); expect(admitted.source).not.toBeNull(); fullRoom = admitted.source!.roomId; }
  r.advance(60000); const failed = await join(r, a, fullRoom); expect(failed.ack).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });
  const forged = { epoch: r.app.rooms.epoch, roomId: fullRoom, membershipId: randomUUID() }; expect((await post(r, a, 'reservations/' + held.id + '/check-in', { schemaVersion: 1, source: forged })).statusCode).toBe(409); expect((await get(r, a, 'reservations/' + held.id)).json().reservation.phase).toBe('CONFIRMED');
});

it('late or expired booking cannot check in and a hold near start is clipped without clock extension', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }); r.advance(115000);
  const held = (await post(r, a, 'reservations', { schemaVersion: 1, eventId: event.event.id, partySize: 1 })).json().reservation; expect(Date.parse(held.holdExpiresAt) - r.now()).toBe(5000); const admitted = await join(r, a);
  r.advance(5000); expect((await post(r, a, 'reservations/' + held.id + '/confirm')).json().reservation.phase).toBe('EXPIRED'); expect((await post(r, a, 'reservations/' + held.id + '/check-in', { schemaVersion: 1, source: admitted.source })).json().reservation.phase).toBe('EXPIRED');
  expect((await r.pool.query("SELECT 1 FROM engine_reservations WHERE phase='CHECKED_IN'")).rowCount).toBe(0);
});

it('rejects overlapping table windows under concurrent trusted schedule creation and permits adjacent windows', async () => {
  const r = await open(), owner = await guest(r); r.organizers.add(owner.me.profile.id); const body = input(r, { resourceKey: 'table-one' });
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => r.app.events.schedule(owner.token, randomUUID(), body))); expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(results.filter(result => result.status === 'rejected')).toHaveLength(5);
  const s = body.schedule, adjacent = { ...s, opensAt: s.endsAt, startsAt: new Date(Date.parse(s.endsAt) + 60000).toISOString(), checkInClosesAt: new Date(Date.parse(s.endsAt) + 120000).toISOString(), endsAt: new Date(Date.parse(s.endsAt) + 3600000).toISOString() };
  expect((await schedule(r, owner, { resourceKey: 'table-one', schedule: adjacent })).event.resourceKey).toBe('table-one');
  await expect(schedule(r, owner, { resourceKey: 'forged-table' })).rejects.toMatchObject({ status: 404 });
});

it('reservation receipt failure rolls back holds/confirmation and own privacy/erasure cascades allocation', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), key = randomUUID(), body = { schemaVersion: 1, eventId: event.event.id, partySize: 2 };
  await r.pool.query("CREATE FUNCTION fail_booking_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic reservation receipt failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_booking_receipt BEFORE INSERT ON engine_reservation_mutations FOR EACH ROW EXECUTE FUNCTION fail_booking_receipt()');
  expect((await post(r, a, 'reservations', body, key)).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM engine_reservations')).rowCount).toBe(0);
  await r.pool.query('DROP TRIGGER fail_booking_receipt ON engine_reservation_mutations'); const held = (await post(r, a, 'reservations', body, key)).json().reservation;
  await r.pool.query('CREATE TRIGGER fail_booking_receipt BEFORE INSERT ON engine_reservation_mutations FOR EACH ROW EXECUTE FUNCTION fail_booking_receipt()'); expect((await post(r, a, 'reservations/' + held.id + '/confirm')).statusCode).toBe(503); expect((await get(r, a, 'reservations/' + held.id)).json().reservation.phase).toBe('HELD'); await r.pool.query('DROP TRIGGER fail_booking_receipt ON engine_reservation_mutations');
  expect((await get(r, b, 'reservations/' + held.id)).statusCode).toBe(404); expect((await get(r, b, 'reservations')).json().items).toEqual([]); const exported = (await get(r, a, 'me/export')).json().domains.reservations; expect(exported.items[0].id).toBe(held.id); expect(JSON.stringify(exported)).not.toMatch(/account_id|organizer|fingerprint/);
  expect((await post(r, a, 'reservations', { ...body, partySize: 1 }, key)).statusCode).toBe(409); expect((await post(r, a, 'reservations', { ...body, holdSeconds: 999 })).statusCode).toBe(422);
  await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(a), payload: {} }); expect((await r.pool.query('SELECT 1 FROM engine_reservation_mutations')).rowCount).toBe(0); expect((await post(r, b, 'reservations', body)).statusCode).toBe(201);
});

it('FIFO entry withdrawal is private and block cancels pending bookings atomically', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), body = { schemaVersion: 1, eventId: event.event.id, partySize: 1 };
  const held = (await post(r, a, 'reservations', body)).json().reservation, waitingKey = randomUUID(), waiting = (await post(r, b, 'reservations/waitlist', body, waitingKey)).json().entry;
  expect((await post(r, a, 'reservations/waitlist/' + waiting.id + '/leave')).statusCode).toBe(404);
  expect((await post(r, b, 'reservations/waitlist/' + waiting.id + '/leave')).json().entry.phase).toBe('CANCELLED'); expect((await post(r, b, 'reservations/waitlist', body, waitingKey)).json().entry.phase).toBe('CANCELLED');
  await r.pool.query("CREATE FUNCTION fail_booking_block() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.phase='CANCELLED' THEN RAISE EXCEPTION 'synthetic reservation block rollback'; END IF; RETURN NEW; END $$"); await r.pool.query('CREATE TRIGGER fail_booking_block BEFORE UPDATE ON engine_reservations FOR EACH ROW EXECUTE FUNCTION fail_booking_block()');
  expect((await post(r, a, 'blocks', { targetId: owner.me.profile.id, blocked: true })).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM social_blocks')).rowCount).toBe(0);
  await r.pool.query('DROP TRIGGER fail_booking_block ON engine_reservations'); expect((await post(r, a, 'blocks', { targetId: owner.me.profile.id, blocked: true })).statusCode).toBe(200); expect((await get(r, a, 'reservations/' + held.id)).json().reservation.phase).toBe('CANCELLED');
  await r.app.worlds.registry.setEnabled('event-fixture', false); expect((await post(r, a, 'reservations/' + held.id + '/cancel')).statusCode).toBe(200);
});

it('expired FIFO consent cannot renew through an old key or block a new explicit claimant', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), c = await guest(r), base = input(r).schedule, event = await schedule(r, owner, { resourceKey: 'table-one', schedule: { ...base, startsAt: new Date(r.now() + 600000).toISOString(), checkInClosesAt: new Date(r.now() + 900000).toISOString() } }), body = { schemaVersion: 1, eventId: event.event.id, partySize: 1 }, key = randomUUID();
  await post(r, a, 'reservations', body); const waiting = await post(r, b, 'reservations/waitlist', body, key); expect(waiting.statusCode).toBe(201); r.advance(300000);
  expect((await post(r, c, 'reservations', body)).statusCode).toBe(201); const old = await post(r, b, 'reservations/waitlist', body, key); expect(old.json().entry.phase).toBe('EXPIRED'); expect(old.json().entry.expiresAt).toBe(waiting.json().entry.expiresAt);
});

it('durable reservation command budgets and SQL constraints reject replay churn and duplicate slot ownership', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), body = { schemaVersion: 1, eventId: event.event.id, partySize: 1 }, key = randomUUID();
  const held = (await post(r, a, 'reservations', body, key)).json().reservation;
  for (let i = 1; i < 30; i++) expect((await post(r, a, 'reservations', body)).statusCode).toBe(201);
  expect((await post(r, a, 'reservations', body)).statusCode).toBe(429); expect((await post(r, a, 'reservations', body, key)).json().reservation.id).toBe(held.id);
  await expect(r.pool.query("INSERT INTO engine_reservations(id,event_id,account_id,phase,party_size,schedule,world_slug,resource_key,created_at,changed_at,hold_expires_at,allocation_ends_at) SELECT gen_random_uuid(),event_id,account_id,phase,party_size,schedule,world_slug,resource_key,created_at,changed_at,hold_expires_at,allocation_ends_at FROM engine_reservations")).rejects.toMatchObject({ code: '23505' });
  await expect(r.pool.query('UPDATE engine_reservations SET hold_expires_at=created_at')).rejects.toMatchObject({ code: '23514' });
});

it('restart preserves original hold expiry while confirmed no-shows expire without phantom attendance', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), body = { schemaVersion: 1, eventId: event.event.id, partySize: 1 }, key = randomUUID();
  const held = (await post(r, a, 'reservations', body, key)).json().reservation; r.advance(10000); await restart(r);
  const retry = (await post(r, a, 'reservations', body, key)).json().reservation; expect(retry.id).toBe(held.id); expect(retry.holdExpiresAt).toBe(held.holdExpiresAt); expect(retry.phase).toBe('HELD');
  await post(r, a, 'reservations/' + held.id + '/confirm'); r.advance(170000); const own = await get(r, a, 'reservations/' + held.id); expect(own.json().reservation.phase).toBe('EXPIRED'); expect(r.app.rooms.diagnostics().memberships).toBe(0); expect((await r.pool.query("SELECT 1 FROM engine_reservations WHERE phase='CHECKED_IN'")).rowCount).toBe(0);
});

it('event cancellation atomically releases table/waitlist consent and leaves one private notice per participant', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), b = await guest(r), stranger = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), body = { schemaVersion: 1, eventId: event.event.id, partySize: 1 }, key = randomUUID();
  await post(r, a, 'reservations', body); await post(r, b, 'reservations/waitlist', body);
  const aSocket = await join(r, a), bSocket = await join(r, b), aHints: unknown[] = [], bHints: unknown[] = []; aSocket.socket.on('event.notice', hint => aHints.push(hint)); bSocket.socket.on('event.notice', hint => bHints.push(hint));
  const replies = await Promise.all(Array.from({ length: 8 }, () => post(r, owner, 'events/' + event.event.id + '/cancel', { schemaVersion: 1, expectedVersion: 0 }, key))); expect(replies.every(reply => reply.statusCode === 200 && reply.json().event.phase === 'CANCELLED')).toBe(true);
  expect((await r.pool.query('SELECT phase FROM engine_reservations')).rows[0].phase).toBe('CANCELLED'); expect((await r.pool.query('SELECT phase FROM engine_reservation_waitlist')).rows[0].phase).toBe('CANCELLED'); expect((await r.pool.query('SELECT 1 FROM engine_event_notices')).rowCount).toBe(2);
  const own = (await get(r, a, 'events/notices')).json(); expect(own.items).toHaveLength(1); expect(own.items[0].kind).toBe('cancelled'); expect(JSON.stringify(own)).not.toMatch(/organizer|account|fingerprint|reason|title/); expect((await get(r, stranger, 'events/notices')).json().items).toEqual([]);
  await expect.poll(() => aHints.length).toBe(1); await expect.poll(() => bHints.length).toBe(1); expect(aHints).toEqual([{ schemaVersion: 1 }]); expect(bHints).toEqual([{ schemaVersion: 1 }]);
  await restart(r); expect((await post(r, owner, 'events/' + event.event.id + '/cancel', { schemaVersion: 1, expectedVersion: 0 }, key)).statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM engine_event_notices')).rowCount).toBe(2);
  expect((await get(r, a, 'me/export')).json().domains.events.notices).toHaveLength(1); await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(a), payload: {} }); expect((await r.pool.query('SELECT 1 FROM engine_event_notices')).rowCount).toBe(1);
});

it('default persistent organizer grants require current registered scope and do not grant moderation or performer authority', async () => {
  const r = await open(false), owner = await registered(r), other = await registered(r), g = await guest(r);
  expect((await post(r, owner, 'events', input(r))).statusCode).toBe(404); await grant(r, g, 'organizer'); expect((await post(r, g, 'events', input(r))).statusCode).toBe(404);
  await grant(r, owner, 'organizer'); const created = await post(r, owner, 'events', input(r)); expect(created.statusCode).toBe(201); const id = created.json().event.id;
  expect((await get(r, owner, 'events/' + id + '/controls')).json()).toMatchObject({ canAdjust: true, canCancel: true, canPerform: false });
  expect((await post(r, other, 'events/' + id + '/cancel', { schemaVersion: 1, expectedVersion: 0 })).statusCode).toBe(404); expect((await post(r, owner, 'events/' + id + '/performer-ready', { schemaVersion: 1, ready: true })).statusCode).toBe(404);
  await r.pool.query('UPDATE engine_event_grants SET expires_at=$2 WHERE account_id=$1', [owner.me.profile.id, new Date(r.now())]); expect((await post(r, owner, 'events/' + id + '/adjust', { schemaVersion: 1, expectedVersion: 0, title: 'Changed' })).statusCode).toBe(404);
  expect((await post(r, owner, 'event-grants', { role: 'organizer' })).statusCode).toBe(404); expect((await post(r, other, 'events', { ...input(r), role: 'organizer' })).statusCode).toBe(422);
});

it('only the current organizer adjusts an unoccupied scheduled event; stale versions and participant rescheduling reject', async () => {
  const r = await open(false), owner = await registered(r), other = await registered(r), attendee = await guest(r); await grant(r, owner, 'organizer'); await grant(r, other, 'organizer'); const event = (await post(r, owner, 'events', input(r))).json().event, path = 'events/' + event.id;
  expect((await post(r, other, path + '/adjust', { schemaVersion: 1, expectedVersion: 0, title: 'Hijacked' })).statusCode).toBe(404);
  const key = randomUUID(), body = { schemaVersion: 1, expectedVersion: 0, title: 'Reviewed silent schedule' }; const adjusted = await post(r, owner, path + '/adjust', body, key); expect(adjusted.statusCode).toBe(200); expect(adjusted.json().event).toMatchObject({ version: 1, title: body.title }); expect((await post(r, owner, path + '/adjust', body, key)).json()).toEqual(adjusted.json());
  expect((await post(r, owner, path + '/adjust', body)).statusCode).toBe(409); await post(r, attendee, path + '/rsvp'); expect((await post(r, owner, path + '/adjust', { ...body, expectedVersion: 1 })).statusCode).toBe(409);
  expect((await post(r, owner, 'events', { ...input(r), audience: 'interactive' })).statusCode).toBe(422); expect((await r.pool.query('SELECT 1 FROM engine_events')).rowCount).toBe(1);
});

it('performer readiness is voluntary, event-scoped and cannot adjust/cancel or become a moderation privilege', async () => {
  const r = await open(false), owner = await registered(r), performer = await registered(r); await grant(r, owner, 'organizer'); const event = (await post(r, owner, 'events', input(r))).json().event, path = 'events/' + event.id; await grant(r, performer, 'performer', event.id);
  expect((await post(r, performer, path + '/performer-ready', { schemaVersion: 1, ready: true })).statusCode).toBe(404); r.advance(60000);
  const key = randomUUID(); expect((await post(r, performer, path + '/performer-ready', { schemaVersion: 1, ready: true }, key)).json().ready).toBe(true); expect((await post(r, performer, path + '/performer-ready', { schemaVersion: 1, ready: true }, key)).json().ready).toBe(true);
  expect((await post(r, performer, path + '/cancel', { schemaVersion: 1, expectedVersion: 0 })).statusCode).toBe(404); expect((await get(r, performer, path + '/controls')).json()).toMatchObject({ canAdjust: false, canCancel: false, canPerform: true, ready: true });
  expect((await post(r, performer, 'blocks', { targetId: owner.me.profile.id, blocked: true })).statusCode).toBe(200); expect((await r.pool.query('SELECT ready FROM engine_event_performer_readiness WHERE event_id=$1 AND account_id=$2', [event.id, performer.me.profile.id])).rows[0].ready).toBe(false);
  await post(r, performer, 'blocks', { targetId: owner.me.profile.id, blocked: false }); expect((await post(r, performer, path + '/performer-ready', { schemaVersion: 1, ready: true })).json().ready).toBe(true);
  await r.pool.query("DELETE FROM engine_event_grants WHERE role='performer'"); expect((await get(r, performer, path + '/controls')).json()).toMatchObject({ canPerform: false, ready: false }); await r.app.worlds.registry.setEnabled('event-fixture', false); expect((await post(r, performer, path + '/performer-ready', { schemaVersion: 1, ready: false })).json().ready).toBe(false);
});

it('scoped registered safety moderator cancels during world closure without organizer/performer grants', async () => {
  const r = await open(false), owner = await registered(r), mod = await registered(r), wrongScope = await registered(r), a = await guest(r); await grant(r, owner, 'organizer'); const event = (await post(r, owner, 'events', input(r))).json().event, path = 'events/' + event.id;
  await post(r, a, path + '/rsvp'); await r.pool.query('INSERT INTO safety_staff_grants VALUES($1,$2,$3,$4),($5,$6,$3,$4)', [mod.me.profile.id, 'event-fixture', 'moderator', new Date(r.now() + 7200000), wrongScope.me.profile.id, 'sdk-sandbox']);
  expect((await post(r, wrongScope, path + '/cancel', { schemaVersion: 1, expectedVersion: 0 })).statusCode).toBe(404);
  await r.pool.query("INSERT INTO safety_incident_controls VALUES('event-fixture','world',true,NULL,$1)", [new Date(r.now())]); await r.app.worlds.registry.setEnabled('event-fixture', false);
  const cancelled = await post(r, mod, path + '/cancel', { schemaVersion: 1, expectedVersion: 0 }); expect(cancelled.statusCode).toBe(200); expect(cancelled.json().event.phase).toBe('CANCELLED'); expect((await get(r, a, 'events/notices')).json().items).toHaveLength(1); expect(r.app.rooms.diagnostics().memberships).toBe(0);
});

it('notice insertion failure rolls back cancellation, booking release and idempotency receipt together', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }), held = (await post(r, a, 'reservations', { schemaVersion: 1, eventId: event.event.id, partySize: 1 })).json().reservation, key = randomUUID(), body = { schemaVersion: 1, expectedVersion: 0 };
  await r.pool.query("CREATE FUNCTION fail_event_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic cancellation notice failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_event_notice BEFORE INSERT ON engine_event_notices FOR EACH ROW EXECUTE FUNCTION fail_event_notice()');
  expect((await post(r, owner, 'events/' + event.event.id + '/cancel', body, key)).statusCode).toBe(503); expect((await r.pool.query('SELECT phase,version FROM engine_events')).rows[0]).toMatchObject({ phase: 'SCHEDULED', version: 0 }); expect((await get(r, a, 'reservations/' + held.id)).json().reservation.phase).toBe('HELD'); expect((await r.pool.query("SELECT 1 FROM engine_event_mutations WHERE operation='cancel'")).rowCount).toBe(0);
  await r.pool.query('DROP TRIGGER fail_event_notice ON engine_event_notices'); expect((await post(r, owner, 'events/' + event.event.id + '/cancel', body, key)).statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM engine_event_notices')).rowCount).toBe(1);
});

it('RSVP racing cancellation either rejects admission or receives a single durable private notice after retry', async () => {
  const r = await open(), owner = await guest(r);
  for (let i = 0; i < 4; i++) {
    const a = await guest(r), event = await schedule(r, owner), key = randomUUID(), payload = { schemaVersion: 1, expectedVersion: 0 }, path = 'events/' + event.event.id;
    const [joinReply, initialCancel] = await Promise.all([post(r, a, path + '/rsvp'), post(r, owner, path + '/cancel', payload, key)]);
    const cancelled = initialCancel.statusCode === 503 ? await post(r, owner, path + '/cancel', payload, key) : initialCancel; expect(cancelled.statusCode).toBe(200); expect(cancelled.json().event.phase).toBe('CANCELLED'); expect([201, 409]).toContain(joinReply.statusCode);
    const notices = (await get(r, a, 'events/notices')).json().items; expect(notices).toHaveLength(joinReply.statusCode === 201 ? 1 : 0); expect((await r.pool.query("SELECT 1 FROM engine_event_rsvps WHERE event_id=$1 AND phase='CONFIRMED'", [event.event.id])).rowCount).toBe(0);
  }
});

it('authorized schedule adjustment persists an explicit timezone and cannot overlap another table slot', async () => {
  const r = await open(false), owner = await registered(r); await grant(r, owner, 'organizer'); const s = input(r).schedule, first = await schedule(r, owner, { resourceKey: 'table-one' });
  await schedule(r, owner, { resourceKey: 'table-one', schedule: { ...s, opensAt: s.endsAt, startsAt: new Date(Date.parse(s.endsAt) + 60000).toISOString(), checkInClosesAt: new Date(Date.parse(s.endsAt) + 120000).toISOString(), endsAt: new Date(Date.parse(s.endsAt) + 3600000).toISOString() } });
  const adjusted = await post(r, owner, 'events/' + first.event.id + '/adjust', { schemaVersion: 1, expectedVersion: 0, schedule: { ...s, timeZone: 'America/New_York' } }); expect(adjusted.statusCode).toBe(200); expect(adjusted.json().event).toMatchObject({ version: 1, schedule: { timeZone: 'America/New_York' } }); expect(adjusted.json().event.startsLabel).toContain('05:02:00');
  const overlap = { ...s, opensAt: new Date(r.now() + 1800000).toISOString(), startsAt: new Date(r.now() + 2700000).toISOString(), checkInClosesAt: new Date(r.now() + 3000000).toISOString(), endsAt: new Date(r.now() + 5400000).toISOString() };
  expect((await post(r, owner, 'events/' + first.event.id + '/adjust', { schemaVersion: 1, expectedVersion: 1, schedule: overlap })).statusCode).toBe(409); expect((await get(r, owner, 'events/' + first.event.id)).json().event.version).toBe(1);
});

it('participant erasure racing cancellation leaves no private notice or booking tied to the erased account', async () => {
  const r = await open(), owner = await guest(r), a = await guest(r), event = await schedule(r, owner, { resourceKey: 'table-one' }); await post(r, a, 'reservations', { schemaVersion: 1, eventId: event.event.id, partySize: 1 }); const key = randomUUID(), body = { schemaVersion: 1, expectedVersion: 0 };
  const [cancelled, erased] = await Promise.all([post(r, owner, 'events/' + event.event.id + '/cancel', body, key), r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(a), payload: {} })]); expect(erased.statusCode).toBe(200); expect(cancelled.statusCode).toBe(200);
  expect((await r.pool.query('SELECT 1 FROM engine_event_notices WHERE account_id=$1', [a.me.profile.id])).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_reservations WHERE account_id=$1', [a.me.profile.id])).rowCount).toBe(0);
});

it('global event discovery lists eligible public events while private and adult-gated rows remain hidden', async () => {
  const r = await open(), owner = await guest(r), viewer = await guest(r), publicEvent = await schedule(r, owner); await schedule(r, owner, { visibility: 'private' });
  const adultId = randomUUID(); await r.pool.query("INSERT INTO engine_events(id,organizer_id,world_slug,world_version,policy_version,title,audience,visibility,capacity,time_zone,opens_at,starts_at,check_in_closes_at,ends_at,phase,created_at,changed_at) SELECT $1,organizer_id,'dating',world_version,policy_version,'Private adult fixture',audience,visibility,capacity,time_zone,opens_at,starts_at,check_in_closes_at,ends_at,phase,created_at,changed_at FROM engine_events WHERE id=$2", [adultId, publicEvent.event.id]);
  const discovered = await get(r, viewer, 'events'); expect(discovered.statusCode).toBe(200); expect(discovered.json().items.map((event: { id: string }) => event.id)).toEqual([publicEvent.event.id]); expect(discovered.body).not.toMatch(/dating|Private adult/);
  expect((await get(r, viewer, 'events/' + adultId)).statusCode).toBe(404); expect((await get(r, viewer, 'events?worldSlug=dating')).statusCode).toBe(404);
});

it('private event invitation needs current friendship/opt-in and explicit acceptance without allocating RSVP/table/room', async () => {
  const r = await open(), owner = await guest(r), recipient = await guest(r), stranger = await guest(r), event = await schedule(r, owner, { visibility: 'private' }), path = 'events/' + event.event.id;
  expect((await post(r, owner, path + '/invitations', { schemaVersion: 1, recipientId: recipient.me.profile.id })).statusCode).toBe(404); await befriend(r, owner, recipient); await inviteOptIn(r, recipient, true);
  const sent = await post(r, owner, path + '/invitations', { schemaVersion: 1, recipientId: recipient.me.profile.id }); expect(sent.statusCode).toBe(201); expect(sent.json().phase).toBe('PENDING');
  expect((await get(r, recipient, path)).statusCode).toBe(404); const inbox = await get(r, recipient, 'event-invitations'); expect(inbox.json().items[0]).toMatchObject({ direction: 'incoming', event: { title: 'Synthetic silent study' } }); expect((await get(r, stranger, 'event-invitations')).json().items).toEqual([]);
  const accepted = await post(r, recipient, 'event-invitations/' + sent.json().id + '/respond', { schemaVersion: 1, action: 'accept' }); expect(accepted.statusCode).toBe(200); expect((await get(r, recipient, path)).statusCode).toBe(200); expect((await get(r, recipient, 'events')).json().items).toEqual([]);
  expect((await r.pool.query('SELECT 1 FROM engine_event_rsvps')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_reservations')).rowCount).toBe(0); expect(r.app.rooms.diagnostics().memberships).toBe(0);
});

it('private invitations reject IDOR and expire at the original deadline without revealing later schedule changes', async () => {
  const r = await open(), owner = await guest(r), recipient = await guest(r), stranger = await guest(r), base = input(r).schedule;
  const event = await schedule(r, owner, { visibility: 'private', schedule: { ...base, opensAt: new Date(r.now() + 300000).toISOString(), startsAt: new Date(r.now() + 600000).toISOString(), checkInClosesAt: new Date(r.now() + 900000).toISOString() } });
  await befriend(r, owner, recipient); await inviteOptIn(r, recipient, true); const key = randomUUID(), body = { schemaVersion: 1, recipientId: recipient.me.profile.id }, path = 'events/' + event.event.id;
  const sent = await post(r, owner, path + '/invitations', body, key); expect(sent.statusCode).toBe(201); const id = sent.json().id;
  expect((await post(r, stranger, 'event-invitations/' + id + '/respond', { schemaVersion: 1, action: 'accept' })).statusCode).toBe(404);
  expect((await post(r, owner, 'event-invitations/' + id + '/respond', { schemaVersion: 1, action: 'accept' })).statusCode).toBe(404);
  expect((await post(r, owner, path + '/invitations', { ...body, recipientId: stranger.me.profile.id }, key)).statusCode).toBe(404);
  r.advance(120000); const expired = await post(r, recipient, 'event-invitations/' + id + '/respond', { schemaVersion: 1, action: 'accept' }); expect(expired.statusCode).toBe(200); expect(expired.json().phase).toBe('EXPIRED');
  expect((await post(r, owner, path + '/invitations', body, key)).json().phase).toBe('EXPIRED'); expect((await get(r, recipient, path)).statusCode).toBe(404); expect((await get(r, recipient, 'event-invitations')).json().items).toEqual([]);
  const edited = await post(r, owner, path + '/adjust', { schemaVersion: 1, expectedVersion: 0, title: 'Changed private details' }); expect(edited.statusCode).toBe(200); expect((await get(r, recipient, 'event-invitations')).body).not.toContain('Changed private details');
});

it('acceptance crossing its deadline while SQL is blocked expires instead of granting private access', async () => {
  const r = await open(), owner = await guest(r), recipient = await guest(r), base = input(r).schedule;
  const event = await schedule(r, owner, { visibility: 'private', schedule: { ...base, startsAt: new Date(r.now() + 600000).toISOString(), checkInClosesAt: new Date(r.now() + 900000).toISOString() } }); await befriend(r, owner, recipient); await inviteOptIn(r, recipient, true);
  const sent = await post(r, owner, 'events/' + event.event.id + '/invitations', { schemaVersion: 1, recipientId: recipient.me.profile.id }); const id = sent.json().id;
  await r.pool.query("CREATE FUNCTION pause_event_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.phase='ACCEPTED' THEN PERFORM pg_advisory_xact_lock(7369281); END IF; RETURN NEW; END $$");
  await r.pool.query('CREATE TRIGGER pause_event_acceptance BEFORE UPDATE ON engine_event_invitations FOR EACH ROW EXECUTE FUNCTION pause_event_acceptance()');
  const blocker = await r.pool.connect(); await blocker.query('BEGIN'); await blocker.query('SELECT pg_advisory_xact_lock(7369281)');
  const pending = post(r, recipient, 'event-invitations/' + id + '/respond', { schemaVersion: 1, action: 'accept' });
  try {
    await expect.poll(async () => (await r.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE engine_event_invitations SET phase=%' AND pid<>pg_backend_pid()")).rows[0].n, { timeout: 800 }).toBeGreaterThan(0);
    r.advance(120000); await blocker.query('COMMIT');
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  const result = await pending; expect(result.statusCode).toBe(200); expect(result.json().phase).toBe('EXPIRED'); expect((await get(r, recipient, 'events/' + event.event.id)).statusCode).toBe(404);
});

it('revoking invitation consent atomically cancels accepted private table work and cannot revive old keys', async () => {
  const r = await open(), owner = await guest(r), recipient = await guest(r), other = await guest(r), event = await schedule(r, owner, { visibility: 'private', resourceKey: 'table-one' }), path = 'events/' + event.event.id;
  await befriend(r, owner, recipient); await befriend(r, owner, other); await inviteOptIn(r, recipient, true); await inviteOptIn(r, other, true);
  const sendKey = randomUUID(), offer = await post(r, owner, path + '/invitations', { schemaVersion: 1, recipientId: recipient.me.profile.id }, sendKey), acceptKey = randomUUID(), accept = { schemaVersion: 1, action: 'accept' };
  await post(r, recipient, 'event-invitations/' + offer.json().id + '/respond', accept, acceptKey); const booking = await post(r, recipient, 'reservations', { schemaVersion: 1, eventId: event.event.id, partySize: 1 }); expect(booking.statusCode).toBe(201);
  await r.pool.query("CREATE FUNCTION fail_private_revocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.phase='CANCELLED' THEN RAISE EXCEPTION 'synthetic consent withdrawal failure'; END IF; RETURN NEW; END $$"); await r.pool.query('CREATE TRIGGER fail_private_revocation BEFORE UPDATE ON engine_reservations FOR EACH ROW EXECUTE FUNCTION fail_private_revocation()');
  expect((await inviteOptIn(r, recipient, false)).statusCode).toBe(503); expect((await get(r, recipient, path)).statusCode).toBe(200); expect((await r.pool.query('SELECT phase FROM engine_event_invitations')).rows[0].phase).toBe('ACCEPTED');
  await r.pool.query('DROP TRIGGER fail_private_revocation ON engine_reservations'); expect((await inviteOptIn(r, recipient, false)).statusCode).toBe(200); expect((await get(r, recipient, path)).statusCode).toBe(404); expect((await get(r, recipient, 'reservations/' + booking.json().reservation.id)).json().reservation.phase).toBe('CANCELLED');
  await inviteOptIn(r, recipient, true); expect((await post(r, recipient, 'event-invitations/' + offer.json().id + '/respond', accept, acceptKey)).json().phase).toBe('CANCELLED'); expect((await get(r, recipient, path)).statusCode).toBe(404);
  const offer2 = await post(r, owner, path + '/invitations', { schemaVersion: 1, recipientId: other.me.profile.id }); await post(r, other, 'event-invitations/' + offer2.json().id + '/respond', accept); expect((await post(r, other, 'reservations', { schemaVersion: 1, eventId: event.event.id, partySize: 1 })).statusCode).toBe(201);
});

it('blocking or unfriending serializes with acceptance and withdraws private RSVP without later resurrection', async () => {
  const r = await open(), owner = await guest(r);
  for (const method of ['block', 'unfriend'] as const) {
    const recipient = await guest(r), event = await schedule(r, owner, { visibility: 'private' }), path = 'events/' + event.event.id; await befriend(r, owner, recipient); await inviteOptIn(r, recipient, true);
    const offer = await post(r, owner, path + '/invitations', { schemaVersion: 1, recipientId: recipient.me.profile.id }), id = offer.json().id, key = randomUUID(), accept = { schemaVersion: 1, action: 'accept' };
    const withdrawal = () => method === 'block' ? post(r, recipient, 'blocks', { targetId: owner.me.profile.id, blocked: true }) : r.app.http.inject({ method: 'DELETE', url: '/v1/friends/' + owner.me.profile.id, headers: headers(recipient) });
    const [accepted, withdrawn] = await Promise.all([post(r, recipient, 'event-invitations/' + id + '/respond', accept, key), withdrawal()]); expect(withdrawn.statusCode).toBe(200); expect([200,404]).toContain(accepted.statusCode);
    expect((await get(r, recipient, path)).statusCode).toBe(404); expect((await r.pool.query('SELECT phase FROM engine_event_invitations WHERE id=$1', [id])).rows[0].phase).toBe('CANCELLED');
    if (method === 'block') await post(r, recipient, 'blocks', { targetId: owner.me.profile.id, blocked: false }); await befriend(r, owner, recipient);
    expect((await get(r, recipient, path)).statusCode).toBe(404); expect((await post(r, owner, path + '/invitations', { schemaVersion: 1, recipientId: recipient.me.profile.id })).json().phase).toBe('PENDING');
  }
});

it('event cancellation reaches invited accounts with private notices and cancels pending consent once', async () => {
  const r = await open(), owner = await guest(r), recipient = await guest(r), event = await schedule(r, owner, { visibility: 'private' }), path = 'events/' + event.event.id; await befriend(r, owner, recipient); await inviteOptIn(r, recipient, true);
  const key = randomUUID(), input = { schemaVersion: 1, recipientId: recipient.me.profile.id }, offers = await Promise.all(Array.from({ length: 6 }, () => post(r, owner, path + '/invitations', input, key)));
  expect(offers.every(reply => reply.statusCode === 201 && reply.json().id === offers[0].json().id)).toBe(true); expect((await r.pool.query('SELECT 1 FROM engine_event_invitations')).rowCount).toBe(1); expect((await r.pool.query('SELECT 1 FROM engine_event_invite_mutations')).rowCount).toBe(1);
  expect((await post(r, owner, path + '/cancel', { schemaVersion: 1, expectedVersion: 0 })).statusCode).toBe(200); expect((await r.pool.query('SELECT phase FROM engine_event_invitations')).rows[0].phase).toBe('CANCELLED'); expect((await get(r, recipient, 'events/notices')).json().items).toHaveLength(1); expect((await get(r, recipient, 'event-invitations')).json().items).toEqual([]);
  const exported = (await get(r, recipient, 'me/export')).json().domains.eventInvitations; expect(exported.items[0]).toMatchObject({ id: offers[0].json().id, phase: 'CANCELLED', direction: 'incoming' }); expect(JSON.stringify(exported)).not.toMatch(/fingerprint|sender_id|recipient_id/);
  await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(recipient), payload: {} }); expect((await r.pool.query('SELECT 1 FROM engine_event_invitations')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_event_invite_mutations')).rowCount).toBe(0);
});

it.each([
  { name: 'spring gap', now: '2026-03-08T05:00:00.000Z', opensAt: '2026-03-08T06:00:00.000Z', startsAt: '2026-03-08T06:30:00.000Z', checkInClosesAt: '2026-03-08T07:15:00.000Z', endsAt: '2026-03-08T07:30:00.000Z', startOffset: 'GMT-05:00', endOffset: 'GMT-04:00', endClock: '03:30:00' },
  { name: 'repeated fall hour', now: '2026-11-01T04:00:00.000Z', opensAt: '2026-11-01T05:00:00.000Z', startsAt: '2026-11-01T05:30:00.000Z', checkInClosesAt: '2026-11-01T06:15:00.000Z', endsAt: '2026-11-01T06:30:00.000Z', startOffset: 'GMT-04:00', endOffset: 'GMT-05:00', endClock: '01:30:00' },
])('two independent network sessions preserve one table and trusted expiry after timezone change through $name', async spec => {
  const r = await open(); r.advance(Date.parse(spec.now) - r.now()); const owner = await guest(r), a = await guest(r), b = await guest(r);
  const scheduleInput = { schemaVersion: 1, timeZone: 'UTC', opensAt: spec.opensAt, startsAt: spec.startsAt, checkInClosesAt: spec.checkInClosesAt, endsAt: spec.endsAt };
  const event = await schedule(r, owner, { resourceKey: 'table-one', capacity: 2, schedule: scheduleInput }), changed = await post(r, owner, 'events/' + event.event.id + '/adjust', { schemaVersion: 1, expectedVersion: 0, schedule: { ...scheduleInput, timeZone: 'America/New_York' } });
  expect(changed.statusCode).toBe(200); expect(changed.json().event).toMatchObject({ version: 1, schedule: { startsAt: spec.startsAt, endsAt: spec.endsAt } }); expect(changed.json().event.startsLabel).toContain('01:30:00'); expect(changed.json().event.startsLabel).toContain(spec.startOffset); expect(changed.json().event.endsLabel).toContain(spec.endClock); expect(changed.json().event.endsLabel).toContain(spec.endOffset);
  const actors = [a,b], visits = await Promise.all(actors.map(actor => join(r, actor))); expect(visits.every(visit => visit.source !== null)).toBe(true);
  const tcp = async (actor: User, path: string, body: unknown, key = randomUUID()) => { const response = await fetch(r.url + '/v1/' + path, { method: 'POST', headers: { ...headers(actor, key), 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }); return { status: response.status, body: await response.json() }; };
  const body = { schemaVersion: 1, eventId: event.event.id, partySize: 2 }, race = await Promise.all(actors.map(actor => tcp(actor, 'reservations', body))); expect(race.map(result => result.status).sort()).toEqual([201,409]); const winnerIndex = race.findIndex(result => result.status === 201), loserIndex = 1 - winnerIndex, winner = actors[winnerIndex], loser = actors[loserIndex], reservation = race[winnerIndex].body.reservation;
  const confirmKey = randomUUID(), confirms = await Promise.all(Array.from({ length: 4 }, () => tcp(winner, 'reservations/' + reservation.id + '/confirm', { schemaVersion: 1 }, confirmKey))); expect(confirms.every(result => result.status === 200 && result.body.reservation.phase === 'CONFIRMED')).toBe(true);
  r.advance(Date.parse(spec.opensAt) - r.now());
  await tcp(winner, 'reservations/' + reservation.id + '/cancel', { schemaVersion: 1 }); const held = await tcp(loser, 'reservations', body); expect(held.status).toBe(201); r.advance(30000);
  expect((await tcp(loser, 'reservations/' + held.body.reservation.id + '/check-in', { schemaVersion: 1, source: visits[loserIndex].source })).body.reservation.phase).toBe('EXPIRED');
  expect((await r.pool.query("SELECT 1 FROM engine_reservations WHERE phase IN ('HELD','CONFIRMED','CHECKED_IN')")).rowCount).toBe(0);
  const replacement = await tcp(winner, 'reservations', body); expect(replacement.status).toBe(201); await tcp(winner, 'reservations/' + replacement.body.reservation.id + '/confirm', { schemaVersion: 1 });
  const checked = await tcp(winner, 'reservations/' + replacement.body.reservation.id + '/check-in', { schemaVersion: 1, source: visits[winnerIndex].source }); expect(checked.body.reservation.phase).toBe('CHECKED_IN'); expect((await r.pool.query("SELECT 1 FROM engine_reservation_mutations WHERE operation='confirm'")).rowCount).toBe(2);
});
