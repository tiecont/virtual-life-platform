import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { MeSchema, RoomAckSchema, ChatAckSchema, ReportReceiptSchema, CaseDetailSchema, CasePageSchema, type Me, type RoomSnapshot } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';

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
async function open(withKey = true) {
  const schema = 'report_test_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema);
  const pool = new Pool({ connectionString: url.toString() }); await migrate(pool); let offset = 0;
  const fixture = defineWorld({ schemaVersion: 1, apiVersion: 1, slug: 'maid', version: '1.0.0', title: 'Local report fixture (not integrated Maid)', kind: 'sandbox', sceneRef: { key: 'report-fixture', version: '1.0.0' }, capacity: 8, capabilities: ['presence', 'chat'], accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {} });
  const app = await createApp(readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'reports-only-local-test-session-secret0001', ...(withKey ? { SAFETY_EVIDENCE_KEY: '45'.repeat(32) } : {}) }), pool, false, { now: () => Date.now() + offset, worlds: { modules: [fixture] }, safety: { enabled: true } });
  opened.push({ app, pool, schema }); await app.app.listen(0, '127.0.0.1'); await app.worlds.registry.setEnabled('maid', true);
  return { app, pool, url: await app.app.getUrl(), advance: (ms: number) => { offset += ms; } };
}
type Runtime = Awaited<ReturnType<typeof open>>; type User = { me: Me; cookie: string };
const headers = (user: User, key = randomUUID()) => ({ origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': key });
async function guest(r: Runtime): Promise<User> {
  const response = await r.app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: '127.27.0.' + serial++, headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Report Test Visitor', avatarKey: 'mint' } }); expect(response.statusCode).toBe(201);
  const user = { me: MeSchema.parse(response.json()), cookie: String(response.headers['set-cookie']).split(';')[0] };
  expect((await r.app.http.inject({ method: 'PATCH', url: '/v1/me/privacy', headers: headers(user), payload: { presence: 'public', analyticsConsent: false, worldVisibility: { dating: 'hidden' } } })).statusCode).toBe(200); return user;
}
async function upgrade(r: Runtime, user: User) {
  const response = await r.app.http.inject({ method: 'POST', url: '/v1/session/upgrade', headers: headers(user), payload: { loginName: 'staff' + randomUUID().replaceAll('-', '').slice(0, 12), password: 'test-only-long-password-123!' } }); expect(response.statusCode).toBe(200);
  user.me = MeSchema.parse(response.json()); user.cookie = String(response.headers['set-cookie']).split(';')[0];
  return user;
}
async function staff(r: Runtime, role: 'moderator' | 'safety-admin', world = 'maid') {
  const user = await upgrade(r, await guest(r));
  // Trusted test provisioning only. No grant/self-promotion HTTP route exists.
  await r.pool.query('INSERT INTO safety_staff_grants VALUES($1,$2,$3,$4)', [user.me.profile.id, world, role, new Date(Date.now() + 3600000)]); return user;
}
async function connect(r: Runtime, user: User) {
  const socket = io(r.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: '127.28.0.' + serial++ } }, extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }); clients.add(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  const ack = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join', { schemaVersion: 1, requestId: randomUUID(), worldSlug: 'maid', worldVersion: '1.0.0', sceneVersion: '1.0.0' }));
  if (!ack.ok || ack.result.type !== 'snapshot') throw new Error('Fixture admission failed'); return { socket, state: ack.result };
}
const own = (s: RoomSnapshot) => ({ schemaVersion: 1, requestId: randomUUID(), epoch: s.epoch, roomId: s.roomId, membershipId: s.membershipId });
const roomReport = (state: RoomSnapshot, target: User) => ({ schemaVersion: 1, category: 'harassment', note: 'Private reporter note', source: { kind: 'room', epoch: state.epoch, roomId: state.roomId, membershipId: state.membershipId, targetId: target.me.profile.id } });
const submit = (r: Runtime, user: User, input: unknown, key = randomUUID()) => r.app.http.inject({ method: 'POST', url: '/v1/reports', headers: headers(user, key), payload: input });
const get = (r: Runtime, user: User, path: string) => r.app.http.inject({ url: '/v1/' + path, headers: { cookie: user.cookie } });
const assign = (r: Runtime, user: User, id: string, target: User, key = randomUUID()) => r.app.http.inject({ method: 'POST', url: `/v1/moderation/cases/${id}/assignment`, headers: headers(user, key), payload: { assigneeId: target.me.profile.id, reason: 'triage' } });
async function reported() {
  const r = await open(), a = await guest(r), b = await guest(r); const joined = await connect(r, a); await connect(r, b);
  const response = await submit(r, a, roomReport(joined.state, b)); expect(response.statusCode).toBe(201);
  const receipt = ReportReceiptSchema.parse(response.json()); const row = (await r.pool.query('SELECT * FROM safety_cases WHERE receipt_id=$1', [receipt.receiptId])).rows[0];
  return { r, a, b, joined, receipt, id: row.id as string };
}

it('reports fail closed without a separate key; no client can provision staff or bypass auth/CSRF/strict payloads', async () => {
  const r = await open(false), a = await guest(r), b = await guest(r); const joined = await connect(r, a); await connect(r, b);
  expect((await get(r, a, 'safety/status')).json().reportsAvailable).toBe(false);
  expect((await submit(r, a, roomReport(joined.state, b))).statusCode).toBe(503);
  expect((await r.app.http.inject({ url: '/v1/safety/status' })).statusCode).toBe(401);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/reports', headers: { origin, cookie: a.cookie, 'idempotency-key': randomUUID() }, payload: roomReport(joined.state, b) })).statusCode).toBe(403);
  expect((await submit(r, a, { ...roomReport(joined.state, b), role: 'safety-admin' })).statusCode).toBe(422);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/moderation/grants', headers: headers(a), payload: { role: 'safety-admin' } })).statusCode).toBe(404);
});

it('confidential receipt is reporter-only, concurrent retries persist one encrypted case and one audit event', async () => {
  const r = await open(), a = await guest(r), b = await guest(r), stranger = await guest(r); const joined = await connect(r, a); const peer = await connect(r, b);
  const emitted: string[] = []; peer.socket.onAny((name, data) => { if (name !== 'room.delta') emitted.push(JSON.stringify({ name, data })); });
  const input = roomReport(joined.state, b), key = randomUUID(); const results = await Promise.all([submit(r, a, input, key), submit(r, a, input, key)]);
  expect(results.map(res => res.statusCode)).toEqual([201, 201]); expect(results[0].json()).toEqual(results[1].json());
  const receipt = ReportReceiptSchema.parse(results[0].json());
  expect((await get(r, a, 'reports/' + receipt.receiptId)).statusCode).toBe(200);
  expect((await get(r, b, 'reports/' + receipt.receiptId)).statusCode).toBe(404);
  expect((await get(r, stranger, 'reports/' + receipt.receiptId)).statusCode).toBe(404);
  expect((await submit(r, a, { ...input, note: 'Changed evidence' }, key)).statusCode).toBe(409);
  expect((await r.pool.query('SELECT count(*)::int AS n FROM safety_cases')).rows[0].n).toBe(1);
  expect((await r.pool.query('SELECT count(*)::int AS n FROM safety_audit_events')).rows[0].n).toBe(1);
  const storage = await r.pool.query('SELECT * FROM safety_report_evidence'); expect(JSON.stringify(storage.rows)).not.toContain(input.note);
  expect(storage.rows[0].ciphertext.includes(Buffer.from(input.note))).toBe(false);
  expect(emitted).toEqual([]); expect(JSON.stringify(receipt)).not.toContain(a.me.profile.id);
});

it('rejects room IDOR, self-report, forged membership/epoch and invisible targets without enumerating peers', async () => {
  const r = await open(), a = await guest(r), b = await guest(r), c = await guest(r); const joined = await connect(r, a); await connect(r, b);
  const input = roomReport(joined.state, b);
  for (const source of [{ ...input.source, roomId: randomUUID() }, { ...input.source, epoch: randomUUID() }, { ...input.source, membershipId: randomUUID() }, { ...input.source, targetId: a.me.profile.id }, { ...input.source, targetId: c.me.profile.id }]) expect((await submit(r, a, { ...input, source })).statusCode).toBe(404);
  expect((await submit(r, c, input)).statusCode).toBe(404);
  await r.app.http.inject({ method: 'POST', url: '/v1/blocks', headers: headers(a), payload: { targetId: b.me.profile.id, blocked: true } });
  expect((await submit(r, a, input)).statusCode).toBe(404);
  expect((await r.pool.query('SELECT count(*)::int AS n FROM safety_cases')).rows[0].n).toBe(0);
});

it('assigned registered staff can review within world scope, while target/reporter/unassigned/expired grants cannot', async () => {
  const { r, a, b, id } = await reported(); const adminUser = await staff(r, 'safety-admin'), moderator = await staff(r, 'moderator'), other = await staff(r, 'moderator'), wrongWorld = await staff(r, 'safety-admin', 'library');
  for (const user of [a, b, moderator, other, wrongWorld, adminUser]) expect((await get(r, user, 'moderation/cases/' + id)).statusCode).toBe(404);
  expect(CasePageSchema.parse((await get(r, moderator, 'moderation/cases')).json()).items).toEqual([]);
  expect((await assign(r, wrongWorld, id, moderator)).statusCode).toBe(404);
  expect((await assign(r, moderator, id, moderator)).statusCode).toBe(404);
  const key = randomUUID(); expect((await assign(r, adminUser, id, moderator, key)).statusCode).toBe(200);
  expect((await assign(r, adminUser, id, moderator, key)).statusCode).toBe(200);
  expect((await assign(r, adminUser, id, other, key)).statusCode).toBe(409);
  const detail = CaseDetailSchema.parse((await get(r, moderator, 'moderation/cases/' + id)).json()); expect(detail.evidence?.note).toBe('Private reporter note');
  expect(JSON.stringify(detail)).not.toContain(a.me.profile.id); expect(detail.subjectId).toBe(b.me.profile.id);
  expect(CasePageSchema.parse((await get(r, moderator, 'moderation/cases')).json()).items).toHaveLength(1);
  expect((await get(r, other, 'moderation/cases/' + id)).statusCode).toBe(404);
  await r.pool.query('UPDATE safety_staff_grants SET expires_at=$2 WHERE account_id=$1', [moderator.me.profile.id, new Date(0)]);
  expect((await get(r, moderator, 'moderation/cases/' + id)).statusCode).toBe(404);
  expect((await r.pool.query("SELECT count(*)::int AS n FROM safety_audit_events WHERE action='case.assigned'")).rows[0].n).toBe(1);
});

it('guest grants and conflicted staff never authorize case evidence; staff-abuse needs an independent safety admin', async () => {
  const { r, a, b, id, joined } = await reported(); const adminUser = await staff(r, 'safety-admin'), moderator = await staff(r, 'moderator'), lead = await staff(r, 'safety-admin');
  for (const user of [a, b]) await r.pool.query('INSERT INTO safety_staff_grants VALUES($1,$2,$3,$4)', [user.me.profile.id, 'maid', 'safety-admin', new Date(Date.now() + 3600000)]);
  expect((await get(r, a, 'moderation/cases')).statusCode).toBe(404);
  expect((await assign(r, adminUser, id, b)).statusCode).toBe(404);
  const response = await submit(r, a, { ...roomReport(joined.state, b), category: 'staff-abuse' }); expect(response.statusCode).toBe(201);
  const caseId = (await r.pool.query('SELECT id FROM safety_cases WHERE receipt_id=$1', [response.json().receiptId])).rows[0].id;
  expect((await assign(r, adminUser, caseId, moderator)).statusCode).toBe(404);
  expect((await assign(r, adminUser, caseId, lead)).statusCode).toBe(200);
  expect((await get(r, lead, 'moderation/cases/' + caseId)).statusCode).toBe(200);
  await upgrade(r, a); await upgrade(r, b);
  expect(CasePageSchema.parse((await get(r, b, 'moderation/cases')).json()).items).toEqual([]);
  expect((await assign(r, adminUser, id, b)).statusCode).toBe(404);
  expect((await assign(r, b, id, moderator)).statusCode).toBe(404);
  await r.pool.query('UPDATE safety_cases SET assigned_to=$2 WHERE id=$1', [id, b.me.profile.id]);
  expect((await get(r, b, 'moderation/cases/' + id)).statusCode).toBe(404);
  expect((await get(r, a, 'moderation/cases/' + id)).statusCode).toBe(404);
});

it('database audit refuses UPDATE, DELETE and TRUNCATE; tampered ciphertext fails safely without leaking evidence', async () => {
  const { r, id } = await reported(); const administrator = await staff(r, 'safety-admin'), moderator = await staff(r, 'moderator'); await assign(r, administrator, id, moderator);
  for (const sql of ["UPDATE safety_audit_events SET reason='expired'", 'DELETE FROM safety_audit_events', 'TRUNCATE safety_audit_events']) await expect(r.pool.query(sql)).rejects.toMatchObject({ code: '55000' });
  await r.pool.query("UPDATE safety_report_evidence SET ciphertext=decode(repeat('00',octet_length(ciphertext)),'hex') WHERE case_id=$1", [id]);
  const response = await get(r, moderator, 'moderation/cases/' + id); expect(response.statusCode).toBe(503); expect(response.body).not.toContain('Private reporter note'); expect(response.body).not.toContain('authenticate');
  expect((await r.pool.query("SELECT count(*)::int AS n FROM safety_audit_events WHERE action='case.viewed'")).rows[0].n).toBe(0);
});

it('shared durable daily report budget, bounded notes and evidence TTL prevent unbounded retained evidence', async () => {
  const { r, a, b, joined, id } = await reported();
  expect((await submit(r, a, { ...roomReport(joined.state, b), note: 'x'.repeat(1001) })).statusCode).toBe(422);
  for (let index = 0; index < 4; index++) expect((await submit(r, a, roomReport(joined.state, b))).statusCode).toBe(201);
  expect((await submit(r, a, roomReport(joined.state, b))).statusCode).toBe(429);
  const administrator = await staff(r, 'safety-admin'), moderator = await staff(r, 'moderator'); await assign(r, administrator, id, moderator);
  r.advance(30 * 86400000); // Tests the expiry using a new staff session after the original session/grant expiry.
  const renewed = await staff(r, 'safety-admin'); await r.pool.query('UPDATE safety_staff_grants SET expires_at=$2 WHERE account_id=$1', [renewed.me.profile.id, new Date(Date.now() + 31 * 86400000)]);
  await assign(r, renewed, id, renewed); const detail = CaseDetailSchema.parse((await get(r, renewed, 'moderation/cases/' + id)).json()); expect(detail.evidence).toBeNull();
  expect(await r.app.reports.purgeExpiredEvidence()).toBe(5); expect(await r.app.reports.purgeExpiredEvidence()).toBe(0);
  expect((await r.pool.query('SELECT count(*)::int AS n FROM safety_report_evidence')).rows[0].n).toBe(0);
});

it('own export excludes reports against target; explicit identity deletion unlinks case and erases associated evidence', async () => {
  const { r, a, b, receipt, id } = await reported();
  const ownExport = (await get(r, a, 'me/export')).json(), targetExport = (await get(r, b, 'me/export')).json();
  expect(ownExport.domains.safety.submittedReports).toEqual([receipt]); expect(targetExport.domains.safety.submittedReports).toEqual([]); expect(JSON.stringify(targetExport)).not.toContain(a.me.profile.id);
  const response = await r.app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(a), payload: {} }); expect(response.statusCode).toBe(200);
  const row = (await r.pool.query('SELECT reporter_id FROM safety_cases WHERE id=$1', [id])).rows[0]; expect(row.reporter_id).toBeNull();
  expect((await r.pool.query('SELECT 1 FROM safety_report_evidence WHERE case_id=$1', [id])).rowCount).toBe(0);
  expect((await r.pool.query("SELECT 1 FROM safety_audit_events WHERE action='evidence.purged' AND reason='identity-deleted'")).rowCount).toBe(1);
});

it('automatic guest expiry invokes safety deletion hooks and removes ciphertext rather than leaving orphaned identity evidence', async () => {
  const { r, a, b, id } = await reported();
  await r.pool.query('UPDATE identity_sessions SET expires_at=$2 WHERE account_id=$1', [b.me.profile.id, new Date(0)]);
  expect(await r.app.identity.purgeExpired()).toBeGreaterThan(0);
  expect((await r.pool.query('SELECT subject_id FROM safety_cases WHERE id=$1', [id])).rows[0].subject_id).toBeNull();
  expect((await r.pool.query('SELECT 1 FROM safety_report_evidence WHERE case_id=$1', [id])).rowCount).toBe(0);
  expect((await get(r, a, 'me/export')).statusCode).toBe(200);
});

it('persisted receipt and ciphertext survive app recreation while missing or wrong keys never reveal plaintext', async () => {
  const { r, a, id, receipt } = await reported(); const administrator = await staff(r, 'safety-admin'), moderator = await staff(r, 'moderator'); await assign(r, administrator, id, moderator);
  await r.app.app.close();
  const config = { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, SESSION_SECRET: 'reports-only-local-test-session-secret0001' };
  for (const key of [undefined, '56'.repeat(32), '45'.repeat(32)]) {
    const next = await createApp(readConfig({ ...config, ...(key ? { SAFETY_EVIDENCE_KEY: key } : {}) }), r.pool);
    try {
      const response = await next.http.inject({ url: '/v1/moderation/cases/' + id, headers: { cookie: moderator.cookie } });
      expect(response.statusCode).toBe(key === undefined || key !== '45'.repeat(32) ? 503 : 200);
      if (response.statusCode !== 200) expect(response.body).not.toContain('Private reporter note');
      if (key === '45'.repeat(32)) expect(ReportReceiptSchema.parse((await next.http.inject({ url: '/v1/reports/' + receipt.receiptId, headers: { cookie: a.cookie } })).json())).toEqual(receipt);
    } finally { await next.app.close(); }
  }
});

it('actual moderated-message references are recipient-bound and remain reportable after block without fabricating text', async () => {
  const r = await open(), a = await guest(r), b = await guest(r), stranger = await guest(r); const reporter = await connect(r, a), sender = await connect(r, b);
  const received = new Promise<unknown>(resolve => reporter.socket.once('chat.message', resolve));
  const ack = ChatAckSchema.parse(await sender.socket.timeout(5000).emitWithAck('chat.send', { ...own(sender.state), content: { kind: 'text', text: 'Xin chào' } })); expect(ack.ok).toBe(true); const event = await received as { messageId: string };
  const input = { schemaVersion: 1, category: 'harassment', note: 'Context matters; this is an allegation', source: { kind: 'messages', messageIds: [event.messageId] } };
  expect((await submit(r, stranger, input)).statusCode).toBe(404); expect((await submit(r, b, input)).statusCode).toBe(404);
  expect((await submit(r, a, { ...input, source: { kind: 'messages', messageIds: [randomUUID()] } })).statusCode).toBe(404);
  expect((await submit(r, a, { ...input, text: 'Forged quote' })).statusCode).toBe(422);
  expect((await r.app.http.inject({ method: 'POST', url: '/v1/blocks', headers: headers(a), payload: { targetId: b.me.profile.id, blocked: true } })).statusCode).toBe(200);
  const response = await submit(r, a, input); expect(response.statusCode).toBe(201);
  const caseId = (await r.pool.query('SELECT id FROM safety_cases WHERE receipt_id=$1', [response.json().receiptId])).rows[0].id;
  const administrator = await staff(r, 'safety-admin'), moderator = await staff(r, 'moderator'); await assign(r, administrator, caseId, moderator);
  const detail = CaseDetailSchema.parse((await get(r, moderator, 'moderation/cases/' + caseId)).json());
  expect(detail.evidence?.source.kind).toBe('messages'); if (detail.evidence?.source.kind === 'messages') expect(detail.evidence.source.messages[0].content).toEqual({ kind: 'text', text: 'Xin chào' });
  r.advance(300001); expect((await submit(r, a, input)).statusCode).toBe(404);
});
