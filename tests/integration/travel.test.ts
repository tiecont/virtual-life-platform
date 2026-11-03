import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { MeSchema, RoomAckSchema, TravelAckSchema, TravelIntentReceiptSchema, type Me, type RoomSnapshot, type TravelSource, type TravelDestination } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';

const origin = 'http://127.0.0.1:3300'; let serial = 0; let admin: Pool;
const opened: { app: Awaited<ReturnType<typeof createApp>>; pool: Pool; schema: string }[] = [], clients = new Set<Socket>();
const address = (family: number) => { const n = serial++; return `127.${family}.${Math.floor(n / 250)}.${n % 250 + 1}`; };
beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: url.toString() });
});
afterEach(async () => {
  for (const socket of clients) socket.close(); clients.clear();
  for (const r of opened.splice(0)) { await r.app.app.close(); await r.pool.end(); await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`); }
});
afterAll(async () => { await admin.end(); });
async function open(capacity = 8, prepare: (signal: AbortSignal) => Promise<void> = async () => {}, depart: () => Promise<void> = async () => {}) {
  const schema = 'travel_test_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema);
  const pool = new Pool({ connectionString: url.toString() }); await migrate(pool); let offset = 0;
  const access = { private: false, adult: false };
  const modules = ['maid', 'private-room', 'dating'].map(slug => defineWorld({ schemaVersion: 1, apiVersion: 1, slug, version: '1.0.0', title: 'Synthetic travel target (not integrated world)', kind: 'sandbox', sceneRef: { key: 'travel-fixture', version: '1.0.0' }, capacity, capabilities: ['presence'], accessPolicy: slug === 'maid' ? { kind: 'public' } : slug === 'dating' ? { kind: 'restricted', policyKey: 'travel.adult', requiresAdult: true } : { kind: 'private', policyKey: 'travel.private' }, visibility: slug === 'maid' ? 'listed' : 'hidden', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {}, travel: { prepare: context => prepare(context.signal), abort: async () => {}, depart: async () => depart() } }));
  const config = readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'travel-local-test-session-secret-000000001' });
  const now = () => Date.now() + offset;
  const options = { now, worlds: { modules, policy: { permits: async () => access.private }, adultProof: { hasReviewedProof: async () => access.adult } } };
  const app = await createApp(config, pool, false, options); opened.push({ app, pool, schema }); await app.app.listen(0, '127.0.0.1');
  for (const slug of app.worlds.registry.slugs()) await app.worlds.registry.setEnabled(slug, true);
  return { app, pool, config, options, access, now, url: await app.app.getUrl(), advance: (ms: number) => { offset += ms; } };
}
type Runtime = Awaited<ReturnType<typeof open>>; type User = { me: Me; cookie: string };
const headers = (u: User, key = randomUUID()) => ({ origin, cookie: u.cookie, 'x-csrf-token': u.me.csrfToken, 'idempotency-key': key });
const post = (r: Runtime, u: User, path: string, payload: unknown, key = randomUUID()) => r.app.http.inject({ method: 'POST', url: '/v1/' + path, headers: headers(u, key), payload });
const get = (r: Runtime, u: User, id: string) => r.app.http.inject({ url: '/v1/travel-intents/' + id, headers: { cookie: u.cookie } });
const destination = (worldSlug = 'maid', roomId?: string): TravelDestination => ({ worldSlug, worldVersion: '1.0.0', sceneVersion: '1.0.0', ...(roomId ? { roomId } : {}) });
const input = (source: TravelSource | null = null, target = destination()) => ({ schemaVersion: 1, source, destination: target });
function credential(r: Runtime, u: User) { const parsed = r.app.http.unsignCookie(r.app.http.parseCookie(u.cookie).city_session); if (!parsed.value) throw new Error('Invalid fixture cookie'); return parsed.value; }
async function guest(r: Runtime): Promise<User> {
  const response = await r.app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: address(41), headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Travel Test Visitor', avatarKey: 'mint' } }); expect(response.statusCode).toBe(201);
  return { me: MeSchema.parse(response.json()), cookie: String(response.headers['set-cookie']).split(';')[0] };
}
async function join(r: Runtime, u: User, worldSlug = 'sdk-sandbox') {
  const socket = io(r.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: address(42) } }, extraHeaders: { origin, cookie: u.cookie }, auth: { schemaVersion: 1, csrfToken: u.me.csrfToken } }); clients.add(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  const ack = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join', { schemaVersion: 1, requestId: randomUUID(), worldSlug, worldVersion: '1.0.0', sceneVersion: '1.0.0' }));
  if (!ack.ok || ack.result.type !== 'snapshot') throw new Error('Fixture admission failed');
  const state = ack.result, source = { epoch: state.epoch, roomId: state.roomId, membershipId: state.membershipId };
  return { socket, state, source };
}
async function create(r: Runtime, u: User, source: TravelSource | null = null, target = destination(), key = randomUUID()) {
  const response = await post(r, u, 'travel-intents', input(source, target), key); expect(response.statusCode).toBe(201); return TravelIntentReceiptSchema.parse(response.json());
}
const own = (s: RoomSnapshot) => ({ schemaVersion: 1, requestId: randomUUID(), epoch: s.epoch, roomId: s.roomId, membershipId: s.membershipId });
async function restart(r: Runtime) {
  await r.app.app.close(); const old = r.app, app = await createApp(r.config, r.pool, false, r.options); opened.find(item => item.app === old)!.app = app; r.app = app;
  await app.app.listen(0, '127.0.0.1'); r.url = await app.app.getUrl(); for (const slug of app.worlds.registry.slugs()) await app.worlds.registry.setEnabled(slug, true);
}

it('issues one scoped capability under concurrent actual HTTP retries without changing source membership or reserving a target', async () => {
  const r = await open(), u = await guest(r), peer = await join(r, u), key = randomUUID();
  const replies = await Promise.all(Array.from({ length: 10 }, () => fetch(r.url + '/v1/travel-intents', { method: 'POST', headers: { ...headers(u, key), 'content-type': 'application/json' }, body: JSON.stringify(input(peer.source)), signal: AbortSignal.timeout(5000) })));
  expect(replies.every(response => response.status === 201)).toBe(true);
  const receipts = await Promise.all(replies.map(async response => TravelIntentReceiptSchema.parse(await response.json())));
  for (const receipt of receipts) expect(receipt).toEqual(receipts[0]);
  const first = receipts[0]; expect(first.phase).toBe('CREATED'); expect(first.capability).toMatch(/^[a-f0-9]{64}$/); expect(Date.parse(first.expiresAt) - Date.parse(first.createdAt)).toBe(30000);
  const row = (await r.pool.query('SELECT * FROM travel_intents')).rows[0]; expect(row.capability_digest).toBe(r.app.identity.hash(first.capability!)); expect(JSON.stringify(row)).not.toContain(first.capability!);
  expect((await r.pool.query('SELECT * FROM travel_mutations')).rowCount).toBe(1);
  const ownReceipt = TravelIntentReceiptSchema.parse((await get(r, u, first.intentId)).json()); expect(ownReceipt.capability).toBeNull();
  expect(r.app.rooms.diagnostics().memberships).toBe(1); expect((await r.app.rooms.list(credential(r, u), 'maid')).rooms).toHaveLength(0);
  expect((await post(r, u, 'travel-intents', input(peer.source, destination('private-room')), key)).statusCode).toBe(409);
  const stranger = await guest(r); expect((await get(r, stranger, first.intentId)).statusCode).toBe(404);
  expect((await post(r, stranger, `travel-intents/${first.intentId}/cancel`, {})).statusCode).toBe(404);
});

it('consumes authorization once under a concurrent race, retries the same redemption and never reports READY or moves a player', async () => {
  const r = await open(), u = await guest(r), peer = await join(r, u), createKey = randomUUID(), issued = await create(r, u, peer.source, destination(), createKey), keys = [randomUUID(), randomUUID()];
  const outcomes = await Promise.allSettled(keys.map(key => r.app.travel.redeem(credential(r, u), issued.intentId, key, issued.capability!)));
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const winner = outcomes.findIndex(result => result.status === 'fulfilled'), success = outcomes[winner]; if (success.status !== 'fulfilled') throw new Error('Expected successful redemption');
  expect(outcomes[1 - winner]).toMatchObject({ status: 'rejected', reason: { code: 'IDEMPOTENCY_CONFLICT' } });
  expect(await r.app.travel.redeem(credential(r, u), issued.intentId, keys[winner], issued.capability!)).toEqual(success.value);
  const current = TravelIntentReceiptSchema.parse((await get(r, u, issued.intentId)).json()); expect(current).toMatchObject({ phase: 'CREATED', redeemed: true, capability: null });
  expect(await create(r, u, peer.source, destination(), createKey)).toEqual(current);
  expect((await r.pool.query("SELECT 1 FROM travel_mutations WHERE operation='redeem'")).rowCount).toBe(1);
  expect(r.app.rooms.diagnostics().memberships).toBe(1);
  const unchanged = RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state))); expect(unchanged.ok).toBe(true);
  const arbitrary = await r.app.http.inject({ method: 'POST', url: `/v1/travel-intents/${issued.intentId}/redeem`, headers: headers(u), payload: { capability: issued.capability } }); expect(arbitrary.statusCode).toBe(404);
});

it('rejects malformed authority, wrong origin/CSRF, unknown query fields and wrong capability without consuming anything', async () => {
  const r = await open(), u = await guest(r), issued = await create(r, u);
  for (const extra of [{ accountId: randomUUID() }, { role: 'admin' }, { age: 21 }, { ttlMs: 999999 }, { redirect: 'https://example.invalid' }]) expect((await post(r, u, 'travel-intents', { ...input(), ...extra })).statusCode).toBe(422);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/travel-intents', headers: { ...headers(u), origin: 'https://example.invalid' }, payload: input() })).statusCode).toBe(403);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/travel-intents', headers: { cookie: u.cookie, origin, 'idempotency-key': randomUUID() }, payload: input() })).statusCode).toBe(403);
  expect((await r.app.http.inject({ url: '/v1/travel-intents/' + issued.intentId + '?capability=never-accepted', headers: { cookie: u.cookie } })).statusCode).toBe(422);
  await expect(r.app.travel.redeem(credential(r, u), issued.intentId, randomUUID(), '00'.repeat(32))).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  expect((await r.pool.query('SELECT redeemed_at FROM travel_intents')).rows[0].redeemed_at).toBeNull();
});

it('expires at trusted deadline, bounds TTL to session expiry and never resurrects an old creation retry', async () => {
  const r = await open(), u = await guest(r), key = randomUUID(), issued = await create(r, u, null, destination(), key);
  r.advance(30000);
  expect(TravelIntentReceiptSchema.parse((await get(r, u, issued.intentId)).json())).toMatchObject({ phase: 'EXPIRED', capability: null });
  await expect(r.app.travel.redeem(credential(r, u), issued.intentId, randomUUID(), issued.capability!)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  expect(await create(r, u, null, destination(), key)).toMatchObject({ intentId: issued.intentId, phase: 'EXPIRED', capability: null });
  await r.pool.query('UPDATE identity_sessions SET expires_at=$2 WHERE account_id=$1', [u.me.profile.id, new Date(r.now() + 5000)]);
  const short = await create(r, u); expect(Date.parse(short.expiresAt) - Date.parse(short.createdAt)).toBeLessThanOrEqual(5000);
  r.advance(5001); expect((await get(r, u, short.intentId)).statusCode).toBe(401);
});

it('serializes one pending intent per account and cancellation retries without reopening an old request', async () => {
  const r = await open(), u = await guest(r), createKey = randomUUID(), issued = await create(r, u, null, destination(), createKey);
  expect((await post(r, u, 'travel-intents', input())).statusCode).toBe(409);
  const key = randomUUID(), path = `travel-intents/${issued.intentId}/cancel`;
  const replies = await Promise.all([post(r, u, path, {}, key), post(r, u, path, {}, key)]); expect(replies.map(response => response.statusCode)).toEqual([200, 200]); expect(replies[0].json()).toEqual(replies[1].json());
  const cancelled = TravelIntentReceiptSchema.parse(replies[0].json()); expect(cancelled).toMatchObject({ phase: 'CANCELLED', capability: null });
  expect(await create(r, u, null, destination(), createKey)).toEqual(cancelled);
  await expect(r.app.travel.redeem(credential(r, u), issued.intentId, randomUUID(), issued.capability!)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  const next = await create(r, u); expect(next.intentId).not.toBe(issued.intentId);
  expect((await post(r, u, `travel-intents/${next.intentId}/cancel`, {}, key)).statusCode).toBe(409);
});

it('binds an existing source to the exact epoch/membership/current session and rejects changed or missing sources', async () => {
  const r = await open(), u = await guest(r), peer = await join(r, u);
  expect((await post(r, u, 'travel-intents', input())).statusCode).toBe(409);
  for (const field of ['epoch', 'roomId', 'membershipId']) expect((await post(r, u, 'travel-intents', input({ ...peer.source, [field]: randomUUID() }))).statusCode).toBe(409);
  expect((await post(r, u, 'travel-intents', input(peer.source, destination('sdk-sandbox')))).statusCode).toBe(422);
  const issued = await create(r, u, peer.source);
  expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.leave', own(peer.state))).ok).toBe(true);
  await expect(r.app.travel.redeem(credential(r, u), issued.intentId, randomUUID(), issued.capability!)).rejects.toMatchObject({ code: 'NOT_IN_ROOM' });
  expect((await r.pool.query('SELECT redeemed_at FROM travel_intents')).rows[0].redeemed_at).toBeNull(); expect(r.app.rooms.diagnostics().memberships).toBe(0);
});

it('keeps capabilities and receipts inaccessible to another authenticated session of the same registered account', async () => {
  const r = await open(), initial = await guest(r), loginName = 'travel' + randomUUID().replaceAll('-', '').slice(0, 12), password = 'synthetic-only-session-travel-password';
  const upgrade = await post(r, initial, 'session/upgrade', { loginName, password }); expect(upgrade.statusCode).toBe(200);
  const u = { me: MeSchema.parse(upgrade.json()), cookie: String(upgrade.headers['set-cookie']).split(';')[0] }, issued = await create(r, u);
  const login = await r.app.http.inject({ method: 'POST', url: '/v1/session/login', headers: { origin }, payload: { requestId: randomUUID(), loginName, password } }); expect(login.statusCode).toBe(200);
  const other = { me: MeSchema.parse(login.json()), cookie: String(login.headers['set-cookie']).split(';')[0] };
  expect(other.me.profile.id).toBe(u.me.profile.id); expect((await get(r, other, issued.intentId)).statusCode).toBe(404);
  await expect(r.app.travel.redeem(credential(r, other), issued.intentId, randomUUID(), issued.capability!)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  expect((await post(r, other, `travel-intents/${issued.intentId}/cancel`, {})).statusCode).toBe(404);
  expect((await post(r, u, 'session/logout', {})).statusCode).toBe(200);
  expect((await get(r, u, issued.intentId)).statusCode).toBe(401);
  await expect(r.app.travel.redeem(credential(r, u), issued.intentId, randomUUID(), issued.capability!)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('denies private/unreviewed adult/offline/version-mismatched and full targets before changing source', async () => {
  const r = await open(1), u = await guest(r), peer = await join(r, u);
  for (const world of ['private-room', 'dating', 'unknown-world']) expect((await post(r, u, 'travel-intents', input(peer.source, destination(world)))).statusCode).toBe(404);
  r.access.private = true; expect((await post(r, u, 'travel-intents', input(peer.source, destination('dating')))).statusCode).toBe(404);
  expect((await post(r, u, 'travel-intents', input(peer.source, { ...destination(), sceneVersion: '2.0.0' }))).statusCode).toBe(409);
  await r.app.worlds.registry.setEnabled('maid', false); expect((await post(r, u, 'travel-intents', input(peer.source))).statusCode).toBe(503); await r.app.worlds.registry.setEnabled('maid', true);
  const occupant = await join(r, await guest(r), 'maid'); expect((await post(r, u, 'travel-intents', input(peer.source, destination('maid', occupant.state.roomId)))).statusCode).toBe(409);
  expect((await r.pool.query('SELECT 1 FROM travel_intents')).rowCount).toBe(0); expect(r.app.rooms.diagnostics().memberships).toBe(2);
});

it('revalidates private/adult/base flags after issuance; a scoped token never bypasses current access', async () => {
  const r = await open(), u = await guest(r); r.access.private = true; r.access.adult = true;
  const issued = await create(r, u, null, destination('dating')), key = randomUUID();
  r.access.adult = false; await expect(r.app.travel.redeem(credential(r, u), issued.intentId, key, issued.capability!)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  r.access.adult = true; r.access.private = false; await expect(r.app.travel.redeem(credential(r, u), issued.intentId, key, issued.capability!)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  r.access.private = true; await r.app.worlds.registry.setEnabled('dating', false); await expect(r.app.travel.redeem(credential(r, u), issued.intentId, key, issued.capability!)).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' });
  expect((await r.pool.query('SELECT redeemed_at FROM travel_intents')).rows[0].redeemed_at).toBeNull(); expect(r.app.rooms.diagnostics().memberships).toBe(0);
});

it('rechecks a specific destination capacity after issuance without consuming a full target or releasing source', async () => {
  const r = await open(2), first = await join(r, await guest(r), 'maid'), u = await guest(r), peer = await join(r, u);
  const issued = await create(r, u, peer.source, destination('maid', first.state.roomId));
  const second = await join(r, await guest(r), 'maid'); expect(second.state.roomId).toBe(first.state.roomId);
  await expect(r.app.travel.redeem(credential(r, u), issued.intentId, randomUUID(), issued.capability!)).rejects.toMatchObject({ code: 'ROOM_FULL' });
  expect((await r.pool.query('SELECT redeemed_at FROM travel_intents')).rows[0].redeemed_at).toBeNull();
  expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state))).ok).toBe(true);
  expect(r.app.rooms.diagnostics().memberships).toBe(3);
});

it('applies already committed world sanctions and incident denial again during redemption without evidence-key dependency', async () => {
  const r = await open(), u = await guest(r), reporter = await guest(r), peer = await join(r, u), issued = await create(r, u, peer.source);
  // Synthetic committed storage fixtures only; issuance/independent reversal APIs
  // are covered by sanctions.test.ts, no real moderator is provisioned here.
  const caseId = randomUUID(), sanctionId = randomUUID();
  await r.pool.query("INSERT INTO safety_cases(id,receipt_id,reporter_id,subject_id,request_id,fingerprint,world_slug,category,severity,created_at) VALUES($1,$2,$3,$4,$5,$6,'maid','harassment','high',$7)", [caseId, randomUUID(), reporter.me.profile.id, u.me.profile.id, randomUUID(), r.app.identity.fingerprint({ synthetic: true }), new Date(r.now())]);
  await r.pool.query("INSERT INTO safety_sanctions(id,case_id,subject_id,kind,category,world_slug,effective_at,expires_at,appeal_until) VALUES($1,$2,$3,'world-ban','harassment','maid',$4,$5,$5)", [sanctionId, caseId, u.me.profile.id, new Date(r.now()), new Date(r.now() + 60000)]);
  expect((await post(r, u, 'travel-intents', input(peer.source))).statusCode).toBe(404);
  await expect(r.app.travel.redeem(credential(r, u), issued.intentId, randomUUID(), issued.capability!)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await r.pool.query('UPDATE safety_sanctions SET revoked_at=$2 WHERE id=$1', [sanctionId, new Date(r.now())]);
  await r.pool.query("INSERT INTO safety_incident_controls VALUES('maid','world',true,NULL,$1)", [new Date(r.now())]);
  await expect(r.app.travel.redeem(credential(r, u), issued.intentId, randomUUID(), issued.capability!)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect((await r.pool.query('SELECT redeemed_at FROM travel_intents')).rows[0].redeemed_at).toBeNull();
  expect((await get(r, u, issued.intentId)).statusCode).toBe(200); expect(r.app.rooms.diagnostics().memberships).toBe(1);
});

it('invalidates previous owner epoch after restart and cannot replay its old source or redemption', async () => {
  const r = await open(), u = await guest(r), peer = await join(r, u), issued = await create(r, u, peer.source); await restart(r);
  expect(TravelIntentReceiptSchema.parse((await get(r, u, issued.intentId)).json())).toMatchObject({ phase: 'FAILED', capability: null });
  await expect(r.app.travel.redeem(credential(r, u), issued.intentId, randomUUID(), issued.capability!)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  expect((await post(r, u, 'travel-intents', input(peer.source))).statusCode).toBe(409);
  expect((await create(r, u)).phase).toBe('CREATED'); expect(r.app.rooms.diagnostics().memberships).toBe(0);
});

it('keeps the creation quota durable across API restart and bounds expiry/metadata cleanup', async () => {
  const r = await open(), u = await guest(r);
  for (let i = 0; i < 6; i++) { const issued = await create(r, u); expect((await post(r, u, `travel-intents/${issued.intentId}/cancel`, {})).statusCode).toBe(200); }
  expect((await post(r, u, 'travel-intents', input())).statusCode).toBe(429); await restart(r); expect((await post(r, u, 'travel-intents', input())).statusCode).toBe(429);
  r.advance(61000); await create(r, u); r.advance(86400001);
  expect(await r.app.travel.maintain()).toBe(7); expect((await r.pool.query('SELECT 1 FROM travel_intents')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM travel_mutations')).rowCount).toBe(0);
});

it('exports own receipt metadata without capabilities, cascades identity erasure and rolls back intent on receipt failure', async () => {
  const r = await open(), u = await guest(r), issued = await create(r, u);
  const exported = await r.app.http.inject({ url: '/v1/me/export', headers: { cookie: u.cookie } }); expect(exported.statusCode).toBe(200); expect(exported.body).not.toContain(issued.capability!); expect(exported.json().domains.travel.items[0].intentId).toBe(issued.intentId);
  const erased = await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(u), payload: {} }); expect(erased.statusCode).toBe(200); expect((await r.pool.query('SELECT 1 FROM travel_intents')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM travel_mutations')).rowCount).toBe(0);
  const next = await guest(r);
  await r.pool.query("CREATE FUNCTION fail_travel_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END $$"); await r.pool.query('CREATE TRIGGER fail_travel BEFORE INSERT ON travel_mutations FOR EACH ROW EXECUTE FUNCTION fail_travel_receipt()');
  expect((await post(r, next, 'travel-intents', input())).statusCode).toBe(503); expect((await r.pool.query('SELECT 1 FROM travel_intents')).rowCount).toBe(0);
});

it('prepares a destination without public membership, retains source seat, then switches exactly once with current snapshots', async () => {
  let release!: () => void, started = false;
  const r = await open(1, async () => { started = true; await new Promise<void>(resolve => { release = resolve; }); }), u = await guest(r), peer = await join(r, u);
  const seat = RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('seat.claim', { ...own(peer.state), seatId: 'seat-1' })); expect(seat.ok).toBe(true);
  const issued = await create(r, u, peer.source), key = randomUUID();
  const request = r.app.travel.request(credential(r, u), peer.socket.id!, { schemaVersion: 1, requestId: key, intentId: issued.intentId, capability: issued.capability! }, () => peer.socket.connected);
  await expect.poll(() => started).toBe(true);
  expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, occupiedSeats: 1, travelHolds: 1 });
  expect((await r.app.rooms.list(credential(r, u), 'maid')).rooms[0].occupancy).toBe(0);
  expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state))).ok).toBe(true);
  release(); const result = await request; expect(result.receipt.phase).toBe('COMMITTED'); expect(result.snapshot).toMatchObject({ worldSlug: 'maid', self: { accountId: u.me.profile.id, seatId: null }, occupancy: 1 });
  expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, occupiedSeats: 0, travelHolds: 0 });
  expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state)))).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
  const replay = await r.app.travel.request(credential(r, u), peer.socket.id!, { schemaVersion: 1, requestId: key, intentId: issued.intentId, capability: issued.capability! }, () => peer.socket.connected); expect(replay.snapshot?.membershipId).toBe(result.snapshot?.membershipId);
});

const transfer = async (peer: Awaited<ReturnType<typeof join>>, intent: Awaited<ReturnType<typeof create>>, key = randomUUID()) => TravelAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('travel.request', { schemaVersion: 1, requestId: key, intentId: intent.intentId, capability: intent.capability! }));

it('rechecks reviewed adult eligibility and committed target sanctions after preparation, retaining valid source', async () => {
  for (const change of ['adult', 'sanction']) {
    let release!: () => void, started = false;
    const r = await open(1, async () => { started = true; await new Promise<void>(resolve => { release = resolve; }); }), u = await guest(r), reporter = await guest(r), peer = await join(r, u); r.access.private = true; r.access.adult = true;
    const target = change === 'adult' ? 'dating' : 'maid', issued = await create(r, u, peer.source, destination(target)), pending = transfer(peer, issued); await expect.poll(() => started).toBe(true);
    if (change === 'adult') r.access.adult = false;
    else {
      const caseId = randomUUID(); await r.pool.query("INSERT INTO safety_cases(id,receipt_id,reporter_id,subject_id,request_id,fingerprint,world_slug,category,severity,created_at) VALUES($1,$2,$3,$4,$5,$6,'maid','harassment','high',$7)", [caseId, randomUUID(), reporter.me.profile.id, u.me.profile.id, randomUUID(), r.app.identity.fingerprint({ syntheticHandoff: true }), new Date(r.now())]);
      await r.app.rooms.safetyMutation(async () => { await r.pool.query("INSERT INTO safety_sanctions(id,case_id,subject_id,kind,category,world_slug,effective_at,expires_at,appeal_until) VALUES($1,$2,$3,'world-ban','harassment','maid',$4,$5,$5)", [randomUUID(), caseId, u.me.profile.id, new Date(r.now()), new Date(r.now() + 60000)]); return { result: true }; });
    }
    release(); expect((await pending).ok).toBe(false); expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, travelHolds: 0 }); expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state))).ok).toBe(true);
  }
});

it('reconciles ambiguous COMMIT acknowledgement without inventing a live target or replaying membership', async () => {
  const r = await open(), u = await guest(r), peer = await join(r, u), issued = await create(r, u, peer.source), key = randomUUID();
  const connect = r.pool.connect.bind(r.pool); let injected = false;
  r.pool.connect = (async (...args: unknown[]) => {
    if (typeof args[0] === 'function') return Reflect.apply(connect, r.pool, args);
    const client = await connect(); let committing = false;
    return new Proxy(client, { get(target, property) {
      if (property === 'query') return async (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('target_room_id=$4')) committing = true;
        const result = await Reflect.apply(target.query, target, args);
        if (!injected && committing && args[0] === 'COMMIT') { injected = true; r.pool.connect = connect; throw new Error('synthetic commit acknowledgement lost'); }
        return result;
      };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
  }) as typeof r.pool.connect;
  expect((await transfer(peer, issued, key)).ok).toBe(false); expect(injected).toBe(true);
  const replay = await transfer(peer, issued, key); expect(replay).toMatchObject({ ok: true, result: { receipt: { phase: 'COMMITTED' }, snapshot: null } });
  expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, travelHolds: 0 }); expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state))).ok).toBe(true);
});

it('owner lock loss during preparation discards source/holds and denies every late destination completion', async () => {
  let release!: () => void, started = false;
  const r = await open(1, async () => { started = true; await new Promise<void>(resolve => { release = resolve; }); }), u = await guest(r), peer = await join(r, u), issued = await create(r, u, peer.source);
  const pending = r.app.travel.request(credential(r, u), peer.socket.id!, { schemaVersion: 1, requestId: randomUUID(), intentId: issued.intentId, capability: issued.capability! }, () => peer.socket.connected).then(result => ({ result }), error => ({ error })); await expect.poll(() => started).toBe(true);
  const owner = (await r.pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=1447840561::oid AND objid=(hashtext(current_schema())::bigint & 4294967295)::oid AND objsubid=2 AND granted")).rows[0]; expect(owner).toBeDefined(); await r.pool.query('SELECT pg_terminate_backend($1)', [owner.pid]);
  await expect.poll(() => r.app.diagnostics().authority).toBe('lost'); release(); expect('error' in await pending).toBe(true); expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 0, travelHolds: 0 });
  expect((await r.pool.query("SELECT 1 FROM travel_intents WHERE phase='COMMITTED'")).rowCount).toBe(0); expect((await r.app.http.inject({ url: '/health/ready' })).statusCode).toBe(503);
});

it('quarantines failing source resource departure without creating a second active membership', async () => {
  const r = await open(8, async () => {}, async () => { throw new Error('synthetic source resource cleanup failure'); }), u = await guest(r), peer = await join(r, u), issued = await create(r, u, peer.source), first = await transfer(peer, issued);
  if (!first.ok || !first.result.snapshot) throw new Error('Expected first admission');
  const target = first.result.snapshot, next = await create(r, u, { epoch: target.epoch, roomId: target.roomId, membershipId: target.membershipId }, destination('sdk-sandbox')), second = await transfer(peer, next);
  expect(second).toMatchObject({ ok: true, result: { receipt: { phase: 'COMMITTED' }, snapshot: { worldSlug: 'sdk-sandbox', self: { accountId: u.me.profile.id } } } });
  expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, travelHolds: 0 }); expect((await r.app.worlds.registry.catalog(credential(r, u))).worlds.find(world => world.slug === 'maid')?.availability).toBe('offline');
});

it('travels over authenticated socket with same-key ACK replay and invalidates every old source tab', async () => {
  const r = await open(), u = await guest(r), first = await join(r, u), other = await join(r, u), issued = await create(r, u, first.source), key = randomUUID();
  const outcomes = await Promise.all([transfer(first, issued, key), transfer(first, issued, key)]); expect(outcomes.every(result => result.ok)).toBe(true);
  const result = outcomes[0]; if (!result.ok || !result.result.snapshot) throw new Error('Expected confirmed target');
  const target = result.result.snapshot; expect(target.worldSlug).toBe('maid'); expect(target.self.accountId).toBe(u.me.profile.id);
  expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, connections: 1, travelHolds: 0 });
  expect(RoomAckSchema.parse(await other.socket.timeout(5000).emitWithAck('room.snapshot', own(other.state)))).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
  expect(await transfer(first, issued, key)).toEqual(result);
  expect(await transfer(first, issued)).toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_CONFLICT' } });
  const malicious = await first.socket.timeout(5000).emitWithAck('travel.request', { schemaVersion: 1, requestId: randomUUID(), intentId: issued.intentId, capability: issued.capability, accountId: randomUUID() }); expect(TravelAckSchema.parse(malicious)).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  expect(RoomAckSchema.parse(await first.socket.timeout(5000).emitWithAck('room.snapshot', own(target))).ok).toBe(true);
});

it('retains source on timed-out/hung preparation and quarantines late completion without blocking owner commands', async () => {
  let release!: () => void, aborted = false, started = false;
  const r = await open(1, async signal => { started = true; signal.addEventListener('abort', () => { aborted = true; }); await new Promise<void>(resolve => { release = resolve; }); }), u = await guest(r), peer = await join(r, u), issued = await create(r, u, peer.source);
  const pending = transfer(peer, issued); await expect.poll(() => started).toBe(true);
  const source = RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state))); expect(source.ok).toBe(true);
  const failed = await pending; expect(failed).toMatchObject({ ok: false, error: { code: 'WORLD_UNAVAILABLE' } }); expect(aborted).toBe(true);
  expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, travelHolds: 0 }); expect((await get(r, u, issued.intentId)).json().phase).toBe('FAILED');
  release(); expect((await r.app.worlds.registry.catalog(credential(r, u))).worlds.find(world => world.slug === 'maid')?.availability).toBe('offline');
  expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state))).ok).toBe(true);
  await expect(r.app.worlds.registry.setEnabled('maid', true)).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' });
});

it('cancellation during nonpublic preparation wins and removes its hold without releasing source', async () => {
  let release!: () => void, started = false;
  const r = await open(1, async () => { started = true; await new Promise<void>(resolve => { release = resolve; }); }), u = await guest(r), peer = await join(r, u), issued = await create(r, u, peer.source);
  const pending = transfer(peer, issued); await expect.poll(() => started).toBe(true);
  expect((await post(r, u, `travel-intents/${issued.intentId}/cancel`, {})).json().phase).toBe('CANCELLED'); release(); expect((await pending).ok).toBe(false);
  expect((await get(r, u, issued.intentId)).json().phase).toBe('CANCELLED'); expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, travelHolds: 0 });
  expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state))).ok).toBe(true);
});

it('counts pending holds in target capacity and never activates two users into a last slot', async () => {
  let release!: () => void, started = false;
  const r = await open(2, async () => { started = true; await new Promise<void>(resolve => { release = resolve; }); }), occupant = await join(r, await guest(r), 'maid'), a = await guest(r), source = await join(r, a), issued = await create(r, a, source.source, destination('maid', occupant.state.roomId));
  const pending = transfer(source, issued); await expect.poll(() => started).toBe(true);
  const b = await guest(r), second = await join(r, b); expect((await post(r, b, 'travel-intents', input(second.source, destination('maid', occupant.state.roomId)))).statusCode).toBe(409);
  release(); expect((await pending).ok).toBe(true); expect((await r.app.rooms.list(credential(r, a), 'maid')).rooms.find(room => room.roomId === occupant.state.roomId)?.occupancy).toBe(2); expect(r.app.rooms.diagnostics().travelHolds).toBe(0);
});

it.each(['expiry', 'source-leave', 'target-disable', 'private-withdrawal', 'disconnect', 'logout'] as const)('revalidates %s after preparation started and cannot publish a stale target', async change => {
  let release!: () => void, started = false;
  const r = await open(1, async () => { started = true; await new Promise<void>(resolve => { release = resolve; }); }), u = await guest(r), peer = await join(r, u); r.access.private = true;
  const issued = await create(r, u, peer.source, destination(change === 'private-withdrawal' ? 'private-room' : 'maid'));
  // Direct coordinator promise allows observing disconnect/logout rejection even
  // when the real socket can no longer receive an ACK.
  const pending = r.app.travel.request(credential(r, u), peer.socket.id!, { schemaVersion: 1, requestId: randomUUID(), intentId: issued.intentId, capability: issued.capability! }, () => peer.socket.connected).then(result => ({ result }), error => ({ error }));
  await expect.poll(() => started).toBe(true);
  if (change === 'expiry') r.advance(30000);
  if (change === 'source-leave') expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.leave', own(peer.state))).ok).toBe(true);
  if (change === 'target-disable') await r.app.worlds.registry.setEnabled('maid', false);
  if (change === 'private-withdrawal') r.access.private = false;
  if (change === 'disconnect') peer.socket.close();
  if (change === 'logout') expect((await post(r, u, 'session/logout', {})).statusCode).toBe(200);
  release(); const outcome = await pending; expect('error' in outcome).toBe(true); expect(r.app.rooms.diagnostics().travelHolds).toBe(0);
  expect((await r.pool.query("SELECT 1 FROM travel_intents WHERE phase='COMMITTED'")).rowCount).toBe(0);
  if (!['source-leave', 'logout'].includes(change)) expect(r.app.rooms.diagnostics().memberships).toBe(1);
});

it('rolls back the unannounced index switch and source seat when a deferred database constraint rejects COMMIT', async () => {
  const r = await open(), u = await guest(r), peer = await join(r, u); expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('seat.claim', { ...own(peer.state), seatId: 'seat-1' })).ok).toBe(true);
  const issued = await create(r, u, peer.source), ended: unknown[] = []; peer.socket.on('room.ended', event => ended.push(event));
  await r.pool.query("CREATE FUNCTION fail_travel_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.phase='COMMITTED' THEN RAISE EXCEPTION 'synthetic deferred commit failure'; END IF; RETURN NEW; END $$");
  await r.pool.query('CREATE CONSTRAINT TRIGGER fail_travel_commit AFTER UPDATE ON travel_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_travel_commit()');
  expect(await transfer(peer, issued)).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } }); expect(ended).toEqual([]);
  expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, occupiedSeats: 1, travelHolds: 0 }); expect(RoomAckSchema.parse(await peer.socket.timeout(5000).emitWithAck('room.snapshot', own(peer.state))).ok).toBe(true);
  expect((await get(r, u, issued.intentId)).json().phase).toBe('FAILED');
});

it('treats a durable committed receipt after owner restart as history with no phantom live snapshot', async () => {
  const r = await open(), u = await guest(r), peer = await join(r, u), issued = await create(r, u, peer.source), key = randomUUID(); expect((await transfer(peer, issued, key)).ok).toBe(true); await restart(r);
  const newPeer = await join(r, u), result = await transfer(newPeer, issued, key); expect(result).toMatchObject({ ok: true, result: { receipt: { phase: 'COMMITTED' }, snapshot: null } });
  expect(r.app.rooms.diagnostics()).toMatchObject({ memberships: 1, travelHolds: 0 }); expect((await get(r, u, issued.intentId)).json().phase).toBe('COMMITTED');
});
