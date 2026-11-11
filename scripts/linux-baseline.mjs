import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import {taskStatus, readTaskPlan} from './task-plan.mjs';

const probesOnly = process.argv.slice(2).join(' ') === '--probes-only';
if (process.argv.length > 2 && !probesOnly) throw Error('Use --probes-only or no arguments');
const directory = resolve('artifacts/linux-baseline', new Date().toISOString().replaceAll(/[:.]/g, '-'));
await mkdir(directory, {recursive: true, mode: 0o700});
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  sourceRevision: '',
  environment: {},
  readyTasks: (taskStatus(await readTaskPlan())).ready,
  commands: [],
};

async function capture(command, args) {
  return new Promise(resolveResult => {
    const process = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    process.stdout.on('data', bytes => {output += bytes;});
    process.stderr.on('data', bytes => {output += bytes;});
    process.once('error', () => resolveResult({exitCode: 127, output: 'Executable unavailable'}));
    process.once('close', code => resolveResult({exitCode: code ?? 1, output: output.trim()}));
  });
}
function classify(code, output) {
  if (code === 0) return 'PASS';
  if (code === 127) return 'MISSING_OPTIONAL_LOCAL_TOOLING';
  if (/Operation not permitted|Permission denied|unable to open database file/i.test(output)) return 'EXECUTION_PERMISSION_BLOCKER';
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|Cannot connect to the Docker daemon|Test harness failed during database-start/i.test(output)) return 'ENVIRONMENT_BLOCKER';
  if (/unsupported.*(node|platform)|GLIBC_|could not find.*(openssl|linker)/i.test(output)) return 'LINUX_TOOLCHAIN_COMPATIBILITY';
  return 'UNCLASSIFIED_FAILURE';
}
async function run(command, args, name) {
  const started = Date.now(), path = resolve(directory, name + '.log'), log = createWriteStream(path, {mode: 0o600});
  const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
  child.stdout.pipe(log, {end: false});
  child.stderr.pipe(log, {end: false});
  const code = await new Promise(resolveCode => {
    child.once('error', () => resolveCode(127));
    child.once('close', exitCode => resolveCode(exitCode ?? 1));
  });
  await new Promise(ok => log.end(ok));
  const classification = classify(code, await readFile(path, 'utf8'));
  report.commands.push({command: [command, ...args].join(' '), exitCode: code, classification, log: path, durationMs: Date.now() - started});
  await save();
  console.log(JSON.stringify({name, exitCode: code, classification}));
}
async function save() {
  await writeFile(resolve(directory, 'baseline.json'), JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
}

report.sourceRevision = (await capture('git', ['rev-parse', 'HEAD'])).output;
report.environment = {
  gitStatus: await capture('git', ['status', '--porcelain']),
  os: await readFile('/etc/os-release', 'utf8'),
  kernel: await capture('uname', ['-srm']),
};
for (const [name, command, args] of [
  ['node', 'node', ['--version']],
  ['pnpm', 'pnpm', ['--version']],
  ['rust', 'rustc', ['--version']],
  ['cargo', 'cargo', ['--version']],
  ['postgres', 'psql', ['--version']],
  ['postgresReady', 'pg_isready', []],
  ['docker', 'docker', ['info', '--format', '{{.ServerVersion}}']],
  ['graphics', 'lspci', ['-k']],
  ['vulkan', 'vulkaninfo', ['--summary']],
  ['opengl', 'glxinfo', ['-B']],
  ['unity', 'sh', ['-c', 'command -v Unity unity unityhub']],
]) report.environment[name] = await capture(command, args);
await save();
if (!probesOnly) {
  for (const [command, args, name] of [
    ['pnpm', ['install', '--frozen-lockfile'], 'install'],
    ['pnpm', ['check'], 'check'],
    ['cargo', ['fmt', '--all', '--', '--check'], 'rust-fmt'],
    ['cargo', ['test', '--workspace', '--locked'], 'rust-test'],
    ['cargo', ['clippy', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings'], 'rust-clippy'],
  ]) await run(command, args, name);
}
report.completedAt = new Date().toISOString();
report.finalSourceRevision = (await capture('git', ['rev-parse', 'HEAD'])).output;
report.finalGitStatus = await capture('git', ['status', '--porcelain']);
report.sourceStable = report.sourceRevision === report.finalSourceRevision &&
  report.environment.gitStatus.output === '' && report.finalGitStatus.output === '';
await save();
console.log(JSON.stringify({report: resolve(directory, 'baseline.json'), sourceStable: report.sourceStable}));
process.exitCode = report.commands.some(command => command.exitCode !== 0) ? 1 : 0;
