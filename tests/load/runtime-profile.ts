import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpus, totalmem, availableParallelism, release} from 'node:os';
import {performance} from 'node:perf_hooks';
import {request} from 'node:http';
import {writeFile, readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {io, type Socket} from 'socket.io-client';
import {MeSchema, RoomAckSchema, type RoomSnapshot} from '@virtual-city/contracts';
import {migrate} from '../../apps/platform-api/src/db/migrations';
import {startRoomProcess} from '../support/room-process';
import type {createApp} from '../../apps/platform-api/src/app';
import {evidenceOutput} from '../../scripts/evidence-output.mjs';

const count = Number(process.env.ROOM_PROFILE_ACTORS ?? 12);
assert(Number.isInteger(count) && count >= 8 && count <= 24, 'Profile actors must be8..24; unchanged handshake/session budgets apply');
const db = new URL(process.env.TEST_DATABASE_URL ?? '');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(db.hostname) && /^virtual_city_test(?:_|$)/.test(db.pathname.slice(1)), 'Disposable local database only');
const admin = new Pool({connectionString: db.toString()}), schema = 'runtime_profile_' + randomUUID().replaceAll('-', '');
db.searchParams.set('options', '-c search_path=' + schema); const pool = new Pool({connectionString: db.toString()});
const sockets = new Set<Socket>(), samples: Sample[] = [], attempts: {command: string; outcome: string; ms: number}[] = [];
type Diagnostics = ReturnType<Awaited<ReturnType<typeof createApp>>['diagnostics']>;
type Sample = {cpu: {user: number; system: number}; memory: {rss: number; heapUsed: number}; diagnostics: Diagnostics; traffic: {readBytes: number; writtenBytes: number}};
type Visitor = {cookie: string; csrf: string; socket: Socket; state?: RoomSnapshot; nextSeq: number};
let runtime: Awaited<ReturnType<typeof startRoomProcess>> | undefined, created = false, cancelled = false, sampling = false, sampler: Promise<void> | undefined;
let deltaPackets = 0, deltaBytes = 0, snapshotDeltas = 0, unknownPackets = 0;
let samplingFailure: unknown;
const deltaSizes: number[] = [];
function cancel() {cancelled = true; sampling = false; for (const socket of sockets) socket.close(); runtime?.child.kill('SIGTERM');}
process.once('SIGTERM', cancel); process.once('SIGINT', cancel); const deadline = setTimeout(cancel, 60000); deadline.unref();
function check() {assert(!cancelled, 'Profile cancelled or deadline exceeded');}
async function sample(): Promise<Sample> {
  check(); const child = runtime!.child, id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {child.off('message', receive); reject(Error('Profile IPC deadline'));}, 5000);
    function receive(message: unknown) {
      if (!message || typeof message !== 'object' || !('id' in message) || message.id !== id || !('diagnostics' in message) || !('cpu' in message) || !('memory' in message) || !('traffic' in message)) return;
      clearTimeout(timer); child.off('message', receive); resolve(message as Sample);
    }
    child.on('message', receive); child.send({type: 'sample', id});
  });
}
async function connect(visitor: Pick<Visitor, 'cookie' | 'csrf'>) {
  check(); const socket = io(runtime!.url, {forceNew: true, autoConnect: false, reconnection: false, timeout: 3000, transports: ['websocket'], extraHeaders: {origin: 'http://127.0.0.1:3300', cookie: visitor.cookie}, auth: {schemaVersion: 1, csrfToken: visitor.csrf}});
  sockets.add(socket);
  await new Promise<void>((resolve, reject) => {socket.once('connect', resolve); socket.once('connect_error', () => reject(Error('Profile handshake rejected'))); socket.connect();});
  socket.io.engine.on('packet', packet => {
    if (packet.type !== 'message' || typeof packet.data !== 'string' || !packet.data.startsWith('2["room.delta",')) return;
    try {const event = JSON.parse(packet.data.slice(1)); if (event[0] !== 'room.delta') return; const bytes = Buffer.byteLength(packet.data); deltaPackets++; deltaBytes += bytes; deltaSizes.push(bytes); if (event[1]?.state?.type === 'snapshot') snapshotDeltas++; else unknownPackets++;} catch {unknownPackets++;}
  });
  return socket;
}
const own = (visitor: Visitor) => ({schemaVersion: 1, requestId: randomUUID(), epoch: visitor.state!.epoch, roomId: visitor.state!.roomId, membershipId: visitor.state!.membershipId, clientSeq: visitor.nextSeq++});
async function guest(index: number) {
  check();
  const body = JSON.stringify({requestId: randomUUID(), displayName: 'Runtime Profile Visitor', avatarKey: 'mint'});
  return new Promise<{cookie: string; csrf: string}>((resolve, reject) => {
    const req = request(runtime!.url + '/v1/session/guest', {method: 'POST', localAddress: '127.30.0.' + (index + 1), headers: {origin: 'http://127.0.0.1:3300', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body)}}, response => {
      let data = ''; response.on('data', chunk => {data += chunk;}); response.on('end', () => {try {assert.equal(response.statusCode, 201); const me = MeSchema.parse(JSON.parse(data)); resolve({cookie: response.headers['set-cookie']![0].split(';')[0], csrf: me.csrfToken});} catch {reject(Error('Profile guest bootstrap rejected'));}});
    }); req.setTimeout(5000, () => req.destroy(Error('Profile guest timeout'))); req.once('error', reject); req.end(body);
  });
}
async function command(visitor: Visitor, name: string, input: unknown, expected = 'OK') {
  check(); const started = performance.now(); let recorded = false;
  try {
    const ack = RoomAckSchema.parse(await visitor.socket.timeout(5000).emitWithAck(name, input)), outcome = ack.ok ? 'OK' : ack.error.code;
    attempts.push({command: name, outcome, ms: performance.now() - started}); recorded = true; assert.equal(outcome, expected); return ack;
  } catch (error) {if (!recorded) attempts.push({command: name, outcome: 'TIMEOUT_OR_INVALID', ms: performance.now() - started}); throw error;}
}
async function join(visitor: Visitor) {
  const ack = await command(visitor, 'room.join', {schemaVersion: 1, requestId: randomUUID(), worldSlug: 'sdk-sandbox', worldVersion: '1.0.0', sceneVersion: '1.0.0', motionVersion: 1});
  assert(ack.ok && ack.result.type === 'snapshot'); visitor.state = ack.result; return ack.result;
}
const distribution = (values: number[]) => {const sorted = [...values].sort((a, b) => a - b), at = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null; return {count: values.length, p50: at(.5), p95: at(.95), p99: at(.99), max: at(1)};};
async function main() {
  const report: Record<string, unknown> = {result: 'FAIL', qualification: 'DIAGNOSTIC_ONLY', recordedAt: new Date().toISOString(), command: 'pnpm profile:runtime', cleanupComplete: false};
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), diff = execFileSync('git', ['diff', 'HEAD', '--binary']);
    report.sourceRevision = revision + '+workspace-sha256:' + createHash('sha256').update(diff).digest('hex');
    report.hardware = {node: process.version, kernel: release(), platform: process.platform, architecture: process.arch, cpuModel: cpus()[0]?.model, logicalCpus: cpus().length, availableParallelism: availableParallelism(), memoryBytes: totalmem()};
    const cgroup: Record<string, string> = {}; for (const name of ['cpu.max', 'memory.max']) {try {cgroup[name] = (await readFile('/sys/fs/cgroup/' + name, 'utf8')).trim();} catch {cgroup[name] = 'unavailable';}} report.cgroup = cgroup;
    await admin.query(`CREATE SCHEMA "${schema}"`); created = true; await migrate(pool);
    report.postgresVersion = (await pool.query("SELECT current_setting('server_version') AS version")).rows[0].version;
    check(); runtime = await startRoomProcess(db.toString(), randomUUID() + randomUUID());
    const visitors: Visitor[] = [];
    for (let i = 0; i < count; i++) {
      const user = await guest(i), visitor = {...user, socket: undefined as unknown as Socket, nextSeq: 0};
      const privacy: Response = await fetch(runtime.url + '/v1/me/privacy', {method: 'PATCH', headers: {origin: 'http://127.0.0.1:3300', cookie: user.cookie, 'x-csrf-token': user.csrf, 'idempotency-key': randomUUID(), 'content-type': 'application/json'}, body: JSON.stringify({presence: 'public', analyticsConsent: false, worldVisibility: {dating: 'hidden'}})}); assert.equal(privacy.status, 200);
      visitor.socket = await connect(visitor); visitors.push(visitor);
    }
    const before = await sample(), started = performance.now(); sampling = true;
    sampler = (async () => {while (sampling) {samples.push(await sample()); await delay(100);}})().catch(error => {samplingFailure = error; sampling = false;});
    await Promise.all(visitors.map(visitor => join(visitor)));
    assert.equal((await sample()).diagnostics.rooms.memberships, count);
    await Promise.all(visitors.map(visitor => command(visitor, 'room.snapshot', own(visitor))));
    for (const destination of [{x: 2, y: 3}, {x: 6, y: 3}]) {
      const moves = await Promise.all(visitors.map(visitor => command(visitor, 'room.move', {...own(visitor), destination})));
      const walkMs = Math.max(...moves.map(ack => ack.ok && ack.result.type === 'snapshot' ? (ack.result.self.motion?.path.length ?? 1) * 150 : 0)); await delay(walkMs + 100);
    }
    const seats = [...new Map(visitors.map(visitor => [visitor.state!.roomId, visitor])).values()];
    for (const visitor of seats) {
      const claim = {...own(visitor), seatId: 'seat-1'}; await command(visitor, 'seat.claim', claim);
      await Promise.all([command(visitor, 'seat.claim', claim), command(visitor, 'seat.claim', claim)]);
      await command(visitor, 'seat.release', {...own(visitor), seatId: 'seat-1'});
      await command(visitor, 'seat.claim', {...own(visitor), seatId: 'seat-1', clientSeq: 0}, 'IDEMPOTENCY_CONFLICT');
    }
    for (const visitor of visitors.slice(0, 2)) {const membership = visitor.state!.membershipId; visitor.socket.close(); visitor.socket = await connect(visitor); visitor.nextSeq = 0; assert.equal((await join(visitor)).membershipId, membership);}
    await Promise.all(visitors.map(visitor => command(visitor, 'room.leave', own(visitor))));
    sampling = false; await sampler; sampler = undefined; if (samplingFailure) throw samplingFailure;
    const after = await sample(), elapsedMs = performance.now() - started;
    assert.equal(after.diagnostics.rooms.memberships, 0); assert.equal(after.diagnostics.rooms.occupiedSeats, 0);
    assert(after.diagnostics.realtime.databaseObservation.status === 'active'); assert(after.diagnostics.realtime.phases.every(series => series.unsupportedDatabaseCalls === 0));
    assert(deltaPackets > 0 && deltaPackets === snapshotDeltas && unknownPackets === 0);
    const metrics = after.diagnostics.realtime;
    assert(metrics.phases.some(series => series.command === 'room.move' && series.outcome === 'OK' && series.timings.db_query.totalMs > 0 && series.timings.path_compute.totalMs > 0));
    assert(metrics.phases.some(series => series.outcome === 'IDEMPOTENCY_CONFLICT'));
    report.profile = {actors: count, rooms: Math.ceil(count / 8), capacityPerRoom: 8, publicSyntheticProfiles: true, motionVersion: 1, moveWaves: 2, reconnects: 2, limitsChanged: false, elapsedMs, sampleIntervalMs: 100, includesSetupInPhaseTotals: true};
    report.roundTripMs = Object.fromEntries([...new Set(attempts.map(item => item.command))].map(name => {const values = attempts.filter(item => item.command === name); return [name, {all: distribution(values.map(item => item.ms)), successful: distribution(values.filter(item => item.outcome === 'OK').map(item => item.ms)), rejected: distribution(values.filter(item => item.outcome !== 'OK').map(item => item.ms)), outcomes: Object.fromEntries([...new Set(values.map(item => item.outcome))].map(outcome => [outcome, values.filter(item => item.outcome === outcome).length]))}];}));
    report.server = {cpuMs: (after.cpu.user + after.cpu.system - before.cpu.user - before.cpu.system) / 1000, rssPeakSampled: Math.max(...samples.map(sample => sample.memory.rss)), heapPeakSampled: Math.max(...samples.map(sample => sample.memory.heapUsed)), eventLoop: metrics.eventLoop, phases: metrics.phases, phaseScope: metrics.phaseScope, databaseObservation: metrics.databaseObservation, droppedDeltas: metrics.droppedDeltas, slowConsumerDisconnects: metrics.slowConsumerDisconnects};
    report.delivery = {kind: 'Full viewer snapshot carried in room.delta', socketIoTextPayload: {packets: deltaPackets, bytes: deltaBytes, sizesBytes: distribution(deltaSizes)}, stateTypeSnapshotPackets: snapshotDeltas, unsupportedPackets: unknownPackets, applicationTcpBytes: {read: after.traffic.readBytes - before.traffic.readBytes, written: after.traffic.writtenBytes - before.traffic.writtenBytes}, scope: 'Observed Socket.IO text payload excludes Engine.IO/WebSocket/TLS framing; separate application TCP counters include socket/HTTP framing, not DB traffic'};
    report.limitations = ['Short shared-host loopback synthetic SDK sandbox; no TLS/WAN/browser, orders or production capacity qualification', 'Client round-trip includes authentication, queue, service and transport; no isolated one-way network latency or subtraction of percentiles', 'Owner-context timings are nested wall observations, not additive CPU decomposition; path_compute covers selected synchronous pathfinding only', 'DB timings cover initiated pg Promise/callback queries; coalesced/background work is unattributed; unsupported calls make coverage incomplete', 'Phase/event-loop totals include setup; process CPU/traffic use a measured workload window; generator/DB CPU share host but are excluded from API CPU', 'Sparse deltas, per-room mailboxes, native clients, public worlds and quota changes are not implemented by this profile'];
    report.result = 'PASS';
  } catch (error) {report.error = error instanceof Error ? error.message : 'Runtime profile failed'; process.exitCode = 1;}
  finally {
    sampling = false; for (const socket of sockets) socket.close();
    try {await sampler;} catch { /* Original failure remains recorded. */ }
    try {
      if (runtime) {let forced = false; const killer = setTimeout(() => {forced = true; runtime?.child.kill('SIGKILL');}, 5000); try {await runtime.stop();} finally {clearTimeout(killer);} if (forced) {report.forcedRuntimeKill = true; report.result = 'FAIL'; process.exitCode = 1;}}
      await pool.end(); if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); report.cleanupComplete = true;
    } catch {report.cleanupComplete = false; report.result = 'FAIL'; process.exitCode = 1;}
    if (cancelled) {report.result = 'FAIL'; report.cancelled = true; process.exitCode = 1;}
    clearTimeout(deadline); process.off('SIGTERM', cancel); process.off('SIGINT', cancel);
    const output = evidenceOutput('docs/agent/evidence/n05-runtime-profile.json'); report.artifact = output; await writeFile(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
  }
}
void main();
