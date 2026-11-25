import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { delimiter, join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = join(root, 'tests', 'harness', 'fixtures');
const workflow = 'scripts/engineering-harness/workflow.mjs';
const migration = 'scripts/engineering-harness/workflow-migrations.mjs';
const ghArgs = ['pr', 'view', '--repo', 'tiecont/virtual-life-platform', '42', '--json', 'number,headRefOid,state,statusCheckRollup'];
const environment = {
  PATH: process.env.PATH,
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.fsmonitor',
  GIT_CONFIG_VALUE_0: 'false',
  LANG: 'C.UTF-8',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_OPTIONAL_LOCKS: '0',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = value => hash(JSON.stringify(value));

function execute(command, args, { env = environment, input, codes = [0] } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    input,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 90_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert(!result.error, `Benchmark command could not complete: ${command} (${result.error?.code})`);
  assert(codes.includes(result.status), `Unexpected benchmark command exit: ${command} ${args[0]} (${result.status ?? result.signal})`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const node = (args, options) => execute(process.execPath, args, options);
const json = result => JSON.parse(result.stdout);
const decode = result => result.stdout.toString('utf8').trim();
const observation = (results, subprocessCalls) => ({
  visibleResultBytes: results.reduce((sum, result) => sum + result.stdout.length + result.stderr.length, 0),
  topLevelToolCalls: results.length,
  recordedSubprocessCalls: subprocessCalls,
});

function runWorkflow(id, input, options = {}) {
  const call = node([workflow, 'run', id, JSON.stringify(input)], options);
  const result = json(call);
  const statuses = { 0: 'PASS', 1: 'FAIL', 2: 'BLOCKED', 3: 'NOT_RUN' };
  assert.equal(result.status, statuses[call.status]);
  assert.equal(result.workflow, id);
  assert.equal(result.schemaVersion, 1);
  assert.match(result.revision, /^[a-f0-9]{40}$/);
  return { call, result, measured: observation([call], result.steps.reduce((count, step) => count + step.attempts, 0)) };
}

function benchmarkPr(home) {
  // An explicitly selected local executable supplies the same response to both
  // approaches. No account, network, CI refresh or private log is involved.
  const env = { ...environment, HOME: home, GH_CONFIG_DIR: home, PATH: `${join(fixtures, 'bin')}${delimiter}${environment.PATH}` };
  const fixture = join(fixtures, 'bin', 'gh');
  const baseline = () => {
    const call = execute('gh', ghArgs, { env });
    const pr = json(call);
    const status = pr.statusCheckRollup.some(check => check.conclusion === 'FAILURE') ? 'FAIL' : 'PASS';
    const findings = {
      pr: pr.number,
      headSha: pr.headRefOid,
      state: pr.state,
      counts: {
        success: pr.statusCheckRollup.filter(check => check.conclusion === 'SUCCESS').length,
        failed: pr.statusCheckRollup.filter(check => check.conclusion === 'FAILURE').length,
        pending: pr.statusCheckRollup.filter(check => check.status !== 'COMPLETED').length,
        neutral: 0,
        unknown: 0,
      },
      quality: pr.statusCheckRollup.filter(check => check.name === 'quality').map(check => check.conclusion),
      failedJobIds: pr.statusCheckRollup.filter(check => check.conclusion === 'FAILURE')
        .map(check => Number(new URL(check.detailsUrl).pathname.split('/').at(-1))),
    };
    assert.equal(findings.pr, 42);
    assert.equal(findings.headSha, 'a'.repeat(40));
    assert.deepEqual(findings.counts, { success: 12, failed: 1, pending: 1, neutral: 0, unknown: 0 });
    return { measured: observation([call], 1), acceptance: { status, ...findings }, inputSha256: hash(readFileSync(fixture)) };
  };
  const upgraded = () => {
    const run = runWorkflow('pr-ci', { pr: 42, allowNetwork: true }, { env, codes: [1] });
    return { measured: run.measured, acceptance: { status: run.result.status, ...run.result.findings['github-pr-checks'] }, run: run.result };
  };
  return { id: 'A', description: 'Pull request and CI inspection using a synthetic GitHub response', baseline, upgraded };
}

function benchmarkMigration(revision) {
  const baseline = () => {
    const call = node([migration, revision]);
    const facts = json(call);
    assert(Number.isSafeInteger(facts.migrationCount) && facts.migrationCount >= facts.frozenCount && facts.frozenCount > 0);
    assert.match(facts.sha256, /^[a-f0-9]{64}$/);
    return { measured: observation([call], 1), acceptance: facts, inputSha256: facts.sha256 };
  };
  const upgraded = () => {
    const run = runWorkflow('migration-compat', { mode: 'static' });
    return { measured: run.measured, acceptance: { revision: run.result.revision, ...run.result.findings['frozen-migrations'] }, run: run.result };
  };
  return { id: 'B', description: 'Frozen migration source compatibility using the same validator', baseline, upgraded };
}

function countGitRecords(result) {
  const entries = result.stdout.toString('utf8').split('\u0000').slice(0, -1);
  let count = 0;
  for (let index = 0; index < entries.length; index += 1) {
    count += 1;
    if (/[RC]/.test(entries[index].slice(0, 2))) index += 1;
  }
  return count;
}

function benchmarkComposition() {
  const baseline = () => {
    const head = execute('git', ['rev-parse', 'HEAD']);
    const dirty = execute('git', ['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
    const plan = node(['scripts/task-plan.mjs']);
    const revision = decode(head);
    const migrationCheck = node([migration, revision]);
    const release = node(['scripts/release-manifest.mjs']);
    const { total, remaining, ready, counts } = json(plan);
    const { migrationCount, frozenCount, sha256 } = json(migrationCheck);
    const { policy, ownerPromotionRequired, committedCandidates } = json(release);
    assert.equal(policy, 'PASS');
    assert.equal(ownerPromotionRequired, true);
    const acceptance = {
      revision,
      source: { dirty: dirty.stdout.length > 0, entries: countGitRecords(dirty) },
      plan: { total, remaining, ready: ready.length, counts },
      migrations: { migrationCount, frozenCount, sha256 },
      release: { committedCandidates: committedCandidates.length, ownerPromotionRequired },
    };
    const results = [head, dirty, plan, migrationCheck, release];
    return { measured: observation(results, results.length), acceptance, inputSha256: fingerprint(acceptance) };
  };
  const upgraded = () => {
    const run = runWorkflow('local-review', {});
    const { findings, revision } = run.result;
    const acceptance = {
      revision,
      source: findings['source-state'],
      plan: findings['development-plan'],
      migrations: findings['frozen-migrations'],
      release: findings['release-manifest-policy'],
    };
    return { measured: run.measured, acceptance, run: run.result };
  };
  return { id: 'C', description: 'Repository, migration and release audit with in-process filtering', baseline, upgraded };
}

// Both actors write or update a checkpoint, exit and recover it in another
// process. The reference path models a manual full JSON handoff.
function benchmarkRecovery(directory, revision) {
  const fixture = readFileSync(join(fixtures, 'benchmark-recovery.json'));
  // The copy exercises the shipping CLI and store, preserving the current Git
  // revision via the parent checkout and isolating synthetic task IDs.
  const sourceDirectory = join('scripts', 'engineering-harness');
  const checkpointDirectory = join(directory, 'checkpoint-fixture', sourceDirectory);
  mkdirSync(checkpointDirectory, { recursive: true, mode: 0o700 });
  for (const name of readdirSync(join(root, sourceDirectory)).filter(name => /^state(?:-[a-z-]+)?[.]mjs$/.test(name))) {
    copyFileSync(join(root, sourceDirectory, name), join(checkpointDirectory, name));
  }
  const state = join(checkpointDirectory, 'state.mjs');
  const spec = JSON.parse(fixture);
  const taskId = 'validate';
  const patch = { status: 'IN_PROGRESS', remainingActions: ['Run the validator and record its evidence checksum.'] };
  const referenceInit = `const fs = require('node:fs');
const spec = JSON.parse(fs.readFileSync(0));
const snapshot = { baseRevision: process.argv[2], objective: spec.objective, tasks: spec.tasks.map(task => ({ ...task, status: 'PENDING', remainingActions: [] })) };
fs.writeFileSync(process.argv[1], JSON.stringify(snapshot), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify(snapshot));`;
  const referenceUpdate = `const fs = require('node:fs');
const [path, id] = process.argv.slice(1);
const snapshot = JSON.parse(fs.readFileSync(path));
Object.assign(snapshot.tasks.find(task => task.id === id), JSON.parse(fs.readFileSync(0)));
fs.writeFileSync(path, JSON.stringify(snapshot));
console.log(JSON.stringify(snapshot));`;
  const referenceRecover = "process.stdout.write(require('node:fs').readFileSync(process.argv[1]));";

  const baseline = () => {
    const checkpoint = join(directory, `reference-${randomUUID()}.json`);
    const init = node(['-e', referenceInit, checkpoint, revision], { input: fixture });
    const update = node(['-e', referenceUpdate, checkpoint, taskId], { input: JSON.stringify(patch) });
    const recover = node(['-e', referenceRecover, checkpoint]);
    const snapshot = json(recover);
    const accepted = projectCheckpoint({
      ...snapshot,
      ready: snapshot.tasks.filter(task => task.status === 'PENDING' && !task.dependsOn.length).map(task => task.id),
      task: snapshot.tasks.find(task => task.id === taskId),
    });
    assert.equal(accepted.task.status, patch.status);
    return {
      measured: { ...observation([init, update, recover], 3), recoveryResultBytes: recover.stdout.length + recover.stderr.length },
      acceptance: accepted,
      inputSha256: fingerprint({ spec, patch }),
      integrity: { checkpointSha256: hash(recover.stdout), verified: recover.stdout.equals(readFileSync(checkpoint)) },
    };
  };
  const upgraded = () => {
    const id = `bench-${randomUUID()}`;
    const init = node([state, 'init', id, '-'], { input: fixture });
    const update = node([state, 'update', id, '1', taskId, '-'], { input: JSON.stringify(patch) });
    const recover = node([state, 'recover', id, taskId]);
    const checkpoint = json(recover);
    assert.equal(checkpoint.id, id);
    assert.equal(checkpoint.version, 2);
    assert.match(checkpoint.stateSha256, /^[a-f0-9]{64}$/);
    return {
      measured: { ...observation([init, update, recover], 3), recoveryResultBytes: recover.stdout.length + recover.stderr.length },
      acceptance: projectCheckpoint(checkpoint),
      integrity: { checkpointSha256: checkpoint.stateSha256, verified: json(update).stateSha256 === checkpoint.stateSha256 },
    };
  };
  return { id: 'D', description: 'Interrupted-task recovery from a separate process', baseline, upgraded };
}

function benchmarkDiscovery() {
  const taskPlan = 'scripts/task-plan.mjs';
  const baseline = () => {
    const call = node([taskPlan]);
    const { total, remaining, ready } = json(call);
    return { measured: observation([call], 1), acceptance: { total, remaining, ready: ready.length },
      inputSha256: hash(readFileSync(join(root, 'config/development-plan.json'))) };
  };
  const upgraded = () => {
    const run = runWorkflow('repo-inspect', {});
    const { total, remaining, ready } = run.result.findings['development-plan'];
    return { measured: run.measured, acceptance: { total, remaining, ready }, run: run.result };
  };
  return { id: 'E', description: 'Filter the complete backlog to counts for a single local readiness query', baseline, upgraded };
}

function projectCheckpoint({ baseRevision, objective, task, ready }) {
  const { id, owner, dependsOn, writePaths, acceptance, status, remainingActions } = task;
  return { baseRevision, objective, ready, task: { id, owner, dependsOn, writePaths, acceptance, status, remainingActions } };
}

function time(run) {
  const start = performance.now();
  const outcome = run();
  return { ...outcome, measured: { ...outcome.measured, durationMs: Math.round(performance.now() - start) } };
}

function summarize(rows, key, ranges = false) {
  return Object.fromEntries(Object.keys(rows[0][key]).map(metric => {
    const sorted = rows.map(row => row[key][metric]).sort((a, b) => a - b);
    return [metric, ranges ? { min: sorted[0], max: sorted.at(-1) } : sorted[Math.floor(sorted.length / 2)]];
  }));
}

function verifiedEvidence(result) {
  const receipt = json(node([workflow, 'evidence', result.runId]));
  assert.equal(receipt.runId, result.runId);
  assert.equal(receipt.revision, result.revision);
  assert.equal(receipt.status, result.status);
  assert.deepEqual(receipt.evidence, result.evidence);
  assert.match(result.runId, /^[a-f0-9-]{36}$/);
  assert.equal(result.evidence.length, 1);
  const [reference] = result.evidence;
  assert.equal(reference.path, `artifacts/engineering-harness/runs/${result.runId}/report.json`);
  const bytes = readFileSync(join(root, reference.path));
  assert.equal(bytes.length, reference.bytes);
  assert.equal(hash(bytes), reference.sha256);
  return { references: result.evidence, verified: true };
}

function measureScenario(scenario, trials) {
  const rows = [];
  for (let index = 0; index < trials; index += 1) {
    // Reverse evaluation order every second trial to reduce startup/cache bias.
    const order = index % 2 === 0 ? ['baseline', 'upgraded'] : ['upgraded', 'baseline'];
    const results = Object.fromEntries(order.map(key => [key, time(scenario[key])]));
    const { baseline, upgraded } = results;
    assert.deepEqual(upgraded.acceptance, baseline.acceptance, `Acceptance mismatch for ${scenario.id}`);
    const integrity = upgraded.run ? verifiedEvidence(upgraded.run) : upgraded.integrity;
    assert.equal(integrity.verified, true, `Integrity mismatch for ${scenario.id}`);
    if (baseline.integrity) assert.equal(baseline.integrity.verified, true);
    rows.push({
      order,
      baseline: baseline.measured,
      upgraded: upgraded.measured,
      acceptance: baseline.acceptance,
      inputSha256: baseline.inputSha256,
      integrity: { baseline: baseline.integrity ?? null, upgraded: integrity },
    });
  }
  return {
    id: scenario.id,
    description: scenario.description,
    quality: 'PASS',
    baselineMedian: summarize(rows, 'baseline'),
    upgradedMedian: summarize(rows, 'upgraded'),
    baselineRange: summarize(rows, 'baseline', true),
    upgradedRange: summarize(rows, 'upgraded', true),
    trials: rows,
  };
}

function privateOutput() {
  const artifacts = join(root, 'artifacts');
  mkdirSync(artifacts, { recursive: true, mode: 0o700 });
  const metadata = lstatSync(artifacts);
  assert(metadata.isDirectory() && (!process.getuid || metadata.uid === process.getuid()) &&
    (metadata.mode & 0o022) === 0, 'Benchmark artifact root must be an owned, protected directory');
  return mkdtempSync(join(artifacts, 'harness-benchmark-'));
}

function main() {
  const count = process.argv[2] ?? '3';
  assert(process.argv.length <= 3 && ['1', '3', '5'].includes(count), 'Usage: node scripts/engineering-harness/benchmark.mjs [1|3|5]');
  const directory = privateOutput();
  const revision = decode(execute('git', ['rev-parse', 'HEAD']));
  const checkouts = execute('git', ['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
  const scenarios = [benchmarkPr(directory), benchmarkMigration(revision), benchmarkComposition(), benchmarkRecovery(directory, revision), benchmarkDiscovery()];
  const results = scenarios.map(scenario => measureScenario(scenario, Number(count)));
  const report = {
    schemaVersion: 1,
    status: 'PASS',
    revision,
    worktreeDirty: checkouts.stdout.length > 0,
    trialCount: Number(count),
    methodology: {
      baseline: 'Direct CLI results without workflow-level filtering; a plain JSON checkpoint models the reference recovery.',
      upgraded: 'Typed workflows and targeted checkpoint recovery over the same scenario inputs.',
      disclosure: 'Reported separately from wall-clock time. Counts bytes returned at the CLI boundary, including stderr.',
      calls: 'Top-level counts represent direct CLI invocations as a stand-in for model-facing tool calls. Subprocess counts cover recorded workflow adapters and exclude nested commands and untimed evidence verification.',
      gitHub: 'Synthetic response from a fixed local fixture executable; no live GitHub calls.',
      migrations: 'Offline frozen SQL prefix and working bytes; runtime database behavior was outside this benchmark.',
      recovery: 'The writer exits and a separate process recovers the saved state from isolated fixture storage.',
    },
    modelMetrics: Object.fromEntries([
      'inputTokens', 'outputTokens', 'cachedTokens', 'modelOrchestrationTurns', 'contextCompactions', 'apiCost',
      'fixedContextBytes', 'nativeToolSchemaBytes',
    ].map(key => [key, 'NOT_MEASURED'])),
    nativeScenarios: {
      independentMultiAgent: { repeatedProviderComparison: 'NOT_MEASURED', reason: 'No repeated provider comparison has been recorded on this revision' },
      nativeCrossProviderHandoff: { status: 'NOT_RUN', reason: 'Requires receipts from both provider owners on this revision' },
    },
    results,
  };
  const path = join(directory, 'report.json');
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({
    schemaVersion: 1,
    status: report.status,
    revision,
    worktreeDirty: report.worktreeDirty,
    trialCount: report.trialCount,
    scenarios: results.map(({ trials, ...summary }) => summary),
    nativeScenarios: report.nativeScenarios,
    modelMetrics: report.modelMetrics,
    evidence: { path: relative(root, path), bytes: bytes.length, sha256: hash(bytes) },
  }, null, 2));
}

main();
