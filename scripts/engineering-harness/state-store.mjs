import { createHash } from 'node:crypto'
import { closeSync, constants, lstatSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { checkOwnership, isActive, MAX_STATE_BYTES, StateError, validateState } from './state-contract.mjs'
import { workspaceReference } from './state-portable.mjs'

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

function checkWriteOwnership(db, state, root) {
  const withWorkspace = (task) => ({ ...task, workspace: workspaceReference(root, task.workspace) })
  const activeWriters = state.tasks.filter((task) => isActive(task) && task.writePaths.length).map(withWorkspace)
  if (!activeWriters.length) return
  for (const [index, task] of activeWriters.entries()) {
    for (const other of activeWriters.slice(index + 1)) checkOwnership(task, other)
  }
  const otherRuns = db.prepare(`
    SELECT run_id, version, state, sha256 FROM checkpoints
    WHERE (run_id, version) IN (
      SELECT run_id, MAX(version) FROM checkpoints WHERE run_id != ? GROUP BY run_id
    )
  `)
  for (const row of otherRuns.iterate(state.id)) {
    const others = decode(row).state.tasks.map(withWorkspace)
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
    db.exec('PRAGMA trusted_schema = OFF; PRAGMA busy_timeout = 3000;')
    if (create) db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        run_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        state TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        PRIMARY KEY (run_id, version)
      ) STRICT
    `)
    return operation(db)
  } finally {
    db.close()
  }
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

export function createCheckpoint(repoRoot, state) {
  return withDatabase(repoRoot, true, (db) => inWriteTransaction(db, () => {
    if (loadLatest(db, state.id)) throw new StateError('CONFLICT', 'run ID already exists')
    checkWriteOwnership(db, state, repoRoot)
    return writeCheckpoint(db, state)
  }))
}

export function readCheckpoint(repoRoot, id, version) {
  return withDatabase(repoRoot, false, (db) => decode(version === undefined
    ? loadLatest(db, id)
    : db.prepare('SELECT * FROM checkpoints WHERE run_id = ? AND version = ?').get(id, version)))
}

export function advanceCheckpoint(repoRoot, id, version, advance) {
  return withDatabase(repoRoot, false, (db) => inWriteTransaction(db, () => {
    const { state } = decode(loadLatest(db, id))
    if (state.version !== version) throw new StateError('CONFLICT', 'checkpoint version changed, recover before retrying')
    const next = advance(state)
    checkWriteOwnership(db, next, repoRoot)
    return writeCheckpoint(db, next)
  }))
}


export function listIncompleteCheckpoints(repoRoot) {
  try {
    return withDatabase(repoRoot, false, (db) => db.prepare(`
      SELECT * FROM checkpoints
      WHERE (run_id, version) IN (SELECT run_id, MAX(version) FROM checkpoints GROUP BY run_id)
      ORDER BY run_id
    `).all().map(decode).filter(({ state }) => state.tasks.some(({ status }) => status !== 'DONE')))
  } catch (error) {
    if (error instanceof StateError && error.code === 'NOT_FOUND') return []
    throw error
  }
}
