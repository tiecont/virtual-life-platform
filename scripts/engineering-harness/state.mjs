import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkId, initializeState, MAX_STATE_BYTES, StateError, summarizeState, updateState } from './state-contract.mjs'
import { advanceCheckpoint, createCheckpoint, readCheckpoint } from './state-store.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const help = {
  commands: [
    'init RUN_ID JSON|-',
    'show RUN_ID [VERSION]',
    'recover RUN_ID [TASK_ID]',
    'update RUN_ID EXPECTED_VERSION TASK_ID JSON|-',
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

async function readInput(value) {
  let input = value
  if (value === '-') {
    const chunks = []
    let size = 0
    for await (const chunk of process.stdin) {
      size += chunk.length
      if (size > MAX_STATE_BYTES) throw new StateError('INVALID_STATE', 'JSON input exceeds the 64 KiB limit')
      chunks.push(chunk)
    }
    input = Buffer.concat(chunks).toString('utf8')
  }
  if (Buffer.byteLength(input) > MAX_STATE_BYTES) throw new StateError('INVALID_STATE', 'JSON input exceeds the 64 KiB limit')
  try {
    return JSON.parse(input)
  } catch {
    throw new StateError('INVALID_STATE', 'input must be valid JSON')
  }
}

function baseRevision() {
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 256,
    }).trim()
  } catch {
    throw new StateError('STORAGE_ERROR', 'could not determine the current Git revision')
  }
}

async function main([command, id, ...args]) {
  if (command === undefined || (command === '--help' && id === undefined)) return help
  if (command === 'init' && args.length === 1) {
    const plan = initializeState(checkId(id, 'run ID'), await readInput(args[0]), baseRevision())
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
  if (command === 'update' && args.length === 3) {
    const runId = checkId(id, 'run ID')
    const expectedVersion = version(args[0])
    const taskId = checkId(args[1], 'task ID')
    const patch = await readInput(args[2])
    const { state, stateSha256 } = advanceCheckpoint(repoRoot, runId, expectedVersion, (current) => updateState(current, taskId, patch))
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
