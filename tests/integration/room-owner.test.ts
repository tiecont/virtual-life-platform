import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { MeSchema, RoomAckSchema, type RoomSnapshot } from '@virtual-city/contracts';
import { RoomRecovery, defineWorld } from '@virtual-city/world-sdk';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import { ROOM_OWNER_LOCK_CLASS } from '../../apps/platform-api/src/rooms/authority';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { startRoomProcess } from '../support/room-process';

let admin: Pool; let pool: Pool; let schema: string; let databaseUrl: string;
const secret = 'room-owner-test-only-session-secret-0000001'; const origin = 'http://127.0.0.1:3300';
const processes = new Set<Awaited<ReturnType<typeof startRoomProcess>>>(); const clients = new Set<Socket>();
beforeAll(() => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Local test DB only');
  admin = new Pool({ connectionString: url.toString() });
});
beforeEach(async () => {
  schema = 'room_owner_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema); databaseUrl = url.toString();
  pool = new Pool({ connectionString: databaseUrl }); await migrate(pool);
});
afterEach(async () => {
  for (const client of clients) client.close(); clients.clear();
  for (const process of processes) { process.child.kill('SIGCONT'); await process.stop(); } processes.clear();
  await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});
afterAll(async () => { await admin.end(); });
async function runtime(port = 0) { const process = await startRoomProcess(databaseUrl, secret, port); processes.add(process); return process; }
async function guest(url: string) {
  const response = await fetch(url + '/v1/session/guest', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ requestId: randomUUID(), displayName: 'Owner test visitor', avatarKey: 'mint' }) });
  expect(response.status).toBe(201); return { cookie: response.headers.getSetCookie()[0].split(';')[0], me: MeSchema.parse(await response.json()) };
}
async function connect(url: string, user: Awaited<ReturnType<typeof guest>>) {
  const socket = io(url, { forceNew: true, autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } });
  clients.add(socket); await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); }); return socket;
}
const joinInput = (slug = 'sdk-sandbox') => ({ schemaVersion: 1, requestId: randomUUID(), worldSlug: slug, worldVersion: '1.0.0', sceneVersion: '1.0.0' });
const ownInput = (s: RoomSnapshot) => ({ schemaVersion: 1, requestId: randomUUID(), epoch: s.epoch, roomId: s.roomId, membershipId: s.membershipId });
const command = async (client: Socket, name: string, input: unknown) => RoomAckSchema.parse(await client.timeout(5000).emitWithAck(name, input));
async function join(client: Socket) { const ack = await command(client, 'room.join', joinInput()); if (!ack.ok || ack.result.type !== 'snapshot') throw new Error('Expected successful snapshot'); return ack.result; }
async function terminateOwner() {
  const owners = await admin.query<{ pid: number }>("SELECT pid FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid=$1::oid AND objid=((hashtext($2)::bigint & 4294967295)::oid) AND objsubid=2 AND granted", [ROOM_OWNER_LOCK_CLASS, schema]);
  expect(owners.rows).toHaveLength(1);
  // Only a backend identified by this disposable test schema's advisory key is terminated.
  expect((await admin.query('SELECT pg_terminate_backend($1) AS terminated', [owners.rows[0].pid])).rows[0].terminated).toBe(true);
}

it.each(['SIGTERM', 'SIGKILL'] as const)('recovers after actual %s and same-port restart with a fresh epoch and no phantom seat', async signal => {
  const first = await runtime(); const user = await guest(first.url); const client = await connect(first.url, user);
  const recovery = new RoomRecovery(); const initial = await join(client); recovery.acceptSnapshot(recovery.beginSync(), initial);
  client.on('room.ended', event => recovery.ended(event)); client.on('disconnect', () => recovery.disconnect());
  expect((await command(client, 'seat.claim', { ...ownInput(initial), seatId: 'seat-1' })).ok).toBe(true);
  const ended: unknown[] = []; client.on('room.ended', event => ended.push(event));
  const closed = new Promise<void>(resolve => client.once('disconnect', () => resolve())); await first.stop(signal); await closed;
  if (signal === 'SIGTERM') {
    expect(ended).toEqual([{ schemaVersion: 1, epoch: initial.epoch, roomId: initial.roomId, reason: 'server-stopping' }]);
    expect(recovery.view).toMatchObject({ status: 'interrupted', reason: 'server-stopping', snapshot: null });
  } else expect(recovery.view).toMatchObject({ status: 'reconnecting', snapshot: null });
  const replacement = await runtime(Number(new URL(first.url).port)); const fresh = await connect(replacement.url, user);
  const stale = await command(fresh, 'room.snapshot', ownInput(initial)); expect(stale.ok).toBe(false); if (!stale.ok) expect(stale.error.code).toBe('NOT_IN_ROOM');
  const snapshot = await join(fresh); recovery.acceptSnapshot(recovery.beginSync(), snapshot);
  expect(snapshot.epoch).not.toBe(initial.epoch); expect(snapshot.membershipId).not.toBe(initial.membershipId);
  expect(snapshot.occupancy).toBe(1); expect(snapshot.self.seatId).toBeNull(); expect(snapshot.seats.every(s => s.state === 'available')).toBe(true);
  expect(recovery.view).toMatchObject({ status: 'active', reason: 'membership-reset' });
});

it('rejects a second live process, then denies the old owner after SIGSTOP, lost authority backend and takeover', async () => {
  const first = await runtime(); const second = await runtime(); const user = await guest(first.url);
  const a = await connect(first.url, user); const b = await connect(second.url, user); const initial = await join(a);
  expect((await command(a, 'seat.claim', { ...ownInput(initial), seatId: 'seat-1' })).ok).toBe(true);
  const rejected = await command(b, 'room.join', joinInput()); expect(rejected.ok).toBe(false); if (!rejected.ok) expect(rejected.error.code).toBe('WORLD_UNAVAILABLE');
  expect((await fetch(second.url + '/health/ready')).status).toBe(503);
  const interrupted = new Promise<unknown>(resolve => a.once('room.ended', resolve));
  const closed = new Promise<void>(resolve => a.once('disconnect', () => resolve()));
  first.child.kill('SIGSTOP');
  try {
    await terminateOwner();
    const taken = await join(b); expect(taken.epoch).not.toBe(initial.epoch); expect(taken.self.seatId).toBeNull();
    expect((await command(b, 'seat.claim', { ...ownInput(taken), seatId: 'seat-1' })).ok).toBe(true);
  } finally { first.child.kill('SIGCONT'); }
  expect(await interrupted).toEqual({ schemaVersion: 1, epoch: initial.epoch, roomId: initial.roomId, reason: 'authority-lost' }); await closed;
  expect((await fetch(first.url + '/health/ready')).status).toBe(503);
  const old = await connect(first.url, user); const denied = await command(old, 'seat.claim', { ...ownInput(initial), seatId: 'seat-1' });
  expect(denied.ok).toBe(false); if (!denied.ok) expect(denied.error.code).toBe('WORLD_UNAVAILABLE');
  await second.stop();
  const stillDenied = await command(old, 'room.join', joinInput()); expect(stillDenied.ok).toBe(false); if (!stillDenied.ok) expect(stillDenied.error.code).toBe('WORLD_UNAVAILABLE');
});

it('never acknowledges or publishes a paused admission after losing its dedicated lock connection', async () => {
  let began!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; }); const delayed = new Promise<void>(resolve => { release = resolve; });
  const local = await createApp(readConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, SESSION_SECRET: secret }), pool, false, { worlds: { modules: [defineWorld({ schemaVersion: 1, apiVersion: 1, slug: 'owner-loss-fixture', title: 'Owner loss fixture', version: '1.0.0', sceneRef: { key: 'owner-loss', version: '1.0.0' }, capacity: 8, capabilities: ['presence'], kind: 'sandbox', accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: 0.5, y: 0.5 }, icon: 'flask' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => { began(); await delayed; }, onLeave: async () => {}, onCommand: async () => {} })] } });
  await local.app.listen(0, '127.0.0.1'); await local.worlds.registry.setEnabled('owner-loss-fixture', true);
  try {
    const url = await local.app.getUrl(); const user = await guest(url); const client = await connect(url, user);
    let successful = 0; let deltas = 0; client.on('room.delta', () => deltas++);
    const outcome = client.timeout(2000).emitWithAck('room.join', joinInput('owner-loss-fixture')).then(ack => { if (RoomAckSchema.parse(ack).ok) successful++; }, () => {});
    await started; await terminateOwner();
    await expect.poll(() => local.diagnostics().authority).toBe('lost');
    const replacement = await runtime(); const next = await connect(replacement.url, user); await join(next);
    release(); await outcome; await local.rooms.maintain();
    expect(successful).toBe(0); expect(deltas).toBe(0); expect(local.rooms.diagnostics().memberships).toBe(0);
    expect((await fetch(url + '/health/ready')).status).toBe(503);
  } finally { release(); await local.app.close(); }
});
