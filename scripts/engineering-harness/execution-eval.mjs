import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {commandEnvironment} from './workflow-runner.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const execution = 'scripts/engineering-harness/execution.mjs';
const workflows = 'scripts/engineering-harness/workflow.mjs';
const observations = [];
const cases = [];

function call(script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {cwd: root, env: commandEnvironment(),
    timeout: 90000, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
  observations.push((result.stdout?.length ?? 0) + (result.stderr?.length ?? 0));
  assert.ifError(result.error);
  return {value: JSON.parse(result.stdout), exit: result.status};
}

function run(id, procedure) {
  const start = performance.now();
  const offset = observations.length;
  let details, status = 'PASS', code;
  try {
    details = procedure();
  } catch (error) {
    status = 'FAIL';
    code = error.code === 'ERR_ASSERTION' ? 'ACCEPTANCE_FAILED' : 'EXECUTION_FAILED';
  }
  const calls = observations.slice(offset);
  cases.push({id, status, code, elapsedMs: Math.round(performance.now() - start), topLevelCalls: calls.length,
    visibleResultBytes: calls.reduce((sum, bytes) => sum + bytes, 0), ...details});
}

run('local-review-from-short-prompt', () => {
  const search = call(execution, 'search', 'Check frozen migrations and release source policy');
  assert.equal(search.value.routes[0].id, 'repo-review');
  const {value: route} = call(execution, 'describe', search.value.routes[0].id);
  assert.deepEqual(route.gates.map(gate => gate.id), ['local-source']);
  const {workflow} = route.gates[0];
  const check = call(workflows, 'run', workflow);
  assert.equal(check.exit, 0);
  assert.equal(check.value.status, 'PASS');
  assert.equal(check.value.worktreeDirty, false);
  assert.deepEqual(check.value.steps.map(step => step.id).sort(), ['development-plan', 'frozen-migrations',
    'release-manifest-policy', 'source-revision', 'source-state']);
  const proof = call(workflows, 'evidence', check.value.runId, check.value.evidence[0].sha256);
  assert.deepEqual(proof.value.evidence, check.value.evidence);
  const mismatch = call(workflows, 'evidence', check.value.runId, '0'.repeat(64));
  assert.equal(mismatch.value.code, 'EVIDENCE_DIGEST_MISMATCH');
  return {revision: check.value.revision, worktreeDirty: check.value.worktreeDirty, evidence: proof.value.evidence};
});

run('gameplay-change-impact', () => {
  const path = 'packages/contracts/src/gameplay-config.ts';
  const {value: pick} = call(execution, 'search', 'native gameplay configuration', '--path', path);
  assert.equal(pick.routes[0].id, 'native-gameplay');
  const {value: context} = call(execution, 'context', pick.routes[0].id, '--path', path);
  assert(context.impact.dependentPackages.includes('@aetheria/platform-api'));
  assert(context.references.includes('specs/pet-arena/wave-c2-arena8-contract.md'));
  return {selectedRoute: pick.routes[0].id, implementation: 'NOT_RUN'};
});

run('hero-and-detached-review-boundaries', () => {
  const {value: hero} = call(execution, 'describe', 'hero-vrm');
  const {value: accessory} = call(execution, 'describe', 'standard-character-asset');
  assert.deepEqual(hero.gates.filter(gate => /^h[1-4]$/.test(gate.id) && gate.kind === 'owner')
    .map(gate => gate.id), ['h1', 'h2', 'h3', 'h4']);
  assert(accessory.gates.some(gate => gate.id === 'asset-owner-admission' && gate.kind === 'owner'));
  return {selectedRoutes: [hero.id, accessory.id], production: 'NOT_RUN'};
});

run('safe-capability-fallback', () => {
  assert.equal(call(execution, 'capabilities', '--native-parallel').value.mode, 'sequential');
  assert.equal(call(execution, 'capabilities', '--allow-delegation', '--bounded-parallel').value.mode, 'limited-parallel');
  assert.equal(call(execution, 'capabilities', '--allow-delegation', '--native-parallel',
    '--isolated-writes').value.mode, 'native-parallel');
  return {modeScenarios: 3, agentDelegation: 'NOT_RUN'};
});

const status = cases.some(candidate => candidate.status === 'FAIL') ? 'FAIL' : 'PASS';
process.stdout.write(JSON.stringify({
  version: 1, status, environment: 'local Node/Git', node: process.version, cases,
  comparisons: {
    existingApproachModelRun: 'NOT_RUN', canonicalModelRun: 'NOT_RUN', lowerCostModelRun: 'NOT_RUN',
    externalPlatforms: 'NOT_RUN', tokenUsage: 'UNKNOWN', inferenceCost: 'UNKNOWN',
  },
}) + '\n');
process.exitCode = status === 'PASS' ? 0 : 1;
