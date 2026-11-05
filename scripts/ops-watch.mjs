import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { summarize } from './plan-status.mjs';
import { checkRelease } from './verify-release.mjs';

export function watchReport(watch, stage, backup, safety, budget) {
  assert.equal(watch.schemaVersion, 1);
  assert.equal(watch.scope, 'offline-preparation');
  for (const key of ['publicRelease', 'collectorInstalled', 'alertDeliveryTested', 'automaticActions']) assert.equal(watch[key], false);
  for (const key of ['actualMonthlySpendCents', 'consentedReturnRetentionRate', 'publicSafetyIncidentCount']) assert.equal(watch[key], null, 'Unknown operational data must remain unknown');
  assert.equal(watch.proposedSampleSeconds, 30); assert.equal(watch.proposedWatchSeconds, 900);
  assert.deepEqual(watch.signals.map(signal => signal.id), ['errors', 'occupancy', 'record-retention', 'return-retention', 'safety', 'costs', 'database-backup']);
  assert.equal(stage.result, 'PASS'); assert.equal(backup.result, 'PASS');
  assert.equal(stage.publicRelease, false); assert.equal(backup.publicRelease, false);
  const sample = stage.privateOperatorTelemetry;
  for (const key of ['httpRequests', 'httpErrors', 'online']) assert(Number.isSafeInteger(sample[key]) && sample[key] >= 0);
  assert(sample.httpErrors <= sample.httpRequests && sample.errorsIncludeExpectedDenials === true);
  assert.equal(sample.publicEdgeDenied, true);
  assert.equal(backup.journal.count, 38); assert.equal(backup.cleanupComplete, true);
  assert.equal(safety.cases, 1); assert.equal(safety.initialAutomaticSanctions, 0);
  assert.equal(budget.vendorQuotesVerified, false); assert.equal(budget.purchasesApproved, false);
  return {
    scope: 'historical-local-rehearsal-observations;not-live-monitoring', publicRelease: false,
    errors: { status: 'LOCAL_SAMPLE', requests: sample.httpRequests, errorsIncludingExpectedDenials: sample.httpErrors, productionUnexpectedErrorRate: null },
    occupancy: { status: 'LOCAL_CLOSED_STACK_SAMPLE', genericOnlineMemberships: sample.online, productionOccupancy: null, privateDatesExcluded: true },
    recordRetention: { status: 'OWNER_CLEANUP_TESTS_ONLY', liveExpiryHoldBacklog: null, publicPolicyReviewed: false },
    returnRetention: { status: 'NOT_COLLECTED', rate: null, optionalAnalyticsCollectorInstalled: false },
    safety: { status: 'SYNTHETIC_REVIEW_DRILL_ONLY', localReports: safety.cases, initialAutomaticSanctions: safety.initialAutomaticSanctions, actualPublicIncidents: null, publicCoverageAssigned: false },
    costs: { status: 'UNPRICED_NOT_METERED', ceilingCentsUSD: budget.monthlyCeilingCents, actualSpendCents: null, purchasesApproved: false },
    databaseBackup: { status: 'LOCAL_EMPTY_RESTORE_SAMPLE', migrations: backup.journal.count, encryptedArchiveBytes: backup.backup.bytes, recoveryExerciseMs: backup.recoveryExerciseMs, operatedSchedule: false, achievedRpoRto: false },
    collection: { installed: false, alertDeliveryTested: false, automaticActions: false, proposedSampleSeconds: watch.proposedSampleSeconds, proposedWatchSeconds: watch.proposedWatchSeconds },
  };
}
export async function checkOpsWatch() {
  const paths = ['config/ops-watch.json', 'docs/agent/evidence/m23-rehearsal-staging-facts.json', 'docs/agent/evidence/m23-recovery-backup-facts.json', 'docs/agent/evidence/m23-rehearsal-browser-artifacts/m16-native-safety-visual/desktop-moderation.json', 'infra/environments/resource-budget.json'];
  const values = await Promise.all(paths.map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const release = await checkRelease();
  for (const signal of values[0].signals) assert(release.unassignedRoles.includes(signal.ownerRole));
  return watchReport(...values);
}
export async function handoffReport() {
  const manifest = JSON.parse(await readFile('PLAN-MANIFEST.json', 'utf8'));
  const checkpoint = JSON.parse(await readFile('docs/agent/task-state.json', 'utf8'));
  const summary = summarize(manifest, checkpoint);
  const ids = [...Array.from({ length: 8 }, (_, n) => 'AUD-' + String(n + 1).padStart(2, '0')), ...manifest.plans.flatMap(module => module.tasks)];
  const counts = {};
  for (const id of ids) { const status = checkpoint.tasks[id]?.status ?? 'TODO'; counts[status] = (counts[status] ?? 0) + 1; }
  const worlds = Object.fromEntries(Object.entries({ deadline: 'M15', maid: 'M16', library: 'M17', restaurant: 'M18', lounge: 'M19', dating: 'M20', park: 'M24' }).map(([world, module]) => [world, { module, checkpoint: summary.modules[module], publicRelease: false, remainingTasks: manifest.plans.find(plan => plan.moduleId === module).tasks.filter(id => checkpoint.tasks[id]?.status !== 'VERIFIED') }]));
  return { generatedAt: new Date().toISOString(), publicRelease: false, counts, totalTasks: ids.length, ready: summary.ready, blocked: summary.blocked, worlds, monitoring: await checkOpsWatch() };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await handoffReport(), null, 2));
