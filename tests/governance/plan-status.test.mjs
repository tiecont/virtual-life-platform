import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditIds, dependencies, summarize, validateGraph } from '../../scripts/plan-status.mjs';
const modules = [
  { moduleId: 'M00', dependsOn: 'audit', tasks: ['M00-01'] },
  { moduleId: 'M01', dependsOn: 'M00', tasks: ['M01-01'] },
  { moduleId: 'M02', dependsOn: 'M00, M01', tasks: ['M02-01'] },
];
const verified = { status: 'VERIFIED', evidence: 'real-log', verification: 'review command → 0' };
test('audit ranges and conjunctive dependencies preserve the authoritative DAG', () => {
  assert.deepEqual(dependencies('AUD-01..08, M06'), [...auditIds, 'M06']);
  const state = { tasks: {} };
  assert.deepEqual(summarize({ plans: modules }, state).ready, []);
  for (const id of auditIds) state.tasks[id] = verified;
  assert.deepEqual(summarize({ plans: modules }, state).ready, ['M00-01']);
  state.tasks['M00-01'] = verified;
  state.tasks['M01-01'] = { status: 'BLOCKED_EXTERNAL' };
  assert.deepEqual(summarize({ plans: modules }, state).ready, []);
  assert.deepEqual(summarize({ plans: modules }, state).blocked, ['M01-01']);
});
test('cycles, unknown dependencies and duplicate module IDs are rejected', () => {
  assert.throws(() => validateGraph([{ moduleId: 'M00', dependsOn: 'M00' }]), /cycle/);
  assert.throws(() => validateGraph([{ moduleId: 'M00', dependsOn: 'M99' }]), /Unknown/);
  assert.throws(() => validateGraph([modules[0], modules[0]]), /Duplicate/);
});
test('checkpoint cannot assert verification without evidence or through an unmet gate', () => {
  assert.throws(() => summarize({ plans: modules }, { tasks: { 'M00-01': { status: 'VERIFIED' } } }), /Missing evidence/);
  assert.throws(() => summarize({ plans: modules }, { tasks: { 'M01-01': verified } }), /unverified dependency/);
  assert.throws(() => summarize({ plans: modules }, { tasks: { invented: verified } }), /Unknown task/);
});

test('the supplied plan pack is accepted without changing its manifest shape', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../fixtures/historical-release/manifest.json', import.meta.url), 'utf8'));
  const summary = summarize(manifest, { tasks: {} });
  assert.equal(Object.keys(summary.modules).length, 25);
  assert.deepEqual(summary.ready, []);
});
