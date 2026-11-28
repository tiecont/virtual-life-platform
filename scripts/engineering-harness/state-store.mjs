import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { boundRevision, checkOwnership, getTask, isActive, MAX_STATE_BYTES, StateError, validateState } from './state-contract.mjs'

const DATABASE_SCHEMA_VERSION = 2
const MAX_OPERATIONS_PER_RUN = 512

function checkMetadata(path, directory, privateOnly) {
  const metadata = lstatSync(path, { throwIfNoEntry: false })
  if (!metadata) return false
  const currentUserOwnsPath = !process.getuid || process.getuid() === metadata.uid
  const correctType = directory ? metadata.isDirectory() : metadata.isFile() && metadata.nlink === 1
  const protectedMode = process.platform === 'win32' || (metadata.mode & (privateOnly ? 0o077 : 0o022)) === 0
  if (!correctType || !currentUserOwnsPath || !protectedMode) {
    throw new StateError('UNSAFE_STORAGE', 'state storage needs owned, protected directories and unlinked regular files')
  }
  return true
}

function ensureDirectory(path, create, privateOnly) {
  if (create) {
    try {
      mkdirSync(path, { mode: 0o700 })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
  if (!checkMetadata(path, true, privateOnly)) throw new StateError('NOT_FOUND', 'state storage was not found')
}

function stateFile(repoRoot, create) {
  const artifacts = join(repoRoot, 'artifacts')
  ensureDirectory(artifacts, create, false)
  const stateDirectory = join(artifacts, 'harness-state')
  ensureDirectory(stateDirectory, create, true)
  const database = join(stateDirectory, 'checkpoints.sqlite')
  if (create) {
    try {
      const flags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0)
      closeSync(openSync(database, flags, 0o600))
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
  if (!checkMetadata(database, false, true)) throw new StateError('NOT_FOUND', 'state storage was not found')
  for (const suffix of ['-journal', '-wal', '-shm']) checkMetadata(database + suffix, false, true)
  return database
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function decode(row) {
  if (!row) throw new StateError('NOT_FOUND', 'checkpoint was not found')
  if (typeof row.state !== 'string' || Buffer.byteLength(row.state) > MAX_STATE_BYTES || sha256(row.state) !== row.sha256) {
    throw new StateError('CORRUPT_STATE', 'checkpoint integrity check failed')
  }
  try {
    const state = validateState(JSON.parse(row.state))
    if (state.id !== row.run_id || state.version !== row.version) throw new Error('checkpoint identity mismatch')
    return { state, stateSha256: row.sha256 }
  } catch {
    throw new StateError('CORRUPT_STATE', 'checkpoint does not match the state schema')
  }
}

function loadLatest(db, id) {
  return db.prepare('SELECT * FROM checkpoints WHERE run_id = ? ORDER BY version DESC LIMIT 1').get(id)
}

function writeCheckpoint(db, state) {
  const encoded = JSON.stringify(state)
  if (Buffer.byteLength(encoded) > MAX_STATE_BYTES) {
    throw new StateError('INVALID_STATE', 'checkpoint exceeds the 64 KiB limit')
  }
  const stateSha256 = sha256(encoded)
  db.prepare('INSERT INTO checkpoints (run_id, version, state, sha256) VALUES (?, ?, ?, ?)').run(state.id, state.version, encoded, stateSha256)
  return { state, stateSha256 }
}

function checkOtherRuns(db, state) {
  const activeWriters = state.tasks.filter((task) => isActive(task) && task.writePaths.length)
  if (!activeWriters.length) return
  const otherRuns = db.prepare(`
    SELECT run_id, version, state, sha256 FROM checkpoints
    WHERE (run_id, version) IN (
      SELECT run_id, MAX(version) FROM checkpoints WHERE run_id != ? GROUP BY run_id
    )
  `)
  for (const row of otherRuns.iterate(state.id)) {
    const others = decode(row).state.tasks
    for (const task of activeWriters) {
      for (const other of others) checkOwnership(task, other)
    }
  }
}

function withDatabase(repoRoot, create, operation) {
  const path = stateFile(repoRoot, create)
  // SQLite may need to recover a rollback journal after an interrupted writer.
  const db = new DatabaseSync(path, { enableDoubleQuotedStringLiterals: false, allowExtension: false })
  try {
    db.exec('PRAGMA trusted_schema = OFF; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
    const { user_version: schemaVersion } = db.prepare('PRAGMA user_version').get()
    if (![0, DATABASE_SCHEMA_VERSION].includes(schemaVersion)) {
      throw new StateError('UNSUPPORTED_SCHEMA', 'checkpoint database schema is unsupported')
    }
    return operation(db)
  } finally {
    db.close()
  }
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      run_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      state TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      PRIMARY KEY (run_id, version)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS operations (
      run_id TEXT NOT NULL,
      key TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (run_id, key),
      FOREIGN KEY (run_id, version) REFERENCES checkpoints (run_id, version)
    ) STRICT;
    PRAGMA user_version = 2;
  `)
}

function loadVersion(db, id, version) {
  return db.prepare('SELECT * FROM checkpoints WHERE run_id = ? AND version = ?').get(id, version)
}

function applyOperation(db, id, request, operation) {
  if (!request) return operation()
  const { key, fingerprint } = request
  const receipt = db.prepare('SELECT fingerprint, version FROM operations WHERE run_id = ? AND key = ?').get(id, key)
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) {
      throw new StateError('IDEMPOTENCY_CONFLICT', 'operation key was used with a different request')
    }
    return { ...decode(loadVersion(db, id, receipt.version)), replayed: true }
  }
  const { count } = db.prepare('SELECT count(*) AS count FROM operations WHERE run_id = ?').get(id)
  if (count >= MAX_OPERATIONS_PER_RUN) {
    throw new StateError('IDEMPOTENCY_LIMIT', 'operation receipt limit reached, use a new run')
  }
  const result = operation()
  db.prepare('INSERT INTO operations (run_id, key, fingerprint, version) VALUES (?, ?, ?, ?)').run(
    id, key, fingerprint, result.state.version,
  )
  return { ...result, replayed: false }
}

function inWriteTransaction(db, operation) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw error
  }
}

export function createCheckpoint(repoRoot, state, request) {
  return withDatabase(repoRoot, true, (db) => inWriteTransaction(db, () => {
    ensureSchema(db)
    return applyOperation(db, state.id, request, () => {
      if (loadLatest(db, state.id)) throw new StateError('CONFLICT', 'run ID already exists')
      return writeCheckpoint(db, state)
    })
  }))
}

export function readCheckpoint(repoRoot, id, version) {
  return withDatabase(repoRoot, false, (db) => decode(version === undefined
    ? loadLatest(db, id)
    : loadVersion(db, id, version)))
}

export function advanceCheckpoint(repoRoot, id, version, advance, request) {
  return withDatabase(repoRoot, false, (db) => inWriteTransaction(db, () => {
    ensureSchema(db)
    return applyOperation(db, id, request, () => {
      const { state } = decode(loadLatest(db, id))
      if (state.version !== version) throw new StateError('CONFLICT', 'checkpoint version changed, recover before retrying')
      const next = advance(state)
      checkOtherRuns(db, next)
      return writeCheckpoint(db, next)
    })
  }))
}


const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024

function verifyEvidence(repoRoot, { path, sha256: expected }, budget) {
  if (path.startsWith('artifacts/harness-state/')) return 'UNSAFE_PATH'
  let location = repoRoot
  const names = path.split('/')
  try {
    for (const directory of names.slice(0, -1)) {
      location = join(location, directory)
      if (!checkMetadata(location, true, false)) return 'MISSING'
    }
    location = join(location, names.at(-1))
    if (!checkMetadata(location, false, false)) return 'MISSING'
    const fd = openSync(location, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    try {
      const before = fstatSync(fd, { bigint: true })
      if (!before.isFile() || before.nlink !== 1n) return 'UNSAFE_PATH'
      if (before.size > BigInt(budget.remaining)) return 'BYTE_LIMIT'
      const hash = createHash('sha256')
      const chunk = Buffer.allocUnsafe(64 * 1024)
      let remaining = Number(before.size)
      while (remaining > 0) {
        const bytes = readSync(fd, chunk, 0, Math.min(chunk.length, remaining), null)
        if (bytes === 0) return 'CHANGED_DURING_READ'
        hash.update(chunk.subarray(0, bytes))
        remaining -= bytes
        budget.remaining -= bytes
      }
      const after = fstatSync(fd, { bigint: true })
      if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
        return 'CHANGED_DURING_READ'
      }
      if (hash.digest('hex') !== expected) return 'DIGEST_MISMATCH'
      return null
    } finally {
      closeSync(fd)
    }
  } catch (error) {
    if (error.code === 'ENOENT') return 'MISSING'
    if (error.code === 'ELOOP' || error.code === 'UNSAFE_STORAGE') return 'UNSAFE_PATH'
    return 'READ_ERROR'
  }
}

export function verifyCheckpointEvidence(repoRoot, { state, stateSha256 }, taskId) {
  const selected = taskId ? [getTask(state, taskId)] : state.tasks
  const budget = { remaining: MAX_EVIDENCE_BYTES }
  const entries = []
  for (const task of selected) {
    for (const ref of task.evidence) {
      const code = verifyEvidence(repoRoot, ref, budget)
      entries.push({ taskId: task.id, path: ref.path, status: code ? 'FAIL' : 'PASS', ...(code ? { code } : {}) })
    }
  }
  const status = entries.length === 0 ? 'NOT_RUN' : entries.some((entry) => entry.status === 'FAIL') ? 'FAIL' : 'PASS'
  return { schemaVersion: 2, runId: state.id, version: state.version, sourceRevision: boundRevision(state), stateSha256, status, evidence: entries }
}
