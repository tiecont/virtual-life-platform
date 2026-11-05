import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { checkOpsWatch, watchReport } from '../../scripts/ops-watch.mjs';
const inputs = await Promise.all(['config/ops-watch.json', 'docs/agent/evidence/m23-rehearsal-staging-facts.json', 'docs/agent/evidence/m23-recovery-backup-facts.json', 'docs/agent/evidence/m23-rehearsal-browser-artifacts/m16-native-safety-visual/desktop-moderation.json', 'infra/environments/resource-budget.json'].map(async path => JSON.parse(await readFile(path, 'utf8'))));
test('actual local samples remain separate from unavailable retention,costs and public safety metrics', async () => {
  const data = await checkOpsWatch();
  assert.equal(data.errors.requests, 10); assert.equal(data.errors.errorsIncludingExpectedDenials, 1);
  assert.equal(data.occupancy.genericOnlineMemberships, 0);
  assert.equal(data.returnRetention.rate, null); assert.equal(data.costs.actualSpendCents, null);
  assert.equal(data.databaseBackup.migrations, 38); assert.equal(data.collection.installed, false);
  const next = globalThis.structuredClone(inputs); next[1].rawTrace = 'SENSITIVE_INPUT_MARKER'; next[3].accountId = 'SENSITIVE_INPUT_MARKER';
  assert(!JSON.stringify(watchReport(...next)).includes('SENSITIVE_INPUT_MARKER'));
});
test('a historical sample cannot silently become live monitoring or unknown business data become zero', () => {
  for (const mutate of [
    values => { values[0].collectorInstalled = true; },
    values => { values[0].actualMonthlySpendCents = 0; },
    values => { values[0].consentedReturnRetentionRate = 0; },
    values => { values[1].privateOperatorTelemetry.httpErrors = 1000; },
    values => { values[2].journal.count = 36; },
  ]) { const next = globalThis.structuredClone(inputs); mutate(next); assert.throws(() => watchReport(...next)); }
});
