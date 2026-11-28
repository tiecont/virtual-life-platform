export const MAX_STATE_BYTES = 64 * 1024
const statuses = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE']
const transitions = {
  PENDING: ['PENDING', 'IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['IN_PROGRESS', 'BLOCKED', 'REVIEW'],
  BLOCKED: ['BLOCKED', 'PENDING', 'IN_PROGRESS'],
  REVIEW: ['REVIEW', 'IN_PROGRESS', 'BLOCKED', 'DONE'],
  DONE: [],
}
const taskDefinitionKeys = ['id', 'owner', 'acceptance', 'dependsOn', 'writePaths', 'workspace']
const taskProgressKeys = ['status', 'decisions', 'evidence', 'blockers', 'remainingActions', 'handoff']
const digestPattern = /^[0-9a-f]{64}$/
const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const credentialPattern = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bbearer\s+[\w./+=-]{8,}|\b(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9_-])[A-Za-z0-9_-]{10,}|\b(?:password|passwd|secret|(?:access|api|auth)[_-]?(?:key|token))\s*[:=]\s*\S+|\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@|[?&](?:token|signature|x-amz-credential|x-amz-signature)=\S+)/i

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

function checkTask(task) {
  exactKeys(task, [...taskDefinitionKeys, ...taskProgressKeys], [], 'task')
  checkId(task.id, 'task.id')
  checkId(task.owner, 'task.owner')
  checkArray(task.acceptance, 'task.acceptance', 8, checkText, 1)
  checkArray(task.dependsOn, 'task.dependsOn', 24, checkId)
  checkUnique(task.dependsOn, 'task.dependsOn')
  checkArray(task.writePaths, 'task.writePaths', 24, checkPath)
  checkUnique(task.writePaths.map((path) => path.toLowerCase()), 'task.writePaths')
  if (task.workspace !== null) checkText(task.workspace, 'task.workspace')
  requireValue(statuses.includes(task.status), 'task.status is invalid')
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
  exactKeys(state, ['schemaVersion', 'id', 'version', 'baseRevision', 'objective', 'tasks'], [], 'state')
  requireValue(state.schemaVersion === 1, 'unsupported state schema version')
  checkId(state.id, 'run ID')
  requireValue(Number.isSafeInteger(state.version) && state.version > 0, 'state.version must be a positive integer')
  requireValue(typeof state.baseRevision === 'string' && shaPattern.test(state.baseRevision), 'baseRevision must be a full Git object ID')
  checkText(state.objective, 'objective', 1000)
  checkArray(state.tasks, 'tasks', 24, checkTask, 1)
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
  }))
  return validateState({ schemaVersion: 1, id, version: 1, baseRevision, objective: input.objective, tasks })
}

export function getTask(state, taskId) {
  const task = state.tasks.find(({ id }) => id === taskId)
  if (!task) throw new StateError('NOT_FOUND', 'task ID was not found')
  return task
}

export function updateState(state, taskId, patch) {
  exactKeys(patch, [], [...taskProgressKeys, 'owner', 'workspace'], 'task update')
  requireValue(Object.keys(patch).length > 0, 'task update must contain at least one field')
  const current = getTask(state, taskId)
  const next = { ...current, ...patch }
  requireValue(transitions[current.status].includes(next.status), 'invalid task status transition')
  requireValue(!isActive(current) || !isActive(next) || (next.owner === current.owner && next.workspace === current.workspace),
    'pause or block active work before reassigning ownership')
  if (next.status !== 'BLOCKED' && !Object.hasOwn(patch, 'blockers')) next.blockers = []
  if (next.status !== 'REVIEW' && next.status !== 'DONE' && !Object.hasOwn(patch, 'handoff')) next.handoff = null
  return validateState({
    ...state,
    version: state.version + 1,
    tasks: state.tasks.map((task) => task === current ? next : task),
  })
}

export function summarizeState(state, stateSha256, taskId) {
  const complete = new Set(state.tasks.filter(({ status }) => status === 'DONE').map(({ id }) => id))
  const { schemaVersion, id, version, baseRevision, objective } = state
  return {
    schemaVersion, id, version, baseRevision, objective, stateSha256,
    ready: state.tasks.filter(({ status, dependsOn }) => status === 'PENDING' && dependsOn.every((dep) => complete.has(dep))).map(({ id }) => id),
    active: state.tasks.filter(isActive).map(({ id, owner, status }) => ({ id, owner, status })),
    blocked: state.tasks.filter(({ status }) => status === 'BLOCKED').map(({ id, blockers }) => ({ id, blockers })),
    complete: [...complete],
    ...(taskId ? { task: getTask(state, taskId) } : {}),
  }
}
