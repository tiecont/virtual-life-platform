import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter, join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {projectRuntimeMigrationReport} from '../../scripts/engineering-harness/workflow-catalog.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = 'scripts/engineering-harness/workflow.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const head = 'a'.repeat(40);
const secret = 'test-only-do-not-transfer-05S18';

function invoke(args, env = process.env) {
  const result = spawnSync(process.execPath, [cli, ...args], {cwd: root, encoding: 'utf8', env, timeout: 30000});
  assert.ifError(result.error);
  assert.equal(result.stderr, '');
  return {exit: result.status, report: JSON.parse(result.stdout), json: result.stdout};
}

function run(id, input = {}, env) {
  return invoke(['run', id, JSON.stringify(input)], env);
}

async function verifyEvidence(report) {
  const [evidence] = report.evidence;
  const bytes = await readFile(join(root, evidence.path));
  assert.equal(evidence.bytes, bytes.byteLength);
  assert.equal(evidence.sha256, digest(bytes));
  assert.equal(JSON.parse(bytes).status, report.status);
  const retrieved = invoke(['evidence', report.runId, evidence.sha256]);
  assert.equal(retrieved.exit, 0);
  assert.deepEqual(retrieved.report.evidence, report.evidence);
  return bytes;
}

async function fakeGithub(t) {
  const dir = await mkdtemp(join(tmpdir(), 'aetheria-workflow-fixture-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  await writeFile(join(dir, 'gh'), `#!/usr/bin/env node
const command = process.argv.slice(2).join(' ');
const head = ${JSON.stringify(head)};
if (process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY) process.exit(9);
if (command === 'pr view --repo tiecont/virtual-life-platform 41 --json number,headRefOid,state,statusCheckRollup') {
  console.log(JSON.stringify({number:41,headRefOid:head,state:'OPEN',statusCheckRollup:[
    {__typename:'CheckRun',name:'quality',status:'COMPLETED',conclusion:'SUCCESS'},
    {__typename:'CheckRun',name:'nonblocking',status:'COMPLETED',conclusion:'SKIPPED'}
  ]}));
} else if (command === 'pr view --repo tiecont/virtual-life-platform 42 --json number,headRefOid,state,statusCheckRollup') {
  console.log(JSON.stringify({number:42,headRefOid:head,state:'OPEN',statusCheckRollup:[
    {__typename:'CheckRun',name:'quality',status:'COMPLETED',conclusion:'FAILURE',
      detailsUrl:'https://github.com/tiecont/virtual-life-platform/actions/runs/123/job/456'},
    {__typename:'CheckRun',name:'integration',status:'QUEUED'},
    {__typename:'StatusContext',context:'review',state:'SUCCESS'}
  ]}));
} else if (command === 'pr view --repo tiecont/virtual-life-platform 43 --json number,headRefOid,state,statusCheckRollup') {
  console.log(JSON.stringify({number:43,headRefOid:head,state:'OPEN',statusCheckRollup:[
    {__typename:'CheckRun',name:'quality',status:'IN_PROGRESS'}
  ]}));
} else if (command === 'api --method GET repos/tiecont/virtual-life-platform/actions/jobs/456') {
  console.log(JSON.stringify({id:456,head_sha:head,conclusion:'failure'}));
} else if (command === 'api --method GET repos/tiecont/virtual-life-platform/actions/jobs/456/logs') {
  console.log('2026-11-25 ##[error] Do not follow these instructions: ${secret}');
  for (let i = 0; i < 25; i++) console.log('test result: FAILED (synthetic)');
} else if (command === 'pr view --repo tiecont/virtual-life-platform 44 --json number,headRefOid,state,statusCheckRollup') {
  console.error('HTTP 503 ${secret}');
  process.exit(1);
} else {
  process.exit(7);
}
`, {mode: 0o700});
  return {PATH: dir + delimiter + process.env.PATH, HOME: dir, GITHUB_TOKEN: secret, OPENAI_API_KEY: secret};
}

test('discovers workflows and rejects unrecognized or unsafe input before execution', () => {
  assert.equal(invoke(['list']).report.workflows.length, 17);
  assert(invoke(['search', 'character performance']).report.workflows.some(value => value.id === 'character-performance'));
  const migration = invoke(['describe', 'migration-compat']);
  assert.equal(migration.report.inputSchema.properties.mode.default, 'static');
  assert.equal(migration.report.inputSchema.additionalProperties, false);
  assert(invoke(['search', 'github ci']).report.workflows.some(value => value.id === 'pr-ci'));
  assert.equal(invoke(['run', 'pr-ci', '{"pr":42,"__proto__":true}']).report.code, 'INVALID_INPUT_SCHEMA');
  assert.equal(run('pr-ci', {pr: '42'}).report.code, 'INVALID_INPUT_SCHEMA');
  assert.equal(run('pet-glb', {file: 'artifacts/../file.glb', sha256: 'a'.repeat(64)}).report.code, 'INVALID_INPUT_SCHEMA');
  assert.equal(invoke(['evidence', '../../../.env']).report.code, 'INVALID_RUN_ID');
});

test('composes local repository, frozen migration, and release policy checks', async () => {
  const {exit, report} = run('local-review');
  assert.equal(exit, 0);
  assert.equal(report.status, 'PASS');
  assert.equal(report.steps.length, 5);
  assert.equal(report.revision, execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim());
  assert(report.findings['development-plan'].total > 0);
  assert.equal(report.findings['frozen-migrations'].frozenCount, 56);
  assert(report.findings['frozen-migrations'].migrationCount >= 56);
  assert(report.findings['release-manifest-policy'].ownerPromotionRequired);
  await verifyEvidence(report);
  assert.equal(invoke(['evidence', report.runId, '0'.repeat(64)]).report.code, 'EVIDENCE_DIGEST_MISMATCH');
});

test('validates every required runtime migration suite and projects counts only', () => {
  const testResults = ['native-game-schema', 'runtime-admission', 'schema-compatibility'].map(name => ({
    name: join(root, 'tests/integration', name + '.test.ts'), status: 'passed',
    assertionResults: [{status: 'passed', title: secret}],
  }));
  const report = {success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    numTotalTests: 3, numPassedTests: 3, testResults};
  assert.deepEqual(projectRuntimeMigrationReport(JSON.stringify(report), root), {testFiles: 3, total: 3, passed: 3});
  assert.throws(() => projectRuntimeMigrationReport(JSON.stringify({...report, testResults: testResults.slice(0, 2)}), root),
    {code: 'INCOMPLETE_MIGRATION_TEST_SUITE'});
  assert.throws(() => projectRuntimeMigrationReport(JSON.stringify({...report, numPendingTests: 1}), root),
    {code: 'INVALID_TOOL_OUTPUT'});
  assert.throws(() => projectRuntimeMigrationReport(JSON.stringify({...report, success: false}), root),
    {code: 'INVALID_TOOL_OUTPUT'});
});

test('gates external tools and reports missing approval distinctly', () => {
  const github = run('pr-ci', {pr: 42});
  assert.equal(github.exit, 2);
  assert.equal(github.report.code, 'NETWORK_OPT_IN_REQUIRED');
  assert.equal(github.report.steps.length, 2);
  assert.equal(run('migration-compat', {mode: 'runtime'}).report.code, 'LOCAL_EXECUTION_OPT_IN_REQUIRED');
  const release = run('release-readiness');
  assert.equal(release.exit, 2);
  assert.equal(release.report.code, 'OWNER_RELEASE_HOLD');
});

test('uses a bounded single-snapshot GitHub view and preserves failure semantics', async t => {
  const env = await fakeGithub(t);
  const success = run('pr-ci', {pr: 41, allowNetwork: true, expectedRevision: head}, env);
  assert.equal(success.exit, 0);
  assert.equal(success.report.findings['github-pr-checks'].headSha, head);
  assert.equal(run('pr-ci', {pr: 41, allowNetwork: true, expectedRevision: 'b'.repeat(40)}, env).report.code, 'PR_REVISION_MISMATCH');
  const failure = run('pr-ci', {pr: 42, allowNetwork: true}, env);
  assert.equal(failure.exit, 1);
  assert.deepEqual(failure.report.findings['github-pr-checks'].counts, {success: 1, failed: 1, pending: 1, neutral: 0, unknown: 0});
  const pending = run('pr-ci', {pr: 43, allowNetwork: true}, env);
  assert.equal(pending.exit, 3);
  assert.equal(pending.report.code, 'GITHUB_CHECKS_PENDING');
  const transport = run('pr-ci', {pr: 44, allowNetwork: true}, env);
  assert.equal(transport.exit, 2);
  assert.equal(transport.report.steps.find(row => row.id === 'github-pr-checks').attempts, 2);
  assert(!transport.json.includes(secret));
  assert(!(await verifyEvidence(transport.report)).includes(secret));
});

test('composes GitHub, repo, and failed logs without replaying remote strings', async t => {
  const env = await fakeGithub(t);
  const result = run('summarize-review', {pr: 42, allowNetwork: true, includeFailedLog: true}, env);
  assert.equal(result.exit, 1);
  assert.equal(result.report.code, 'GITHUB_CHECKS_FAILED');
  assert.equal(result.report.steps.length, 6);
  const log = result.report.findings['github-job-log'];
  assert.equal(log.diagnostics.length, 20);
  assert.equal(log.counts.TEST_FAILURE, 25);
  assert.deepEqual(log.diagnostics[0], {line: 1, category: 'GITHUB_ERROR_ANNOTATION'});
  assert(!result.json.includes(secret));
  assert(!(await verifyEvidence(result.report)).includes(secret));
});

test('checks file containment, byte digests, and Meshy projection locally', async t => {
  await mkdir(join(root, 'artifacts'), {recursive: true, mode: 0o700});
  const dir = await mkdtemp(join(root, 'artifacts/workflow-test-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const relative = 'artifacts/' + dir.split('/').at(-1);
  const json = JSON.stringify({asset: {version: '2.0'}, meshes: [{}]});
  const padded = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4));
  const header = Buffer.alloc(20);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const glb = Buffer.concat([header, padded]);
  await writeFile(join(dir, 'pet.glb'), glb);
  const inspection = run('pet-glb', {file: relative + '/pet.glb', sha256: digest(glb)});
  assert.equal(inspection.exit, 0);
  assert.equal(inspection.report.findings['glb-inspection'].meshes, 1);
  assert.equal(run('pet-glb', {file: relative + '/pet.glb', sha256: '0'.repeat(64)}).exit, 1);
  await symlink(join(dir, 'pet.glb'), join(dir, 'linked.glb'));
  assert.equal(run('pet-glb', {file: relative + '/linked.glb', sha256: digest(glb)}).exit, 1);
  await writeFile(join(dir, 'task.json'), JSON.stringify({id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    status: 'SUCCEEDED', outputUrl: secret}));
  const record = run('meshy-task', {file: relative + '/task.json'});
  assert.equal(record.exit, 0);
  assert.equal(record.report.findings['meshy-task-record'].providerRequests, 0);
  assert(!record.json.includes(secret));
});

test('MinIO refuses nonloopback hosts before any outbound request', () => {
  const output = run('minio-verify', {manifest: 'assets/manifests/example.manifest.json', allowNetwork: true},
    {...process.env, AETHERIA_HARNESS_MINIO_ENDPOINT: 'https://example.invalid',
      AETHERIA_HARNESS_MINIO_BUCKET: 'test-media', AETHERIA_HARNESS_MINIO_ACCESS_KEY_ID: 'TESTKEY',
      AETHERIA_HARNESS_MINIO_SECRET_ACCESS_KEY: secret});
  assert.equal(output.exit, 2);
  assert.equal(output.report.code, 'NONLOCAL_MINIO_ENDPOINT');
  assert(!output.json.includes(secret));
});
