import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { InvitationReceiptSchema, InvitationSettingsSchema, InvitationsPageSchema, MeSchema, type Me } from '@virtual-city/contracts';
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
  const schema = 'invite_test_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema); const pool = new Pool({ connectionString: url.toString() }); await migrate(pool); let offset = 0;
  const config = readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'invitation-local-test-session-secret-000001' });
  const modules = ['dating', 'private-room'].map(slug => defineWorld({ schemaVersion: 1, apiVersion: 1, slug, version: '1.0.0', title: 'Hidden synthetic invitation fixture', kind: 'sandbox', sceneRef: { key: 'invite-fixture', version: '1.0.0' }, capacity: 2, capabilities: ['presence'], accessPolicy: slug === 'dating' ? { kind: 'restricted', policyKey: 'invite.adult', requiresAdult: true } : { kind: 'private', policyKey: 'invite.private' }, visibility: 'hidden', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {} }));
  const options = { now: () => Date.now() + offset, worlds: { modules, policy: { permits: async () => true }, adultProof: { hasReviewedProof: async () => true } } };
  const app = await createApp(config, pool, false, options); opened.push({ app, pool, schema }); await app.app.listen(0, '127.0.0.1'); for (const slug of app.worlds.registry.slugs()) await app.worlds.registry.setEnabled(slug, true);
  return { app, pool, config, options, url: await app.app.getUrl(), advance: (ms: number) => { offset += ms; } };
}
type Runtime = Awaited<ReturnType<typeof open>>; type User = { me: Me; cookie: string };
const headers = (u: User, key = randomUUID()) => ({ origin, cookie: u.cookie, 'x-csrf-token': u.me.csrfToken, 'idempotency-key': key });
const write = (r: Runtime, u: User, path: string, payload: unknown, key = randomUUID(), method: 'POST' | 'PATCH' | 'DELETE' = 'POST') => r.app.http.inject({ method, url: '/v1/' + path, headers: headers(u, key), payload });
async function guest(r: Runtime): Promise<User> { const n = serial++; const response = await r.app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: `127.51.${Math.floor(n / 250)}.${n % 250 + 1}`, headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Invitation Visitor', avatarKey: 'mint' } }); expect(response.statusCode).toBe(201); return { me: MeSchema.parse(response.json()), cookie: String(response.headers['set-cookie']).split(';')[0] }; }
const dest = (worldSlug = 'sdk-sandbox') => ({ worldSlug, worldVersion: '1.0.0', sceneVersion: '1.0.0' });
const send = (r: Runtime, a: User, b: User, key = randomUUID(), destination = dest()) => write(r, a, 'invitations', { schemaVersion: 1, recipientId: b.me.profile.id, destination }, key);
const respond = (r: Runtime, u: User, id: string, action: 'accept' | 'decline' | 'cancel', key = randomUUID()) => write(r, u, `invitations/${id}/respond`, { schemaVersion: 1, action }, key);
const settings = (r: Runtime, u: User, enabled: boolean, key = randomUUID()) => write(r, u, 'me/invitations/settings', { schemaVersion: 1, allowInvitations: enabled }, key, 'PATCH');
const list = async (r: Runtime, u: User, query = '') => InvitationsPageSchema.parse((await r.app.http.inject({ url: '/v1/invitations' + query, headers: { cookie: u.cookie } })).json());
async function friends(r: Runtime, a: User, b: User) { const code = (await r.app.http.inject({ url: '/v1/social/me', headers: { cookie: b.cookie } })).json().contactCode; const request = await write(r, a, 'friends/requests', { contactCode: code }); expect(request.statusCode).toBe(200); expect((await write(r, b, `friends/requests/${request.json().id}/respond`, { action: 'accept' })).json().state).toBe('ACCEPTED'); }
async function pair(r: Runtime) { const a = await guest(r), b = await guest(r); await friends(r, a, b); expect((await settings(r, b, true)).statusCode).toBe(200); return { a, b }; }
async function connect(r: Runtime, u: User) { const n = serial++; const socket = io(r.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: `127.52.${Math.floor(n / 250)}.${n % 250 + 1}` } }, extraHeaders: { origin, cookie: u.cookie }, auth: { schemaVersion: 1, csrfToken: u.me.csrfToken } }); sockets.add(socket); await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); }); return socket; }
async function restart(r: Runtime) { await r.app.app.close(); const old = r.app, app = await createApp(r.config, r.pool, false, r.options); opened.find(item => item.app === old)!.app = app; r.app = app; await app.app.listen(0, '127.0.0.1'); r.url = await app.app.getUrl(); for (const slug of app.worlds.registry.slugs()) await app.worlds.registry.setEnabled(slug, true); }

it('defaults recipient consent OFF, requires current friendship and rejects self/stranger without notifications', async () => {
  const r = await open(), a = await guest(r), b = await guest(r), notifications: unknown[] = []; const socket = await connect(r, b); socket.on('invitation.received', event => notifications.push(event));
  const prefs = await r.app.http.inject({ url: '/v1/me/invitations/settings', headers: { cookie: b.cookie } }); expect(InvitationSettingsSchema.parse(prefs.json()).allowInvitations).toBe(false);
  expect((await send(r, a, b)).statusCode).toBe(404); await friends(r, a, b); expect((await send(r, a, b)).statusCode).toBe(404);
  await settings(r, b, true); expect((await send(r, b, b)).statusCode).toBe(404); expect((await send(r, await guest(r), b)).statusCode).toBe(404);
  expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(0); expect(notifications).toEqual([]);
});

it('persists one invitation under actual TCP concurrent retries and sends metadata-free account-scoped socket refresh once', async () => {
  const r = await open(), { a, b } = await pair(r), outsider = await guest(r), receiver = await connect(r, b), stranger = await connect(r, outsider), events: unknown[] = [], foreign: unknown[] = [];
  receiver.on('invitation.received', event => events.push(event)); stranger.on('invitation.received', event => foreign.push(event)); const key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 12 }, () => fetch(r.url + '/v1/invitations', { method: 'POST', headers: { ...headers(a, key), 'content-type': 'application/json' }, body: JSON.stringify({ schemaVersion: 1, recipientId: b.me.profile.id, destination: dest() }), signal: AbortSignal.timeout(5000) })));
  expect(responses.every(response => response.status === 201)).toBe(true); const bodies = await Promise.all(responses.map(async response => InvitationReceiptSchema.parse(await response.json()))); for (const body of bodies) expect(body).toEqual(bodies[0]);
  await expect.poll(() => events.length).toBe(1); expect(events).toEqual([{ schemaVersion: 1 }]); expect(foreign).toEqual([]);
  expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(1); expect((await r.pool.query("SELECT 1 FROM invitation_mutations WHERE operation='create'")).rowCount).toBe(1);
  const incoming = await list(r, b), outgoing = await list(r, a); expect(incoming.items[0]).toMatchObject({ direction: 'incoming', contact: a.me.profile, destination: dest(), state: 'PENDING' }); expect(outgoing.items[0].direction).toBe('outgoing'); expect((await list(r, outsider)).items).toEqual([]);
  expect(JSON.stringify(incoming)).not.toMatch(/session|cookie|capability|membership|roomId|presence/); expect(r.app.rooms.diagnostics().memberships).toBe(0);
});

it('accept/decline/cancel are scoped, durable and idempotent, never issue travel authority or move membership', async () => {
  const r = await open(), { a, b } = await pair(r), outsider = await guest(r), created = await send(r, a, b); const id = created.json().id;
  expect((await respond(r, a, id, 'accept')).statusCode).toBe(403); expect((await respond(r, b, id, 'cancel')).statusCode).toBe(403); expect((await respond(r, outsider, id, 'accept')).statusCode).toBe(404);
  const key = randomUUID(), outcomes = await Promise.all([respond(r, b, id, 'accept', key), respond(r, b, id, 'accept', key)]); expect(outcomes.every(response => response.statusCode === 200 && response.json().state === 'ACCEPTED')).toBe(true); expect(outcomes[0].json()).toEqual(outcomes[1].json());
  expect((await respond(r, b, id, 'decline')).json().state).toBe('ACCEPTED'); expect((await respond(r, b, id, 'decline', key)).statusCode).toBe(409);
  expect((await r.pool.query('SELECT 1 FROM travel_intents')).rowCount).toBe(0); expect(r.app.rooms.diagnostics().memberships).toBe(0);
  const second = (await send(r, a, b)).json(); expect((await respond(r, b, second.id, 'decline')).json().state).toBe('DECLINED');
  const third = (await send(r, a, b)).json(); expect((await respond(r, a, third.id, 'cancel')).json().state).toBe('CANCELLED');
  await restart(r); expect((await respond(r, b, id, 'accept', key)).json()).toEqual(outcomes[0].json());
});

it('expires at server deadline, retains original TTL on retry and never accepts expired invitation', async () => {
  const r = await open(), { a, b } = await pair(r), key = randomUUID(), first = InvitationReceiptSchema.parse((await send(r, a, b, key)).json()); expect(Date.parse(first.expiresAt) - Date.parse(first.createdAt)).toBe(120000);
  r.advance(120000); expect((await respond(r, b, first.id, 'accept')).json().state).toBe('EXPIRED'); expect(InvitationReceiptSchema.parse((await send(r, a, b, key)).json())).toEqual({ ...first, state: 'EXPIRED' });
  expect((await list(r, b)).items[0].state).toBe('EXPIRED'); expect((await send(r, a, b)).json().id).not.toBe(first.id);
});

it('withdraws pending invitations atomically on block/unfriend and never resurrects them after new friendship', async () => {
  const r = await open(), { a, b } = await pair(r), key = randomUUID(), first = (await send(r, a, b, key)).json();
  expect((await write(r, b, 'blocks', { targetId: a.me.profile.id, blocked: true })).statusCode).toBe(200); expect((await list(r, a)).items).toEqual([]); expect((await list(r, b)).items).toEqual([]);
  expect((await respond(r, b, first.id, 'accept')).statusCode).toBe(404); expect((await send(r, a, b, key)).statusCode).toBe(404); expect((await r.pool.query('SELECT state FROM invitations WHERE id=$1', [first.id])).rows[0].state).toBe('CANCELLED');
  await write(r, b, 'blocks', { targetId: a.me.profile.id, blocked: false }); await friends(r, a, b); expect((await respond(r, b, first.id, 'accept')).json().state).toBe('CANCELLED');
  const second = (await send(r, a, b)).json(); expect((await write(r, a, 'friends/' + b.me.profile.id, {}, randomUUID(), 'DELETE')).statusCode).toBe(200); expect((await r.pool.query('SELECT state FROM invitations WHERE id=$1', [second.id])).rows[0].state).toBe('CANCELLED');
});

it('serializes accept versus block, then rejects stale accepted replay and preference disable/re-enable cannot restore pending offers', async () => {
  const r = await open(), { a, b } = await pair(r), first = (await send(r, a, b)).json(), key = randomUUID();
  const results = await Promise.all([respond(r, b, first.id, 'accept', key), write(r, a, 'blocks', { targetId: b.me.profile.id, blocked: true })]); expect(results[1].statusCode).toBe(200); expect([200, 404]).toContain(results[0].statusCode);
  expect((await respond(r, b, first.id, 'accept', key)).statusCode).toBe(404); expect((await list(r, b)).items).toEqual([]);
  await write(r, a, 'blocks', { targetId: b.me.profile.id, blocked: false }); await friends(r, a, b); const next = (await send(r, a, b)).json();
  await settings(r, b, false); expect((await respond(r, b, next.id, 'accept')).statusCode).toBe(404); expect((await list(r, a)).items).toEqual([]); await settings(r, b, true); expect((await respond(r, b, next.id, 'accept')).json().state).toBe('CANCELLED');
});

it('never sends hidden/private/adult world details even to reviewed adults; rechecks base flags and versions on accept/list', async () => {
  const r = await open(), { a, b } = await pair(r);
  for (const slug of ['dating', 'private-room', 'unknown-world']) { const response = await send(r, a, b, randomUUID(), dest(slug)); expect(response.statusCode).toBe(404); expect(response.body).not.toContain(slug); }
  expect((await send(r, a, b, randomUUID(), { ...dest(), sceneVersion: '2.0.0' })).statusCode).toBe(409);
  const first = (await send(r, a, b)).json(); await r.app.worlds.registry.setEnabled('sdk-sandbox', false);
  expect((await respond(r, b, first.id, 'accept')).statusCode).toBe(404); expect((await list(r, b)).items).toEqual([]); expect((await send(r, a, b)).statusCode).toBe(404);
  expect((await respond(r, b, first.id, 'decline')).json().state).toBe('DECLINED');
});

it('rejects forged authority/room/free text, Origin/CSRF failures, arbitrary keys and query bearer input', async () => {
  const r = await open(), { a, b } = await pair(r), input = { schemaVersion: 1, recipientId: b.me.profile.id, destination: dest() };
  for (const extra of [{ senderId: a.me.profile.id }, { role: 'staff' }, { text: 'unreviewed arbitrary message' }, { ttlMs: 999999 }, { redirect: 'https://example.invalid' }]) expect((await write(r, a, 'invitations', { ...input, ...extra })).statusCode).toBe(422);
  expect((await write(r, a, 'invitations', { ...input, destination: { ...dest(), roomId: randomUUID() } })).statusCode).toBe(422);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/invitations', headers: { ...headers(a), origin: 'https://example.invalid' }, payload: input })).statusCode).toBe(403);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/invitations', headers: { origin, cookie: a.cookie, 'idempotency-key': randomUUID() }, payload: input })).statusCode).toBe(403);
  expect((await write(r, a, 'invitations', input, 'unsafe-key')).statusCode).toBe(422); expect((await r.app.http.inject({ url: '/v1/invitations?token=ignored', headers: { cookie: a.cookie } })).statusCode).toBe(422);
  expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(0);
});

it('keeps sender rate budget durable across independent sessions/restart and bounds expiry metadata maintenance', async () => {
  const r = await open(), { a, b } = await pair(r);
  const loginName = 'invite_' + randomUUID().replaceAll('-', '').slice(0, 16), password = 'invitation-local-test-password';
  const upgrade = await write(r, a, 'session/upgrade', { loginName, password }); expect(upgrade.statusCode).toBe(200); a.cookie = String(upgrade.headers['set-cookie']).split(';')[0]; a.me = MeSchema.parse(upgrade.json());
  for (let i = 0; i < 6; i++) { const invitation = (await send(r, a, b)).json(); expect((await respond(r, b, invitation.id, 'decline')).statusCode).toBe(200); }
  expect((await send(r, a, b)).statusCode).toBe(429);
  const login = await r.app.http.inject({ method: 'POST', url: '/v1/session/login', remoteAddress: '127.55.0.1', headers: { origin }, payload: { requestId: randomUUID(), loginName, password } }); expect(login.statusCode).toBe(200);
  const other = { cookie: String(login.headers['set-cookie']).split(';')[0], me: MeSchema.parse(login.json()) }; expect(other.me.profile.id).toBe(a.me.profile.id); expect((await send(r, other, b)).statusCode).toBe(429);
  await restart(r); expect((await send(r, a, b)).statusCode).toBe(429);
  r.advance(61000); expect((await send(r, a, b)).statusCode).toBe(201); r.advance(86400001); await r.app.invitations.maintain(); expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM invitation_mutations')).rowCount).toBe(0);
});

it('enforces current recipient sanctions at accept/list without giving the invitation any admission privilege', async () => {
  const r = await open(), { a, b } = await pair(r), reporter = await guest(r), first = (await send(r, a, b)).json(), caseId = randomUUID();
  await r.pool.query("INSERT INTO safety_cases(id,receipt_id,reporter_id,subject_id,request_id,fingerprint,world_slug,category,severity,created_at) VALUES($1,$2,$3,$4,$5,$6,'sdk-sandbox','harassment','high',$7)", [caseId, randomUUID(), reporter.me.profile.id, b.me.profile.id, randomUUID(), r.app.identity.fingerprint({ syntheticInvitation: true }), new Date(r.options.now())]);
  await r.pool.query("INSERT INTO safety_sanctions(id,case_id,subject_id,kind,category,world_slug,effective_at,expires_at,appeal_until) VALUES($1,$2,$3,'world-ban','harassment','sdk-sandbox',$4,$5,$5)", [randomUUID(), caseId, b.me.profile.id, new Date(r.options.now()), new Date(r.options.now() + 60000)]);
  expect((await respond(r, b, first.id, 'accept')).statusCode).toBe(404); expect((await list(r, b)).items).toEqual([]); expect((await respond(r, b, first.id, 'decline')).json().state).toBe('DECLINED'); expect(r.app.rooms.diagnostics().memberships).toBe(0);
});

it('rolls back block and friendship withdrawal if pending invitation cancellation cannot commit', async () => {
  const r = await open(), { a, b } = await pair(r), first = (await send(r, a, b)).json();
  await r.pool.query("CREATE FUNCTION fail_invitation_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic invitation cancellation failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_invitation_cancel BEFORE UPDATE ON invitations FOR EACH ROW EXECUTE FUNCTION fail_invitation_cancel()');
  expect((await write(r, a, 'blocks', { targetId: b.me.profile.id, blocked: true })).statusCode).toBe(503);
  expect((await r.pool.query('SELECT 1 FROM social_blocks')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM social_friendships')).rowCount).toBe(1); expect((await r.pool.query('SELECT state FROM invitations WHERE id=$1', [first.id])).rows[0].state).toBe('PENDING');
  await r.pool.query('DROP TRIGGER fail_invitation_cancel ON invitations'); expect((await write(r, a, 'blocks', { targetId: b.me.profile.id, blocked: true })).statusCode).toBe(200); expect((await r.pool.query('SELECT state FROM invitations WHERE id=$1', [first.id])).rows[0].state).toBe('CANCELLED');
});

it('bounds paginated inbox projections and rejects changed idempotency input or duplicate pending pair', async () => {
  const r = await open(), { a, b } = await pair(r), c = await guest(r); await friends(r, a, c); await settings(r, c, true);
  const key = randomUUID(), first = (await send(r, a, b, key)).json(); expect((await send(r, a, c, key)).statusCode).toBe(409); expect((await send(r, a, b)).statusCode).toBe(409);
  const second = (await send(r, a, c)).json(), page = await list(r, a, '?limit=1'); expect(page.items).toHaveLength(1); expect(page.nextCursor).not.toBeNull(); const next = await list(r, a, '?limit=1&cursor=' + page.nextCursor); expect(next.items).toHaveLength(1); expect(new Set([...page.items, ...next.items].map(row => row.id))).toEqual(new Set([first.id, second.id])); expect(next.nextCursor).toBeNull();
  await expect(r.pool.query("UPDATE invitations SET state='FORGED' WHERE id=$1", [first.id])).rejects.toMatchObject({ code: '23514' });
  await expect(r.pool.query("INSERT INTO invitations VALUES($1,$2,$2,$3,'PENDING',now(),now()+interval '2 minutes',now())", [randomUUID(), a.me.profile.id, JSON.stringify(dest())])).rejects.toMatchObject({ code: '23514' });
});

it('exports minimal own invitation metadata, erases dependent data and rolls back creation on receipt failure', async () => {
  const r = await open(), { a, b } = await pair(r), first = (await send(r, a, b)).json();
  const response = await r.app.http.inject({ url: '/v1/me/export', headers: { cookie: b.cookie } }); expect(response.statusCode).toBe(200); const exported = response.json().domains.invitations; expect(exported.items[0].id).toBe(first.id); expect(JSON.stringify(exported)).not.toMatch(/sender_id|recipient_id|session|cookie|capability/);
  expect((await write(r, b, 'me', {}, randomUUID(), 'DELETE')).statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM invitation_mutations')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM invitation_preferences')).rowCount).toBe(0);
  const c = await guest(r); await friends(r, a, c); await settings(r, c, true);
  await r.pool.query("CREATE FUNCTION fail_invitation_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic invitation receipt failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_invitation BEFORE INSERT ON invitation_mutations FOR EACH ROW EXECUTE FUNCTION fail_invitation_receipt()');
  expect((await send(r, a, c)).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(0);
});

it('creates a bounded group with explicit partial consent, offline pending expiry and no reserved room capacity', async () => {
  const r = await open(), { a, b } = await pair(r), c = await guest(r), d = await guest(r); await friends(r, a, c); await friends(r, a, d); await settings(r, c, true);
  const key = randomUUID(), payload = { schemaVersion: 1, recipientIds: [b.me.profile.id, c.me.profile.id, d.me.profile.id], destination: dest() };
  const sent = await write(r, a, 'invitation-groups', payload, key); expect(sent.statusCode).toBe(201);
  const group = sent.json(); expect(group.items.map((item: { status: string }) => item.status)).toEqual(['PENDING', 'PENDING', 'UNAVAILABLE']);
  expect((await respond(r, b, group.items[0].invitationId, 'accept')).json().state).toBe('ACCEPTED');
  const refreshed = await r.app.http.inject({ url: '/v1/invitation-groups/' + group.id, headers: { cookie: a.cookie } }); expect(refreshed.json()).toMatchObject({ completion: 'PARTIAL', acceptedCount: 1, pendingCount: 1 });
  expect((await write(r, a, 'invitation-groups', payload, key)).json().id).toBe(group.id); expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(2);
  expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 0, travelHolds: 0 });
  r.advance(120001); const expired = await r.app.http.inject({ url: '/v1/invitation-groups/' + group.id, headers: { cookie: a.cookie } }); expect(expired.json()).toMatchObject({ completion: 'PARTIAL', acceptedCount: 1, pendingCount: 0 }); expect(expired.json().items[1].status).toBe('EXPIRED');
});

it('same-key concurrent group retries persist one root and one invitation per recipient, with no peer cohort disclosure', async () => {
  const r = await open(), { a, b } = await pair(r), c = await guest(r); await friends(r, a, c); await settings(r, c, true);
  const key = randomUUID(), input = { schemaVersion: 1, recipientIds: [b.me.profile.id, c.me.profile.id], destination: dest() };
  const responses = await Promise.all(Array.from({ length: 4 }, () => write(r, a, 'invitation-groups', input, key))); expect(responses.every(response => response.statusCode === 201)).toBe(true); expect(responses.every(response => JSON.stringify(response.json()) === JSON.stringify(responses[0].json()))).toBe(true);
  const group = responses[0].json(); expect((await r.pool.query('SELECT 1 FROM invitation_groups')).rowCount).toBe(1); expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(2);
  for (const user of [b, c, await guest(r)]) expect((await r.app.http.inject({ url: '/v1/invitation-groups/' + group.id, headers: { cookie: user.cookie } })).statusCode).toBe(404);
  const inbox = await list(r, b); expect(JSON.stringify(inbox)).not.toContain(group.id); expect(JSON.stringify(inbox)).not.toContain(c.me.profile.id); expect(inbox.items).toHaveLength(1);
  expect((await write(r, a, 'invitation-groups', { ...input, recipientIds: [...input.recipientIds].reverse() }, key)).statusCode).toBe(409);
});

it('resumes partial fan-out after a committed child loses its group linkage without duplicate invitations, including restart', async () => {
  const r = await open(), { a, b } = await pair(r), c = await guest(r); await friends(r, a, c); await settings(r, c, true);
  const key = randomUUID(), input = { schemaVersion: 1, recipientIds: [b.me.profile.id, c.me.profile.id], destination: dest() };
  await r.pool.query("CREATE FUNCTION fail_group_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic linkage failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_group_link BEFORE UPDATE ON invitation_group_items FOR EACH ROW EXECUTE FUNCTION fail_group_link()');
  expect((await write(r, a, 'invitation-groups', input, key)).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(1); const original = (await r.pool.query('SELECT id FROM invitations')).rows[0].id;
  await r.pool.query('DROP TRIGGER fail_group_link ON invitation_group_items'); await restart(r);
  const result = await write(r, a, 'invitation-groups', input, key); expect(result.statusCode).toBe(201); expect(result.json().items[0].invitationId).toBe(original); expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(2); expect((await r.pool.query('SELECT 1 FROM invitation_groups')).rowCount).toBe(1);
});

it('group retries recheck blocks/preferences, budgets count every child and expired roots cannot resend unfinished entries', async () => {
  const r = await open(), { a, b } = await pair(r), c = await guest(r); await friends(r, a, c); await settings(r, c, true);
  const input = { schemaVersion: 1, recipientIds: [b.me.profile.id, c.me.profile.id], destination: dest() }, key = randomUUID(), first = (await write(r, a, 'invitation-groups', input, key)).json();
  await write(r, b, 'blocks', { targetId: a.me.profile.id, blocked: true }); const current = (await write(r, a, 'invitation-groups', input, key)).json(); expect(current.items[0]).toMatchObject({ status: 'UNAVAILABLE', invitationId: null }); expect(current.items[1].status).toBe('PENDING');
  await respond(r, c, first.items[1].invitationId, 'decline');
  for (let i = 0; i < 2; i++) { const group = await write(r, a, 'invitation-groups', input); expect(group.statusCode).toBe(201); if (group.json().items[1].invitationId) await respond(r, c, group.json().items[1].invitationId, 'decline'); }
  expect((await write(r, a, 'invitation-groups', input)).statusCode).toBe(429);
  await r.pool.query('UPDATE invitation_group_items SET outcome=NULL,invitation_id=NULL WHERE group_id=$1 AND position=0', [first.id]);
  r.advance(120001); expect((await write(r, a, 'invitation-groups', input, key)).json().items[0].status).toBe('EXPIRED');
  expect((await r.pool.query('SELECT 1 FROM invitations')).rowCount).toBe(4);
  r.advance(86400001); await r.app.invitations.maintain(); expect((await r.pool.query('SELECT 1 FROM invitation_groups')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM invitation_group_items')).rowCount).toBe(0);
});

it('rejects oversized/duplicate/forged group input and exports/deletes group metadata without recipient identities', async () => {
  const r = await open(), { a, b } = await pair(r), c = await guest(r); await friends(r, a, c); await settings(r, c, true);
  const input = { schemaVersion: 1, recipientIds: [b.me.profile.id, c.me.profile.id], destination: dest() };
  for (const raw of [{ ...input, recipientIds: [b.me.profile.id, b.me.profile.id] }, { ...input, recipientIds: Array.from({ length: 5 }, () => randomUUID()) }, { ...input, recipientIds: [b.me.profile.id] }, { ...input, actorId: a.me.profile.id }, { ...input, capacity: 999 }, { ...input, message: 'arbitrary text' }]) expect((await write(r, a, 'invitation-groups', raw)).statusCode).toBe(422);
  expect((await write(r, a, 'invitation-groups', { ...input, destination: dest('dating') })).statusCode).toBe(404);
  const group = (await write(r, a, 'invitation-groups', input)).json(); const exported = (await r.app.http.inject({ url: '/v1/me/export', headers: { cookie: a.cookie } })).json().domains.invitations.groups; expect(exported[0].id).toBe(group.id); expect(JSON.stringify(exported)).not.toContain(b.me.profile.id); expect(JSON.stringify(exported)).not.toContain(c.me.profile.id);
  expect((await write(r, b, 'me', {}, randomUUID(), 'DELETE')).statusCode).toBe(200); expect((await r.app.http.inject({ url: '/v1/invitation-groups/' + group.id, headers: { cookie: a.cookie } })).json().items[0].status).toBe('UNAVAILABLE');
  expect((await write(r, a, 'me', {}, randomUUID(), 'DELETE')).statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM invitation_groups')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM invitation_group_items')).rowCount).toBe(0);
});
