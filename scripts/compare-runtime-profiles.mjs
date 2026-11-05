import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const commands = ['room.join', 'room.snapshot', 'room.move', 'seat.claim', 'seat.release', 'room.leave'];
const workloadKeys = ['actors', 'rooms', 'capacityPerRoom', 'publicSyntheticProfiles', 'motionVersion', 'moveWaves', 'reconnects', 'limitsChanged', 'sampleIntervalMs', 'includesSetupInPhaseTotals'];
function finite(value) {assert(Number.isFinite(value) && value >= 0, 'Missing or invalid measurement'); return value;}
function validate(report) {
  assert(report.result === 'PASS' && report.qualification === 'DIAGNOSTIC_ONLY' && report.cleanupComplete === true && !report.cancelled, 'Incomplete or failed profile');
  assert(/^[a-f0-9]{40}\+workspace-sha256:[a-f0-9]{64}$/.test(report.sourceRevision), 'Missing measured source identity');
  const p = report.profile;
  assert(Number.isInteger(p.actors) && p.actors >= 8 && p.actors <= 24 && p.rooms === Math.ceil(p.actors / 8), 'Unsupported workload');
  assert(p.capacityPerRoom === 8 && p.publicSyntheticProfiles === true && p.motionVersion === 1 && p.moveWaves === 2 && p.reconnects === 2 && p.limitsChanged === false && p.sampleIntervalMs === 100 && p.includesSetupInPhaseTotals === true, 'Workload/budgets changed');
  finite(p.elapsedMs);
  assert.deepEqual(Object.keys(report.roundTripMs).sort(), [...commands].sort(), 'Missing or unexpected command');
  const counts = [p.actors + 2, p.actors, 2 * p.actors, 4 * p.rooms, p.rooms, p.actors];
  for (const [i, command] of commands.entries()) {
    const row = report.roundTripMs[command], expected = command === 'seat.claim' ? {OK: 3 * p.rooms, IDEMPOTENCY_CONFLICT: p.rooms} : {OK: counts[i]};
    assert.deepEqual(row.outcomes, expected, 'Unexpected command outcome/count');
    assert.equal(row.all.count, counts[i]); assert.equal(row.successful.count, expected.OK); assert.equal(row.rejected.count, expected.IDEMPOTENCY_CONFLICT ?? 0);
    for (const key of ['all', 'successful', 'rejected']) {
      const distribution = row[key];
      for (const metric of ['p50', 'p95', 'p99', 'max']) {if (distribution.count) finite(distribution[metric]); else assert.equal(distribution[metric], null);}
      if (distribution.count) assert(distribution.p50 <= distribution.p95 && distribution.p95 <= distribution.p99 && distribution.p99 <= distribution.max, 'Invalid percentile order');
    }
  }
  const server = report.server, delivery = report.delivery;
  assert.equal(server.databaseObservation.status, 'active');
  assert.equal(server.droppedDeltas, 0); assert.equal(server.slowConsumerDisconnects, 0);
  assert(server.phases.length > 0 && server.phases.every(row => row.databaseErrors === 0 && row.unsupportedDatabaseCalls === 0), 'Incomplete database coverage or error');
  assert.equal(server.eventLoop.status, 'available'); finite(server.eventLoop.p95Ms);
  for (const key of ['cpuMs', 'rssPeakSampled', 'heapPeakSampled']) finite(server[key]);
  assert.equal(delivery.kind, 'Full viewer snapshot carried in room.delta');
  assert.equal(delivery.unsupportedPackets, 0);
  assert(delivery.stateTypeSnapshotPackets > 0 && delivery.stateTypeSnapshotPackets === delivery.socketIoTextPayload.packets, 'Unknown delivery shape');
  finite(delivery.socketIoTextPayload.bytes); finite(delivery.socketIoTextPayload.sizesBytes.p95);
  assert(typeof report.postgresVersion === 'string' && report.postgresVersion.length > 0 && report.cgroup, 'Missing environment');
  for (const key of ['node', 'kernel', 'platform', 'architecture', 'cpuModel']) assert(typeof report.hardware?.[key] === 'string' && report.hardware[key].length > 0, 'Missing hardware/runtime identity');
  for (const key of ['logicalCpus', 'availableParallelism', 'memoryBytes']) assert(finite(report.hardware[key]) > 0, 'Missing hardware size');
  for (const key of ['cpu.max', 'memory.max']) assert(typeof report.cgroup[key] === 'string' && report.cgroup[key].length > 0, 'Missing cgroup observation');
}

// This is a diagnostic comparison, never a capacity/optimization or release gate.
export function compareRuntimeProfiles(before, after) {
  validate(before); validate(after);
  for (const key of ['hardware', 'cgroup', 'postgresVersion']) assert.deepEqual(after[key], before[key], 'Environment mismatch: ' + key);
  for (const key of workloadKeys) assert.deepEqual(after.profile[key], before.profile[key], 'Workload mismatch: ' + key);
  const pair = (a, b) => ({before: a, after: b, difference: b - a});
  return {
    result: 'COMPARABLE_DIAGNOSTICS', qualification: 'DIAGNOSTIC_ONLY', sourceRevisions: [before.sourceRevision, after.sourceRevision],
    workload: Object.fromEntries(workloadKeys.map(key => [key, before.profile[key]])), environment: {...before.hardware, cgroup: before.cgroup, postgresVersion: before.postgresVersion},
    successfulP95Ms: Object.fromEntries(commands.map(command => [command, pair(before.roundTripMs[command].successful.p95, after.roundTripMs[command].successful.p95)])),
    cpuMs: pair(before.server.cpuMs, after.server.cpuMs), rssPeakSampledBytes: pair(before.server.rssPeakSampled, after.server.rssPeakSampled),
    eventLoopP95Ms: pair(before.server.eventLoop.p95Ms, after.server.eventLoop.p95Ms),
    snapshotTextBytes: pair(before.delivery.socketIoTextPayload.bytes, after.delivery.socketIoTextPayload.bytes),
    snapshotTextPackets: pair(before.delivery.socketIoTextPayload.packets, after.delivery.socketIoTextPayload.packets),
    limitations: ['One pair on a shared host; no statistical equivalence, causal improvement, SLO or capacity conclusion', 'Source identity pins the reported checkout/diff, not a production image; inspect source changes independently', 'DB/projection phase sums overlap; no subtraction of percentiles or CPU inference', 'Snapshot text bytes exclude transport framing; generator and database share hardware'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length, 4, 'Usage: node scripts/compare-runtime-profiles.mjs BEFORE.json AFTER.json');
    const buffers = await Promise.all(process.argv.slice(2).map(file => readFile(file)));
    assert(buffers.every(buffer => buffer.length <= 2 * 1024 * 1024), 'Oversized profile');
    const result = compareRuntimeProfiles(...buffers.map(buffer => JSON.parse(buffer.toString('utf8'))));
    result.inputSha256 = buffers.map(buffer => createHash('sha256').update(buffer).digest('hex'));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {console.error(error instanceof Error ? error.message : 'Invalid profiles'); process.exitCode = 1;}
}
