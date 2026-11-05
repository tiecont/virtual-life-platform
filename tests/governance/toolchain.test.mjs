import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertBuildAll, assertQualityToolchain, describeToolchain, workspaceGraph} from '../../scripts/verify-toolchain.mjs';

const project = (name, dependencies = {}) => ({path: 'packages/' + name, manifest: {name: '@virtual-city/' + name, scripts: {build: 'tsc', typecheck: 'tsc --noEmit'}, dependencies}});

test('shared contracts reach both real apps and every compiled workspace participates in the build-all map', async () => {
  const {map} = await describeToolchain();
  const contracts = map.projects.find(project => project.name === '@virtual-city/contracts');
  assert.deepEqual(contracts.applicationConsumers, ['@virtual-city/platform-api', '@virtual-city/portal-web']);
  assert.deepEqual(map.projects.find(project => project.name === '@virtual-city/config').applicationConsumers, contracts.applicationConsumers);
  assert(map.projects.find(project => project.name === '@virtual-city/platform-api').compilerInputs.some(input => input.path === 'packages/config/tsconfig.json'));
  assert(map.projects.filter(project => project.kind === 'application').every(project => map.buildOrder.includes(project.name)));
  assert.equal(map.projects.filter(project => project.kind === 'source-only').length, 2);
  const root = JSON.parse(await readFile('package.json', 'utf8'));
  assertBuildAll(root);
  for (const command of ['pnpm --filter @virtual-city/platform-api build', 'pnpm -r --filter "...[HEAD]" build']) {
    assert.throws(() => assertBuildAll({...root, scripts: {...root.scripts, build: command}}));
  }
});

test('graph rejects unknown workspaces, implicit external ranges, cycles, duplicate names and missing app build targets', () => {
  assert.deepEqual(workspaceGraph([project('base'), project('client', {'@virtual-city/base': 'workspace:*'})]).order, ['@virtual-city/base', '@virtual-city/client']);
  const cases = [
    [project('base', {'@virtual-city/missing': 'workspace:*'})],
    [project('base', {zod: '^4.6.7'})],
    [project('base', {'@virtual-city/base': '4.6.7'})],
    [project('a', {'@virtual-city/b': 'workspace:*'}), project('b', {'@virtual-city/a': 'workspace:*'})],
    [project('base'), project('base')],
    [{path: 'apps/missing', manifest: {name: '@virtual-city/missing'}}]
  ];
  for (const value of cases) assert.throws(() => workspaceGraph(value));
});

test('fork quality keeps frozen installs, matching pins and no secret or write grant', async () => {
  const workflow = await readFile('.github/workflows/quality.yml', 'utf8');
  assertQualityToolchain(workflow, '11.28.5');
  for (const mutation of [
    source => source.replace('contents: read', 'contents: write'),
    source => source + '\npermissions:\n  packages: write\n',
    source => source.replace('permissions:\n  contents: read', 'permissions: write-all'),
    source => source.replace('permissions:\n  contents: read', 'permissions: { contents: write }'),
    source => source + '\n  fake-job:\n    permissions:\n      packages: "write"\n',
    source => source + '\nsecrets: inherit\n',
    source => source.replace('pull_request:', 'pull_request_target:'),
    source => source + '\nsecret: ${{ secrets.PUBLISH_TOKEN }}\n',
    source => source.replace('pnpm install --frozen-lockfile', 'pnpm install'),
    source => source.replace('version: 11.28.5', 'version: 11.28.6')
  ]) assert.throws(() => assertQualityToolchain(mutation(workflow), '11.28.5'));
});
