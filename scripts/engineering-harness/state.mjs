import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  assertBoundRevision, cancelTask, checkId, checkLeaseId, checkRevision, claimTask, heartbeatTask,
  initializeState, MAX_STATE_BYTES, rebindState, StateError, summarizeState, updateState,
} from './state-contract.mjs'
import { advanceCheckpoint, createCheckpoint, readCheckpoint, verifyCheckpointEvidence } from './state-store.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const help = {
  schemaVersion: 2,
  commands: [
    'init RUN_ID JSON|- [--key KEY]',
    'show RUN_ID [VERSION]',
    'recover RUN_ID [TASK_ID]',
    'verify-evidence RUN_ID [TASK_ID]',
    'update RUN_ID EXPECTED_VERSION TASK_ID JSON|- [--lease ID] [--key KEY]',
    'claim RUN_ID EXPECTED_VERSION TASK_ID JSON|- [--key KEY]',
    'heartbeat RUN_ID EXPECTED_VERSION TASK_ID JSON|- [--key KEY]',
    'cancel RUN_ID EXPECTED_VERSION TASK_ID JSON|- [--key KEY]',
    'rebind RUN_ID EXPECTED_VERSION JSON|- [--key KEY]',
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

function liveRevision() {
  try {
    return checkRevision(execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 256,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_CONFIG_NOSYSTEM: '1' },
    }).trim())
  } catch {
    throw new StateError('SOURCE_UNAVAILABLE', 'could not determine the current Git revision')
  }
}

function readLiveRevision() {
  try {
    return liveRevision()
  } catch {
    return null
  }
}

function requestReceipt(key, request) {
  if (!key) return undefined
  let fingerprint
  try {
    // Sorting object keys makes replays independent of each client's JSON field order.
    const canonical = JSON.stringify(request, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, value[name]]))
      : value)
    fingerprint = createHash('sha256').update(canonical).digest('hex')
  } catch {
    throw new StateError('INVALID_STATE', 'operation request is not representable')
  }
  return { key, fingerprint }
}

function resultSummary(receipt, taskId, revision, now = Date.now()) {
  const { state, stateSha256, replayed } = receipt
  return {
    ...summarizeState(state, stateSha256, taskId, revision, now),
    ...(replayed === undefined ? {} : { replayed }),
  }
}

function usage() {
  return new StateError('INVALID_STATE', 'invalid state command or options, use --help')
}

function parse(rawArgs) {
  let parsed
  try {
    parsed = parseArgs({
      args: rawArgs, allowPositionals: true,
      options: {
        key: { type: 'string', multiple: true },
        lease: { type: 'string', multiple: true },
        help: { type: 'boolean' },
      },
    })
  } catch {
    throw usage()
  }
  const { positionals: [command, id, ...args], values } = parsed
  if (values.help && (command || values.key || values.lease)) throw usage()
  if (values.key?.length > 1 || values.lease?.length > 1) throw usage()
  const key = values.key ? checkId(values.key[0], 'operation key') : undefined
  const leaseId = values.lease ? checkLeaseId(values.lease[0]) : undefined
  return { command, id, args, key, leaseId }
}

const taskMutations = {
  update: (state, taskId, input, now, leaseId) => updateState(state, taskId, input, leaseId, now),
  claim: claimTask,
  heartbeat: heartbeatTask,
  cancel: cancelTask,
}

async function main(rawArgs) {
  const { command, id, args, key, leaseId } = parse(rawArgs)
  if (command === undefined && key === undefined && leaseId === undefined) return help
  const runId = checkId(id, 'run ID')
  if (leaseId !== undefined && command !== 'update') throw usage()
  if (command === 'init' && args.length === 1) {
    const input = await readInput(args[0])
    const revision = liveRevision()
    const plan = initializeState(runId, input, revision)
    return resultSummary(createCheckpoint(repoRoot, plan, requestReceipt(key, { command, input })), undefined, revision)
  }
  if (['show', 'recover', 'verify-evidence'].includes(command) && args.length < 2 && key === undefined) {
    if (command === 'show') return readCheckpoint(repoRoot, runId, args.length ? version(args[0]) : undefined)
    const task = args.length ? checkId(args[0], 'task ID') : undefined
    const receipt = readCheckpoint(repoRoot, runId)
    return command === 'verify-evidence'
      ? verifyCheckpointEvidence(repoRoot, receipt, task)
      : resultSummary(receipt, task, readLiveRevision())
  }
  const rebind = command === 'rebind'
  if ((rebind || Object.hasOwn(taskMutations, command)) && args.length === (rebind ? 2 : 3)) {
    const expectedVersion = version(args[0])
    const task = rebind ? undefined : checkId(args[1], 'task ID')
    const input = await readInput(args.at(-1))
    const request = requestReceipt(key, { command, expectedVersion, task, input, leaseId })
    let revision
    let now
    const receipt = advanceCheckpoint(repoRoot, runId, expectedVersion, (state) => {
      if (command === 'cancel') return cancelTask(state, task, input)
      revision = liveRevision()
      if (rebind) return rebindState(state, input, revision)
      assertBoundRevision(state, revision)
      now = Date.now()
      return taskMutations[command](state, task, input, now, leaseId)
    }, request)
    return resultSummary(receipt, task, revision ?? readLiveRevision(), now)
  }
  throw usage()
}

try {
  const result = await main(process.argv.slice(2))
  process.stdout.write(JSON.stringify(result) + '\n')
  if (result.status === 'FAIL') process.exitCode = 1
} catch (error) {
  const knownError = error instanceof StateError
  const code = knownError ? error.code : 'STORAGE_ERROR'
  const infrastructureMessage = error.errcode === 5 ? 'state storage is busy, recover before retrying' : 'state storage operation failed'
  process.stderr.write(JSON.stringify({ error: code, message: knownError ? error.message : infrastructureMessage }) + '\n')
  const conflicts = ['CONFLICT', 'SOURCE_DRIFT', 'SOURCE_UNAVAILABLE', 'LEASE_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_LIMIT']
  process.exitCode = conflicts.includes(code) ? 3 : code === 'INVALID_STATE' ? 2 : 1
}
