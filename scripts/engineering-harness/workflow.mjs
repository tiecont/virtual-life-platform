import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {describeWorkflow, resolveWorkflow, listWorkflows, normalizeInput, recordRevision, recordWorkingTree, workflows} from './workflow-catalog.mjs';
import {newExecution, projectRunView, readEvidence, schemaVersion, statusExitCodes, WorkflowError} from './workflow-runner.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const launcher = 'scripts/engineering-harness/workflow.mjs';
const invalidUsage = () => new WorkflowError('FAIL', 'INVALID_USAGE');

function print(value) {
  process.stdout.write(JSON.stringify(value) + '\n');
}

function parseInput(value) {
  if (value === undefined) return {};
  if (Buffer.byteLength(value) > 4096) throw new WorkflowError('FAIL', 'INPUT_LIMIT');
  try {
    return JSON.parse(value);
  } catch {
    throw new WorkflowError('FAIL', 'INVALID_INPUT_JSON');
  }
}

async function execute(id, rawInput, expectedRevision) {
  const descriptor = describeWorkflow(id);
  const input = normalizeInput(descriptor.inputSchema, parseInput(rawInput));
  const controller = new globalThis.AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  const ctx = newExecution(root, id, controller.signal);
  try {
    const [revision, tree] = await Promise.all([recordRevision(ctx), recordWorkingTree(ctx)]);
    ctx.revision = revision.findings?.revision;
    const findings = {revision: ctx.revision ?? null, worktreeDirty: tree.findings?.dirty ?? null};
    let outcome = [revision, tree].find(result => result.status !== 'PASS');
    if (!outcome && expectedRevision && expectedRevision !== ctx.revision) {
      outcome = {status: 'BLOCKED', code: 'SOURCE_REVISION_MISMATCH'};
    } else if (!outcome && expectedRevision && findings.worktreeDirty) {
      outcome = {status: 'BLOCKED', code: 'SOURCE_WORKTREE_DIRTY'};
    }
    if (!outcome) {
      try {
        outcome = await workflows[id].run(ctx, input);
      } catch (error) {
        outcome = error instanceof WorkflowError ? error : {status: 'FAIL', code: 'UNEXPECTED_ERROR'};
      }
      if (!controller.signal.aborted) {
        const [endingRevision, endingTree] = await Promise.all([
          recordRevision(ctx, 'source-revision-after'), recordWorkingTree(ctx, 'source-state-after'),
        ]);
        if (endingRevision.status !== 'PASS' || endingTree.status !== 'PASS') {
          outcome = {status: 'FAIL', code: 'SOURCE_RECHECK_FAILED'};
        } else if (endingRevision.findings.revision !== ctx.revision ||
          endingTree.findings.statusSha256 !== tree.findings.statusSha256) {
          outcome = {status: 'FAIL', code: 'SOURCE_DRIFT'};
        }
      }
    }
    const args = ['node', launcher, 'run', id];
    if (Object.keys(input).length) args.push(JSON.stringify(input));
    if (expectedRevision) args.push('--source-revision', expectedRevision);
    if (controller.signal.aborted) outcome = {status: 'NOT_RUN', code: 'CANCELLED'};
    return await ctx.finish({...findings, status: outcome.status, code: outcome.code, reproduce: {argv: args},
      sourceBinding: expectedRevision ? 'PINNED_CLEAN_REQUESTED' : 'OBSERVED'});
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}

async function main() {
  let positionals, flags;
  try {
    ({positionals, values: flags} = parseArgs({allowPositionals: true, options: {
      view: {type: 'string'},
      'source-revision': {type: 'string'},
    }}));
  } catch {
    throw invalidUsage();
  }
  const [command, name, input] = positionals;
  const view = flags.view;
  const revision = flags['source-revision'];
  if ((view !== undefined && (!['brief', 'standard', 'full'].includes(view) || !['run', 'evidence'].includes(command))) ||
    (revision !== undefined && (command !== 'run' || !/^[a-f0-9]{40}$/.test(revision)))) throw invalidUsage();
  switch (command) {
    case 'list':
      if (positionals.length !== 1) throw invalidUsage();
      print({schemaVersion, workflows: listWorkflows()});
      break;
    case 'search': {
      if (positionals.length !== 2 || !name?.trim() || name.length > 100) throw invalidUsage();
      const terms = name.trim().toLowerCase().split(/\s+/);
      const matches = listWorkflows().filter(workflow => {
        const text = [workflow.id, workflow.summary, ...workflow.tags].join(' ').toLowerCase();
        return terms.every(term => text.includes(term));
      });
      print({schemaVersion, workflows: matches});
      break;
    }
    case 'describe':
      if (positionals.length !== 2) throw invalidUsage();
      print({schemaVersion, ...describeWorkflow(resolveWorkflow(name))});
      break;
    case 'run': {
      if (positionals.length < 2 || positionals.length > 3) throw invalidUsage();
      const result = await execute(resolveWorkflow(name), input, revision);
      print(projectRunView(result, view ?? 'full'));
      process.exitCode = statusExitCodes[result.status];
      break;
    }
    case 'evidence':
      if (positionals.length < 2 || positionals.length > 3 || (input !== undefined && !/^[a-f0-9]{64}$/.test(input))) {
        throw invalidUsage();
      }
      if (view && view !== 'brief' && !input) throw new WorkflowError('FAIL', 'EVIDENCE_DIGEST_REQUIRED');
      print(await readEvidence(root, name, id => typeof id === 'string' && Object.hasOwn(workflows, id), input, view ?? 'brief'));
      break;
    default:
      throw invalidUsage();
  }
}

try {
  await main();
} catch (error) {
  const known = error instanceof WorkflowError;
  const status = known ? error.status : 'FAIL';
  print({schemaVersion, status, code: known ? error.code : 'UNEXPECTED_ERROR'});
  process.exitCode = statusExitCodes[status];
}
