import {spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {lstat, mkdir, rmdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {readBounded, safePath} from '../media/private-art-manifest.mjs';

export const schemaVersion = 1;
export const statusExitCodes = {PASS: 0, FAIL: 1, BLOCKED: 2, NOT_RUN: 3};
const artifactRoot = 'artifacts/engineering-harness/runs';
const maxReportBytes = 64 * 1024;
const maxCommandBytes = 1024 * 1024;
const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const diagnosticPatterns = [
  ['GITHUB_ERROR_ANNOTATION', /(?:^|\t| )##\[error\]/],
  ['TEST_FAILURE', /(?:\bFAIL(?:ED)?\b|test result: FAILED|AssertionError)/],
  ['COMPILER_ERROR', /\berror(?:\[[A-Z]\d+\])?:/],
  ['PERMISSION_DENIED', /permission denied|access denied/i],
  ['TIMEOUT', /timed? out|deadline exceeded/i],
  ['MISSING_OFFLINE_DEPENDENCY', /no matching package named|--offline was specified/i],
];
const unsigned = value => Number.isSafeInteger(value) && value >= 0;

export class WorkflowError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function commandEnvironment({github = false, unity = false} = {}) {
  const keys = ['PATH', 'HOME', 'SystemRoot', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP',
    'XDG_RUNTIME_DIR', 'LANG', 'PNPM_HOME'];
  if (github) keys.push('XDG_CONFIG_HOME', 'GH_CONFIG_DIR');
  if (unity) keys.push('UNITY_EDITOR', 'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY');
  const env = Object.fromEntries(keys.filter(key => typeof process.env[key] === 'string')
    .map(key => [key, process.env[key]]));
  if (github) {
    env.GH_HOST = 'github.com';
    if (process.env.AETHERIA_HARNESS_GITHUB_TOKEN) env.GH_TOKEN = process.env.AETHERIA_HARNESS_GITHUB_TOKEN;
  }
  return {...env, CI: '1', NO_COLOR: '1', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1',
    GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor',
    GIT_CONFIG_VALUE_0: 'false', CARGO_NET_OFFLINE: 'true', CARGO_BUILD_JOBS: '2', RAYON_NUM_THREADS: '2',
    VITEST_MAX_WORKERS: '2', NEXT_TELEMETRY_DISABLED: '1'};
}

function signalProcess(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function runCommand(root, command, args, {signal, env, timeoutMs, maxBytes}) {
  return new Promise(resolve => {
    if (signal.aborted) return resolve({problem: 'CANCELLED', stdout: '', stderr: '', bytes: 0, exitCode: null});
    const output = {stdout: [], stderr: []};
    let problem, forceTimer, bytes = 0;
    const child = spawn(command, args, {
      cwd: root, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stop = code => {
      if (problem) return;
      problem = code;
      signalProcess(child, 'SIGTERM');
      // Existing disposable runners trap SIGTERM to tear down their own process groups and database.
      forceTimer = setTimeout(() => signalProcess(child, 'SIGKILL'), 15000);
      forceTimer.unref();
    };
    const cancel = () => stop('CANCELLED');
    signal.addEventListener('abort', cancel, {once: true});
    const timer = setTimeout(() => stop('TIMEOUT'), timeoutMs);
    timer.unref();
    for (const name of Object.keys(output)) {
      child[name].on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) stop('OUTPUT_LIMIT');
        if (!problem) output[name].push(chunk);
      });
    }
    child.once('error', error => {
      problem ??= error.code === 'ENOENT' ? 'TOOL_UNAVAILABLE' : 'SPAWN_FAILURE';
    });
    child.once('close', (exitCode, childSignal) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      signal.removeEventListener('abort', cancel);
      if (problem && process.platform !== 'win32') signalProcess(child, 'SIGKILL');
      resolve({problem: problem ?? (childSignal ? 'SUBPROCESS_SIGNAL' : undefined), exitCode, bytes,
        stdout: Buffer.concat(output.stdout).toString('utf8'), stderr: Buffer.concat(output.stderr).toString('utf8')});
    });
  });
}

// Emit only fixed categories and offsets. No subprocess or remote log text crosses this boundary.
export function projectDiagnostics(stdout, maxDiagnostics = 20) {
  const lines = stdout.split('\n');
  const diagnostics = [];
  const counts = Object.fromEntries(diagnosticPatterns.map(([kind]) => [kind, 0]));
  for (let index = 0; index < lines.length; index++) {
    const category = diagnosticPatterns.find(([, pattern]) => pattern.test(lines[index]))?.[0];
    if (category) {
      counts[category]++;
      if (diagnostics.length < maxDiagnostics) diagnostics.push({line: index + 1, category});
    }
  }
  return {lineCount: lines.length - Number(lines.at(-1) === ''), counts, diagnostics};
}

async function privateDirectory(root, directory) {
  const full = await safePath(root, directory);
  await mkdir(full, {recursive: true, mode: 0o700});
  const stat = await lstat(full);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())) {
    throw new WorkflowError('BLOCKED', 'UNSAFE_ARTIFACT_DIRECTORY');
  }
  return full;
}

export function newExecution(root, workflow, signal) {
  const started = performance.now();
  const runId = randomUUID();
  const steps = [];
  const findings = {};
  const queue = [];
  let active = 0;

  function drain() {
    while (active < 2 && queue.length) {
      const {fn, resolve, reject} = queue.shift();
      active++;
      Promise.resolve().then(fn).then(resolve, reject).finally(() => {
        active--;
        drain();
      });
    }
  }

  function bounded(fn) {
    return new Promise((resolve, reject) => {
      queue.push({fn, resolve, reject});
      drain();
    });
  }

  function step(id, implementation) {
    return bounded(async () => {
      const tick = performance.now();
      const outcome = {id, status: 'PASS', attempts: 0};
      steps.push(outcome);
      const recordAttempt = raw => {
        outcome.attempts++;
        outcome.exitCode = raw.exitCode;
        outcome.subprocessOutputBytes = (outcome.subprocessOutputBytes ?? 0) + raw.bytes;
      };
      const diagnose = (raw, max = 5) => {
        const summary = projectDiagnostics(raw.stderr + '\n' + raw.stdout, max);
        if (summary.diagnostics.length) outcome.diagnostics = summary;
      };
      try {
        if (signal.aborted) throw new WorkflowError('NOT_RUN', 'CANCELLED');
        outcome.findings = await implementation({recordAttempt, diagnose});
      } catch (error) {
        outcome.status = error instanceof WorkflowError ? error.status : 'FAIL';
        outcome.code = error instanceof WorkflowError ? error.code : 'UNEXPECTED_ERROR';
      }
      outcome.durationMs = Math.round(performance.now() - tick);
      if (outcome.findings !== undefined) findings[id] = outcome.findings;
      return outcome;
    });
  }

  function command(id, program, args, options = {}) {
    return step(id, async ({recordAttempt, diagnose}) => {
      const maxAttempts = options.retryRead === true ? 2 : 1;
      const limits = {signal, timeoutMs: options.timeoutMs ?? 15000, maxBytes: options.maxBytes ?? maxCommandBytes,
        env: commandEnvironment(options)};
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const raw = await runCommand(root, program, args, limits);
        recordAttempt(raw);
        const combined = raw.stderr + '\n' + raw.stdout;
        const transient = options.retryRead && !signal.aborted &&
          (raw.problem === 'TIMEOUT' || (raw.exitCode !== 0 && /HTTP (?:429|50[0234])\b/.test(combined)));
        if (transient && attempt < maxAttempts) continue;
        if (raw.problem) {
          const status = raw.problem === 'TOOL_UNAVAILABLE' ? 'BLOCKED'
            : raw.problem === 'CANCELLED' ? 'NOT_RUN' : 'FAIL';
          throw new WorkflowError(status, raw.problem);
        }
        if (raw.exitCode !== 0) {
          diagnose(raw);
          if (options.classify) throw options.classify(raw);
          if (/no matching package named|--offline was specified/i.test(combined) && program === 'cargo') {
            throw new WorkflowError('BLOCKED', 'OFFLINE_RUST_DEPENDENCY_UNAVAILABLE');
          }
          throw new WorkflowError('FAIL', 'COMMAND_FAILED');
        }
        return options.project?.(raw.stdout, raw.stderr);
      }
    });
  }

  async function finish({revision, worktreeDirty, status, code, reproduce, sourceBinding}) {
    const recordedSteps = steps.map(({findings: projected, ...record}) => projected === undefined
      ? record : {...record, finding: record.id});
    const result = {schemaVersion, runId, workflow, status, code, revision, worktreeDirty, sourceBinding,
      durationMs: Math.round(performance.now() - started), findings, steps: recordedSteps, reproduce};
    const bytes = Buffer.from(JSON.stringify(result, null, 2) + '\n');
    if (bytes.length > maxReportBytes) throw new WorkflowError('FAIL', 'REPORT_LIMIT');
    const base = await privateDirectory(root, artifactRoot);
    const directory = join(base, runId);
    await mkdir(directory, {mode: 0o700});
    const path = artifactRoot + '/' + runId + '/report.json';
    await writeFile(join(directory, 'report.json'), bytes, {flag: 'wx', mode: 0o600});
    return {...result, evidence: [{path, sha256: sha256(bytes), bytes: bytes.length}]};
  }

  return {root, signal, findings, steps, command, step, finish};
}

function projectedSteps(data) {
  if (data.steps.length > 64 || !unsigned(data.durationMs) ||
    !data.steps.every(step => step && Object.hasOwn(statusExitCodes, step.status) &&
      unsigned(step.attempts) && unsigned(step.durationMs))) {
    throw new WorkflowError('FAIL', 'INVALID_EVIDENCE');
  }
  return data.steps.map((step, index) => {
    const result = {index: index + 1, status: step.status, attempts: step.attempts, durationMs: step.durationMs};
    if (unsigned(step.exitCode) || step.exitCode === null) result.exitCode = step.exitCode;
    if (unsigned(step.subprocessOutputBytes)) result.subprocessOutputBytes = step.subprocessOutputBytes;
    const diagnostics = step.diagnostics?.diagnostics;
    if (Array.isArray(diagnostics)) {
      const kinds = new Set(diagnosticPatterns.map(([category]) => category));
      result.diagnostics = diagnostics.slice(0, 20).filter(row => unsigned(row?.line) && row.line > 0 &&
        kinds.has(row.category)).map(({line, category}) => ({line, category}));
    }
    return result;
  });
}

function standardView(result, steps) {
  const stepCounts = Object.fromEntries(Object.keys(statusExitCodes).map(status => [status, 0]));
  for (const step of steps) stepCounts[step.status]++;
  return {...result, stepCount: steps.length, stepCounts};
}

export function projectRunView(data, view) {
  if (view === 'full') return data;
  const {schemaVersion, runId, workflow, status, code, revision, worktreeDirty, sourceBinding, durationMs, evidence} = data;
  const result = {schemaVersion, runId, workflow, status, code, revision, worktreeDirty, sourceBinding, durationMs, evidence};
  return view === 'standard' ? standardView(result, data.steps) : result;
}

export async function readEvidence(root, id, isKnownWorkflow, expectedSha256, view = 'brief') {
  if (!uuidPattern.test(id)) throw new WorkflowError('FAIL', 'INVALID_RUN_ID');
  const path = artifactRoot + '/' + id + '/report.json';
  let bytes;
  try {
    bytes = await readBounded(root, path, maxReportBytes);
  } catch (error) {
    if (error.code === 'ENOENT') throw new WorkflowError('NOT_RUN', 'EVIDENCE_NOT_FOUND');
    throw new WorkflowError('FAIL', 'INVALID_EVIDENCE');
  }
  const digest = sha256(bytes);
  if (expectedSha256 !== undefined && digest !== expectedSha256) throw new WorkflowError('FAIL', 'EVIDENCE_DIGEST_MISMATCH');
  let data;
  try {
    data = JSON.parse(bytes);
  } catch {
    throw new WorkflowError('FAIL', 'INVALID_EVIDENCE');
  }
  if (data?.schemaVersion !== schemaVersion || data.runId !== id || !Array.isArray(data.steps) ||
    !Object.hasOwn(statusExitCodes, data.status) || !isKnownWorkflow(data.workflow) ||
    (data.revision !== null && !/^[a-f0-9]{40}$/.test(data.revision))) {
    throw new WorkflowError('FAIL', 'INVALID_EVIDENCE');
  }
  // Persisted text and arbitrary findings remain local, including in the full view.
  const result = {schemaVersion, runId: id, workflow: data.workflow, status: data.status, revision: data.revision,
    evidence: [{path, sha256: digest, bytes: bytes.length}]};
  if (view === 'brief') return result;
  const steps = projectedSteps(data);
  const standard = standardView({...result, durationMs: data.durationMs}, steps);
  return view === 'full' ? {...standard, steps} : standard;
}

export async function withLocalLock(root, action) {
  const home = await privateDirectory(root, 'artifacts/engineering-harness');
  const lock = join(home, 'local-workflow.lock');
  try {
    await mkdir(lock, {mode: 0o700});
  } catch (error) {
    if (error.code === 'EEXIST') throw new WorkflowError('BLOCKED', 'LOCAL_WORKFLOW_LOCKED');
    throw error;
  }
  try {
    return await action();
  } finally {
    await rmdir(lock);
  }
}
