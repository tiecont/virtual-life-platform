import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import assert from 'node:assert/strict'

const digest = 'a'.repeat(64)

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'aetheria-harness-state-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const scripts = join(cwd, 'scripts', 'engineering-harness')
  mkdirSync(scripts, { recursive: true })
  for (const file of ['state.mjs', 'state-contract.mjs', 'state-store.mjs']) {
    copyFileSync(new URL(`../../scripts/engineering-harness/${file}`, import.meta.url), join(scripts, file))
  }
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  git('-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '--no-gpg-sign', '-m', 'fixture')
  const script = join(scripts, 'state.mjs')
  function run(...args) {
    return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
  }
  function call(...args) {
    const result = run(...args)
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  }
  return {
    cwd, script, run, call,
    revision: git('rev-parse', 'HEAD'),
    database: join(cwd, 'artifacts', 'harness-state', 'checkpoints.sqlite'),
  }
}

function task(id = 'inspect', fields = {}) {
  return { id, owner: 'lead', acceptance: ['Confirm source revision'], dependsOn: [], writePaths: [], ...fields }
}

function plan(tasks = [task()]) {
  return { objective: 'Inspect the checkout', tasks }
}

function rejects(result, code = 'INVALID_STATE', messagePattern) {
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr)
  assert.equal(error.error, code)
  if (messagePattern) assert.match(error.message, messagePattern)
}

test('fresh processes recover checkpoints and release completed dependencies', (t) => {
  const { revision, call, run } = fixture(t)
  const initial = call('init', 'run', JSON.stringify(plan([task(), task('review', { dependsOn: ['inspect'] })])))
  assert.deepEqual(initial.ready, ['inspect'])
  assert.equal(initial.version, 1)
  assert.equal(initial.baseRevision, revision)
  assert.match(initial.stateSha256, /^[0-9a-f]{64}$/)
  rejects(run('update', 'run', '1', 'review', '{"status":"IN_PROGRESS"}'), 'INVALID_STATE', /dependencies/)
  const checkpoint = call('update', 'run', '1', 'inspect', JSON.stringify({
    status: 'IN_PROGRESS',
    decisions: ['Use the existing Git checkout'],
    evidence: [{ path: 'artifacts/repo.json', sha256: digest }],
    remainingActions: ['Request review'],
  }))
  const recovered = call('recover', 'run', 'inspect')
  assert.deepEqual(recovered, checkpoint)
  assert.equal(recovered.objective, 'Inspect the checkout')
  assert.equal(recovered.task.owner, 'lead')
  assert.deepEqual(recovered.task.acceptance, ['Confirm source revision'])
  assert.deepEqual(recovered.task.decisions, ['Use the existing Git checkout'])
  assert.deepEqual(recovered.task.remainingActions, ['Request review'])
  assert.equal(call('show', 'run', '1').state.tasks[0].status, 'PENDING')
  assert.notEqual(recovered.stateSha256, initial.stateSha256)

  const handoff = {
    summary: 'Confirmed current checkout revision',
    revision,
    files: [],
    checks: [{ name: 'revision', status: 'PASS', command: 'git rev-parse HEAD' }],
  }
  rejects(run('update', 'run', '2', 'inspect', '{"status":"REVIEW"}'), 'INVALID_STATE', /handoff/)
  call('update', 'run', '2', 'inspect', JSON.stringify({ status: 'REVIEW', handoff }))
  rejects(run('update', 'run', '3', 'inspect', '{"status":"DONE"}'), 'INVALID_STATE', /remaining/)
  const complete = call('update', 'run', '3', 'inspect', '{"status":"DONE","remainingActions":[]}')
  assert.deepEqual(complete.complete, ['inspect'])
  assert.deepEqual(complete.ready, ['review'])
  assert.deepEqual(complete.task.handoff, handoff)
})

test('validates untrusted input, bounds stdin and excludes credential-shaped text', (t) => {
  const { cwd, script, run } = fixture(t)
  rejects(run('init', 'bad', JSON.stringify(plan([task('one'), task('one')]))), 'INVALID_STATE', /duplicate/)
  rejects(run('init', 'bad', JSON.stringify(plan([task('one', { dependsOn: ['missing'] })]))), 'INVALID_STATE', /unknown/)
  rejects(run('init', 'bad', JSON.stringify(plan([task('one', { dependsOn: ['two'] }), task('two', { dependsOn: ['one'] })]))), 'INVALID_STATE', /cycle/)
  rejects(run('init', 'bad', JSON.stringify(plan([task('one', { writePaths: ['src/../outside'] })]))), 'INVALID_STATE', /normalized/)
  rejects(run('init', 'bad', JSON.stringify({ ...plan(), unexpected: true })), 'INVALID_STATE', /unknown/)
  const credential = 'TEST-EXAMPLE-STRING'
  const result = run('init', 'bad', JSON.stringify({ ...plan(), objective: `password=${credential}` }))
  rejects(result, 'INVALID_STATE', /credentials/)
  assert.doesNotMatch(result.stderr, new RegExp(credential))
  const oversized = spawnSync(process.execPath, [script, 'init', 'big', '-'], { cwd, input: 'x'.repeat(64 * 1024 + 1), encoding: 'utf8' })
  rejects(oversized, 'INVALID_STATE', /64 KiB/)
  const stdin = spawnSync(process.execPath, [script, 'init', 'stdin', '-'], { cwd, input: JSON.stringify(plan()), encoding: 'utf8' })
  assert.equal(stdin.status, 0, stdin.stderr)
})

test('requires distinct workspaces and disjoint write scopes across active tasks and runs', (t) => {
  const { revision, call, run } = fixture(t)
  const first = task('first', { writePaths: ['scripts'], workspace: 'worktree-one' })
  const overlapping = task('overlap', { writePaths: ['Scripts/sample.mjs'], workspace: 'worktree-two' })
  const sameWorkspace = task('other', { writePaths: ['tests'], workspace: 'worktree-one' })
  call('init', 'scope', JSON.stringify(plan([first, overlapping, sameWorkspace])))
  call('init', 'separate', JSON.stringify(plan([overlapping])))
  call('update', 'scope', '1', 'first', '{"status":"IN_PROGRESS"}')
  rejects(run('update', 'scope', '2', 'overlap', '{"status":"IN_PROGRESS"}'), 'INVALID_STATE', /overlapping/)
  rejects(run('update', 'scope', '2', 'other', '{"status":"IN_PROGRESS"}'), 'INVALID_STATE', /distinct workspaces/)
  rejects(run('update', 'separate', '1', 'overlap', '{"status":"IN_PROGRESS"}'), 'INVALID_STATE', /overlapping/)
  rejects(run('update', 'scope', '2', 'first', '{"owner":"new-owner"}'), 'INVALID_STATE', /reassigning/)
  rejects(run('update', 'scope', '2', 'first', '{"evidence":[{"path":"README.md","sha256":"invalid"}]}'), 'INVALID_STATE', /under artifacts/)
  const outOfScope = {
    status: 'REVIEW',
    handoff: {
      summary: 'Report changes',
      revision,
      files: ['README.md'],
      checks: [{ name: 'check', status: 'PASS' }],
    },
  }
  rejects(run('update', 'scope', '2', 'first', JSON.stringify(outOfScope)), 'INVALID_STATE', /write scope/)
  rejects(run('update', 'scope', '2', 'first', '{"status":"BLOCKED"}'), 'INVALID_STATE', /blockers/)
  call('update', 'scope', '2', 'first', '{"status":"BLOCKED","blockers":["Waiting for review"]}')
  call('update', 'separate', '1', 'overlap', '{"status":"IN_PROGRESS"}')
  rejects(run('update', 'scope', '3', 'first', '{"status":"IN_PROGRESS"}'), 'INVALID_STATE', /overlapping/)
})

test('only one concurrent writer can advance an expected version', async (t) => {
  const { call, cwd, script } = fixture(t)
  call('init', 'lock', JSON.stringify(plan()))
  function update(action) {
    const patch = JSON.stringify({ status: 'IN_PROGRESS', remainingActions: [action] })
    return new Promise((resolve) => {
      execFile(process.execPath, [script, 'update', 'lock', '1', 'inspect', patch], { cwd }, (error, stdout, stderr) => {
        resolve({ status: error?.code ?? 0, stdout, stderr })
      })
    })
  }
  const results = await Promise.all([update('one'), update('two')])
  assert.deepEqual(results.map(({ status }) => status).sort(), [0, 3])
  rejects(results.find(({ status }) => status === 3), 'CONFLICT', /recover/)
  assert.deepEqual(call('recover', 'lock', 'inspect'), JSON.parse(results.find(({ status }) => !status).stdout))
})

test('protects the database from symlink redirection and detects changed state', { skip: process.platform === 'win32' }, (t) => {
  const { cwd, database, call, run } = fixture(t)
  const other = join(cwd, 'other')
  mkdirSync(other)
  symlinkSync(other, join(cwd, 'artifacts'))
  rejects(run('init', 'storage', JSON.stringify(plan())), 'UNSAFE_STORAGE')
  rmSync(join(cwd, 'artifacts'))
  call('init', 'storage', JSON.stringify(plan()))
  assert.equal(lstatSync(database).mode & 0o777, 0o600)
  assert.equal(lstatSync(join(database, '..')).mode & 0o777, 0o700)
  const db = new DatabaseSync(database)
  const forged = JSON.stringify({ schemaVersion: 1, objective: 'Malformed checkpoint' })
  const stmt = db.prepare('UPDATE checkpoints SET state = ?, sha256 = ?')
  stmt.run(forged, digest)
  rejects(run('recover', 'storage'), 'CORRUPT_STATE', /integrity/)
  stmt.run(forged, createHash('sha256').update(forged).digest('hex'))
  db.close()
  rejects(run('recover', 'storage'), 'CORRUPT_STATE', /schema/)
})

test('discovers an unfinished checkpoint by run ID and recovers it in a fresh process', (t) => {
  const { call, revision } = fixture(t)
  assert.deepEqual(call('list'), { runs: [] })
  call('init', 'coop', JSON.stringify(plan([task('VL-200')])))
  const result = call('list')
  assert.deepEqual(result.runs, [{
    id: 'coop', version: 1, baseRevision: revision, active: [], ready: ['VL-200'], blocked: [],
  }])
  assert.deepEqual(call('recover', result.runs[0].id).ready, ['VL-200'])
})
