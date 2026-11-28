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
const executionProgressKeys = ['stage', 'revision', 'files', 'results', 'resources']
const checkStatuses = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']
const digestPattern = /^[0-9a-f]{64}$/
const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const credentialPattern = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bbearer\s+[\w./+=-]{8,}|\b(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9_-])[A-Za-z0-9_-]{10,}|\b(?:password|passwd|secret|(?:access|api|auth)[_-]?(?:key|token))\s*[:=]\s*\S+|\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@|[?&](?:token|signature|x-amz-credential|x-amz-signature)=\S+)/i

export class StateError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function requireValue(condition, message) {
  if (!condition) throw new StateError('INVALID_STATE', message)
}

export function exactKeys(value, required, optional = [], field = 'record') {
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

function checkRevision(value, field) {
  requireValue(typeof value === 'string' && shaPattern.test(value), `${field} must be a full Git object ID`)
}

function checkScopedFiles(files, writePaths, field) {
  checkArray(files, field, 24, checkPath)
  checkUnique(files.map((file) => file.toLowerCase()), field)
  requireValue(files.every((file) => writePaths.some((scope) => containsPath(scope, file))), `${field} exceed the declared write scope`)
}

function checkCheck(check) {
  exactKeys(check, ['name', 'status'], ['command'], 'handoff.check')
  checkText(check.name, 'handoff.check.name', 100)
  requireValue(checkStatuses.includes(check.status), 'handoff.check.status is invalid')
  if (Object.hasOwn(check, 'command')) checkText(check.command, 'handoff.check.command')
}

function checkHandoff(handoff, writePaths) {
  exactKeys(handoff, ['summary', 'revision', 'files', 'checks'], ['limitations'], 'handoff')
  checkText(handoff.summary, 'handoff.summary', 500)
  checkRevision(handoff.revision, 'handoff.revision')
  checkScopedFiles(handoff.files, writePaths, 'handoff.files')
  checkArray(handoff.checks, 'handoff.checks', 12, checkCheck, 1)
  if (Object.hasOwn(handoff, 'limitations')) checkArray(handoff.limitations, 'handoff.limitations', 8, checkText)
}

function checkGate(gate) {
  exactKeys(gate, ['id', 'kind', 'stage'], ['workflow', 'input', 'revisionPolicy'], 'required gate')
  checkId(gate.id, 'required gate.id')
  checkId(gate.stage, 'required gate.stage')
  requireValue(['workflow', 'technical', 'review', 'owner'].includes(gate.kind), 'required gate.kind is invalid')
  requireValue(gate.revisionPolicy === undefined || gate.revisionPolicy === 'stage', 'required gate revision policy is invalid')
  if (gate.kind === 'workflow') {
    checkId(gate.workflow, 'required gate.workflow')
    if (Object.hasOwn(gate, 'input')) {
      requireValue(gate.input && typeof gate.input === 'object' && !Array.isArray(gate.input), 'required gate.input must be an object')
      checkText(JSON.stringify(gate.input), 'required gate.input', 4096)
    }
  } else requireValue(gate.workflow === undefined && gate.input === undefined, 'only workflow gates may name workflow inputs')
}

function checkPolicy(policy) {
  exactKeys(policy, ['version', 'stages', 'gates', 'rules', 'skills'], [], 'execution policy')
  requireValue(Number.isSafeInteger(policy.version) && policy.version > 0, 'execution policy version is invalid')
  checkArray(policy.stages, 'execution policy.stages', 24, checkId, 1)
  checkUnique(policy.stages, 'execution policy.stages')
  checkArray(policy.gates, 'execution policy.gates', 24, checkGate, 1)
  checkUnique(policy.gates.map(({ id }) => id), 'execution policy.gates')
  requireValue(policy.gates.every(({ stage }) => policy.stages.includes(stage)), 'required gate stage must be present in the execution policy')
  checkArray(policy.rules, 'execution policy.rules', 24, checkPath, 1)
  checkArray(policy.skills, 'execution policy.skills', 24, checkPath)
}

function checkGateResult(result) {
  exactKeys(result, ['id', 'status', 'revision'], ['evidence', 'approval'], 'gate result')
  checkId(result.id, 'gate result.id')
  requireValue(checkStatuses.includes(result.status), 'gate result.status is invalid')
  checkRevision(result.revision, 'gate result.revision')
  if (Object.hasOwn(result, 'evidence')) checkEvidence(result.evidence)
  requireValue(result.status !== 'PASS' || result.evidence, 'a passing gate requires evidence')
  if (Object.hasOwn(result, 'approval')) requireValue(result.approval === 'APPROVED', 'gate approval must record an explicit approval')
}

function checkExecution(task) {
  const { execution, status, handoff, writePaths } = task
  exactKeys(execution, ['route', 'policy', ...executionProgressKeys.slice(0, -1)], ['resources'], 'task execution')
  checkId(execution.route, 'execution.route')
  checkPolicy(execution.policy)
  const { stages, gates } = execution.policy
  const current = stages.indexOf(execution.stage)
  requireValue(current >= 0, 'execution stage is not part of the pinned workflow')
  checkRevision(execution.revision, 'execution.revision')
  checkScopedFiles(execution.files, writePaths, 'execution.files')
  checkArray(execution.results, 'execution.results', 24, checkGateResult)
  checkUnique(execution.results.map(({ id }) => id), 'gate result IDs')
  const results = new Map(execution.results.map((result) => [result.id, result]))
  for (const result of results.values()) {
    const gate = gates.find(({ id }) => id === result.id)
    requireValue(gate && stages.indexOf(gate.stage) <= current, 'gate result is outside the current workflow stage')
    requireValue((gate.kind === 'owner' && result.status === 'PASS') === (result.approval === 'APPROVED'),
      'passing owner gates require explicit owner approval evidence')
  }
  for (const gate of gates) {
    const index = stages.indexOf(gate.stage)
    if (index < current || status === 'REVIEW' || status === 'DONE') {
      requireValue(results.get(gate.id)?.status === 'PASS', `required gate ${gate.id} must pass`)
    }
    if ((status === 'REVIEW' || status === 'DONE') && gate.revisionPolicy !== 'stage') {
      requireValue(results.get(gate.id)?.revision === handoff.revision, `required gate ${gate.id} must match the handoff revision`)
    }
  }
  if (status === 'REVIEW' || status === 'DONE') {
    requireValue(current === stages.length - 1, 'handoff requires the final workflow stage')
    requireValue(execution.revision === handoff.revision, 'execution revision must match the handoff revision')
  }
  if (Object.hasOwn(execution, 'resources')) {
    const fields = ['elapsedMs', 'attempts', 'inputTokens', 'outputTokens', 'credits', 'costUsd']
    exactKeys(execution.resources, [], fields, 'execution.resources')
    requireValue(Object.values(execution.resources).every((value) => Number.isFinite(value) && value >= 0), 'resource usage must contain observed non-negative numbers')
  }
}

export function validateGateReceipt(record, gate, result) {
  const fields = { technical: ['checks'], review: ['mode', 'summary'], owner: ['decision', 'reference'] }
  exactKeys(record, ['schemaVersion', 'gate', 'revision', 'status', ...fields[gate.kind]], [], 'gate receipt')
  requireValue(record.schemaVersion === 1 && record.gate === gate.id && record.revision === result.revision && record.status === 'PASS',
    'gate receipt must match the gate, source revision and passing status')
  if (gate.kind === 'technical') {
    checkArray(record.checks, 'gate receipt.checks', 24, checkCheck, 1)
    requireValue(record.checks.every(({ status }) => status === 'PASS'), 'technical gate requires passing checks')
  }
  if (gate.kind === 'review') {
    requireValue(['INDEPENDENT', 'SELF_REVIEW'].includes(record.mode), 'review receipt must identify its review mode')
    checkText(record.summary, 'gate receipt.summary', 500)
  }
  if (gate.kind === 'owner') {
    requireValue(record.decision === 'APPROVED', 'owner receipt must record explicit approval')
    checkText(record.reference, 'gate receipt.reference', 500)
  }
}

export function isActive(task) {
  return task.status === 'IN_PROGRESS' || task.status === 'REVIEW'
}

function checkTask(task, schemaVersion) {
  exactKeys(task, [...taskDefinitionKeys, ...taskProgressKeys, ...(schemaVersion === 2 ? ['execution'] : [])], [], 'task')
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
  if (schemaVersion === 2) checkExecution(task)
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
  requireValue(state.schemaVersion === 1 || state.schemaVersion === 2, 'unsupported state schema version')
  checkId(state.id, 'run ID')
  requireValue(Number.isSafeInteger(state.version) && state.version > 0, 'state.version must be a positive integer')
  checkRevision(state.baseRevision, 'baseRevision')
  checkText(state.objective, 'objective', 1000)
  checkArray(state.tasks, 'tasks', 24, (task) => checkTask(task, state.schemaVersion), 1)
  checkUnique(state.tasks.map((task) => task.id), 'task IDs')
  checkDependencies(state.tasks)
  for (const [index, task] of state.tasks.entries()) {
    for (const other of state.tasks.slice(index + 1)) checkOwnership(task, other)
  }
  return state
}

export function initializeState(id, input, baseRevision, loadPolicy) {
  exactKeys(input, ['objective', 'tasks'], [], 'plan')
  const universal = typeof loadPolicy === 'function'
  const required = [...taskDefinitionKeys.slice(0, -1), ...(universal ? ['execution'] : [])]
  checkArray(input.tasks, 'tasks', 24, (task) => exactKeys(task, required, ['workspace'], 'task definition'), 1)
  const tasks = input.tasks.map((task) => ({
    workspace: null,
    ...task,
    status: 'PENDING',
    decisions: [],
    evidence: [],
    blockers: [],
    remainingActions: [],
    handoff: null,
    ...(universal ? { execution: startExecution(task.execution, baseRevision, loadPolicy) } : {}),
  }))
  return validateState({ schemaVersion: universal ? 2 : 1, id, version: 1, baseRevision, objective: input.objective, tasks })
}

function startExecution(input, revision, loadPolicy) {
  exactKeys(input, ['route'], [], 'task execution definition')
  const route = checkId(input.route, 'execution.route')
  const policy = loadPolicy(route)
  checkPolicy(policy)
  return { route, policy, stage: policy.stages[0], revision, files: [], results: [] }
}

function advanceExecution(current, patch) {
  exactKeys(patch, [], executionProgressKeys, 'task execution update')
  const next = { ...current, ...patch }
  const position = current.policy.stages.indexOf(next.stage)
  const previous = current.policy.stages.indexOf(current.stage)
  requireValue(position >= 0 && position <= previous + 1, 'execution stage must advance one step or return to an earlier stage')
  if (position < previous) {
    const retained = new Set(current.policy.gates.filter(({ stage }) => current.policy.stages.indexOf(stage) < position).map(({ id }) => id))
    next.results = current.results.filter(({ id }) => retained.has(id))
    requireValue(!Object.hasOwn(patch, 'results'), 'rewinding a workflow discards gate results from the affected stages')
  }
  return next
}

export function getTask(state, taskId) {
  const task = state.tasks.find(({ id }) => id === taskId)
  if (!task) throw new StateError('NOT_FOUND', 'task ID was not found')
  return task
}

export function updateState(state, taskId, patch) {
  exactKeys(patch, [], [...taskProgressKeys, 'owner', 'workspace', ...(state.schemaVersion === 2 ? ['execution'] : [])], 'task update')
  requireValue(Object.keys(patch).length > 0, 'task update must contain at least one field')
  const current = getTask(state, taskId)
  const next = { ...current, ...patch }
  if (Object.hasOwn(patch, 'execution')) {
    requireValue(next.status !== 'PENDING', 'start the task before recording execution progress')
    next.execution = advanceExecution(current.execution, patch.execution)
  }
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
