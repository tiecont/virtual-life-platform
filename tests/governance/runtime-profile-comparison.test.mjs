import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compareRuntimeProfiles} from '../../scripts/compare-runtime-profiles.mjs';

function fixture() {
  const distribution = count => ({count, p50: count ? 5 : null, p95: count ? 10 : null, p99: count ? 15 : null, max: count ? 20 : null});
  const outcomes = [14, 12, 24, 8, 2, 12];
  return {
    result: 'PASS', qualification: 'DIAGNOSTIC_ONLY', cleanupComplete: true,
    sourceRevision: 'a'.repeat(40) + '+workspace-sha256:' + 'b'.repeat(64),
    profile: {actors: 12, rooms: 2, capacityPerRoom: 8, publicSyntheticProfiles: true, motionVersion: 1, moveWaves: 2, reconnects: 2, limitsChanged: false, sampleIntervalMs: 100, includesSetupInPhaseTotals: true, elapsedMs: 5000},
    roundTripMs: Object.fromEntries(['room.join', 'room.snapshot', 'room.move', 'seat.claim', 'seat.release', 'room.leave'].map((name, i) => [name, {all: distribution(outcomes[i]), successful: distribution(name === 'seat.claim' ? 6 : outcomes[i]), rejected: distribution(name === 'seat.claim' ? 2 : 0), outcomes: name === 'seat.claim' ? {OK: 6, IDEMPOTENCY_CONFLICT: 2} : {OK: outcomes[i]}}])),
    server: {cpuMs: 100, rssPeakSampled: 200, heapPeakSampled: 50, eventLoop: {status: 'available', p95Ms: 20}, databaseObservation: {status: 'active'}, phases: [{databaseErrors: 0, unsupportedDatabaseCalls: 0}], droppedDeltas: 0, slowConsumerDisconnects: 0},
    delivery: {kind: 'Full viewer snapshot carried in room.delta', unsupportedPackets: 0, stateTypeSnapshotPackets: 100, socketIoTextPayload: {packets: 100, bytes: 1000, sizesBytes: {p95: 10}}},
    hardware: {node: 'v26.9.0', kernel: 'local', platform: 'linux', architecture: 'x64', cpuModel: 'fixture', logicalCpus: 4, availableParallelism: 4, memoryBytes: 1024},
    cgroup: {'cpu.max': 'unavailable', 'memory.max': 'unavailable'}, postgresVersion: '17.7',
  };
}
test('comparison preserves accepted/rejected scope and reports a diagnostic difference without a performance verdict', () => {
  const before = fixture(), after = fixture(); after.server.cpuMs = 150; after.roundTripMs['room.move'].successful.p95 = 12;
  const result = compareRuntimeProfiles(before, after);
  assert.equal(result.result, 'COMPARABLE_DIAGNOSTICS'); assert.equal(result.qualification, 'DIAGNOSTIC_ONLY');
  assert.deepEqual(result.cpuMs, {before: 100, after: 150, difference: 50});
  assert.deepEqual(result.successfulP95Ms['room.move'], {before: 10, after: 12, difference: 2});
  assert.equal(JSON.stringify(result).includes('capacityPassed'), false);
  assert.equal(before.server.cpuMs, 100);
});
test('comparison fails closed for changed environments, budgets, failures and incomplete observed outcomes', () => {
  const mutations = [
    r => {r.result = 'FAIL';}, r => {r.cleanupComplete = false;}, r => {r.cancelled = true;},
    r => {r.hardware.node = 'different';}, r => {delete r.hardware.cpuModel;}, r => {r.cgroup['cpu.max'] = '100 100';},
    r => {r.postgresVersion = '18';}, r => {r.profile.limitsChanged = true;}, r => {r.profile.actors = 24;},
    r => {r.roundTripMs['room.move'].outcomes = {OK: 23, TIMEOUT_OR_INVALID: 1};},
    r => {r.roundTripMs['seat.claim'].successful.count = 8;}, r => {delete r.roundTripMs['room.leave'];},
    r => {r.roundTripMs['room.move'].successful.p95 = NaN;}, r => {r.server.databaseObservation.status = 'not_attached';},
    r => {r.server.phases[0].unsupportedDatabaseCalls = 1;}, r => {r.server.droppedDeltas = 1;},
    r => {r.delivery.unsupportedPackets = 1;}, r => {r.delivery.stateTypeSnapshotPackets = 99;},
    r => {r.sourceRevision = 'unknown';}, r => {r.server.eventLoop.status = 'warming';},
  ];
  for (const mutate of mutations) {const after = fixture(); mutate(after); assert.throws(() => compareRuntimeProfiles(fixture(), after));}
});
