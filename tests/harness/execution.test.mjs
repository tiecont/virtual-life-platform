import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {checkpointRequirements, executionMode, validateRegistry}
  from '../../scripts/engineering-harness/execution-contract.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = 'scripts/engineering-harness/execution.mjs';
const registry = JSON.parse(readFileSync(new URL('../../config/engineering-execution.json', import.meta.url), 'utf8'));

function invoke(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {cwd: root, encoding: 'utf8', timeout: 10000});
  assert.ifError(result.error);
  assert.equal(result.stderr, '');
  return {exit: result.status, value: JSON.parse(result.stdout)};
}

test('checks the current registry against source rules and the existing workflow input schemas', () => {
  const check = invoke('check');
  assert.equal(check.exit, 0);
  assert.equal(check.value.status, 'PASS');
  const altered = JSON.parse(JSON.stringify(registry));
  altered.routes['hero-vrm'].gates = ['h4', 'h1'];
  assert.throws(() => validateRegistry(altered, () => true), /INVALID_EXECUTION_REGISTRY/);
  assert.equal(invoke('describe', '__proto__').value.code, 'UNKNOWN_EXECUTION_ROUTE');
});

test('finds workflow suggestions, ordered gates and scoped cross-project context', () => {
  const search = invoke('search', 'Check frozen migrations and release source policy');
  assert.equal(search.value.routes[0].id, 'repo-review');
  assert.equal(invoke('search', 'missingdomainterm').value.selection, 'REVIEW_SCOPE');
  const context = invoke('context', 'engineering', '--path', 'packages/contracts/src/gameplay-config.ts',
    '--path', 'apps/portal-web/app/page.tsx').value;
  assert.deepEqual(context.rules, ['AGENTS.md', 'apps/portal-web/AGENTS.md']);
  assert.deepEqual(context.impact.directPackages, ['@aetheria/contracts', '@aetheria/portal-web']);
  assert(context.impact.dependentPackages.includes('@aetheria/platform-api'));
  assert.equal(context.status, 'ADVISORY');
  assert.equal(invoke('context', 'engineering', '--path', '../.env').value.code, 'INVALID_EXECUTION_PATHS');
});

test('projects immutable ordered gates for the portable checkpoint consumer', () => {
  const hero = checkpointRequirements(registry, 'hero-vrm');
  assert.equal(hero.version, 2);
  assert.deepEqual(hero.gates.filter(gate => /^h[1-4]$/.test(gate.id)).map(gate => [gate.id, gate.kind,
    gate.stage, gate.revisionPolicy ?? 'candidate']), [
    ['h1', 'owner', 'hero-h1', 'stage'], ['h2', 'owner', 'hero-h2', 'stage'],
    ['h3', 'owner', 'hero-h3', 'stage'], ['h4', 'owner', 'hero-h4', 'candidate'],
  ]);
  const database = checkpointRequirements(registry, 'database-infrastructure');
  assert.deepEqual(database.gates[0], {id: 'migration-static', kind: 'workflow', stage: 'validate',
    workflow: 'migration-compat', input: {mode: 'static'}});
});

test('selects mode only from supplied authorizations and capabilities', () => {
  assert.equal(executionMode(), 'sequential');
  assert.equal(executionMode({nativeParallel: true, isolatedWrites: true}), 'sequential');
  assert.equal(executionMode({allowDelegation: true, nativeParallel: true}), 'limited-parallel');
  assert.equal(executionMode({allowDelegation: true, boundedParallel: true}), 'limited-parallel');
  assert.equal(executionMode({allowDelegation: true, nativeParallel: true, isolatedWrites: true}), 'native-parallel');
});
