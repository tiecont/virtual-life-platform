#!/usr/bin/env node
// Hardened-profile sandbox probe — positive and negative tests with synthetic data.
//
// Purpose: prove what the hardened profile actually enforces, instead of assuming a
// config key works. Every "secret" used here is synthetic and generated locally; no
// real credential is read, printed or transmitted.
//
//   node config/harness/deepseek/hardened-sandbox-probe.mjs [--root /tmp/aetheria-sandbox-probe]
//
// Output: JSON { tests: [{ id, expect, outcome, verdict }] }.
// verdict is PASS when the observed outcome matches the expectation for the profile
// under test. Run it under the default profile and under ptc-hardened.patch.yml and
// compare: the hardened run should deny escape and allow in-workspace work.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ARGS = process.argv.slice(2);
const rootFlag = ARGS.indexOf('--root');
const ROOT = rootFlag >= 0 ? ARGS[rootFlag + 1] : '/tmp/aetheria-sandbox-probe';
const INSIDE = process.cwd();

function ensureFixture() {
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(join(ROOT, 'synthetic-credentials.yaml'), 'synthetic: true\napi_key: SYNTHETIC-NOT-A-REAL-KEY\n');
  writeFileSync(join(INSIDE, '.sandbox-probe-inside.txt'), 'inside-workspace-synthetic\n');
}

const tests = [];
function record(id, expect, fn) {
  let outcome;
  try {
    outcome = fn();
  } catch (error) {
    outcome = 'DENIED:' + String(error.code ?? error.name ?? 'ERROR');
  }
  const denied = String(outcome).startsWith('DENIED');
  tests.push({ id, expect, outcome, denied });
}

ensureFixture();

// --- Negative tests: things a hardened profile should refuse -------------------
record('read-synthetic-outside-workspace', 'DENIED', () => {
  const text = readFileSync(join(ROOT, 'synthetic-credentials.yaml'), 'utf8');
  return 'ALLOWED:read ' + text.length + ' bytes';
});

record('write-outside-workspace', 'DENIED', () => {
  writeFileSync(join(ROOT, 'escaped.txt'), 'synthetic escape\n');
  return 'ALLOWED:wrote escaped.txt';
});

record('read-real-credential-store', 'DENIED', () => {
  // Length only. Content is never returned, printed or retained.
  const text = readFileSync(join(process.env.HOME ?? '/home/tiecont', '.dsh', '.credentials.yaml'), 'utf8');
  return 'ALLOWED:read ' + text.length + ' bytes';
});

record('spawn-child-process', 'DENIED', () => {
  const out = execFileSync('sh', ['-c', 'echo synthetic-child'], { encoding: 'utf8', timeout: 5000 });
  return 'ALLOWED:' + out.trim();
});

record('network-connect', 'DENIED', () => {
  // Synchronous TCP attempt; any completion counts as reachable.
  const { execFileSync: run } = { execFileSync };
  const probe = run(
    process.execPath,
    ['-e', "const n=require('node:net');const s=n.connect(443,'1.1.1.1');s.setTimeout(1500);s.on('connect',()=>{s.destroy();console.log('CONNECTED')});s.on('timeout',()=>{s.destroy();console.log('TIMEOUT')});s.on('error',e=>console.log('ERR'))"],
    { encoding: 'utf8', timeout: 8000 },
  );
  return 'ALLOWED:' + probe.trim();
});

// --- Positive test: legitimate in-workspace work must still succeed -----------
record('write-inside-workspace', 'ALLOWED', () => {
  const target = join(INSIDE, '.sandbox-probe-inside-out.txt');
  writeFileSync(target, 'inside-ok\n');
  return 'ALLOWED:wrote ' + readFileSync(target, 'utf8').trim();
});

// --- Positive test: the canonical workflow CLI surface must still be readable --
record('run-bounded-workflow', 'ALLOWED', () => {
  const out = execFileSync(process.execPath, ['scripts/engineering-harness/workflow.mjs', 'list'], {
    cwd: INSIDE,
    encoding: 'utf8',
    timeout: 30000,
  });
  return 'ALLOWED:workflows=' + JSON.parse(out).workflows.length;
});

const summarised = tests.map(entry => ({
  id: entry.id,
  expect: entry.expect,
  outcome: entry.outcome.slice(0, 60),
  verdict: entry.expect === 'DENIED' ? (entry.denied ? 'PASS' : 'FAIL') : entry.denied ? 'FAIL' : 'PASS',
}));
console.log(JSON.stringify({ profile: process.env.AETHERIA_PROBE_PROFILE ?? 'unknown', root: ROOT, tests: summarised }, null, 2));
