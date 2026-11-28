import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'
import { exactKeys, MAX_STATE_BYTES, requireValue, StateError, summarizeState, validateState } from './state-contract.mjs'

export const MAX_PORTABLE_BYTES = MAX_STATE_BYTES + 4096
const gitId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const digest = (content) => createHash('sha256').update(content).digest('hex')

export function git(root, args, maxBuffer = 65536) {
  try {
    return execFileSync('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', ...args], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' },
    }).trim()
  } catch (error) {
    if (Number.isInteger(error.status)) return null
    throw new StateError('STORAGE_ERROR', 'could not inspect the local Git checkout')
  }
}

export function currentRevision(root) {
  const revision = git(root, ['rev-parse', '--verify', 'HEAD'])
  if (!gitId.test(revision ?? '')) throw new StateError('STORAGE_ERROR', 'could not determine the current Git revision')
  return revision
}

function workingTree(root) {
  const changes = git(root, ['status', '--porcelain=v1', '--untracked-files=normal'], 1024 * 1024)
  if (changes === null) throw new StateError('STORAGE_ERROR', 'could not determine the current Git working tree')
  return { revision: currentRevision(root), dirty: Boolean(changes) }
}

export function workspaceReference(root, workspace, id) {
  if (!workspace || (!isAbsolute(workspace) && !win32.isAbsolute(workspace))) return workspace
  if (isAbsolute(workspace)) {
    const path = relative(resolve(root), workspace)
    if (path === '') return '.'
    if (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep)) return path.split(sep).join('/')
  }
  return id ? `external-worktree/${id}` : workspace
}

export function portableState(root, state) {
  return validateState({
    ...state,
    tasks: state.tasks.map((task) => ({ ...task, workspace: workspaceReference(root, task.workspace, task.id) })),
  })
}

export function exportPortable(root, state) {
  const content = { schemaVersion: 1, source: workingTree(root), state: portableState(root, state) }
  const encoded = JSON.stringify(content)
  requireValue(Buffer.byteLength(encoded) <= MAX_PORTABLE_BYTES - 100, 'portable checkpoint exceeds its size limit')
  return { ...content, sha256: digest(encoded) }
}

export function validatePortable(input) {
  exactKeys(input, ['schemaVersion', 'source', 'state', 'sha256'], [], 'portable checkpoint')
  requireValue(input.schemaVersion === 1, 'unsupported portable checkpoint schema version')
  exactKeys(input.source, ['revision', 'dirty'], [], 'portable checkpoint source')
  requireValue(typeof input.source.revision === 'string' && gitId.test(input.source.revision)
    && typeof input.source.dirty === 'boolean', 'portable checkpoint source is invalid')
  const state = validateState(input.state)
  requireValue(state.tasks.every(({ workspace }) => !workspace || (!isAbsolute(workspace) && !win32.isAbsolute(workspace))),
    'portable workspace must use a checkout-relative path or a worktree label')
  requireValue(Buffer.byteLength(JSON.stringify(state)) <= MAX_STATE_BYTES, 'checkpoint exceeds the 64 KiB limit')
  const encoded = JSON.stringify({ schemaVersion: input.schemaVersion, source: input.source, state })
  if (typeof input.sha256 !== 'string' || digest(encoded) !== input.sha256) {
    throw new StateError('CORRUPT_STATE', 'portable checkpoint integrity check failed')
  }
  return input
}

export function revisionExists(root, revision) {
  return gitId.test(revision) && git(root, ['cat-file', '-t', revision]) === 'commit'
}

export function inspectEvidence(root, ref, reportLimit = 0) {
  if (git(root, ['check-ignore', '-q', '--', ref.path]) === null) return { status: 'UNSAFE' }
  let current = root
  let file
  try {
    const parts = ref.path.split('/')
    for (const [index, part] of parts.entries()) {
      current = join(current, part)
      const metadata = lstatSync(current)
      if (index < parts.length - 1 ? !metadata.isDirectory() : !metadata.isFile()) return { status: 'UNSAFE' }
    }
    file = openSync(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const opened = fstatSync(file)
    if (!opened.isFile() || (reportLimit && opened.size > reportLimit)) return { status: 'UNSAFE' }
    const hash = createHash('sha256')
    const buffer = Buffer.alloc(Math.min(1024 * 1024, opened.size))
    const chunks = []
    for (let offset = 0; offset < opened.size;) {
      const count = readSync(file, buffer, 0, Math.min(buffer.length, opened.size - offset), offset)
      if (count === 0) return { status: 'CHANGED' }
      const chunk = buffer.subarray(0, count)
      hash.update(chunk)
      if (reportLimit) chunks.push(Buffer.from(chunk))
      offset += count
    }
    const final = fstatSync(file)
    if (final.size !== opened.size || final.mtimeMs !== opened.mtimeMs || hash.digest('hex') !== ref.sha256) return { status: 'CHANGED' }
    return { status: 'MATCH', ...(reportLimit ? { bytes: Buffer.concat(chunks) } : {}) }
  } catch (error) {
    return { status: error.code === 'ENOENT' ? 'MISSING' : 'UNSAFE' }
  } finally {
    if (file !== undefined) closeSync(file)
  }
}

export function inspectPortable(root, input, taskId) {
  const { state, source, sha256 } = validatePortable(input)
  const target = workingTree(root)
  const relation = source.revision === target.revision ? 'EXACT'
    : !revisionExists(root, source.revision) ? 'MISSING_SOURCE'
      : git(root, ['merge-base', '--is-ancestor', source.revision, target.revision]) === null ? 'DIVERGED' : 'DESCENDANT'
  const tasks = taskId ? [state.tasks.find(({ id }) => id === taskId)].filter(Boolean) : state.tasks
  const refs = tasks.flatMap(({ evidence, execution }) => [
    ...evidence, ...(execution?.results.flatMap((result) => result.evidence ? [result.evidence] : []) ?? []),
  ])
  const evidence = [...new Map(refs.map((ref) => [`${ref.path}:${ref.sha256}`, ref])).values()]
    .map((ref) => ({ ...ref, status: inspectEvidence(root, ref).status }))
  const refsToCheck = new Set([state.baseRevision, ...tasks.flatMap(({ handoff, execution }) =>
    [handoff?.revision, execution?.revision, ...execution?.results.map(({ revision }) => revision) ?? []].filter(Boolean))])
  const missingRevisions = [...refsToCheck].filter((revision) => !revisionExists(root, revision))
  return {
    ...summarizeState(state, digest(JSON.stringify(state)), taskId),
    portableSha256: sha256, source, target: { ...target, relation }, missingRevisions, evidence,
  }
}
