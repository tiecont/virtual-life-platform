import { fileURLToPath } from 'node:url'
import { checkId, initializeState, MAX_STATE_BYTES, StateError, summarizeState, updateState } from './state-contract.mjs'
import { advanceCheckpoint, createCheckpoint, listIncompleteCheckpoints, readCheckpoint } from './state-store.mjs'
import { currentRevision, exportPortable, inspectPortable, MAX_PORTABLE_BYTES, validatePortable } from './state-portable.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const help = {
  commands: [
    'list',
    'init RUN_ID JSON|-',
    'start RUN_ID JSON|-',
    'show RUN_ID [VERSION]',
    'recover RUN_ID [TASK_ID]',
    'update RUN_ID EXPECTED_VERSION TASK_ID JSON|-',
    'export RUN_ID [VERSION]',
    'verify JSON|- [TASK_ID]',
    'import JSON|-',
  ],
  storage: 'artifacts/harness-state/checkpoints.sqlite',
}

function version(value) {
  const number = Number(value)
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(number)) {
    throw new StateError('INVALID_STATE', 'version must be a positive integer')
  }
  return number
}

async function readInput(value, limit = MAX_STATE_BYTES) {
  let input = value
  const tooLarge = () => new StateError('INVALID_STATE', `JSON input exceeds the ${limit / 1024} KiB limit`)
  if (value === '-') {
    const chunks = []
    let size = 0
    for await (const chunk of process.stdin) {
      size += chunk.length
      if (size > limit) throw tooLarge()
      chunks.push(chunk)
    }
    input = Buffer.concat(chunks).toString('utf8')
  }
  if (Buffer.byteLength(input) > limit) throw tooLarge()
  try {
    return JSON.parse(input)
  } catch {
    throw new StateError('INVALID_STATE', 'input must be valid JSON')
  }
}

async function executionSupport() {
  return import('./state-execution.mjs')
}

async function main([command, id, ...args]) {
  if (command === undefined || (command === '--help' && id === undefined)) return help
  if (command === 'list' && id === undefined) {
    return { runs: listIncompleteCheckpoints(repoRoot).map(({ state, stateSha256 }) => {
      const { id, version, baseRevision, active, ready, blocked } = summarizeState(state, stateSha256)
      return { id, version, baseRevision, active, ready, blocked: blocked.map(({ id }) => id) }
    }) }
  }
  if ((command === 'init' || command === 'start') && id !== undefined && args.length === 1) {
    const base = currentRevision(repoRoot)
    const loadPolicy = command === 'start' ? (await executionSupport()).executionPolicy(repoRoot, base) : undefined
    const plan = initializeState(checkId(id, 'run ID'), await readInput(args[0]), base, loadPolicy)
    const { state, stateSha256 } = createCheckpoint(repoRoot, plan)
    return summarizeState(state, stateSha256)
  }
  if (command === 'show' && id !== undefined && args.length < 2) {
    return readCheckpoint(repoRoot, checkId(id, 'run ID'), args.length ? version(args[0]) : undefined)
  }
  if (command === 'recover' && id !== undefined && args.length < 2) {
    const taskId = args.length ? checkId(args[0], 'task ID') : undefined
    const { state, stateSha256 } = readCheckpoint(repoRoot, checkId(id, 'run ID'))
    return summarizeState(state, stateSha256, taskId)
  }
  if (command === 'export' && id !== undefined && args.length < 2) {
    const { state } = readCheckpoint(repoRoot, checkId(id, 'run ID'), args.length ? version(args[0]) : undefined)
    return exportPortable(repoRoot, state)
  }
  if ((command === 'verify' || command === 'import') && id !== undefined && args.length <= Number(command === 'verify')) {
    const portable = validatePortable(await readInput(id, MAX_PORTABLE_BYTES))
    const taskId = args.length ? checkId(args[0], 'task ID') : undefined
    const summary = inspectPortable(repoRoot, portable, taskId)
    if (command === 'verify') {
      if (portable.state.schemaVersion === 2 && !summary.missingRevisions.includes(portable.state.baseRevision)) {
        const { validateExecution } = await executionSupport()
        validateExecution(repoRoot, portable.state, { proofs: false })
      }
      return summary
    }
    if (['DIVERGED', 'MISSING_SOURCE'].includes(summary.target.relation) || summary.missingRevisions.length) {
      throw new StateError('INVALID_STATE', 'import requires the source history and recorded revisions in the destination checkout')
    }
    if (portable.state.schemaVersion === 2) {
      const { validateExecution } = await executionSupport()
      validateExecution(repoRoot, portable.state, { allowMissingEvidence: true })
    }
    const { state, stateSha256 } = createCheckpoint(repoRoot, portable.state)
    return { ...summary, ...summarizeState(state, stateSha256) }
  }
  if (command === 'update' && args.length === 3) {
    const runId = checkId(id, 'run ID')
    const expectedVersion = version(args[0])
    const taskId = checkId(args[1], 'task ID')
    const patch = await readInput(args[2])
    const snapshot = readCheckpoint(repoRoot, runId)
    if (snapshot.state.version !== expectedVersion) throw new StateError('CONFLICT', 'checkpoint version changed, recover before retrying')
    const next = updateState(snapshot.state, taskId, patch)
    if (next.schemaVersion === 2) {
      const { validateExecution } = await executionSupport()
      validateExecution(repoRoot, next, { taskId, allowMissingEvidence: !Object.hasOwn(patch, 'execution') })
    }
    const { state, stateSha256 } = advanceCheckpoint(repoRoot, runId, expectedVersion, () => next)
    return summarizeState(state, stateSha256, taskId)
  }
  throw new StateError('INVALID_STATE', 'invalid state command or argument count, use --help')
}

try {
  const result = await main(process.argv.slice(2))
  process.stdout.write(JSON.stringify(result) + '\n')
} catch (error) {
  const knownError = error instanceof StateError
  const code = knownError ? error.code : 'STORAGE_ERROR'
  const infrastructureMessage = error.errcode === 5 ? 'state storage is busy, recover before retrying' : 'state storage operation failed'
  process.stderr.write(JSON.stringify({ error: code, message: knownError ? error.message : infrastructureMessage }) + '\n')
  process.exitCode = code === 'CONFLICT' ? 3 : code === 'INVALID_STATE' ? 2 : 1
}
