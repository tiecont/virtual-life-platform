import {createHash} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import https from 'node:https';
import {join, relative, sep} from 'node:path';
import {assetTargetFromEnvironment, sendAssetRequest, signedAssetRequest} from '../media/assets-s3.mjs';
import {loadManifests} from '../media/assets-manifest.mjs';
import {readBounded, verifyBytes} from '../media/private-art-manifest.mjs';
import {validateDockerEndpoint} from '../postgres-backup.mjs';
import {projectDiagnostics, WorkflowError, withLocalLock} from './workflow-runner.mjs';

const node = process.execPath;
const headPattern = /^[a-f0-9]{40}$/;
const meshyIdPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const hashPattern = /^[a-f0-9]{64}$/;
const repository = 'tiecont/virtual-life-platform';
const launcher = 'node scripts/engineering-harness/workflow.mjs';
const sourceStatus = ['--porcelain=v1', '-z', '--untracked-files=normal'];
const buildTimeout = 20 * 60_000;
const localOptIn = {type: 'boolean', default: false, description: 'Permit repository build/test scripts in this trusted workspace'};
const networkOptIn = {type: 'boolean', default: false, description: 'Permit the workflow’s named read-only service'};
const idInput = {type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER};
const object = (properties = {}, required = []) => ({type: 'object', additionalProperties: false, properties, required});
const choice = (...values) => ({type: 'string', enum: values, default: values[0]});
const sourceInput = {type: 'string', pattern: '^[a-f0-9]{40}$', maxLength: 40};
const file = (base, suffix) => ({
  type: 'string', maxLength: 240,
  pattern: '^' + base + '(?:[A-Za-z0-9_-]+(?:[.][A-Za-z0-9_-]+)*/)*[A-Za-z0-9_-]+(?:[.][A-Za-z0-9_-]+)*' + suffix + '$',
});

const pass = () => ({status: 'PASS'});
const blocked = code => ({status: 'BLOCKED', code});
const commandsOutcome = (...results) => results.find(result => result.status === 'FAIL')
  ?? results.find(result => result.status === 'BLOCKED')
  ?? results.find(result => result.status === 'NOT_RUN')
  ?? pass();

function checkedJson(stdout, valid) {
  try {
    const data = JSON.parse(stdout);
    if (valid(data)) return data;
  } catch {
    // Remote and subprocess payloads do not form part of error strings.
  }
  throw new WorkflowError('FAIL', 'INVALID_TOOL_OUTPUT');
}

async function artifactReference(root, reported, allowedPath, validate) {
  if (typeof reported !== 'string') throw new WorkflowError('FAIL', 'EXPECTED_PRODUCER_ARTIFACT');
  const path = relative(root, reported).split(sep).join('/');
  if (!allowedPath.test(path)) throw new WorkflowError('FAIL', 'INVALID_PRODUCER_ARTIFACT');
  const bytes = await readBounded(root, path, 256 * 1024);
  const facts = checkedJson(bytes, validate);
  return {facts, evidence: {path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}};
}

function assertRevision(value) {
  if (!headPattern.test(value)) throw new WorkflowError('FAIL', 'INVALID_SOURCE_REVISION');
  return value;
}

export async function recordRevision(ctx) {
  return ctx.command('source-revision', 'git', ['rev-parse', 'HEAD'], {
    project: stdout => ({revision: assertRevision(stdout.trim())}),
  });
}

export async function recordWorkingTree(ctx) {
  return ctx.command('source-state', 'git', ['status', ...sourceStatus], {
    project: stdout => {
      if (stdout && !stdout.endsWith('\0')) throw new WorkflowError('FAIL', 'INVALID_GIT_STATUS');
      // Porcelain renames include two path entries. Count records, without disclosing file names.
      const records = stdout.split('\0').slice(0, -1);
      let entries = 0;
      for (let i = 0; i < records.length; i++) {
        const code = records[i].slice(0, 2);
        if (!/^[ MARCUD?!T]{2}$/.test(code)) throw new WorkflowError('FAIL', 'INVALID_GIT_STATUS');
        entries++;
        if (/[RC]/.test(code)) i++;
      }
      return {dirty: entries > 0, entries};
    },
  });
}

async function repoInspect(ctx) {
  const summary = await ctx.command('development-plan', node, ['scripts/task-plan.mjs'], {
    project: stdout => {
      const data = checkedJson(stdout, value => value && Number.isSafeInteger(value.total) &&
        Number.isSafeInteger(value.remaining) && Array.isArray(value.ready) &&
        Object.values(value.counts ?? {}).every(Number.isSafeInteger));
      return {total: data.total, remaining: data.remaining, ready: data.ready.length, counts: {
        VERIFIED: data.counts.VERIFIED ?? 0, IN_PROGRESS: data.counts.IN_PROGRESS ?? 0, TODO: data.counts.TODO ?? 0,
      }};
    },
  });
  return commandsOutcome(summary);
}

function githubFailure({stderr, stdout}) {
  const raw = stderr + '\n' + stdout;
  if (/HTTP (401|403|404)\b|authentication|gh auth login|could not resolve to a (?:Repository|PullRequest)/i.test(raw)) {
    return new WorkflowError('BLOCKED', 'GITHUB_ACCESS_OR_TARGET_UNAVAILABLE');
  }
  if (/HTTP (?:429|50[0234])\b|connection (?:reset|refused)|could not resolve host|network is unreachable/i.test(raw)) {
    return new WorkflowError('BLOCKED', 'GITHUB_TRANSPORT_UNAVAILABLE');
  }
  return new WorkflowError('FAIL', 'GITHUB_COMMAND_FAILED');
}

const github = {github: true, retryRead: true, classify: githubFailure, timeoutMs: 35000};
const prInputs = {pr: idInput, expectedRevision: sourceInput, allowNetwork: networkOptIn};
const strongFailure = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']);
const acceptable = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const pending = new Set(['EXPECTED', 'PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED', 'PENDING_APPROVAL']);

export function projectPullRequest(value, pr) {
  if (!value || value.number !== pr || !headPattern.test(value.headRefOid) ||
    !['OPEN', 'MERGED', 'CLOSED'].includes(value.state) || !Array.isArray(value.statusCheckRollup) ||
    value.statusCheckRollup.length > 1000) throw new WorkflowError('FAIL', 'INVALID_GITHUB_OUTPUT');
  const counts = {success: 0, failed: 0, pending: 0, neutral: 0, unknown: 0};
  const failedJobIds = new Set();
  const quality = [];
  for (const row of value.statusCheckRollup) {
    if (!row || !['CheckRun', 'StatusContext'].includes(row.__typename)) {
      counts.unknown++;
      continue;
    }
    const state = row.__typename === 'StatusContext' ? row.state
      : row.status === 'COMPLETED' ? row.conclusion : row.status;
    if (state === 'SUCCESS') counts.success++;
    else if (strongFailure.has(state)) counts.failed++;
    else if (acceptable.has(state)) counts.neutral++;
    else if (pending.has(state)) counts.pending++;
    else counts.unknown++;
    if ((row.name ?? row.context) === 'quality') {
      quality.push(state === 'SUCCESS' ? 'SUCCESS' : strongFailure.has(state) ? 'FAILURE'
        : pending.has(state) ? 'PENDING' : 'UNKNOWN');
    }
    const match = typeof row.detailsUrl === 'string' && row.detailsUrl.match(
      /^https:\/\/github\.com\/tiecont\/virtual-life-platform\/actions\/runs\/\d+\/job\/(\d+)$/);
    if (strongFailure.has(state) && match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) > 0) {
      failedJobIds.add(Number(match[1]));
    }
  }
  return {pr, headSha: value.headRefOid, state: value.state, counts, quality: quality.slice(0, 2), failedJobIds: [...failedJobIds].slice(0, 10)};
}

async function prCi(ctx, input) {
  if (!input.allowNetwork) return blocked('NETWORK_OPT_IN_REQUIRED');
  const check = await ctx.command('github-pr-checks', 'gh', ['pr', 'view', '--repo', repository, String(input.pr),
    '--json', 'number,headRefOid,state,statusCheckRollup'], {...github, project: stdout =>
      projectPullRequest(checkedJson(stdout, value => value && typeof value === 'object'), input.pr)});
  if (check.status !== 'PASS') return check;
  const {headSha, counts, quality} = check.findings;
  if (input.expectedRevision && input.expectedRevision !== headSha) return {status: 'FAIL', code: 'PR_REVISION_MISMATCH'};
  if (counts.failed > 0) return {status: 'FAIL', code: 'GITHUB_CHECKS_FAILED'};
  if (counts.pending > 0) return {status: 'NOT_RUN', code: 'GITHUB_CHECKS_PENDING'};
  if (quality.length !== 1 || quality[0] !== 'SUCCESS' || counts.unknown > 0) {
    return blocked('REQUIRED_QUALITY_RESULT_UNCONFIRMED');
  }
  return pass();
}

function projectJob(raw, id) {
  const value = checkedJson(raw, row => Number.isSafeInteger(row?.id) && row.id === id &&
    headPattern.test(row.head_sha) && typeof row.conclusion === 'string');
  return {jobId: id, revision: value.head_sha,
    outcome: strongFailure.has(value.conclusion.toUpperCase()) ? 'FAIL' : 'NOT_A_FAILED_JOB'};
}

async function failedJobLog(ctx, input) {
  if (!input.allowNetwork) return blocked('NETWORK_OPT_IN_REQUIRED');
  const endpoint = 'repos/' + repository + '/actions/jobs/' + input.job;
  const metadata = await ctx.command('github-failed-job', 'gh', ['api', '--method', 'GET', endpoint],
    {...github, project: stdout => projectJob(stdout, input.job)});
  if (metadata.status !== 'PASS') return metadata;
  if (metadata.findings.outcome !== 'FAIL') return {status: 'NOT_RUN', code: 'JOB_DID_NOT_FAIL'};
  if (input.expectedRevision && input.expectedRevision !== metadata.findings.revision) {
    return {status: 'FAIL', code: 'JOB_REVISION_MISMATCH'};
  }
  const log = await ctx.command('github-job-log', 'gh', ['api', '--method', 'GET', endpoint + '/logs'],
    {...github, maxBytes: 4 * 1024 * 1024, project: stdout => projectDiagnostics(stdout)});
  return commandsOutcome(log);
}

const runtimeMigrationSuites = [
  'tests/integration/native-game-schema.test.ts',
  'tests/integration/runtime-admission.test.ts',
  'tests/integration/schema-compatibility.test.ts',
];

export function projectRuntimeMigrationReport(stdout, root) {
  const report = checkedJson(stdout.trim().split('\n').at(-1),
    value => value?.success === true && Array.isArray(value.testResults) &&
      value.numFailedTests === 0 && value.numPendingTests === 0 && value.numTodoTests === 0 &&
      Number.isSafeInteger(value.numTotalTests) && value.numTotalTests > 0 &&
      value.numPassedTests === value.numTotalTests);
  const files = new Set(runtimeMigrationSuites);
  let assertions = 0;
  for (const suite of report.testResults) {
    if (typeof suite?.name !== 'string' || suite.status !== 'passed' ||
      !Array.isArray(suite.assertionResults) || !suite.assertionResults.length ||
      !suite.assertionResults.every(assertion => assertion?.status === 'passed')) {
      throw new WorkflowError('FAIL', 'INCOMPLETE_MIGRATION_TEST_SUITE');
    }
    if (!files.delete(relative(root, suite.name).split(sep).join('/'))) {
      throw new WorkflowError('FAIL', 'UNEXPECTED_MIGRATION_TEST_SUITE');
    }
    assertions += suite.assertionResults.length;
  }
  if (files.size || assertions !== report.numTotalTests) {
    throw new WorkflowError('FAIL', 'INCOMPLETE_MIGRATION_TEST_SUITE');
  }
  return {testFiles: runtimeMigrationSuites.length, total: assertions, passed: report.numPassedTests};
}

async function migrationCompat(ctx, input) {
  if (input.mode === 'runtime') {
    return localExecution(ctx, input, true, async () => {
      const api = await nestBuild(ctx);
      if (api.status !== 'PASS') return api;
      return ctx.command('migration-runtime', node,
        ['scripts/with-test-db.mjs', 'pnpm', 'exec', 'vitest', 'run', '--project', 'integration',
          ...runtimeMigrationSuites, '--reporter=json'],
        {timeoutMs: buildTimeout, maxBytes: 4 * 1024 * 1024,
          project: stdout => projectRuntimeMigrationReport(stdout, ctx.root)});
    });
  }
  const result = await ctx.command('frozen-migrations', node, ['scripts/engineering-harness/workflow-migrations.mjs', ctx.revision],
    {timeoutMs: 30000, project: stdout => {
      const value = checkedJson(stdout, row => row?.revision === ctx.revision &&
        Number.isSafeInteger(row.migrationCount) && Number.isSafeInteger(row.frozenCount) &&
        hashPattern.test(row.sha256) && row.migrationCount >= row.frozenCount);
      return {migrationCount: value.migrationCount, frozenCount: value.frozenCount, sha256: value.sha256};
    }});
  return commandsOutcome(result);
}

async function requireLocalDatabase(ctx) {
  const context = await ctx.command('docker-local-context', 'docker',
    ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'], {project: stdout => {
      const host = checkedJson(stdout, value => typeof value === 'string');
      try {
        validateDockerEndpoint(host);
      } catch {
        throw new WorkflowError('BLOCKED', 'NONLOCAL_DOCKER_CONTEXT');
      }
      return {local: true};
    }});
  if (context.status !== 'PASS') return context;
  return ctx.command('docker-cached-postgres', 'docker',
    ['image', 'inspect', '--format', '{{.Id}}', 'postgres:17.7-alpine'], {
      project: stdout => {
        if (!/^sha256:[a-f0-9]{64}$/.test(stdout.trim())) throw new WorkflowError('FAIL', 'INVALID_DOCKER_IMAGE_ID');
        return {cached: true, imageDigest: stdout.trim()};
      },
      classify: () => new WorkflowError('BLOCKED', 'DOCKER_OR_PINNED_TEST_IMAGE_UNAVAILABLE'),
    });
}

async function localExecution(ctx, input, database, action) {
  if (!input.allowLocalExecution) return blocked('LOCAL_EXECUTION_OPT_IN_REQUIRED');
  return withLocalLock(ctx.root, async () => {
    if (database) {
      const preflight = await requireLocalDatabase(ctx);
      if (preflight.status !== 'PASS') return preflight;
    }
    const result = await action();
    return commandsOutcome(result);
  });
}

async function nest(ctx, input) {
  const integration = input.mode === 'integration';
  return localExecution(ctx, input, integration, () => integration
    ? ctx.command('nest-integration', 'pnpm', ['test:integration'], {timeoutMs: buildTimeout, maxBytes: 4 * 1024 * 1024})
    : nestBuild(ctx));
}

async function unity(ctx, input) {
  if (!input.allowLocalExecution) return blocked('LOCAL_EXECUTION_OPT_IN_REQUIRED');
  if (!process.env.UNITY_EDITOR) return blocked('LICENSED_UNITY_EDITOR_REQUIRED');
  if (!(await lstat(join(ctx.root, '.git'))).isFile()) return blocked('ISOLATED_UNITY_WORKTREE_REQUIRED');
  return localExecution(ctx, input, false, () => ctx.command('unity-validation', node,
    ['scripts/unity-validate.mjs', input.action], {unity: true, timeoutMs: 30 * 60_000, project: async stdout => {
      const value = checkedJson(stdout.trim().split('\n').at(-1), row => row?.classification === 'PASS');
      const {evidence} = await artifactReference(ctx.root, value.report,
        /^artifacts\/unity\/[A-Za-z0-9-]{15,64}\/result[.]json$/,
        row => row?.classification === 'PASS' && row.sourceRevision === ctx.revision && row.action === input.action);
      return {classification: 'PASS', report: evidence};
    }}));
}

async function native(ctx, input) {
  return localExecution(ctx, input, true, async () => {
    const api = await nestBuild(ctx);
    if (api.status !== 'PASS') return api;
    const engine = await ctx.command('native-runtime-build', 'cargo',
      ['build', '--locked', '--offline', '-j', '2', '--package', 'aetheria-game-runtime'], {timeoutMs: buildTimeout});
    if (engine.status !== 'PASS') return engine;
    return ctx.command('native-process-acceptance', node,
      ['scripts/with-test-db.mjs', 'node', '--import', 'tsx', 'scripts/native-wss-interop.mjs', '--' + input.scenario],
      {timeoutMs: buildTimeout, maxBytes: 4 * 1024 * 1024, project: async stdout => {
        const value = checkedJson(stdout.trim().split('\n').at(-1), row => row?.result === 'PASS' &&
          Number.isSafeInteger(row.scenarios) && row.scenarios > 0 && typeof row.artifactDirectory === 'string');
        const {evidence} = await artifactReference(ctx.root, join(value.artifactDirectory, 'facts.json'),
          /^artifacts\/desktop-first\/vl022\/interop-[a-f0-9]{8}\/facts[.]json$/,
          row => row?.result === 'PASS' && row.cleanupComplete === true && row.scenarios?.length === value.scenarios);
        return {scenarios: value.scenarios, report: evidence};
      }});
  });
}

async function nestBuild(ctx) {
  const packages = await ctx.command('workspace-packages', 'pnpm', ['build:packages'], {timeoutMs: buildTimeout});
  if (packages.status !== 'PASS') return packages;
  return ctx.command('nest-build', 'pnpm', ['--filter', '@aetheria/platform-api', 'build'], {timeoutMs: buildTimeout});
}

async function petGlb(ctx, input) {
  const result = await ctx.step('glb-inspection', async () => {
    const bytes = await readBounded(ctx.root, input.file, 64 * 1024 * 1024);
    verifyBytes({path: input.file, bytes: bytes.length, sha256: input.sha256}, bytes);
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    if (!Array.isArray(json.meshes) || !json.meshes.length) throw new WorkflowError('FAIL', 'GLB_HAS_NO_MESHES');
    return {sha256: input.sha256, bytes: bytes.length, meshes: json.meshes.length,
      skins: Array.isArray(json.skins) ? json.skins.length : 0, animations: Array.isArray(json.animations) ? json.animations.length : 0};
  });
  return commandsOutcome(result);
}

async function meshy(ctx, input) {
  const result = await ctx.step('meshy-task-record', async () => {
    const contents = await readBounded(ctx.root, input.file, 1024 * 1024);
    const value = checkedJson(contents, row => row && typeof row.id === 'string' && meshyIdPattern.test(row.id) &&
      ['PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELED'].includes(row.status) &&
      (row.progress === undefined || (Number.isInteger(row.progress) && row.progress >= 0 && row.progress <= 100)));
    return {id: value.id, status: value.status, ...(value.progress === undefined ? {} : {progress: value.progress}),
      recordSha256: createHash('sha256').update(contents).digest('hex'), providerRequests: 0};
  });
  if (result.status !== 'PASS') return result;
  switch (result.findings.status) {
    case 'FAILED':
    case 'CANCELED': return {status: 'FAIL', code: 'MESHY_TASK_UNSUCCESSFUL'};
    case 'SUCCEEDED': return pass();
    default: return {status: 'NOT_RUN', code: 'MESHY_TASK_PENDING'};
  }
}

async function minio(ctx, input) {
  if (!input.allowNetwork) return blocked('NETWORK_OPT_IN_REQUIRED');
  const result = await ctx.step('minio-readback', async ({recordAttempt}) => {
    const env = Object.fromEntries(['ENDPOINT', 'BUCKET', 'REGION', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY']
      .map(key => ['S3_' + key, process.env['AETHERIA_HARNESS_MINIO_' + key]]));
    let target;
    try {
      target = assetTargetFromEnvironment(env);
    } catch {
      throw new WorkflowError('BLOCKED', 'MINIO_READ_ONLY_CONFIGURATION_REQUIRED');
    }
    if (!['127.0.0.1', '[::1]'].includes(new URL(target.endpoint).hostname)) {
      throw new WorkflowError('BLOCKED', 'NONLOCAL_MINIO_ENDPOINT');
    }
    const [{manifest}] = await loadManifests(ctx.root, [input.manifest]);
    if (manifest.sizeBytes > 64 * 1024 * 1024) throw new WorkflowError('BLOCKED', 'MINIO_OBJECT_LIMIT');
    const signed = signedAssetRequest({target, key: manifest.s3Key, method: 'GET'});
    let response;
    try {
      response = await sendAssetRequest(signed, manifest.sizeBytes, (url, options, callback) =>
        https.request(url, {...options, signal: ctx.signal}, callback));
      recordAttempt({exitCode: null, bytes: response.bytes});
    } catch {
      recordAttempt({exitCode: null, bytes: 0});
      throw new WorkflowError('BLOCKED', 'MINIO_TRANSPORT_UNAVAILABLE');
    }
    if ([401, 403, 404].includes(response.status)) throw new WorkflowError('BLOCKED', 'MINIO_OBJECT_UNAVAILABLE');
    if (response.status !== 200 || response.bytes !== manifest.sizeBytes ||
      response.headers['content-type'] !== manifest.contentType ||
      createHash('sha256').update(response.body).digest('hex') !== manifest.sha256) {
      throw new WorkflowError('FAIL', 'MINIO_READBACK_MISMATCH');
    }
    return {bytes: response.bytes, sha256: manifest.sha256};
  });
  return commandsOutcome(result);
}

async function releaseSource(ctx) {
  const result = await ctx.command('release-manifest-policy', node, ['scripts/release-manifest.mjs'], {
    project: stdout => {
      const value = checkedJson(stdout, row => row?.policy === 'PASS' && Array.isArray(row.committedCandidates) &&
        row.autoMerge === false && row.productionAutoPromotion === false && row.ownerPromotionRequired === true);
      return {committedCandidates: value.committedCandidates.length, ownerPromotionRequired: true};
    },
  });
  return commandsOutcome(result);
}

async function releaseReadiness(ctx) {
  const result = await releaseSource(ctx);
  if (result.status !== 'PASS') return result;
  const decision = await ctx.step('release-decision', async () => {
    const value = checkedJson(await readBounded(ctx.root, 'config/release-decision.json', 64 * 1024),
      row => typeof row?.publicRelease === 'boolean' && typeof row?.authorization?.publicDeployment === 'boolean');
    return {publicRelease: value.publicRelease, publicDeploymentAuthorized: value.authorization.publicDeployment};
  });
  if (decision.status !== 'PASS') return decision;
  return blocked(decision.findings.publicDeploymentAuthorized
    ? 'HOSTED_ATTESTATIONS_AND_OWNER_ACCEPTANCE_REQUIRED' : 'OWNER_RELEASE_HOLD');
}

async function localReview(ctx) {
  const results = await Promise.all([repoInspect(ctx), migrationCompat(ctx, {mode: 'static'}), releaseSource(ctx)]);
  return commandsOutcome(...results);
}

async function summarizeReview(ctx, input) {
  const results = await Promise.all([repoInspect(ctx), prCi(ctx, input)]);
  if (input.includeFailedLog && ctx.findings['github-pr-checks']?.failedJobIds.length &&
    (!input.expectedRevision || input.expectedRevision === ctx.findings['github-pr-checks'].headSha)) {
    results.push(await failedJobLog(ctx, {allowNetwork: input.allowNetwork, job: ctx.findings['github-pr-checks'].failedJobIds[0],
      expectedRevision: ctx.findings['github-pr-checks'].headSha}));
  }
  return commandsOutcome(...results);
}

const describe = (summary, tags, inputSchema, run, manual = []) => ({summary, tags, inputSchema, run, manual});

export const workflows = {
  'repo-inspect': describe('Inspect HEAD, worktree cleanliness, and backlog readiness', ['git', 'plan'], object(), repoInspect),
  'pr-ci': describe('Read a single PR check snapshot from the configured Aetheria repository', ['github', 'ci', 'read-only'],
    object(prInputs, ['pr']), prCi, ['Supply a read-only AETHERIA_HARNESS_GITHUB_TOKEN or authorize the configured gh identity.']),
  'failed-job-log': describe('Extract bounded diagnostic categories and line offsets from one failed GitHub job', ['github', 'ci', 'logs'],
    object({job: idInput, expectedRevision: sourceInput, allowNetwork: networkOptIn}, ['job']), failedJobLog),
  'migration-compat': describe('Compare frozen migration bytes or run the native schema/compatibility integration suites', ['database', 'migration'],
    object({mode: choice('static', 'runtime'), allowLocalExecution: localOptIn}), migrationCompat,
    ['Runtime mode needs local Docker with the pinned image cached and frozen dependencies installed. It runs CI’s three current-schema suites. The separate archived-runtime proof is pnpm game:migration:compat. Static mode needs the checked-in migration history.']),
  'rust-tests': describe('Run the pinned Rust workspace tests from the offline toolchain/dependency cache', ['rust', 'tests', 'runtime'],
    object({allowLocalExecution: localOptIn}), (ctx, input) => localExecution(ctx, input, false,
      () => ctx.command('rust-workspace-tests', 'cargo', ['test', '--workspace', '--locked', '--offline', '-j', '2'],
        {timeoutMs: buildTimeout, maxBytes: 4 * 1024 * 1024})),
    ['Install the repository’s Rust toolchain and warm its locked dependencies before running.']),
  'nest-check': describe('Build the Nest control plane or run its owned integration suites', ['nest', 'backend', 'tests'],
    object({mode: choice('build', 'integration'), allowLocalExecution: localOptIn}), nest),
  'unity-build': describe('Run licensed Unity validation in an isolated Git worktree', ['unity', 'build', 'tests'],
    object({action: choice('tests', 'linux', 'linux-player-tests', 'windows-mono', 'world'), allowLocalExecution: localOptIn}), unity,
    ['Set UNITY_EDITOR to the licensed pinned Editor executable in an isolated linked worktree. Project packages and build modules are local prerequisites.']),
  'native-acceptance': describe('Run a native Rust/Nest/WSS process test on a disposable loopback database', ['native', 'rust', 'nest', 'acceptance'],
    object({scenario: choice('pet-arena', 'pet-arena-loss', 'runtime-gameplay'), allowLocalExecution: localOptIn}), native,
    ['Requires locked Node/Rust dependencies, local Docker with cached PostgreSQL, and the existing test browser/TLS tools. Scope is the named process fixture.']),
  'pet-assets': describe('Run the existing Pet asset and provenance checks', ['pet', 'catalog', 'art'],
    object({allowLocalExecution: localOptIn}), (ctx, input) => localExecution(ctx, input, false, async () => {
      const packages = await ctx.command('workspace-packages', 'pnpm', ['build:packages'], {timeoutMs: buildTimeout});
      if (packages.status !== 'PASS') return packages;
      return ctx.command('pet-asset-checks', 'pnpm', ['assets:check'], {timeoutMs: buildTimeout});
    })),
  'pet-glb': describe('Check a local Pet GLB container against its pinned bytes and report mesh/rig counts', ['pet', 'glb', 'art'],
    object({file: file('artifacts/', '[.]glb'), sha256: {type: 'string', maxLength: 64, pattern: '^[a-f0-9]{64}$'}}, ['file', 'sha256']),
    petGlb, ['Use an ignored artifacts/ path. For rig, Unity or visual acceptance, use the canonical art skill.']),
  'meshy-task': describe('Inspect a saved Meshy task record by bounded offline projection', ['meshy', 'art', 'offline'],
    object({file: file('artifacts/', '[.]json')}, ['file']), meshy,
    ['Use an existing task GET response stored under ignored artifacts/. The workflow makes zero provider requests.']),
  'minio-verify': describe('Read back one manifest-bound object from a loopback MinIO using GET', ['minio', 's3', 'artifact', 'read-only'],
    object({manifest: file('assets/manifests/', '[.]manifest[.]json'), allowNetwork: networkOptIn}, ['manifest']), minio,
    ['Supply AETHERIA_HARNESS_MINIO_ENDPOINT, BUCKET, REGION, ACCESS_KEY_ID and SECRET_ACCESS_KEY using that prefix. Use a loopback HTTPS origin and bucket-scoped read-only credentials.']),
  'release-source': describe('Validate checked-in release manifest policy', ['release', 'governance', 'offline'], object(), releaseSource),
  'release-readiness': describe('Inspect the checked-in release policy and authorization boundary', ['release', 'governance'],
    object(), releaseReadiness, ['Hosted exact-source checks, signed evidence and owner authorization remain separate acceptance dependencies.']),
  'local-review': describe('Compose repository, frozen migration, and source release policy checks', ['composition', 'git', 'database', 'release'],
    object(), localReview),
  'summarize-review': describe('Compose repository, one PR CI snapshot, and optionally the first failing job diagnostic', ['composition', 'git', 'github', 'ci'],
    object({...prInputs, includeFailedLog: {type: 'boolean', default: false}}, ['pr']), summarizeReview),
};

export function listWorkflows() {
  return Object.entries(workflows).map(([id, {summary, tags}]) => ({id, summary, tags}));
}

export function describeWorkflow(id) {
  if (!Object.hasOwn(workflows, id)) throw new WorkflowError('FAIL', 'UNKNOWN_WORKFLOW');
  const {summary, tags, inputSchema, manual} = workflows[id];
  return {id, summary, tags, inputSchema, command: launcher + ' run ' + id, manual};
}

export function normalizeInput(schema, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !Object.hasOwn(schema.properties, key)) ||
    schema.required.some(key => !Object.hasOwn(value, key))) throw new WorkflowError('FAIL', 'INVALID_INPUT_SCHEMA');
  const normalized = {};
  for (const [name, rule] of Object.entries(schema.properties)) {
    const field = Object.hasOwn(value, name) ? value[name] : rule.default;
    if (field === undefined) continue;
    const validType = rule.type === 'integer'
      ? Number.isSafeInteger(field) && field >= rule.minimum && field <= rule.maximum
      : typeof field === rule.type;
    if (!validType || (rule.enum && !rule.enum.includes(field)) ||
      (rule.maxLength && field.length > rule.maxLength) || (rule.pattern && !new RegExp(rule.pattern).test(field))) {
      throw new WorkflowError('FAIL', 'INVALID_INPUT_SCHEMA');
    }
    normalized[name] = field;
  }
  return normalized;
}
