import { randomUUID } from 'node:crypto'

export const MAX_STATE_BYTES = 64 * 1024
export const STATE_SCHEMA_VERSION = 2
const statuses = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE', 'CANCELLED']
const transitions = {
  PENDING: ['PENDING', 'IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['IN_PROGRESS', 'BLOCKED', 'REVIEW'],
  BLOCKED: ['BLOCKED', 'PENDING', 'IN_PROGRESS'],
  REVIEW: ['REVIEW', 'IN_PROGRESS', 'BLOCKED', 'DONE'],
  DONE: [],
  CANCELLED: [],
}
const taskDefinitionKeys = ['id', 'owner', 'acceptance', 'dependsOn', 'writePaths', 'workspace']
const taskProgressKeys = ['status', 'decisions', 'evidence', 'blockers', 'remainingActions', 'handoff']
const digestPattern = /^[0-9a-f]{64}$/
const leasePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const credentialPattern = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bbearer\s+[\w./+=-]{8,}|\b(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9_-])[A-Za-z0-9_-]{10,}|\b(?:password|passwd|secret|(?:meshy[_-]?)?(?:access|api|auth)[_-]?(?:key|token))\s*[:=]\s*\S+|\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@|[?&](?:token|signature|x-amz-credential|x-amz-signature)=\S+)/i

export class StateError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function requireValue(condition, message) {
  if (!condition) throw new StateError('INVALID_STATE', message)
}

function exactKeys(value, required, optional = [], field = 'record') {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${field} must be an object`)
  requireValue(required.every((key) => Object.hasOwn(value, key)), `${field} is missing required fields`)
  requireValue(Object.keys(value).every((key) => required.includes(key) || optional.includes(key)), `${field} contains unknown fields`)
}

export function checkId(value, field = 'id') {
  requireValue(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value), `${field} must be a 1–64 character identifier`)
  requireValue(!credentialPattern.test(value), `${field} appears to contain credentials`)
  return value
}

function checkText(value, field, max = 300) {
  requireValue(typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max
    && !/[\p{Cc}\p{Cf}]/u.test(value), `${field} must be a short, non-empty single line`)
  requireValue(!credentialPattern.test(value), `${field} appears to contain credentials`)
}

function checkArray(value, field, max, validate, min = 0) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= max, `${field} must contain ${min}–${max} entries`)
  for (const item of value) validate(item, field)
}

function checkUnique(values, field) {
  requireValue(new Set(values).size === values.length, `${field} contains duplicate entries`)
}

function checkPath(value, field) {
  checkText(value, field, 300)
  requireValue(!/[\\:*?"<>|[\]{}]/.test(value) && value.split('/').every((part) => (
    part && part !== '.' && part !== '..' && part.toLowerCase() !== '.git' && !/[. ]$/.test(part)
  )), `${field} must be a normalized repository-relative path`)
}

function containsPath(scope, file) {
  const folder = scope.toLowerCase()
  const target = file.toLowerCase()
  return folder === target || target.startsWith(`${folder}/`)
}

function checkEvidence(ref) {
  exactKeys(ref, ['path', 'sha256'], [], 'evidence')
  checkPath(ref.path, 'evidence.path')
  requireValue(ref.path.startsWith('artifacts/'), 'evidence.path must be under artifacts/')
  requireValue(typeof ref.sha256 === 'string' && digestPattern.test(ref.sha256), 'evidence.sha256 must be SHA-256')
}

function checkCheck(check) {
  exactKeys(check, ['name', 'status'], ['command'], 'handoff.check')
  checkText(check.name, 'handoff.check.name', 100)
  requireValue(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(check.status), 'handoff.check.status is invalid')
  if (Object.hasOwn(check, 'command')) checkText(check.command, 'handoff.check.command')
}

function checkHandoff(handoff, writePaths) {
  exactKeys(handoff, ['summary', 'revision', 'files', 'checks'], ['limitations'], 'handoff')
  checkText(handoff.summary, 'handoff.summary', 500)
  requireValue(typeof handoff.revision === 'string' && shaPattern.test(handoff.revision), 'handoff.revision must be a full Git object ID')
  checkArray(handoff.files, 'handoff.files', 24, checkPath)
  checkUnique(handoff.files.map((file) => file.toLowerCase()), 'handoff.files')
  requireValue(handoff.files.every((file) => writePaths.some((scope) => containsPath(scope, file))), 'handoff.files exceed the declared write scope')
  checkArray(handoff.checks, 'handoff.checks', 12, checkCheck, 1)
  if (Object.hasOwn(handoff, 'limitations')) checkArray(handoff.limitations, 'handoff.limitations', 8, checkText)
}

export function isActive(task) {
  return task.status === 'IN_PROGRESS' || task.status === 'REVIEW'
}

function checkTask(task, schemaVersion) {
  const lifecycleKeys = schemaVersion === 2 ? ['lease', 'cancellation'] : []
  exactKeys(task, [...taskDefinitionKeys, ...taskProgressKeys, ...lifecycleKeys], [], 'task')
  checkId(task.id, 'task.id')
  checkId(task.owner, 'task.owner')
  checkArray(task.acceptance, 'task.acceptance', 8, checkText, 1)
  checkArray(task.dependsOn, 'task.dependsOn', 24, checkId)
  checkUnique(task.dependsOn, 'task.dependsOn')
  checkArray(task.writePaths, 'task.writePaths', 24, checkPath)
  checkUnique(task.writePaths.map((path) => path.toLowerCase()), 'task.writePaths')
  if (task.workspace !== null) checkText(task.workspace, 'task.workspace')
  requireValue(statuses.includes(task.status) && (schemaVersion === 2 || task.status !== 'CANCELLED'), 'task.status is invalid')
  if (schemaVersion === 2) {
    if (task.lease !== null) {
      exactKeys(task.lease, ['id', 'worker', 'expiresAtMs'], [], 'lease')
      checkLeaseId(task.lease.id)
      checkId(task.lease.worker, 'worker')
      requireValue(task.status === 'IN_PROGRESS' && Number.isSafeInteger(task.lease.expiresAtMs) && task.lease.expiresAtMs > 0,
        'only in-progress tasks may have a lease expiration')
    }
    if (task.status === 'CANCELLED') {
      checkText(task.cancellation, 'cancellation')
      requireValue(task.remainingActions.length === 0, 'cancelled tasks cannot have remaining actions')
    } else requireValue(task.cancellation === null, 'only cancelled tasks may have a cancellation reason')
  }
  requireValue(!isActive(task) || !task.writePaths.length || task.workspace, 'active write ownership requires a workspace')
  checkArray(task.decisions, 'task.decisions', 8, checkText)
  checkArray(task.evidence, 'task.evidence', 12, checkEvidence)
  checkArray(task.blockers, 'task.blockers', 8, checkText)
  checkArray(task.remainingActions, 'task.remainingActions', 8, checkText)
  requireValue((task.status === 'BLOCKED') === Boolean(task.blockers.length), 'blockers are required for BLOCKED tasks and cleared when work resumes')
  if (task.status === 'REVIEW' || task.status === 'DONE') checkHandoff(task.handoff, task.writePaths)
  else requireValue(task.handoff === null, 'handoff is recorded during REVIEW')
  if (task.status === 'DONE') {
    requireValue(task.remainingActions.length === 0, 'DONE requires no remaining actions')
    requireValue(task.handoff.checks.every(({ status }) => status !== 'FAIL'), 'DONE cannot have a failed check')
  }
}

function checkDependencies(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const visiting = new Set()
  const visited = new Set()
  function visit(id) {
    requireValue(!visiting.has(id), 'task dependencies contain a cycle')
    if (visited.has(id)) return
    visiting.add(id)
    const task = byId.get(id)
    for (const dep of task.dependsOn) {
      requireValue(byId.has(dep), 'task has an unknown dependency')
      requireValue(!(isActive(task) || task.status === 'DONE') || byId.get(dep).status === 'DONE', 'task dependencies must be DONE before activation')
      visit(dep)
    }
    visiting.delete(id)
    visited.add(id)
  }
  for (const task of tasks) visit(task.id)
}

export function checkOwnership(first, second) {
  if (!isActive(first) || !isActive(second) || !first.writePaths.length || !second.writePaths.length) return
  requireValue(first.workspace.toLowerCase() !== second.workspace.toLowerCase(), 'active write tasks must use distinct workspaces')
  requireValue(!first.writePaths.some((left) => second.writePaths.some((right) => containsPath(left, right) || containsPath(right, left))),
    'active tasks cannot have overlapping write ownership')
}

export function validateState(state) {
  const schemaVersion = state?.schemaVersion
  requireValue(schemaVersion === 1 || schemaVersion === 2, 'unsupported state schema version')
  const sourceKeys = schemaVersion === 2 ? ['sourceRevision', 'rebindReason'] : []
  exactKeys(state, ['schemaVersion', 'id', 'version', 'baseRevision', 'objective', 'tasks', ...sourceKeys], [], 'state')
  if (schemaVersion === 2) {
    checkRevision(state.sourceRevision, 'sourceRevision')
    if (state.rebindReason !== null) checkText(state.rebindReason, 'rebindReason')
  }
  checkId(state.id, 'run ID')
  requireValue(Number.isSafeInteger(state.version) && state.version > 0, 'state.version must be a positive integer')
  checkRevision(state.baseRevision, 'baseRevision')
  checkText(state.objective, 'objective', 1000)
  checkArray(state.tasks, 'tasks', 24, (task) => checkTask(task, schemaVersion), 1)
  checkUnique(state.tasks.map((task) => task.id), 'task IDs')
  checkDependencies(state.tasks)
  for (const [index, task] of state.tasks.entries()) {
    for (const other of state.tasks.slice(index + 1)) checkOwnership(task, other)
  }
  return state
}

export function initializeState(id, input, baseRevision) {
  exactKeys(input, ['objective', 'tasks'], [], 'plan')
  checkArray(input.tasks, 'tasks', 24, (task) => exactKeys(task, taskDefinitionKeys.slice(0, -1), ['workspace'], 'task definition'), 1)
  const tasks = input.tasks.map((task) => ({
    workspace: null,
    ...task,
    status: 'PENDING',
    decisions: [],
    evidence: [],
    blockers: [],
    remainingActions: [],
    handoff: null,
    lease: null,
    cancellation: null,
  }))
  return validateState({
    schemaVersion: STATE_SCHEMA_VERSION, id, version: 1, baseRevision, sourceRevision: baseRevision,
    rebindReason: null, objective: input.objective, tasks,
  })
}

export function getTask(state, taskId) {
  const task = state.tasks.find(({ id }) => id === taskId)
  if (!task) throw new StateError('NOT_FOUND', 'task ID was not found')
  return task
}

export function checkRevision(value, field = 'revision') {
  requireValue(typeof value === 'string' && shaPattern.test(value), `${field} must be a full Git object ID`)
  return value
}

export function checkLeaseId(value) {
  requireValue(typeof value === 'string' && leasePattern.test(value), 'lease ID must be a canonical version 4 UUID')
  return value
}

export function boundRevision(state) {
  return state.schemaVersion === 1 ? state.baseRevision : state.sourceRevision
}

export function assertBoundRevision(state, liveRevision) {
  if (boundRevision(state) !== liveRevision) {
    throw new StateError('SOURCE_DRIFT', 'checkout HEAD differs from the run revision, recover before continuing')
  }
}

function upgrade(state) {
  if (state.schemaVersion === STATE_SCHEMA_VERSION) return state
  return {
    ...state, schemaVersion: STATE_SCHEMA_VERSION, sourceRevision: state.baseRevision, rebindReason: null,
    tasks: state.tasks.map((task) => ({ ...task, lease: null, cancellation: null })),
  }
}

function reviseTask(state, current, next) {
  return validateState({
    ...state,
    version: state.version + 1,
    tasks: state.tasks.map((task) => task === current ? next : task),
  })
}

function leaseConflict(message) {
  throw new StateError('LEASE_CONFLICT', message)
}

function enforceLease(task, leaseId, now) {
  if (!task.lease) {
    if (leaseId !== undefined) leaseConflict('task has no active worker lease')
    return
  }
  if (task.lease.id !== leaseId || task.lease.expiresAtMs <= now) {
    leaseConflict('worker lease is missing, expired, or replaced')
  }
}

function leaseExpiry(ttlMs = 60_000, now) {
  requireValue(Number.isSafeInteger(ttlMs) && ttlMs >= 1_000 && ttlMs <= 1_800_000,
    'ttlMs must be an integer from 1000 through 1800000')
  return now + ttlMs
}

export function claimTask(state, taskId, input, now) {
  exactKeys(input, ['worker'], ['ttlMs', 'workspace'], 'claim')
  checkId(input.worker, 'worker')
  state = upgrade(state)
  const current = getTask(state, taskId)
  const reclaimable = current.lease && current.lease.expiresAtMs <= now
  if (current.status !== 'PENDING' && !reclaimable) leaseConflict('task is not pending or reclaimable')
  if (Object.hasOwn(input, 'workspace')) checkText(input.workspace, 'workspace')
  const workspace = input.workspace ?? current.workspace
  if (reclaimable && current.writePaths.length && current.workspace.toLowerCase() === workspace?.toLowerCase()) {
    leaseConflict('reclaiming a write task requires a distinct workspace')
  }
  return reviseTask(state, current, {
    ...current, workspace, status: 'IN_PROGRESS',
    lease: { id: randomUUID(), worker: input.worker, expiresAtMs: leaseExpiry(input.ttlMs, now) },
  })
}

export function heartbeatTask(state, taskId, input, now) {
  exactKeys(input, ['leaseId'], ['ttlMs'], 'heartbeat')
  checkLeaseId(input.leaseId)
  state = upgrade(state)
  const current = getTask(state, taskId)
  enforceLease(current, input.leaseId, now)
  // A repeated or shorter cadence must not reduce a worker's current lease.
  const expiresAtMs = Math.max(current.lease.expiresAtMs, leaseExpiry(input.ttlMs, now))
  return reviseTask(state, current, { ...current, lease: { ...current.lease, expiresAtMs } })
}

export function cancelTask(state, taskId, input) {
  exactKeys(input, ['reason'], [], 'cancellation')
  checkText(input.reason, 'reason')
  state = upgrade(state)
  const current = getTask(state, taskId)
  if (current.status === 'DONE' || current.status === 'CANCELLED') {
    throw new StateError('CONFLICT', 'terminal task cannot be cancelled')
  }
  return reviseTask(state, current, {
    ...current, status: 'CANCELLED', lease: null, cancellation: input.reason,
    blockers: [], remainingActions: [], handoff: null,
  })
}

export function rebindState(state, input, liveRevision) {
  exactKeys(input, ['revision', 'reason'], [], 'rebind')
  checkRevision(input.revision)
  checkText(input.reason, 'reason')
  if (input.revision !== liveRevision) throw new StateError('SOURCE_DRIFT', 'requested revision differs from checkout HEAD')
  if (state.tasks.some((task) => isActive(task) || task.status === 'DONE')) {
    throw new StateError('CONFLICT', 'cannot rebind work that is active or accepted, start a new run or reconcile active tasks')
  }
  state = upgrade(state)
  return validateState({
    ...state, version: state.version + 1, sourceRevision: liveRevision, rebindReason: input.reason,
    tasks: state.tasks.map((task) => ({ ...task, evidence: [] })),
  })
}

export function updateState(state, taskId, patch, leaseId, now) {
  exactKeys(patch, [], [...taskProgressKeys, 'owner', 'workspace'], 'task update')
  requireValue(Object.keys(patch).length > 0, 'task update must contain at least one field')
  state = upgrade(state)
  const current = getTask(state, taskId)
  enforceLease(current, leaseId, now)
  const next = { ...current, ...patch }
  requireValue(transitions[current.status].includes(next.status), 'invalid task status transition')
  requireValue(!isActive(current) || !isActive(next) || (next.owner === current.owner && next.workspace === current.workspace),
    'pause or block active work before reassigning ownership')
  if (next.status !== 'BLOCKED' && !Object.hasOwn(patch, 'blockers')) next.blockers = []
  if (next.status !== 'REVIEW' && next.status !== 'DONE' && !Object.hasOwn(patch, 'handoff')) next.handoff = null
  if (next.status !== 'IN_PROGRESS') next.lease = null
  if (next.handoff && (Object.hasOwn(patch, 'handoff') || next.status === 'DONE')) {
    requireValue(next.handoff.revision === boundRevision(state), 'handoff revision must match the bound source revision')
  }
  return reviseTask(state, current, next)
}

export function summarizeState(state, stateSha256, taskId, liveRevision = boundRevision(state), now = Date.now()) {
  const complete = new Set(state.tasks.filter(({ status }) => status === 'DONE').map(({ id }) => id))
  const { schemaVersion, id, version, baseRevision, objective } = state
  const sourceRevision = boundRevision(state)
  return {
    schemaVersion, id, version, baseRevision, objective, stateSha256, sourceRevision, liveRevision,
    sourceDrift: sourceRevision !== liveRevision,
    ready: state.tasks.filter(({ status, dependsOn }) => status === 'PENDING' && dependsOn.every((dep) => complete.has(dep))).map(({ id }) => id),
    active: state.tasks.filter(isActive).map(({ id, owner, status }) => ({ id, owner, status })),
    expired: state.tasks.filter(({ lease }) => lease && lease.expiresAtMs <= now).map(({ id }) => id),
    blocked: state.tasks.filter(({ status }) => status === 'BLOCKED').map(({ id, blockers }) => ({ id, blockers })),
    cancelled: state.tasks.filter(({ status }) => status === 'CANCELLED').map(({ id }) => id),
    complete: [...complete],
    ...(taskId ? { task: getTask(state, taskId) } : {}),
  }
}
