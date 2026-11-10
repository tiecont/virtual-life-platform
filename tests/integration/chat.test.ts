import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { MeSchema, RoomAckSchema, ChatAckSchema, ChatMessageSchema, type Me, type RoomSnapshot, type ChatSend, type ChatMessage } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/shared/config/environment';
import { migrate } from '../../apps/platform-api/src/shared/database/migrations';
import type { ChatModerator } from '../../apps/platform-api/src/features/safety/modules/moderation/domain/moderation';

const origin = 'http://127.0.0.1:3300'; const clients = new Set<Socket>(); let source = 1;
let admin: Pool; const opened: { app: Awaited<ReturnType<typeof createApp>>; pool: Pool; schema: string }[] = [];
beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: url.toString() });
});
afterEach(async () => {
  for (const client of clients) client.close(); clients.clear();
  for (const item of opened.splice(0)) { await item.app.app.close(); await item.pool.end(); await admin.query(`DROP SCHEMA IF EXISTS "${item.schema}" CASCADE`); }
});
afterAll(async () => { await admin.end(); });
async function open(options: { enabled?: boolean; moderator?: ChatModerator; slug?: string; mode?: 'silent' | 'canned'; fallback?: 'deny' } = {}) {
  const schema = 'chat_test_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema);
  const pool = new Pool({ connectionString: url.toString() }); await migrate(pool); let offset = 0;
  const policy = JSON.parse(readFileSync('config/safety-policy.json', 'utf8')); const fixtureSlug = options.slug ?? 'maid';
  if (options.mode) policy.contexts.maid = { ...policy.contexts.maid, mode: options.mode, ...(options.mode === 'silent' ? { audience: 'none', cannedIds: [], fallback: 'deny' } : {}) };
  if (options.fallback) policy.contexts.maid.fallback = options.fallback;
  // Synthetic module only: use a reviewed presence-policy context without relaxing the unknown-world privacy denylist. No legacy Maid source is integrated.
  const module = defineWorld({ schemaVersion: 1, apiVersion: 1, slug: fixtureSlug, version: '1.0.0', title: 'Local safety fixture (not integrated Maid)', kind: 'sandbox', sceneRef: { key: 'chat-fixture', version: '1.0.0' }, capacity: 8, capabilities: ['presence', 'chat'], accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } }, {
    bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {},
  });
  const app = await createApp(readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'chat-test-only-session-secret-000000001' }), pool, false, { now: () => Date.now() + offset, worlds: { modules: [module] }, safety: { enabled: options.enabled ?? true, moderator: options.moderator, policy } });
  opened.push({ app, pool, schema }); await app.app.listen(0, '127.0.0.1'); await app.worlds.registry.setEnabled(fixtureSlug, true); await app.worlds.registry.setEnabled('sdk-sandbox', true);
  return { app, pool, fixtureSlug, url: await app.app.getUrl(), advance: (ms: number) => { offset += ms; } };
}
type Runtime = Awaited<ReturnType<typeof open>>; type User = { cookie: string; me: Me };
async function guest(runtime: Runtime): Promise<User> {
  const response = await runtime.app.http.inject({ method: 'POST', url: '/v1/session/guest', remoteAddress: '127.25.0.' + source++, headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Chat Test Visitor', avatarKey: 'mint' } });
  expect(response.statusCode).toBe(201); const user = { cookie: String(response.headers['set-cookie']).split(';')[0], me: MeSchema.parse(response.json()) };
  const changed = await runtime.app.http.inject({ method: 'PATCH', url: '/v1/me/privacy', headers: { origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': randomUUID() }, payload: { presence: 'public', analyticsConsent: false, worldVisibility: { dating: 'hidden' } } });
  expect(changed.statusCode).toBe(200); return user;
}
async function connect(runtime: Runtime, user: User) {
  const client = io(runtime.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: '127.26.0.' + source++ } }, extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }); clients.add(client);
  await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); client.connect(); }); return client;
}
async function join(client: Socket, worldSlug = 'maid') {
  const ack = RoomAckSchema.parse(await client.timeout(5000).emitWithAck('room.join', { schemaVersion: 1, requestId: randomUUID(), worldSlug, worldVersion: '1.0.0', sceneVersion: '1.0.0' }));
  if (!ack.ok || ack.result.type !== 'snapshot') throw new Error('Fixture admission failed'); return ack.result;
}
const own = (state: RoomSnapshot) => ({ schemaVersion: 1, requestId: randomUUID(), epoch: state.epoch, roomId: state.roomId, membershipId: state.membershipId });
const chatInput = (state: RoomSnapshot, content: ChatSend['content']) => ({ ...own(state), content });
const send = async (client: Socket, input: unknown) => ChatAckSchema.parse(await client.timeout(2500).emitWithAck('chat.send', input));
async function flush(client: Socket, state: RoomSnapshot) { const ack = RoomAckSchema.parse(await client.timeout(5000).emitWithAck('room.snapshot', own(state))); expect(ack.ok).toBe(true); }
function messages(client: Socket) { const events: ChatMessage[] = []; client.on('chat.message', event => events.push(ChatMessageSchema.parse(event))); return events; }
function gateModerator() {
  let start!: () => void, release!: () => void; const started = new Promise<void>(resolve => { start = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
  const moderator: ChatModerator = { inspect: async () => { calls++; start(); await gate; return { decision: 'allow' }; } };
  return { moderator, started, release, calls: () => calls };
}

it('applies the Vietnamese/Unicode corpus before real socket broadcast without turning withheld text into sanctions or cases', async () => {
  const corpus = JSON.parse(readFileSync('tests/fixtures/chat-moderation-corpus.json', 'utf8')) as { id: string; text: string; decision: 'allow' | 'reject' | 'review' | 'invalid' }[];
  const runtime = await open(), sender = await guest(runtime);
  const a = await connect(runtime, sender), b = await connect(runtime, await guest(runtime)), sa = await join(a), sb = await join(b), seen = messages(b);
  const elapsed: number[] = []; let delivered = 0;
  for (const row of corpus) {
    runtime.advance(10001);
    const started = performance.now(), result = await send(a, chatInput(sa, { kind: 'text', text: row.text })); elapsed.push(performance.now() - started);
    expect(result.ok, row.id).toBe(row.decision === 'allow');
    if (!result.ok) expect(result.error.code, row.id).toBe(row.decision === 'invalid' ? 'INVALID_REQUEST' : 'CONTENT_REJECTED');
    await flush(b, sb);
    if (row.decision === 'allow') { delivered++; expect(seen.at(-1)?.sender.id, row.id).toBe(sender.me.profile.id); }
    expect(seen, row.id).toHaveLength(delivered);
  }
  expect((await runtime.pool.query('SELECT 1 FROM safety_sanctions')).rowCount).toBe(0);
  expect((await runtime.pool.query('SELECT 1 FROM safety_cases')).rowCount).toBe(0);
  expect((await send(a, chatInput(sa, { kind: 'canned', id: 'thanks' }))).ok).toBe(true);
  expect(a.connected).toBe(true);
  const ordered = elapsed.toSorted((a, b) => a - b);
  console.info('M08-06_LOCAL_CHAT_TIMING', JSON.stringify({ samples: ordered.length, p50Ms: ordered[Math.ceil(ordered.length * .5) - 1], p95Ms: ordered[Math.ceil(ordered.length * .95) - 1], maxMs: ordered.at(-1), allowed: delivered, withheld: corpus.length - delivered, profile: 'sequential loopback sockets; synthetic clock advances quota windows; not a load/production SLA' }));
});

it('shares a concurrent quick-action flood budget across independently signed-in sessions and recovers after the account window', async () => {
  const runtime = await open(), original = await guest(runtime);
  const loginName = 'flood' + randomUUID().replaceAll('-', '').slice(0, 12), password = 'synthetic-only-session-flood-password';
  const upgraded = await runtime.app.http.inject({ method: 'POST', url: '/v1/session/upgrade', headers: { origin, cookie: original.cookie, 'x-csrf-token': original.me.csrfToken, 'idempotency-key': randomUUID() }, payload: { loginName, password } }); expect(upgraded.statusCode).toBe(200);
  const first = { me: MeSchema.parse(upgraded.json()), cookie: String(upgraded.headers['set-cookie']).split(';')[0] };
  const signedIn = await runtime.app.http.inject({ method: 'POST', url: '/v1/session/login', headers: { origin }, payload: { requestId: randomUUID(), loginName, password } }); expect(signedIn.statusCode).toBe(200);
  const second = { me: MeSchema.parse(signedIn.json()), cookie: String(signedIn.headers['set-cookie']).split(';')[0] };
  expect(first.me.profile.id).toBe(second.me.profile.id); expect(first.cookie).not.toBe(second.cookie);
  const a = await connect(runtime, first), b = await connect(runtime, second), observer = await connect(runtime, await guest(runtime));
  const sa = await join(a), sb = await join(b), so = await join(observer), seen = messages(observer);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => send(i % 2 ? a : b, chatInput(i % 2 ? sa : sb, { kind: 'emote', id: 'wave' }))));
  const burstAccepted = results.filter(result => result.ok).length;
  expect(burstAccepted).toBeGreaterThan(0); expect(burstAccepted).toBeLessThanOrEqual(6);
  expect(results.filter(result => !result.ok).every(result => !result.ok && result.error.code === 'RATE_LIMITED')).toBe(true);
  // The two-in-flight account cap can reject a burst before all six window
  // slots are used. Fill remaining slots sequentially, then deny both sessions.
  for (let i = burstAccepted; i < 6; i++) {
    const result = await send(i % 2 ? a : b, chatInput(i % 2 ? sa : sb, { kind: 'emote', id: 'wave' })); expect(result.ok).toBe(true); results.push(result);
  }
  expect(results.filter(result => result.ok)).toHaveLength(6);
  for (const [socket, state] of [[a, sa], [b, sb]] as const) expect(await send(socket, chatInput(state, { kind: 'canned', id: 'hello' }))).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  await flush(observer, so);
  const accepted = new Set(results.flatMap(result => result.ok ? [result.result.messageId] : []));
  expect(seen.length).toBeLessThanOrEqual(6); expect(seen.every(event => accepted.has(event.messageId))).toBe(true);
  expect(runtime.app.chat.diagnostics()).toMatchObject({ accepted: 6, pending: 0, workerSlots: 0 });
  runtime.advance(10001); expect((await send(b, chatInput(sb, { kind: 'canned', id: 'thanks' }))).ok).toBe(true);
  expect((await runtime.pool.query('SELECT 1 FROM safety_sanctions')).rowCount).toBe(0);
});

it('acknowledges a nonsettling moderation deadline within a bounded local response without any late delivery', async () => {
  let release!: () => void;
  const runtime = await open({ moderator: { inspect: () => new Promise(resolve => { release = () => resolve({ decision: 'allow' }); }) } });
  const a = await connect(runtime, await guest(runtime)), sa = await join(a), seen = messages(a);
  const started = performance.now(), result = await send(a, chatInput(sa, { kind: 'text', text: 'hello' })), elapsedMs = performance.now() - started;
  expect(result).toMatchObject({ ok: false, error: { code: 'MODERATION_UNAVAILABLE', retryable: true } });
  expect(elapsedMs).toBeGreaterThanOrEqual(450); expect(elapsedMs).toBeLessThan(1500);
  expect(runtime.app.chat.diagnostics()).toMatchObject({ pending: 0, workerSlots: 1, receipts: 0 });
  release(); await expect.poll(() => runtime.app.chat.diagnostics().workerSlots).toBe(0); await flush(a, sa); expect(seen).toEqual([]);
  expect((await send(a, chatInput(sa, { kind: 'canned', id: 'hello' }))).ok).toBe(true);
  console.info('M08-06_LOCAL_MODERATION_DEADLINE', JSON.stringify({ samples: 1, elapsedMs, providerDeadlineMs: 500, localRegressionCeilingMs: 1500, profile: 'loopback, nonsettling test provider, not a production latency guarantee' }));
});

it('keeps chat disabled by default and denies missing capabilities, malformed identity/target and private payload fields', async () => {
  const off = await open({ enabled: false }); const user = await guest(off), client = await connect(off, user), state = await join(client); const seen = messages(client);
  const denied = await send(client, chatInput(state, { kind: 'canned', id: 'hello' })); expect(denied.ok).toBe(false); if (!denied.ok) expect(denied.error.code).toBe('FORBIDDEN');
  expect(off.app.chat.diagnostics().enabled).toBe(false); expect(seen).toEqual([]);
  const runtime = await open(); const a = await connect(runtime, await guest(runtime)); const sa = await join(a); const observed = messages(a);
  for (const extra of [{ senderId: randomUUID() }, { role: 'admin' }, { targetId: randomUUID() }, { content: { kind: 'emote', id: 'upload-image' } }, { content: { kind: 'canned', id: 'hello', text: 'injected' } }, { content: { kind: 'text', text: 'x'.repeat(281) } }]) expect((await send(a, { ...chatInput(sa, { kind: 'canned', id: 'hello' }), ...extra })).ok).toBe(false);
  expect((await send(a, { ...chatInput(sa, { kind: 'canned', id: 'hello' }), membershipId: randomUUID() })).ok).toBe(false);
  const b = await connect(runtime, await guest(runtime)); const sb = await join(b, 'sdk-sandbox'); expect((await send(b, chatInput(sb, { kind: 'canned', id: 'hello' }))).ok).toBe(false);
  await flush(a, sa); expect(observed).toEqual([]);
  const unknown = await open({ slug: 'unknown-chat-fixture' }); const un = await connect(unknown, await guest(unknown)); const us = await join(un, unknown.fixtureSlug);
  expect((await send(un, chatInput(us, { kind: 'canned', id: 'hello' }))).ok).toBe(false);
});

it('broadcasts only approved normalized server-profile messages and deduplicates actual socket retries', async () => {
  const runtime = await open(); const user = await guest(runtime); const a = await connect(runtime, user), b = await connect(runtime, await guest(runtime)); const sa = await join(a), sb = await join(b);
  const aa = messages(a), bb = messages(b); const input = chatInput(sa, { kind: 'text', text: '  Ｈｅｌｌｏ  ' });
  const first = await send(a, input); expect(first.ok).toBe(true); await flush(b, sb);
  expect(bb).toHaveLength(1); expect(aa).toHaveLength(1); expect(bb[0].content).toEqual({ kind: 'text', text: 'Hello' }); expect(bb[0].sender.id).toBe(user.me.profile.id);
  expect(await send(a, input)).toEqual(first); await flush(b, sb); expect(bb).toHaveLength(1);
  const conflict = await send(a, { ...input, content: { kind: 'text', text: 'thanks' } }); expect(conflict.ok).toBe(false); if (!conflict.ok) expect(conflict.error.code).toBe('IDEMPOTENCY_CONFLICT');
  expect(JSON.stringify(runtime.app.chat.diagnostics())).not.toContain(user.me.profile.id); expect(JSON.stringify(runtime.app.chat.diagnostics())).not.toContain('Hello');
});

it('does not broadcast before moderation, shares pending retries and rechecks bilateral block after a delayed decision', async () => {
  const gate = gateModerator(); const runtime = await open({ moderator: gate.moderator }); const user = await guest(runtime), peer = await guest(runtime);
  const a = await connect(runtime, user), b = await connect(runtime, peer); const sa = await join(a), sb = await join(b); const aa = messages(a), bb = messages(b);
  const input = chatInput(sa, { kind: 'text', text: 'hello' }); const pending = send(a, input), retry = send(a, input); await gate.started;
  await flush(a, sa); await flush(b, sb); expect(aa).toEqual([]); expect(bb).toEqual([]); expect(gate.calls()).toBe(1);
  const second = send(a, chatInput(sa, { kind: 'text', text: 'thanks' })); await expect.poll(gate.calls).toBe(2);
  const budget = await send(a, chatInput(sa, { kind: 'canned', id: 'hello' })); expect(budget.ok).toBe(false); if (!budget.ok) expect(budget.error.code).toBe('RATE_LIMITED');
  const response = await runtime.app.http.inject({ method: 'POST', url: '/v1/blocks', headers: { origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': randomUUID() }, payload: { targetId: peer.me.profile.id, blocked: true } }); expect(response.statusCode).toBe(200);
  gate.release(); const result = await pending; expect(result.ok).toBe(true); expect(await retry).toEqual(result); expect((await second).ok).toBe(true); await flush(b, sb);
  expect(aa).toHaveLength(2); expect(bb).toEqual([]);
});

it('rejects abuse, ambiguous text and markup without broadcasting or automatically banning, while allowing explicit canned/emote choices', async () => {
  const runtime = await open(); const a = await connect(runtime, await guest(runtime)); const sa = await join(a); const seen = messages(a);
  for (const text of ['đm', 'context needs a human', '<script>hello</script>']) expect((await send(a, chatInput(sa, { kind: 'text', text }))).ok).toBe(false);
  await flush(a, sa); expect(seen).toEqual([]); expect(a.connected).toBe(true);
  expect((await send(a, chatInput(sa, { kind: 'canned', id: 'thanks' }))).ok).toBe(true);
  expect((await send(a, chatInput(sa, { kind: 'emote', id: 'wave' }))).ok).toBe(true); await flush(a, sa);
  expect(seen.map(event => event.content)).toEqual([{ kind: 'canned', id: 'thanks', text: 'Cảm ơn!' }, { kind: 'emote', id: 'wave' }]);
});

it('fails closed on classifier error or invalid decision and permits only separately requested safe fallback content', async () => {
  let invalid = false;
  const runtime = await open({ moderator: { inspect: async () => { if (invalid) return { decision: 'allow', role: 'admin' }; throw new Error('private-provider-detail'); } } });
  const a = await connect(runtime, await guest(runtime)), sa = await join(a); const seen = messages(a);
  const result = await send(a, chatInput(sa, { kind: 'text', text: 'hello' })); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('MODERATION_UNAVAILABLE'); expect(JSON.stringify(result)).not.toContain('private-provider-detail'); expect(seen).toEqual([]);
  expect((await send(a, chatInput(sa, { kind: 'canned', id: 'hello' }))).ok).toBe(true);
  invalid = true; expect((await send(a, chatInput(sa, { kind: 'text', text: 'hello' }))).ok).toBe(false);
  expect((await send(a, chatInput(sa, { kind: 'emote', id: 'nod' }))).ok).toBe(true); await flush(a, sa); expect(seen).toHaveLength(2);
});

it.each(['silent', 'canned'] as const)('enforces %s world rules even with an injected allowing moderator', async mode => {
  let calls = 0; const runtime = await open({ mode, moderator: { inspect: async () => { calls++; return { decision: 'allow' }; } } });
  const a = await connect(runtime, await guest(runtime)), sa = await join(a), seen = messages(a);
  expect((await send(a, chatInput(sa, { kind: 'text', text: 'hello' }))).ok).toBe(false);
  expect((await send(a, chatInput(sa, { kind: 'canned', id: 'hello' }))).ok).toBe(mode === 'canned');
  await flush(a, sa); expect(seen).toHaveLength(mode === 'canned' ? 1 : 0); expect(calls).toBe(0);
});

it('honors a deny-on-outage rule and recovers only after a validated moderation response', async () => {
  let healthy = false; const runtime = await open({ fallback: 'deny', moderator: { inspect: async () => { if (!healthy) throw new Error('offline'); return { decision: 'allow' }; } } });
  const a = await connect(runtime, await guest(runtime)), sa = await join(a), seen = messages(a);
  expect((await send(a, chatInput(sa, { kind: 'text', text: 'hello' }))).ok).toBe(false);
  expect((await send(a, chatInput(sa, { kind: 'canned', id: 'hello' }))).ok).toBe(false);
  await flush(a, sa); expect(seen).toEqual([]);
  healthy = true; expect((await send(a, chatInput(sa, { kind: 'text', text: 'hello' }))).ok).toBe(true);
  expect((await send(a, chatInput(sa, { kind: 'canned', id: 'hello' }))).ok).toBe(true); await flush(a, sa); expect(seen).toHaveLength(2);
});

it('closes pending moderation without broadcast or retained acceptance and ignores a late provider completion', async () => {
  const gate = gateModerator(); const runtime = await open({ moderator: gate.moderator });
  const a = await connect(runtime, await guest(runtime)), sa = await join(a), seen = messages(a);
  const pending = send(a, chatInput(sa, { kind: 'text', text: 'hello' })); await gate.started;
  runtime.app.chat.close(); expect((await pending).ok).toBe(false); gate.release();
  await expect.poll(() => runtime.app.chat.diagnostics().workerSlots).toBe(0); await flush(a, sa);
  expect(runtime.app.chat.diagnostics()).toMatchObject({ enabled: false, pending: 0, receipts: 0 }); expect(seen).toEqual([]);
});

it('bounds timed-out underlying classifier work and never emits late successes after providers eventually resolve', async () => {
  const releases: (() => void)[] = [];
  const runtime = await open({ moderator: { inspect: () => new Promise(resolve => { releases.push(() => resolve({ decision: 'allow' })); }) } });
  const a = await connect(runtime, await guest(runtime)), b = await connect(runtime, await guest(runtime)); const sa = await join(a), sb = await join(b); const aa = messages(a), bb = messages(b);
  const results = await Promise.all([send(a, chatInput(sa, { kind: 'text', text: 'hello' })), send(a, chatInput(sa, { kind: 'text', text: 'thanks' })), send(b, chatInput(sb, { kind: 'text', text: 'hello' })), send(b, chatInput(sb, { kind: 'text', text: 'thanks' }))]);
  expect(results.every(result => !result.ok && result.error.code === 'MODERATION_UNAVAILABLE')).toBe(true); expect(releases).toHaveLength(4);
  expect(runtime.app.chat.diagnostics()).toMatchObject({ pending: 0, workerSlots: 4, receipts: 0 });
  expect((await send(a, chatInput(sa, { kind: 'text', text: 'hello' }))).ok).toBe(false); expect(releases).toHaveLength(4);
  expect((await send(a, chatInput(sa, { kind: 'canned', id: 'hello' }))).ok).toBe(true);
  releases.forEach(release => release()); await expect.poll(() => runtime.app.chat.diagnostics().workerSlots).toBe(0); await flush(a, sa); await flush(b, sb);
  expect(aa).toHaveLength(1); expect(bb).toHaveLength(1); expect(aa[0].content.kind).toBe('canned'); expect(runtime.app.chat.diagnostics().pending).toBe(0);
});

it('shares quick-action flood limits across tabs and releases the account budget after its window', async () => {
  const runtime = await open(); const user = await guest(runtime), a = await connect(runtime, user), b = await connect(runtime, user); const sa = await join(a), sb = await join(b);
  for (let i = 0; i < 6; i++) expect((await send(i % 2 ? a : b, chatInput(i % 2 ? sa : sb, { kind: 'emote', id: 'wave' }))).ok).toBe(true);
  const denied = await send(b, chatInput(sb, { kind: 'canned', id: 'hello' })); expect(denied.ok).toBe(false); if (!denied.ok) expect(denied.error.code).toBe('RATE_LIMITED');
  runtime.advance(10001); expect((await send(a, chatInput(sa, { kind: 'canned', id: 'hello' }))).ok).toBe(true);
});

it.each(['leave', 'revoke', 'disable'] as const)('rechecks authority and admission after moderation when %s occurs', async action => {
  const gate = gateModerator(); const runtime = await open({ moderator: gate.moderator }); const user = await guest(runtime), a = await connect(runtime, user), b = await connect(runtime, await guest(runtime)); const sa = await join(a), sb = await join(b); const seen = messages(b);
  const pending = send(a, chatInput(sa, { kind: 'text', text: 'hello' })); await gate.started;
  if (action === 'leave') { const left = RoomAckSchema.parse(await a.timeout(5000).emitWithAck('room.leave', own(sa))); expect(left.ok).toBe(true); }
  else if (action === 'revoke') await runtime.pool.query('UPDATE identity_sessions SET revoked_at=now() WHERE account_id=$1', [user.me.profile.id]);
  else { await runtime.app.worlds.registry.setEnabled(runtime.fixtureSlug, false); await runtime.app.rooms.maintain(); }
  gate.release(); expect((await pending).ok).toBe(false);
  if (action !== 'disable') await flush(b, sb); expect(seen).toEqual([]);
});
