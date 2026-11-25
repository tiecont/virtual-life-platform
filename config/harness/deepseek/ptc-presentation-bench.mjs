#!/usr/bin/env node
// Native vs PTC presentation benchmark.
//
// Runs the SAME headless one-shot workloads twice — once with native Function
// Calling, once with PTC (`run_code` + generated SDK) — and measures what the model
// actually had to carry. Metrics come from the recorded session log, not from an
// estimate:
//
//   systemBytes        system-prompt bytes (the presentation cost)
//   toolSchemaBytes    bytes of the tool catalog in the request header
//   toolResultBytes    bytes of tool results that entered conversation history
//   steps / ptcSubcalls  orchestration turns and underlying PTC sub-calls
//   wallMs             end-to-end latency
//
// Usage:
//   node config/harness/deepseek/ptc-presentation-bench.mjs [--reps N] [--workload filter|bigfilter|multi]-reps N] [--workload filter|multi]
//
// It prints a table and writes artifacts/engineering-harness/bench/report.json.

import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const DSH_ROOT = '/opt/DeepSeek Harness/resources/app/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js';
const NODE = process.execPath;
const OUT_DIR = join(REPO_ROOT, 'artifacts', 'engineering-harness', 'bench');
const PROVIDER_PATCH = join(REPO_ROOT, 'config', 'harness', 'deepseek', 'profiles', 'bench-provider.patch.yml');

// One workload, asked identically in both modes. It forces a large tool result and
// then requires only a tiny derivation from it — exactly the shape PTC should win.
const WORKLOADS = {
  filter: {
    prompt:
      'Run the command: node scripts/engineering-harness/workflow.mjs run plan-status\n' +
      'From its JSON output report ONLY: the "total" number and each value inside "counts". ' +
      'Answer in three lines or fewer. Do not paste any other output.',
  },
  // The case PTC exists for: a large raw input where only a tiny derivation is
  // wanted. Native must pull the bytes into history; a PTC program can consume
  // them execution-locally and return two numbers.
  bigfilter: {
    prompt:
      'Using only the file config/development-plan.json, answer with exactly two lines: ' +
      'the total number of entries in "tasks", and how many of them have priority 0. ' +
      'Nothing else.',
  },
  multi: {
    prompt:
      'Do these three reads in one step if you can: ' +
      '(1) node scripts/engineering-harness/workflow.mjs list  ' +
      '(2) git -C . rev-parse --abbrev-ref HEAD  ' +
      '(3) node -e "console.log(require(\'./package.json\').scripts[\'plan:status\'])"  ' +
      'Then answer with exactly three lines: the number of checks, the branch name, and that script command.',
  },
};

function parseArgs(tokens) {
  const options = { reps: 2, workloads: Object.keys(WORKLOADS) };
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === '--reps') options.reps = Number(tokens[++i]);
    else if (tokens[i] === '--workload') options.workloads = [tokens[++i]];
  }
  return options;
}

/** Newest session directory for this workspace, recorded just before the run. */
async function sessionDirs() {
  const root = join(homedir(), '.dsh', 'sessions', '--home-tiecont-Projects-Aetheria--');
  if (!existsSync(root)) return [];
  const entries = await readdir(root);
  const detailed = [];
  for (const name of entries) {
    const file = join(root, name, 'session.v4.jsonl.zstd');
    if (!existsSync(file)) continue;
    detailed.push({ name, file, mtimeMs: (await stat(file)).mtimeMs });
  }
  return detailed.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function readSession(file) {
  // Session logs are appended as a sequence of independent zstd frames. Node's
  // zstdDecompressSync stops after the first frame, so use the zstd CLI which
  // continues across the whole concatenation, and fall back to Node if absent.
  const cli = spawnSync('zstd', ['-dc', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  let text;
  if (cli.status === 0 && cli.stdout) {
    text = cli.stdout;
  } else {
    text = zstdDecompressSync(await readFile(file)).toString('utf8');
  }
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

/** Measure one recorded session. */
function measure(events) {
  let systemBytes = 0;
  let toolSchemaBytes = null;
  let toolResultBytes = 0;
  let steps = 0;
  let ptcSubcalls = 0;
  let assistantMessages = 0;
  for (const event of events) {
    if (event.type === 'system/message') {
      for (const block of event.data?.message?.content ?? []) systemBytes += String(block.text ?? '').length;
    }
    if (event.type === 'request/header' && toolSchemaBytes === null) {
      toolSchemaBytes = JSON.stringify(event.data?.header?.tools ?? []).length;
    }
    if (event.type === 'tool/result') {
      for (const block of event.data?.message?.content ?? []) toolResultBytes += String(block.text ?? '').length;
    }
    if (event.type === 'step/end') steps += 1;
    if (event.type === 'tool/ptc-dispatch') ptcSubcalls += 1;
    if (event.type === 'assistant/message') assistantMessages += 1;
  }
  const header = events.find(event => event.type === 'session');
  return {
    preset: header?.data?.agentPreset ?? null,
    systemBytes,
    toolSchemaBytes,
    toolResultBytes,
    steps,
    assistantMessages,
    ptcSubcalls,
  };
}

function runHeadless(mode, prompt) {
  const before = Date.now();
  const result = spawnSync(
    NODE,
    [DSH_ROOT, '--profile', 'bench', '--patch', PROVIDER_PATCH, prompt],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 600000,
      env: { ...process.env, DSH_TOOLS_MODE: mode },
    },
  );
  return {
    exitCode: result.status,
    wallMs: Date.now() - before,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim().slice(0, 400),
    startedAt: before,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(OUT_DIR, { recursive: true });
  const rows = [];

  for (const workloadName of options.workloads) {
    const workload = WORKLOADS[workloadName];
    if (!workload) throw new Error(`Unknown workload "${workloadName}"`);
    for (const mode of ['native', 'ptc']) {
      for (let rep = 1; rep <= options.reps; rep += 1) {
        const existing = await sessionDirs();
        const newestBefore = existing[0]?.mtimeMs ?? 0;
        const run = runHeadless(mode, workload.prompt);
        // Find the session this run created (mtime advanced).
        const after = await sessionDirs();
        const created = after.find(entry => entry.mtimeMs > newestBefore) ?? after[0];
        let metrics = null;
        if (created) {
          try {
            metrics = measure(await readSession(created.file));
          } catch (error) {
            metrics = { error: String(error.message) };
          }
        }
        rows.push({
          workload: workloadName,
          mode,
          rep,
          exitCode: run.exitCode,
          wallMs: run.wallMs,
          answer: run.stdout.split('\n').slice(-6).join(' ').slice(0, 200),
          session: created?.name ?? null,
          ...(metrics ?? {}),
        });
        process.stderr.write(`  ${workloadName}/${mode}/#${rep} exit=${run.exitCode} wall=${run.wallMs}ms steps=${metrics?.steps ?? '?'}\n`);
      }
    }
  }

  const report = { generatedAt: new Date().toISOString(), node: process.version, rows };
  await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  // Per workload/mode averages, only over runs that actually succeeded.
  const summary = [];
  for (const workloadName of options.workloads) {
    for (const mode of ['native', 'ptc']) {
      const group = rows.filter(row => row.workload === workloadName && row.mode === mode && row.exitCode === 0);
      if (group.length === 0) {
        summary.push({ workload: workloadName, mode, runs: 0, note: 'no successful run' });
        continue;
      }
      const avg = key => Math.round(group.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) / group.length);
      summary.push({
        workload: workloadName,
        mode,
        runs: group.length,
        systemBytes: avg('systemBytes'),
        toolSchemaBytes: avg('toolSchemaBytes'),
        fixedOverheadBytes: avg('systemBytes') + avg('toolSchemaBytes'),
        toolResultBytes: avg('toolResultBytes'),
        steps: avg('steps'),
        ptcSubcalls: avg('ptcSubcalls'),
        wallMs: avg('wallMs'),
      });
    }
  }

  const header = [
    'workload', 'mode', 'runs', 'systemBytes', 'toolSchemaBytes', 'fixedOverheadBytes', 'toolResultBytes', 'steps', 'ptcSubcalls', 'wallMs',
  ];
  const table = [
    header.join('\t'),
    ...summary.map(row => header.map(key => (key === 'note' ? row.note ?? '' : row[key] ?? '')).join('\t')),
  ].join('\n');
  console.log(table);
  await writeFile(join(OUT_DIR, 'summary.tsv'), table + '\n');
  console.log('\nreport: ' + join(OUT_DIR, 'report.json').replace(REPO_ROOT + '/', ''));
}

main().catch(error => {
  console.error('bench failed: ' + String(error.message));
  process.exitCode = 1;
});
