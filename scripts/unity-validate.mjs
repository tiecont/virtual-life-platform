import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const action = process.argv[2] ?? 'tests';
if (!['prepare', 'tests', 'linux', 'windows-mono'].includes(action) || process.argv.length > 3) throw Error('Unknown Unity validation action');
const project = resolve('apps/unity-client');
const directory = resolve('artifacts/unity', new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
await mkdir(directory, {recursive: true});
const report = {action, sourceRevision: spawnSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout.trim(), platform: process.platform, editorVersion: '6000.3.14f1', commands: [], classification: 'MISSING_OPTIONAL_LOCAL_TOOLING'};
const file = resolve(directory, 'result.json');
async function save() {
  await writeFile(file, JSON.stringify(report, null, 2) + '\n');
}
async function run(args, name) {
  const command = [process.env.UNITY_EDITOR, '-batchmode', '-nographics', '-projectPath', project, '-logFile', resolve(directory, name + '.log'), ...args];
  const code = await new Promise(ok => {
    const child = spawn(command[0], command.slice(1), {stdio: 'ignore'});
    child.once('error', () => ok(127));
    child.once('close', exitCode => ok(exitCode ?? 1));
  });
  report.commands.push({command, exitCode: code});
  await save();
  if (code !== 0) throw Error('Unity batch command failed. See artifact log.');
}
try {
  if (!process.env.UNITY_EDITOR) {
    report.reason = 'Set UNITY_EDITOR to an installed, licensed Linux Editor executable.';
    process.exitCode = 2;
  } else {
    const prepared = spawnSync(process.execPath, ['scripts/unity-native-prepare.mjs'], {stdio: 'inherit'});
    report.commands.push({command: ['node', 'scripts/unity-native-prepare.mjs'], exitCode: prepared.status ?? 1});
    if (prepared.status !== 0) throw Error('Native binding preparation failed');
    report.classification = 'UNVERIFIED';
    await run(['-executeMethod', 'VirtualLife.Editor.ProjectBuild.Prepare', '-quit'], 'prepare');
    if (action === 'tests') {
      for (const mode of ['EditMode', 'PlayMode']) {
        const results = resolve(directory, mode + '.xml');
        await run(['-runTests', '-testPlatform', mode, '-testResults', results], mode);
        const xml = await readFile(results, 'utf8');
        if (!/<test-run\b[^>]*result="Passed"/.test(xml) || !/\bpassed="[1-9]\d*"/.test(xml))
          throw Error('Unity test results contain no passing test run');
      }
    } else if (action !== 'prepare') {
      const method = action === 'linux' ? 'Linux' : 'WindowsMono';
      await run(['-executeMethod', 'VirtualLife.Editor.ProjectBuild.' + method, '-quit'], action);
    }
    report.classification = 'PASS';
  }
} catch (error) {
  report.classification = 'UNCLASSIFIED_FAILURE';
  report.reason = error.message;
  process.exitCode = 1;
}
await save();
console.log(JSON.stringify({report: file, classification: report.classification}));
