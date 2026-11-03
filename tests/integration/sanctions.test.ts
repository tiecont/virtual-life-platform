import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { MeSchema, RoomAckSchema, ChatAckSchema, SanctionResultSchema, OwnSanctionsSchema, AppealReceiptSchema, CaseAppealsSchema, ModerationSessionSchema, IncidentPageSchema, type Me, type RoomSnapshot } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import type { ChatModerator } from '../../apps/platform-api/src/safety/moderation';

const origin = 'http://127.0.0.1:3300'; let serial = 1; let admin: Pool;
const opened: { app: Awaited<ReturnType<typeof createApp>>; pool: Pool; schema: string }[] = []; const clients = new Set<Socket>();
beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: url.toString() });
});
afterEach(async () => {
  for (const socket of clients) socket.close(); clients.clear();
  for (const runtime of opened.splice(0)) { await runtime.app.app.close(); await runtime.pool.end(); await admin.query(`DROP SCHEMA "${runtime.schema}" CASCADE`); }
});
afterAll(async () => { await admin.end(); });
async function open(moderator?: ChatModerator) {
  const schema = 'sanction_test_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema);
  const pool = new Pool({ connectionString: url.toString() }); await migrate(pool); let offset = 0;
  const joinBarrier: { work?: () => Promise<void> } = {};
  const modules = ['maid', 'restaurant'].map(slug => defineWorld({ schemaVersion: 1, apiVersion: 1, slug, version: '1.0.0', title: 'Synthetic sanction fixture', kind: 'sandbox', sceneRef: { key: 'sanction-fixture', version: '1.0.0' }, capacity: 8, seatIds: ['one'], capabilities: ['presence', 'chat', 'seating'], accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => { await joinBarrier.work?.(); }, onLeave: async () => {}, onCommand: async () => {} }));
  const config = readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'sanctions-only-local-test-session-secret0001', SAFETY_EVIDENCE_KEY: '67'.repeat(32) });
  const now = () => Date.now() + offset;
  const app = await createApp(config, pool, false, { now, worlds: { modules }, safety: { enabled: true, moderator } });
  opened.push({ app, pool, schema }); await app.app.listen(0, '127.0.0.1'); for (const slug of ['maid', 'restaurant']) await app.worlds.registry.setEnabled(slug, true);
  return { app, pool, config, modules, joinBarrier, now, url: await app.app.getUrl(), advance: (ms: number) => { offset += ms; } };
}
type Runtime = Awaited<ReturnType<typeof open>>; type User = { me: Me; cookie: string };
const headers = (user: User, key = randomUUID()) => ({ origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': key });
const post = (r: Runtime, user: User, path: string, payload: unknown, key = randomUUID()) => r.app.http.inject({ method: 'POST', url: '/v1/' + path, headers: headers(user, key), payload });
const get = (r: Runtime, user: User, path: string) => r.app.http.inject({ url: '/v1/' + path, headers: { cookie: user.cookie } });
async function guest(r: Runtime): Promise<User> {
  const response = await r.app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: '127.31.0.' + serial++, headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Safety Test Visitor', avatarKey: 'mint' } }); expect(response.statusCode).toBe(201);
  const user = { me: MeSchema.parse(response.json()), cookie: String(response.headers['set-cookie']).split(';')[0] };
  expect((await r.app.http.inject({ method: 'PATCH', url: '/v1/me/privacy', headers: headers(user), payload: { presence: 'public', analyticsConsent: false, worldVisibility: { dating: 'hidden' } } })).statusCode).toBe(200); return user;
}
async function staff(r: Runtime, role: 'moderator' | 'safety-admin', world = 'maid') {
  const user = await guest(r);
  const response = await post(r, user, 'session/upgrade', { loginName: 'reviewer' + randomUUID().replaceAll('-', '').slice(0, 12), password: 'test-only-long-password-123!' }); expect(response.statusCode).toBe(200);
  user.me = MeSchema.parse(response.json()); user.cookie = String(response.headers['set-cookie']).split(';')[0];
  // Test-only trusted provisioning; no self-promotion route is exposed.
  await r.pool.query('INSERT INTO safety_staff_grants VALUES($1,$2,$3,$4)', [user.me.profile.id, world, role, new Date(Date.now() + 3600000)]); return user;
}
async function socketFor(r: Runtime, user: User) {
  const socket = io(r.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: '127.32.0.' + serial++ } }, extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }); clients.add(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); }); return socket;
}
const joinInput = (worldSlug = 'maid', roomId?: string) => ({ schemaVersion: 1, requestId: randomUUID(), worldSlug, worldVersion: '1.0.0', sceneVersion: '1.0.0', ...(roomId ? { roomId } : {}) });
const command = async (socket: Socket, name: string, input: unknown) => RoomAckSchema.parse(await socket.timeout(5000).emitWithAck(name, input));
async function connect(r: Runtime, user: User, world = 'maid') {
  const socket = await socketFor(r, user), input = joinInput(world); const ack = await command(socket, 'room.join', input);
  if (!ack.ok || ack.result.type !== 'snapshot') throw new Error('Fixture admission failed'); return { socket, state: ack.result, input };
}
const own = (s: RoomSnapshot) => ({ schemaVersion: 1, requestId: randomUUID(), epoch: s.epoch, roomId: s.roomId, membershipId: s.membershipId });
const reason = 'Reviewed context supports this temporary restriction.';
const issue = (r: Runtime, user: User, id: string, kind = 'mute', durationMinutes = 1, key = randomUUID()) => post(r, user, `moderation/cases/${id}/sanctions`, { kind, durationMinutes, privateReason: reason }, key);
const assign = (r: Runtime, user: User, id: string, target: User) => post(r, user, `moderation/cases/${id}/assignment`, { assigneeId: target.me.profile.id, reason: 'independent-review' });
async function reported(category = 'harassment', moderator?: ChatModerator) {
  const r = await open(moderator), reporter = await guest(r), target = await guest(r); const witness = await connect(r, reporter), peer = await connect(r, target);
  const response = await post(r, reporter, 'reports', { schemaVersion: 1, category, note: 'Private reporter allegation', source: { kind: 'room', epoch: witness.state.epoch, roomId: witness.state.roomId, membershipId: witness.state.membershipId, targetId: target.me.profile.id } }); expect(response.statusCode).toBe(201);
  const id = (await r.pool.query('SELECT id FROM safety_cases WHERE receipt_id=$1', [response.json().receiptId])).rows[0].id as string;
  const administrator = await staff(r, 'safety-admin'), reviewer = await staff(r, 'moderator'); expect((await assign(r, administrator, id, reviewer)).statusCode).toBe(200);
  return { r, reporter, target, witness, peer, id, administrator, reviewer };
}
const chat = (socket: Socket, state: RoomSnapshot, text = false) => socket.timeout(5000).emitWithAck('chat.send', { ...own(state), content: text ? { kind: 'text', text: 'Xin chào' } : { kind: 'canned', id: 'hello' } }).then(raw => ChatAckSchema.parse(raw));

it('issues one encrypted reasoned mute under concurrent retries, denies both tabs and releases at expiry without maintenance', async () => {
  const { r, target, peer, id, reviewer } = await reported(); const tab = await connect(r, target), key = randomUUID();
  const results = await Promise.all([issue(r, reviewer, id, 'mute', 1, key), issue(r, reviewer, id, 'mute', 1, key)]); expect(results.map(v => v.statusCode)).toEqual([200, 200]); expect(results[0].json()).toEqual(results[1].json());
  expect((await r.pool.query('SELECT * FROM safety_sanctions')).rowCount).toBe(1); expect((await r.pool.query("SELECT * FROM safety_audit_events WHERE action='sanction.issued'")).rowCount).toBe(1);
  const note = (await r.pool.query('SELECT * FROM safety_sanction_notes')).rows[0]; expect(note.ciphertext.toString()).not.toContain(reason); expect(note.key_id).toBe('local-v1');
  for (const socket of [peer.socket, tab.socket]) expect(await chat(socket, peer.state)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  expect((await issue(r, reviewer, id, 'warn', 1, key)).statusCode).toBe(409);
  const ownResult = OwnSanctionsSchema.parse((await get(r, target, 'me/sanctions')).json()); expect(ownResult.items[0].state).toBe('active'); expect(JSON.stringify(ownResult)).not.toContain(reviewer.me.profile.id);
  r.advance(61000); expect((await chat(peer.socket, peer.state)).ok).toBe(true); expect((await get(r, target, 'me/sanctions')).json().items[0].state).toBe('expired');
});

it('requires current assigned registered scoped staff, strict input, allowed severity and policy duration', async () => {
  const { r, target, id, reviewer, administrator, reporter } = await reported(); const outsider = await staff(r, 'moderator'), wrongWorld = await staff(r, 'safety-admin', 'restaurant');
  for (const actor of [target, reporter, administrator, outsider, wrongWorld]) expect((await issue(r, actor, id)).statusCode).toBe(404);
  expect((await issue(r, reviewer, id, 'platform-ban')).statusCode).toBe(404); expect((await issue(r, reviewer, id, 'world-ban')).statusCode).toBe(404);
  expect((await issue(r, reviewer, id, 'mute', 1441)).statusCode).toBe(422);
  expect((await post(r, reviewer, `moderation/cases/${id}/sanctions`, { kind: 'mute', durationMinutes: 1, privateReason: reason, subjectId: target.me.profile.id })).statusCode).toBe(422);
  expect((await post(r, reviewer, `moderation/cases/${id}/sanctions`, { kind: 'mute', durationMinutes: 1, privateReason: 'short' })).statusCode).toBe(422);
  await r.pool.query('UPDATE safety_staff_grants SET expires_at=$2 WHERE account_id=$1', [reviewer.me.profile.id, new Date(Date.now() - 1)]); expect((await issue(r, reviewer, id)).statusCode).toBe(404);
  expect((await r.pool.query('SELECT * FROM safety_sanctions')).rowCount).toBe(0);
});

it('room ejection releases seat/all tabs, prevents stale joins and commands, and permits a different world', async () => {
  const { r, target, peer, id, reviewer } = await reported(); const tab = await connect(r, target);
  expect((await command(peer.socket, 'seat.claim', { ...own(peer.state), seatId: 'one' })).ok).toBe(true);
  const ended = [peer.socket, tab.socket].map(socket => new Promise<unknown>(resolve => socket.once('room.ended', resolve)));
  const response = await issue(r, reviewer, id, 'room-eject'); expect(response.statusCode).toBe(200); expect(await Promise.all(ended)).toHaveLength(2);
  expect(r.app.rooms.diagnostics().occupiedSeats).toBe(0); expect(r.app.rooms.diagnostics().memberships).toBe(1);
  for (const socket of [peer.socket, tab.socket]) {
    expect((await command(socket, 'room.join', peer.input)).ok).toBe(false);
    expect((await command(socket, 'room.join', joinInput('maid', peer.state.roomId))).ok).toBe(false);
    expect((await command(socket, 'seat.claim', { ...own(peer.state), seatId: 'one' })).ok).toBe(false);
  }
  expect((await command(peer.socket, 'room.join', joinInput('restaurant'))).ok).toBe(true);
  const ownResult = (await get(r, target, 'me/sanctions')).json(); expect(ownResult.items[0].roomId).toBe(peer.state.roomId);
});

it('world ban survives reconnect/new sessions but other-world admission remains available; independent revocation releases access', async () => {
  const { r, target, peer, id, reviewer, administrator } = await reported('hate'); const response = await issue(r, reviewer, id, 'world-ban'); expect(response.statusCode).toBe(200); const sanction = SanctionResultSchema.parse(response.json()).sanction;
  expect((await command(peer.socket, 'room.join', joinInput())).ok).toBe(false);
  const loginName = 'subject' + randomUUID().replaceAll('-', '').slice(0, 12), password = 'test-only-long-password-123!';
  const upgraded = await post(r, target, 'session/upgrade', { loginName, password }); expect(upgraded.statusCode).toBe(200);
  const signedIn = await r.app.http.inject({ method: 'POST', url: '/v1/session/login', headers: { origin }, payload: { requestId: randomUUID(), loginName, password } }); expect(signedIn.statusCode).toBe(200);
  target.me = MeSchema.parse(signedIn.json()); target.cookie = String(signedIn.headers['set-cookie']).split(';')[0];
  const fresh = await socketFor(r, target); expect((await command(fresh, 'room.join', joinInput())).ok).toBe(false);
  const other = await connect(r, target, 'restaurant'); expect((await chat(other.socket, other.state)).ok).toBe(true);
  expect((await post(r, reviewer, `moderation/sanctions/${sanction.id}/revoke`, { privateReason: reason })).statusCode).toBe(404);
  expect((await assign(r, administrator, id, administrator)).statusCode).toBe(200);
  const revoked = await post(r, administrator, `moderation/sanctions/${sanction.id}/revoke`, { privateReason: reason }); expect(revoked.statusCode).toBe(200); expect(revoked.json().sanction.state).toBe('revoked');
  expect((await command(other.socket, 'room.leave', own(other.state))).ok).toBe(true); expect((await command(other.socket, 'room.join', joinInput())).ok).toBe(true);
});

it('temporary platform ban requires assigned admin and denies every world while preserving own appeal/export/session access', async () => {
  const { r, target, peer, id, reviewer, administrator, reporter } = await reported('threats');
  expect((await issue(r, reviewer, id, 'platform-ban')).statusCode).toBe(404); await assign(r, administrator, id, administrator);
  const response = await issue(r, administrator, id, 'platform-ban', 2); expect(response.statusCode).toBe(200); const sanction = response.json().sanction;
  for (const world of ['maid', 'restaurant']) expect((await command(peer.socket, 'room.join', joinInput(world))).ok).toBe(false);
  expect((await get(r, target, 'worlds')).json().worlds).toEqual([]); expect((await get(r, target, 'me')).statusCode).toBe(200);
  const key = randomUUID(), path = `me/sanctions/${sanction.id}/appeal`, note = 'I request an independent review of this restriction.';
  const appeals = await Promise.all([post(r, target, path, { note }, key), post(r, target, path, { note }, key)]); expect(appeals.map(v => v.statusCode)).toEqual([201, 201]); expect(AppealReceiptSchema.parse(appeals[0].json())).toEqual(appeals[1].json());
  expect((await post(r, reporter, path, { note })).statusCode).toBe(404); expect((await post(r, target, path, { note })).statusCode).toBe(409); expect((await post(r, target, path, { note: 'Different appeal with same key' }, key)).statusCode).toBe(409);
  const ownResult = OwnSanctionsSchema.parse((await get(r, target, 'me/sanctions')).json()); expect(ownResult.appeals).toHaveLength(1); expect(ownResult.items[0].worldSlug).toBe(null);
  const exported = (await get(r, target, 'me/export')).json(); expect(exported.domains.sanctions.appeals).toHaveLength(1);
  for (const secret of [reporter.me.profile.id, administrator.me.profile.id, 'Private reporter allegation', reason, note]) expect(JSON.stringify(exported)).not.toContain(secret);
  expect((await r.pool.query('SELECT * FROM safety_appeals')).rowCount).toBe(1);
});

it('does not broadcast a message whose moderation resolves after a mute commits', async () => {
  let release!: () => void, started!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }), inspecting = new Promise<void>(resolve => { started = resolve; });
  const moderator: ChatModerator = { inspect: async () => { started(); await pending; return { decision: 'allow' }; } };
  const { r, target, witness, peer, id, reviewer } = await reported('harassment', moderator); let deliveries = 0; witness.socket.on('chat.message', () => { deliveries++; });
  const sending = chat(peer.socket, peer.state, true); await inspecting;
  expect((await issue(r, reviewer, id)).statusCode).toBe(200); release();
  expect(await sending).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } }); expect(deliveries).toBe(0);
  expect((await get(r, target, 'me/sanctions')).json().items).toHaveLength(1);
});

it('restarts without the evidence key and still enforces committed bans without disclosing protected notes', async () => {
  const { r, target, id, reviewer } = await reported('hate'); expect((await issue(r, reviewer, id, 'world-ban')).statusCode).toBe(200);
  await r.app.app.close();
  const config = { ...r.config, SAFETY_EVIDENCE_KEY: undefined }; const replacement = await createApp(config, r.pool, false, { now: r.now, worlds: { modules: r.modules }, safety: { enabled: true } });
  opened.find(v => v.app === r.app)!.app = replacement; r.app = replacement; await replacement.app.listen(0, '127.0.0.1'); r.url = await replacement.app.getUrl(); await replacement.worlds.registry.setEnabled('maid', true); await replacement.worlds.registry.setEnabled('restaurant', true);
  const socket = await socketFor(r, target); expect((await command(socket, 'room.join', joinInput())).ok).toBe(false); expect((await command(socket, 'room.join', joinInput('restaurant'))).ok).toBe(true);
  expect((await get(r, target, 'me/sanctions')).json().items[0].state).toBe('active'); expect((await issue(r, reviewer, id)).statusCode).toBe(503);
});

it('deleted subjects erase notes, unlink sanction/appeal identities and preserve append-only audit', async () => {
  const { r, target, id, reviewer } = await reported(); const response = await issue(r, reviewer, id); expect(response.statusCode).toBe(200);
  const sanction = response.json().sanction; expect((await post(r, target, `me/sanctions/${sanction.id}/appeal`, { note: 'Please review this restriction independently.' })).statusCode).toBe(201);
  const deleted = await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(target), payload: {} }); expect(deleted.statusCode).toBe(200);
  expect((await r.pool.query('SELECT * FROM safety_sanction_notes')).rowCount).toBe(0); expect((await r.pool.query('SELECT subject_id FROM safety_sanctions')).rows[0].subject_id).toBe(null); expect((await r.pool.query('SELECT subject_id FROM safety_appeals')).rows[0].subject_id).toBe(null);
  expect((await r.pool.query("SELECT * FROM safety_audit_events WHERE action='sanction.issued'")).rowCount).toBe(1);
  await expect(r.pool.query('DELETE FROM safety_audit_events')).rejects.toMatchObject({ code: '55000' });
});

it('expiry, appeal deadlines and encrypted-note purge use authoritative time with no reactivation on retry', async () => {
  const { r, target, id, reviewer } = await reported(); const key = randomUUID(); const response = await issue(r, reviewer, id, 'room-eject', 1, key); expect(response.statusCode).toBe(200);
  r.advance(61000); const fresh = await connect(r, target); expect(fresh.state.roomId).toBeTruthy();
  const retry = await issue(r, reviewer, id, 'room-eject', 1, key); expect(retry.statusCode).toBe(200); expect(retry.json().sanction.state).toBe('expired'); expect((await command(fresh.socket, 'room.snapshot', own(fresh.state))).ok).toBe(true);
  const sanctionId = response.json().sanction.id; await r.pool.query('UPDATE safety_sanctions SET appeal_until=$2 WHERE id=$1', [sanctionId, new Date(Date.now() - 1)]);
  expect((await post(r, target, `me/sanctions/${sanctionId}/appeal`, { note: 'Please review this restriction independently.' })).statusCode).toBe(404);
  await r.pool.query('UPDATE safety_sanction_notes SET expires_at=$1', [new Date(Date.now() - 1)]); expect(await r.app.sanctions.maintain()).toBe(1); expect(await r.app.sanctions.maintain()).toBe(0);
});

it('rolls back notes, sanction, audit and receipt together and does not interrupt rooms on transaction failure', async () => {
  const { r, peer, id, reviewer } = await reported(); const key = randomUUID();
  await r.pool.query('ALTER TABLE safety_sanction_notes ADD CONSTRAINT fixture_failure CHECK(false) NOT VALID');
  expect((await issue(r, reviewer, id, 'room-eject', 1, key)).statusCode).toBe(503);
  expect((await r.pool.query('SELECT * FROM safety_sanctions')).rowCount).toBe(0); expect((await r.pool.query('SELECT * FROM safety_sanction_mutations')).rowCount).toBe(0); expect((await r.pool.query("SELECT * FROM safety_audit_events WHERE action='sanction.issued'")).rowCount).toBe(0);
  expect((await command(peer.socket, 'room.snapshot', own(peer.state))).ok).toBe(true);
  await r.pool.query('ALTER TABLE safety_sanction_notes DROP CONSTRAINT fixture_failure');
  expect((await issue(r, reviewer, id, 'room-eject', 1, key)).statusCode).toBe(200); expect((await command(peer.socket, 'room.snapshot', own(peer.state))).ok).toBe(false);
});

it('orders an already pending trusted join before ban commit and removes it before issuance acknowledges', async () => {
  const { r, peer, id, reviewer } = await reported('hate'); expect((await command(peer.socket, 'room.leave', own(peer.state))).ok).toBe(true);
  let release!: () => void, started!: () => void; const paused = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { started = resolve; });
  r.joinBarrier.work = async () => { started(); await paused; };
  try {
    const joining = command(peer.socket, 'room.join', joinInput()); await entered;
    let acknowledged = false; const restricting = issue(r, reviewer, id, 'world-ban').then(response => { acknowledged = true; return response; });
    for (let attempt = 0; attempt < 100 && r.app.rooms.diagnostics().pending < 2; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(r.app.rooms.diagnostics().pending).toBeGreaterThanOrEqual(2); expect(acknowledged).toBe(false); release();
    const joined = await joining; expect(joined.ok).toBe(true); expect((await restricting).statusCode).toBe(200);
    if (!joined.ok || joined.result.type !== 'snapshot') throw new Error('Expected join before restriction');
    expect((await command(peer.socket, 'room.snapshot', own(joined.result))).ok).toBe(false); expect(r.app.rooms.diagnostics().memberships).toBe(1);
  } finally { release(); delete r.joinBarrier.work; }
});

it('private refresh hints reach only the target, and an old issuance retry cannot undo a reasoned independent reversal', async () => {
  const { r, reporter, target, witness, peer, id, reviewer, administrator } = await reported(); const key = randomUUID(); let reporterHints = 0;
  witness.socket.on('sanction.changed', () => { reporterHints++; }); const changed = new Promise<unknown>(resolve => peer.socket.once('sanction.changed', resolve));
  const response = await issue(r, reviewer, id, 'room-eject', 1, key); expect(response.statusCode).toBe(200); expect(await changed).toEqual({ schemaVersion: 1 }); expect(reporterHints).toBe(0);
  const sanctionId = response.json().sanction.id; await assign(r, administrator, id, administrator);
  const revokeKey = randomUUID(); const path = `moderation/sanctions/${sanctionId}/revoke`;
  for (let retry = 0; retry < 2; retry++) expect((await post(r, administrator, path, { privateReason: reason }, revokeKey)).statusCode).toBe(200);
  await assign(r, administrator, id, reviewer); const current = await connect(r, target);
  const replay = await issue(r, reviewer, id, 'room-eject', 1, key); expect(replay.statusCode).toBe(200); expect(replay.json().sanction.state).toBe('revoked'); expect((await command(current.socket, 'room.snapshot', own(current.state))).ok).toBe(true);
  expect((await get(r, reporter, `moderation/cases/${id}/sanctions`)).statusCode).toBe(404); expect((await get(r, reviewer, `moderation/cases/${id}/sanctions`)).json().items).toHaveLength(1);
});

it('requires admin for actions against registered staff even if a report uses a different category, and denies expired evidence', async () => {
  const { r, target, id, reviewer, administrator } = await reported();
  const upgraded = await post(r, target, 'session/upgrade', { loginName: 'subject' + randomUUID().replaceAll('-', '').slice(0, 12), password: 'test-only-long-password-123!' }); expect(upgraded.statusCode).toBe(200);
  await r.pool.query('INSERT INTO safety_staff_grants VALUES($1,$2,$3,$4)', [target.me.profile.id, 'restaurant', 'moderator', new Date(Date.now() + 3600000)]);
  expect((await issue(r, reviewer, id)).statusCode).toBe(404); await assign(r, administrator, id, administrator);
  expect((await issue(r, administrator, id)).statusCode).toBe(200);
  await r.pool.query('UPDATE safety_report_evidence SET expires_at=$1 WHERE case_id=$2', [new Date(Date.now() - 1), id]); expect((await issue(r, administrator, id)).statusCode).toBe(404);
});

it('persists an account-wide appeal budget across different sanctions and rejects missing-CSRF writes', async () => {
  const { r, target, id, reviewer } = await reported();
  const denied = await r.app.http.inject({ method: 'POST', url: `/v1/moderation/cases/${id}/sanctions`, headers: { origin, cookie: reviewer.cookie, 'idempotency-key': randomUUID() }, payload: { kind: 'mute', durationMinutes: 1, privateReason: reason } }); expect(denied.statusCode).toBe(403);
  for (let index = 0; index < 6; index++) {
    const issued = await issue(r, reviewer, id); expect(issued.statusCode).toBe(200); const sanctionId = issued.json().sanction.id;
    expect((await post(r, target, `me/sanctions/${sanctionId}/appeal`, { note: 'Please review this restriction independently.' })).statusCode).toBe(index < 5 ? 201 : 429);
  }
  expect((await r.pool.query('SELECT * FROM safety_appeals')).rowCount).toBe(5);
});

it('searches only scoped assigned cases and gates staff session/controls by registered current grants', async () => {
  const { r, reporter, id, reviewer, administrator } = await reported(); const outside = await staff(r, 'moderator', 'restaurant');
  expect((await get(r, reporter, 'moderation/session')).statusCode).toBe(404);
  expect(ModerationSessionSchema.parse((await get(r, reviewer, 'moderation/session')).json()).scopes).toEqual([{ worldSlug: 'maid', role: 'moderator' }]);
  expect((await get(r, reviewer, 'moderation/cases?id=' + id + '&category=harassment&severity=medium&world=maid')).json().items).toHaveLength(1);
  for (const query of ['category=hate', 'severity=critical', 'world=restaurant']) expect((await get(r, reviewer, 'moderation/cases?' + query)).json().items).toHaveLength(0);
  expect((await get(r, outside, 'moderation/cases?id=' + id)).json().items).toHaveLength(0); expect((await get(r, reviewer, 'moderation/cases?reporterId=' + reporter.me.profile.id)).statusCode).toBe(422);
  expect(IncidentPageSchema.parse((await get(r, administrator, 'moderation/controls')).json()).items).toEqual([]);
  await r.pool.query('UPDATE safety_staff_grants SET expires_at=$2 WHERE account_id=$1', [reviewer.me.profile.id, new Date(Date.now() - 1)]); expect((await get(r, reviewer, 'moderation/session')).statusCode).toBe(404);
});

it('scoped admin closes chat before delayed moderation delivery, keeps room activity, requires independent recovery and rejects stale closure replay', async () => {
  let release!: () => void, started!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }), inspecting = new Promise<void>(resolve => { started = resolve; });
  const { r, witness, peer, id, administrator, reviewer } = await reported('harassment', { inspect: async () => { started(); await pending; return { decision: 'allow' }; } });
  const path = 'moderation/controls/maid', input = { surface: 'chat', closed: true, reason: 'incident' }, key = randomUUID();
  expect((await post(r, reviewer, path, input)).statusCode).toBe(404);
  let messages = 0; witness.socket.on('chat.message', () => { messages++; }); const sending = chat(peer.socket, peer.state, true); await inspecting;
  const responses = await Promise.all([post(r, administrator, path, input, key), post(r, administrator, path, input, key)]); expect(responses.map(value => value.statusCode)).toEqual([200, 200]); release();
  expect((await sending).ok).toBe(false); expect(messages).toBe(0); expect((await chat(peer.socket, peer.state)).ok).toBe(false); expect((await command(peer.socket, 'room.snapshot', own(peer.state))).ok).toBe(true);
  expect((await post(r, administrator, path, { surface: 'chat', closed: false, reason: 'reviewed-recovery' })).statusCode).toBe(403);
  const independent = await staff(r, 'safety-admin'); expect((await post(r, independent, path, { surface: 'chat', closed: false, reason: 'reviewed-recovery' })).statusCode).toBe(200);
  expect((await post(r, administrator, path, input, key)).json().control.closed).toBe(false); expect((await chat(peer.socket, peer.state)).ok).toBe(true);
  expect((await r.pool.query('SELECT * FROM safety_incident_audit')).rowCount).toBe(2); await expect(r.pool.query('TRUNCATE safety_incident_audit')).rejects.toMatchObject({ code: '55000' });
  expect((await get(r, administrator, 'moderation/cases?id=' + id)).statusCode).toBe(200);
});

it('world closure interrupts all occupants and persists across restart without evidence key; recovery cannot override disabled flags', async () => {
  const { r, target, peer, witness, administrator } = await reported(); const otherAdmin = await staff(r, 'safety-admin');
  const ended = [peer.socket, witness.socket].map(socket => new Promise<unknown>(resolve => socket.once('room.ended', resolve)));
  expect((await post(r, administrator, 'moderation/controls/maid', { surface: 'world', closed: true, reason: 'coverage-loss' })).statusCode).toBe(200); await Promise.all(ended); expect(r.app.rooms.diagnostics().memberships).toBe(0);
  expect((await command(peer.socket, 'room.join', joinInput())).ok).toBe(false); expect((await command(peer.socket, 'room.join', joinInput('restaurant'))).ok).toBe(true);
  await r.app.app.close(); const replacement = await createApp({ ...r.config, SAFETY_EVIDENCE_KEY: undefined }, r.pool, false, { now: r.now, worlds: { modules: r.modules }, safety: { enabled: true } });
  opened.find(value => value.app === r.app)!.app = replacement; r.app = replacement; await replacement.app.listen(0, '127.0.0.1'); r.url = await replacement.app.getUrl(); await replacement.worlds.registry.setEnabled('maid', true);
  const fresh = await socketFor(r, target); expect((await command(fresh, 'room.join', joinInput())).ok).toBe(false);
  expect((await post(r, otherAdmin, 'moderation/controls/maid', { surface: 'world', closed: false, reason: 'reviewed-recovery' })).statusCode).toBe(200);
  await replacement.worlds.registry.setEnabled('maid', false); expect((await command(fresh, 'room.join', joinInput())).ok).toBe(false);
  await replacement.worlds.registry.setEnabled('maid', true); expect((await command(fresh, 'room.join', joinInput())).ok).toBe(true);
  expect((await post(r, administrator, 'moderation/controls/maid', { surface: 'chat', closed: true, reason: 'incident' })).statusCode).toBe(200);
});

it('only a distinct assigned reviewer can inspect and decide an appeal; concurrent replay revokes once and reveals only controlled result to subject', async () => {
  const { r, target, reporter, peer, id, reviewer, administrator } = await reported(); const issued = await issue(r, reviewer, id); expect(issued.statusCode).toBe(200); const sanctionId = issued.json().sanction.id;
  const receipt = await post(r, target, `me/sanctions/${sanctionId}/appeal`, { note: 'Private subject context for independent review.' }); expect(receipt.statusCode).toBe(201); const appealId = receipt.json().receiptId;
  expect(CaseAppealsSchema.parse((await get(r, reviewer, `moderation/cases/${id}/appeals`)).json()).items).toHaveLength(0);
  const path = `moderation/appeals/${appealId}/review`, input = { decision: 'revoke', privateReason: 'Independent review supports reversing this restriction.' }, key = randomUUID();
  for (const actor of [reviewer, administrator, target, reporter]) expect((await post(r, actor, path, input)).statusCode).toBe(404);
  await assign(r, administrator, id, administrator); const detail = CaseAppealsSchema.parse((await get(r, administrator, `moderation/cases/${id}/appeals`)).json()); expect(detail.items[0]).toMatchObject({ note: 'Private subject context for independent review.', issuanceReason: reason });
  const responses = await Promise.all([post(r, administrator, path, input, key), post(r, administrator, path, input, key)]); expect(responses.map(value => value.statusCode)).toEqual([200, 200]); expect(responses[0].json()).toEqual(responses[1].json());
  expect((await post(r, administrator, path, { ...input, decision: 'uphold' }, key)).statusCode).toBe(409); expect((await post(r, administrator, path, input)).statusCode).toBe(409);
  expect((await chat(peer.socket, peer.state)).ok).toBe(true); const own = OwnSanctionsSchema.parse((await get(r, target, 'me/sanctions')).json()); expect(own.appeals[0].status).toBe('revoked'); expect(own.items[0].state).toBe('revoked'); expect(JSON.stringify(own)).not.toMatch(/Private subject|Independent review|Private reporter/);
  expect((await r.pool.query("SELECT * FROM safety_audit_events WHERE action='appeal.reviewed'")).rowCount).toBe(1); expect((await r.pool.query("SELECT * FROM safety_sanction_notes WHERE purpose='review'")).rows[0].ciphertext.toString()).not.toContain(input.privateReason);
});

it('appeal uphold leaves restriction active; expired/tampered appeal evidence and moderator platform review are denied', async () => {
  const { r, target, id, reviewer, administrator } = await reported('threats'); await assign(r, administrator, id, administrator);
  const response = await issue(r, administrator, id, 'platform-ban'); expect(response.statusCode).toBe(200); const sanctionId = response.json().sanction.id;
  const appeal = await post(r, target, `me/sanctions/${sanctionId}/appeal`, { note: 'Please review this restriction independently.' }); const appealId = appeal.json().receiptId;
  await assign(r, administrator, id, reviewer); expect((await get(r, reviewer, `moderation/cases/${id}/appeals`)).json().items).toHaveLength(0);
  expect((await post(r, reviewer, `moderation/appeals/${appealId}/review`, { decision: 'uphold', privateReason: reason })).statusCode).toBe(404);
  const lead = await staff(r, 'safety-admin'); await assign(r, administrator, id, lead);
  const noteId = (await r.pool.query('SELECT evidence_id FROM safety_appeals WHERE id=$1', [appealId])).rows[0].evidence_id;
  const sealed = (await r.pool.query('SELECT ciphertext,expires_at FROM safety_sanction_notes WHERE id=$1', [noteId])).rows[0]; await r.pool.query('UPDATE safety_sanction_notes SET ciphertext=$2 WHERE id=$1', [noteId, Buffer.alloc(16)]);
  expect((await post(r, lead, `moderation/appeals/${appealId}/review`, { decision: 'uphold', privateReason: reason })).statusCode).toBe(503);
  await r.pool.query('UPDATE safety_sanction_notes SET ciphertext=$2,expires_at=$3 WHERE id=$1', [noteId, sealed.ciphertext, new Date(Date.now() - 1)]);
  expect((await post(r, lead, `moderation/appeals/${appealId}/review`, { decision: 'uphold', privateReason: reason })).statusCode).toBe(404);
  await r.pool.query('UPDATE safety_sanction_notes SET expires_at=$2 WHERE id=$1', [noteId, sealed.expires_at]);
  const original = (await r.pool.query("SELECT id,expires_at FROM safety_sanction_notes WHERE sanction_id=$1 AND purpose='issue'", [sanctionId])).rows[0];
  await r.pool.query('UPDATE safety_sanction_notes SET expires_at=$2 WHERE id=$1', [original.id, new Date(Date.now() - 1)]);
  expect((await post(r, lead, `moderation/appeals/${appealId}/review`, { decision: 'uphold', privateReason: reason })).statusCode).toBe(404);
  await r.pool.query('UPDATE safety_sanction_notes SET expires_at=$2 WHERE id=$1', [original.id, original.expires_at]);
  expect((await post(r, lead, `moderation/appeals/${appealId}/review`, { decision: 'uphold', privateReason: reason })).json().status).toBe('upheld'); const own = (await get(r, target, 'me/sanctions')).json(); expect(own.items[0].state).toBe('active'); expect(own.appeals[0].status).toBe('upheld');
});

it('does not uphold a sanction already independently revoked or lose original appeal intake idempotency after review', async () => {
  const { r, target, id, reviewer, administrator } = await reported(); const issued = await issue(r, reviewer, id); const sanctionId = issued.json().sanction.id;
  const key = randomUUID(), path = `me/sanctions/${sanctionId}/appeal`, note = 'Please review this restriction independently.';
  const original = await post(r, target, path, { note }, key); const appealId = original.json().receiptId;
  await assign(r, administrator, id, administrator);
  expect((await post(r, administrator, `moderation/sanctions/${sanctionId}/revoke`, { privateReason: reason })).statusCode).toBe(200);
  expect((await post(r, administrator, `moderation/appeals/${appealId}/review`, { decision: 'uphold', privateReason: reason })).statusCode).toBe(409);
  expect((await post(r, administrator, `moderation/appeals/${appealId}/review`, { decision: 'revoke', privateReason: reason })).statusCode).toBe(200);
  const replay = await post(r, target, path, { note }, key); expect(replay.statusCode).toBe(201); expect(replay.json()).toEqual(original.json());
  expect((await get(r, target, 'me/sanctions')).json().appeals[0].status).toBe('revoked');
});
