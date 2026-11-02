import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { availableParallelism, cpus, totalmem, platform, release } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { MeSchema, RoomAckSchema, type RoomSnapshot } from '@virtual-city/contracts';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import { startRoomProcess } from '../support/room-process';

const socketCount = Number(process.env.ROOM_LOAD_SOCKETS ?? 24);
assert(Number.isInteger(socketCount) && socketCount >= 2 && socketCount <= 24, 'Keep baseline within unchanged loopback handshake budget (24 sockets + 4 reconnects)');
const schema = 'room_load_' + randomUUID().replaceAll('-', '');
const db = new URL(process.env.TEST_DATABASE_URL ?? '');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(db.hostname) && /^virtual_city_test(?:_|$)/.test(db.pathname.slice(1)), 'Local disposable DB only');
const admin = new Pool({ connectionString: db.toString() }); db.searchParams.set('options', '-c search_path=' + schema);
const pool = new Pool({ connectionString: db.toString() });
const clients = new Set<Socket>();
type Runtime = Awaited<ReturnType<typeof startRoomProcess>>;
type Sample = { cpu: { user: number; system: number }; memory: { rss: number; heapUsed: number }; diagnostics: ReturnType<Awaited<ReturnType<typeof import('../../apps/platform-api/src/app').createApp>>['diagnostics']> };
type Visitor = { cookie: string; csrf: string; socket: Socket; snapshot?: RoomSnapshot };
let runtime: Runtime | undefined;
async function post(url: string, i: number) {
  const body = JSON.stringify({ requestId: randomUUID(), displayName: 'Local load fixture', avatarKey: 'mint' });
  return new Promise<{ cookie: string; csrf: string }>((resolve, reject) => {
    const req = request(url + '/v1/session/guest', { method: 'POST', localAddress: '127.20.0.' + (i + 1), headers: { origin: 'http://127.0.0.1:3300', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { assert.equal(res.statusCode, 201); resolve({ cookie: res.headers['set-cookie']![0].split(';')[0], csrf: MeSchema.parse(JSON.parse(data)).csrfToken }); }
        catch (error) { reject(error); }
      });
    }); req.on('error', reject); req.end(body);
  });
}
async function connect(user: Pick<Visitor, 'cookie' | 'csrf'>) {
  const socket = io(runtime!.url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], extraHeaders: { origin: 'http://127.0.0.1:3300', cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.csrf } });
  clients.add(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  return socket;
}
async function command(socket: Socket, name: string, payload: unknown) {
  const ack = RoomAckSchema.parse(await socket.timeout(10000).emitWithAck(name, payload));
  assert(ack.ok, `Expected successful ${name}, received ${!ack.ok && ack.error.code}`);
  return ack.result;
}
const joinInput = () => ({ schemaVersion: 1, requestId: randomUUID(), worldSlug: 'sdk-sandbox', worldVersion: '1.0.0', sceneVersion: '1.0.0' });
const ownInput = (snapshot: RoomSnapshot) => ({ schemaVersion: 1, requestId: randomUUID(), epoch: snapshot.epoch, roomId: snapshot.roomId, membershipId: snapshot.membershipId });
async function sample(): Promise<Sample> {
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { runtime!.child.off('message', receive); reject(new Error('Server diagnostics timeout')); }, 5000);
    function receive(message: unknown) {
      if (typeof message !== 'object' || !message || !('id' in message) || message.id !== id || !('cpu' in message) || !('memory' in message) || !('diagnostics' in message)) return;
      clearTimeout(timer); runtime!.child.off('message', receive); resolve(message as Sample);
    }
    runtime!.child.on('message', receive); runtime!.child.send({ type: 'sample', id });
  });
}
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
async function main() {
try {
  await admin.query(`CREATE SCHEMA "${schema}"`); await migrate(pool);
  runtime = await startRoomProcess(db.toString(), randomUUID() + randomUUID());
  const visitors: Visitor[] = [];
  for (let i = 0; i < socketCount; i++) {
    const user = await post(runtime.url, i); visitors.push({ ...user, socket: await connect(user) });
    // Real privacy update exercises viewer-visible profiles in the fanout baseline.
    const response: Response = await fetch(runtime.url + '/v1/me/privacy', { method: 'PATCH', headers: { origin: 'http://127.0.0.1:3300', cookie: user.cookie, 'x-csrf-token': user.csrf, 'idempotency-key': randomUUID(), 'content-type': 'application/json' }, body: JSON.stringify({ presence: 'public', analyticsConsent: false, worldVisibility: { dating: 'hidden' } }) });
    assert.equal(response.status, 200);
  }
  const samples: Sample[] = []; const before = await sample(); const start = performance.now(); let sampling = true;
  const sampler = (async () => { while (sampling) { samples.push(await sample()); await delay(100); } })();
  let joins: number[] = []; let reconnects: number[] = []; let peak!: Sample;
  try {
    joins = await Promise.all(visitors.map(async visitor => {
      const started = performance.now(); const snapshot = await command(visitor.socket, 'room.join', joinInput());
      assert(snapshot.type === 'snapshot'); visitor.snapshot = snapshot; return performance.now() - started;
    }));
    peak = await sample(); samples.push(peak);
    assert.equal(peak.diagnostics.sockets, socketCount); assert.equal(peak.diagnostics.rooms.memberships, socketCount);
    assert.equal(peak.diagnostics.rooms.rooms, Math.ceil(socketCount / 8));
    await Promise.all(visitors.map(visitor => command(visitor.socket, 'room.snapshot', ownInput(visitor.snapshot!))));
    await delay(2000);
    const reconnecting = visitors.slice(0, Math.min(4, socketCount));
    for (const visitor of reconnecting) visitor.socket.close();
    reconnects = await Promise.all(reconnecting.map(async visitor => {
      const started = performance.now(); visitor.socket = await connect(visitor);
      const snapshot = await command(visitor.socket, 'room.join', joinInput()); assert(snapshot.type === 'snapshot');
      assert.equal(snapshot.membershipId, visitor.snapshot!.membershipId); assert.equal(snapshot.occupancy <= 8, true);
      visitor.snapshot = snapshot; return performance.now() - started;
    }));
    await Promise.all(visitors.map(visitor => command(visitor.socket, 'room.leave', ownInput(visitor.snapshot!))));
  } finally { sampling = false; await sampler; }
  const elapsedMs = performance.now() - start; const after = await sample(); samples.push(after);
  assert.equal(after.diagnostics.rooms.memberships, 0); assert.equal(after.diagnostics.rooms.occupiedSeats, 0);
  const cpuMs = ((after.cpu.user - before.cpu.user) + (after.cpu.system - before.cpu.system)) / 1000;
  async function cgroup(name: string) { try { return (await readFile('/sys/fs/cgroup/' + name, 'utf8')).trim(); } catch { return 'unavailable'; } }
  const report = {
    recordedAt: new Date().toISOString(), profile: 'loopback synthetic SDK sandbox; real HTTP identity/privacy + Socket.IO; isolated child API process; PostgreSQL tmpfs',
    command: 'pnpm bench:rooms', hardware: { platform: platform(), release: release(), node: process.version, cpuModel: cpus()[0]?.model, logicalCpus: cpus().length, availableParallelism: availableParallelism(), hostMemoryBytes: totalmem(), cgroupCpuMax: await cgroup('cpu.max'), cgroupMemoryMax: await cgroup('memory.max') },
    load: { uniqueAccounts: socketCount, peakActualSockets: peak.diagnostics.sockets, rooms: peak.diagnostics.rooms.rooms, capacityPerRoom: 8, simultaneousJoinAttempts: socketCount, reconnectBurst: reconnects.length, steadyHoldMs: 2000, elapsedMs },
    latencyMs: { join: { samples: joins.length, p50: percentile(joins, .5), p95: percentile(joins, .95), max: Math.max(...joins) }, reconnectIncludingHandshake: { samples: reconnects.length, p95: percentile(reconnects, .95), max: Math.max(...reconnects) } },
    serverProcess: { cpuMs, cpuPercentOfOneCore: cpuMs / elapsedMs * 100, rssBefore: before.memory.rss, rssPeakSampled: Math.max(...samples.map(s => s.memory.rss)), rssAfter: after.memory.rss, heapUsedPeakSampled: Math.max(...samples.map(s => s.memory.heapUsed)), sampleIntervalMs: 100 },
    diagnostics: after.diagnostics,
    limits: ['Single short local baseline, no TLS/WAN/browser rendering, not production capacity or maximum CCU', 'tsx test server; bootstrap outside measured window; client/DB CPU excluded from server CPU but share host', 'RSS high-water is sampled, not an OS-enforced peak; small sample p95 must not be extrapolated', 'No rate limits raised; unique loopback source addresses used for HTTP guest bootstrap', 'No public/restricted worlds, travel, chat or production deployment'],
  };
  await mkdir('docs/agent/evidence', { recursive: true });
  await writeFile('docs/agent/evidence/m06-network-baseline.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const socket of clients) socket.close(); await runtime?.stop();
  await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end();
}
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Load baseline failed'); process.exitCode = 1; });
