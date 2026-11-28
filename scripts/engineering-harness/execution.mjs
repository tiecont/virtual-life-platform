import {execFileSync, spawnSync} from 'node:child_process';
import {lstatSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {describeRoute, discoverRoutes, executionMode, validateRegistry} from './execution-contract.mjs';
import {taskContext} from './execution-context.mjs';
import {describeWorkflow, normalizeInput} from './workflow-catalog.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const registryPath = 'config/engineering-execution.json';
const probeOptions = {cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024,
  stdio: ['ignore', 'pipe', 'pipe']};
const usage = () => { throw new Error('INVALID_EXECUTION_USAGE'); };

function verifyRegistry(registry) {
  const facts = validateRegistry(registry, (id, input) => {
    try {
      normalizeInput(describeWorkflow(id).inputSchema, input);
      return true;
    } catch {
      return false;
    }
  });
  const authorityPaths = ['AGENTS.md', registry.contract, ...registry.scopedRules,
    ...Object.values(registry.skills), ...Object.values(registry.routes).flatMap(route => route.references)];
  for (const path of new Set(authorityPaths)) {
    const stat = lstatSync(join(root, path));
    if (!stat.isFile() && !stat.isDirectory()) throw new Error('INVALID_EXECUTION_AUTHORITY');
  }
  const actualRules = execFileSync('git', ['ls-files', '-z', '--', ':(glob)**/AGENTS.md',
    ':(exclude)AGENTS.md'], probeOptions).split('\0').filter(Boolean).sort();
  if (JSON.stringify(actualRules) !== JSON.stringify([...registry.scopedRules].sort())) {
    throw new Error('EXECUTION_RULES_OUT_OF_SYNC');
  }
  return {status: 'PASS', ...facts};
}

function toolsPresent() {
  return Object.fromEntries(['git', 'pnpm', 'python3'].map(tool => [tool,
    spawnSync(tool, ['--version'], probeOptions).status === 0 ? 'PROBED' : 'UNAVAILABLE']));
}

function run(registry) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'search') {
    const {values, positionals} = parseArgs({args, allowPositionals: true,
      options: {path: {type: 'string', multiple: true}}});
    if (positionals.length > 1) usage();
    return discoverRoutes(registry, positionals[0] ?? '', values.path ?? []);
  }
  if (command === 'describe' && args.length === 1) {
    return {version: registry.version, contract: registry.contract, ...describeRoute(registry, args[0])};
  }
  if (command === 'context') {
    const {values, positionals} = parseArgs({args, allowPositionals: true,
      options: {path: {type: 'string', multiple: true}}});
    if (positionals.length !== 1) usage();
    return taskContext(root, registry, positionals[0], values.path ?? []);
  }
  if (command === 'capabilities') {
    const {values} = parseArgs({args, options: {
      'allow-delegation': {type: 'boolean'}, 'native-parallel': {type: 'boolean'},
      'bounded-parallel': {type: 'boolean'}, 'isolated-writes': {type: 'boolean'},
    }});
    const attested = {
      allowDelegation: values['allow-delegation'] ?? false, nativeParallel: values['native-parallel'] ?? false,
      boundedParallel: values['bounded-parallel'] ?? false, isolatedWrites: values['isolated-writes'] ?? false,
    };
    return {version: registry.version, mode: executionMode(attested), attested, tools: {node: 'PROBED', ...toolsPresent()},
      untested: ['provider-model-access', 'native-delegation', 'sandbox-isolation', 'licensed-editor', 'external-connectors']};
  }
  if (command === 'list' && args.length === 0) {
    return {version: registry.version, contract: registry.contract, skills: registry.skills,
      routes: Object.entries(registry.routes).map(([id, {summary}]) => ({id, summary}))};
  }
  if (command === 'check' && args.length === 0) return verifyRegistry(registry);
  return usage();
}

try {
  const registry = JSON.parse(readFileSync(join(root, registryPath), 'utf8'));
  process.stdout.write(JSON.stringify(run(registry)) + '\n');
} catch (error) {
  const known = /^(?:INVALID_EXECUTION_[A-Z_]+|UNKNOWN_EXECUTION_ROUTE|EXECUTION_RULES_OUT_OF_SYNC)$/;
  process.stdout.write(JSON.stringify({status: 'FAIL',
    code: known.test(error.message) ? error.message : 'EXECUTION_COMMAND_FAILED'}) + '\n');
  process.exitCode = 1;
}
