import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { checkRelease, validateRelease, validateDecision } from '../../scripts/verify-release.mjs';

const inputs = await Promise.all(['config/release-trains.json', 'config/rollout.json', 'config/safety-policy.json', 'config/dating-policy.json', 'PLAN-MANIFEST.json', 'docs/agent/task-state.json'].map(async path => JSON.parse(await readFile(path, 'utf8'))));
test('offline inventory covers seven worlds with public gates and honest operator vacancies', async () => {
  const result = await checkRelease();
  assert.equal(result.publicRelease, false);
  assert.equal(result.unassignedRoles.length, 6);
  assert.deepEqual(result.waves.W2.pendingModules, []);
  assert.equal(result.waves.W6.publicStatus, 'BLOCKED_EXTERNAL');
});
test('a missing later world or dating pilot does not block the independently verified W2 baseline', () => {
  const next = globalThis.structuredClone(inputs);
  delete next[5].tasks['M20-07'];
  for (const module of next[4].plans.filter(module => ['M17', 'M18', 'M19', 'M20', 'M24'].includes(module.moduleId))) {
    for (const task of module.tasks) delete next[5].tasks[task];
  }
  const result = validateRelease(...next);
  assert.deepEqual(result.waves.W2.pendingModules, []);
  assert(result.waves.W6.pendingModules.includes('M20'));
  next[0].waves.W2.modules.push('M20');
  assert.throws(() => validateRelease(...next), /W2 requires/);
});
test('public flags,fabricated operator assignment and inherited dating approval fail closed', () => {
  for (const mutate of [
    values => { values[0].publicRelease = true; },
    values => { values[1].worlds.maid.enabled = true; },
    values => { values[0].roles.safetyOnDuty = 'inferred-from-git'; },
    values => { values[3].approvals.operatorSignoff = true; },
    values => { values[2].defaults.chatEnabled = true; },
    values => { values[0].waves.W2.priorWaves.push('W6'); },
    values => { values[0].waves.W5.worlds.push('dating'); },
  ]) {
    const next = globalThis.structuredClone(inputs); mutate(next); assert.throws(() => validateRelease(...next));
  }
});

test('offline source rights cannot become a public decision,staffing or purchased resource approval', async () => {
  const decision = JSON.parse(await readFile('config/release-decision.json', 'utf8'));
  assert.equal(validateDecision(decision).localScope, 'OFFLINE_ONLY');
  for (const mutate of [
    value => { value.decision = 'RELEASED'; },
    value => { value.authorization.publicDeployment = true; },
    value => { value.authorization.realStaffProvisioning = true; },
    value => { value.approvals.publicOwner = 'inferred-from-source-rights'; },
    value => { value.blockedTasks = []; },
  ]) { const next = globalThis.structuredClone(decision); mutate(next); assert.throws(() => validateDecision(next)); }
});
