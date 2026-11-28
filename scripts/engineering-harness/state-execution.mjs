import { isDeepStrictEqual } from 'node:util'
import { checkpointRequirements } from './execution-contract.mjs'
import { MAX_STATE_BYTES, requireValue, StateError, validateGateReceipt } from './state-contract.mjs'
import { git, inspectEvidence } from './state-portable.mjs'

const registryPath = 'config/engineering-execution.json'
const reportPath = /^artifacts\/engineering-harness\/runs\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/report\.json$/

export function executionPolicy(root, revision) {
  const source = git(root, ['show', `${revision}:${registryPath}`])
  if (!source) throw new StateError('INVALID_STATE', 'the base revision has no committed execution registry')
  let registry
  try {
    registry = JSON.parse(source)
  } catch {
    throw new StateError('INVALID_STATE', 'the committed execution registry is invalid')
  }
  return (route) => {
    try {
      return checkpointRequirements(registry, route)
    } catch {
      throw new StateError('INVALID_STATE', 'the execution route is unavailable in the committed registry')
    }
  }
}

function ancestor(root, prior, revision) {
  return prior === revision || git(root, ['merge-base', '--is-ancestor', prior, revision]) !== null
}

function validateWorkflowReport(report, gate, result) {
  const runId = reportPath.exec(result.evidence.path)?.[1]
  const args = report?.reproduce?.argv
  requireValue(runId && report?.schemaVersion === 1 && report.runId === runId && report.workflow === gate.workflow
    && report.status === 'PASS' && report.revision === result.revision && report.worktreeDirty === false
    && Array.isArray(report.steps) && report.steps.length > 0 && Array.isArray(args) && (args.length === 4 || args.length === 5)
    && isDeepStrictEqual(args.slice(0, 4), ['node', 'scripts/engineering-harness/workflow.mjs', 'run', gate.workflow]),
  'gate requires a matching successful harness report on clean committed source')
  let input
  try {
    input = args.length === 5 ? JSON.parse(args[4]) : {}
  } catch {
    throw new StateError('INVALID_STATE', 'workflow report has invalid reproduction inputs')
  }
  requireValue(input && typeof input === 'object' && !Array.isArray(input)
    && Object.entries(gate.input ?? {}).every(([key, value]) => Object.hasOwn(input, key) && isDeepStrictEqual(input[key], value)),
  'workflow report does not match the mandatory gate inputs')
}

function validateGateProof(root, gate, result, allowMissingEvidence) {
  const evidence = inspectEvidence(root, result.evidence, MAX_STATE_BYTES)
  if (allowMissingEvidence && evidence.status === 'MISSING') return
  requireValue(evidence.status === 'MATCH', `required gate ${gate.id} evidence is missing, changed, or unsafe`)
  let receipt
  try {
    receipt = JSON.parse(evidence.bytes)
  } catch {
    throw new StateError('INVALID_STATE', 'gate evidence must be a JSON harness report or gate receipt')
  }
  if (gate.kind === 'workflow') validateWorkflowReport(receipt, gate, result)
  else validateGateReceipt(receipt, gate, result)
}

export function validateExecution(root, state, { taskId, proofs = true, allowMissingEvidence = false } = {}) {
  if (state.schemaVersion !== 2) return
  const loadPolicy = executionPolicy(root, state.baseRevision)
  for (const { execution, status } of state.tasks.filter(({ id }) => !taskId || taskId === id)) {
    requireValue(isDeepStrictEqual(execution.policy, loadPolicy(execution.route)), 'execution policy differs from the committed route')
    if (!proofs) continue
    requireValue(ancestor(root, state.baseRevision, execution.revision),
      'execution revision must descend from the pinned workflow revision')
    for (const result of execution.results) {
      if (result.status !== 'PASS') continue
      const gate = execution.policy.gates.find(({ id }) => id === result.id)
      requireValue(ancestor(root, result.revision, execution.revision), `required gate ${gate.id} must match the task source history`)
      validateGateProof(root, gate, result, allowMissingEvidence && status !== 'DONE' && status !== 'REVIEW')
    }
  }
}
