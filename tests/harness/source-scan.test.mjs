import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const scanner = fileURLToPath(new URL('../../scripts/engineering-harness/source-scan.py', import.meta.url));
const secret = 'sk-' + 'b'.repeat(32);

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'aetheria-source-scan-'));
  t.after(() => rmSync(cwd, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', ...args],
    {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init', '-q');
  git('commit', '--allow-empty', '--no-gpg-sign', '-m', 'fixture');
  return {cwd, git, commit: message => {
    git('add', '-A');
    git('commit', '--allow-empty', '--no-gpg-sign', '-m', message);
    return git('rev-parse', 'HEAD');
  }};
}

function scan(cwd, ...args) {
  const result = spawnSync('python3', [scanner, ...args], {cwd, encoding: 'utf8', timeout: 60000});
  assert.ifError(result.error);
  assert.equal(result.stderr, '');
  return {code: result.status, report: JSON.parse(result.stdout), stdout: result.stdout};
}

test('exercises each rule against synthetic samples without echoing them', () => {
  const {code, report} = scan(process.cwd(), '--self-test');
  assert.equal(code, 0);
  assert.deepEqual(report, {status: 'PASS', syntheticRulesExercised: 4});
});

test('passes a clean tree and reports only rule names for a dirty leak', t => {
  const {cwd, commit} = fixture(t);
  writeFileSync(join(cwd, 'clean.js'), 'export const ok = true;\n');
  commit('baseline');
  assert.deepEqual(scan(cwd).report, {status: 'PASS', files: 0, findings: {}});

  writeFileSync(join(cwd, 'leak.js'), `export const token = '${secret}';\n`);
  const dirty = scan(cwd);
  assert.equal(dirty.code, 1);
  assert.deepEqual(dirty.report, {status: 'FAIL', files: 1, findings: {'provider-token': 1}});
  assert.ok(!dirty.stdout.includes(secret), 'scanner must not echo credential-shaped text');
  assert.ok(!dirty.stdout.includes('leak.js'), 'scanner must not echo file names');
});

test('scans an exact revision range and ignores unrelated working changes', t => {
  const {cwd, commit} = fixture(t);
  const base = commit('base');
  writeFileSync(join(cwd, 'added.js'), 'export const n = 1;\n');
  const clean = commit('clean');
  assert.deepEqual(scan(cwd, '--range', base, clean).report, {status: 'PASS', files: 1, findings: {}});

  writeFileSync(join(cwd, 'secret.js'), `export const k = '${secret}';\n`);
  const leak = commit('leak');
  assert.deepEqual(scan(cwd, '--range', clean, leak).report, {status: 'FAIL', files: 1, findings: {'provider-token': 1}});
});

test('fails closed on unsafe or unbounded input instead of reporting a pass', t => {
  const {cwd, commit} = fixture(t);
  const base = commit('base');
  writeFileSync(join(cwd, 'big.js'), 'a'.repeat(8 * 1024 * 1024 + 1));
  assert.deepEqual(scan(cwd).report, {status: 'BLOCKED', reason: 'SCAN_INCOMPLETE'});
  rmSync(join(cwd, 'big.js'));

  symlinkSync('/etc/hostname', join(cwd, 'link.js'));
  assert.deepEqual(scan(cwd).report, {status: 'BLOCKED', reason: 'SCAN_INCOMPLETE'});
  rmSync(join(cwd, 'link.js'));

  assert.deepEqual(scan(cwd, '--range', 'HEAD', 'HEAD').report, {status: 'BLOCKED', reason: 'SCAN_INCOMPLETE'});
  assert.equal(scan(cwd, '--range', base, '0'.repeat(40)).report.status, 'BLOCKED');
  assert.deepEqual(scan(tmpdir()).report, {status: 'BLOCKED', reason: 'SCAN_INCOMPLETE'});
});
