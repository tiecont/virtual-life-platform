import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const action = process.argv[2] ?? 'tests';
if (!['prepare', 'tests', 'linux', 'linux-player-tests', 'windows-mono', 'world'].includes(action) || process.argv.length > 3) throw Error('Unknown Unity validation action');
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
  const log = await readFile(resolve(directory, name + '.log'), 'utf8');
  if (/^Unable to parse file (?:ProjectSettings|Assets)\//m.test(log))
    throw Error('Unity project asset parsing failed. See artifact log.');
}

async function runPlayer(executable, args, timeoutMs) {
  return await new Promise(ok => {
    const child = spawn(executable, args, {stdio: 'ignore'});
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('error', () => { clearTimeout(timer); ok(127); });
    child.once('close', exitCode => { clearTimeout(timer); ok(exitCode ?? 1); });
  });
}

// Renders the committed hub and two arena scenes from a real Linux development
// player, walks the actual portal/return flow and verifies the captured PNGs.
async function runWorldEvidence() {
  if (process.platform !== 'linux') throw Error('World render evidence requires a Linux workstation');
  await run(['-executeMethod', 'Aetheria.Editor.ProjectBuild.Linux', '-quit'], 'Linux');
  // Unity's process working directory is the project path, so ProjectBuild.Linux
  // writes the player under apps/unity-client, not the repository root.
  const player = resolve('apps/unity-client/Builds/Linux/Aetheria');
  const renders = resolve(directory, 'world-renders');
  const playerLog = resolve(directory, 'WorldPlayer.log');
  const playerArgs = ['-aetheria-world-capture', renders, '-screen-width', '1280', '-screen-height', '720',
    '-screen-fullscreen', '0', '-logFile', playerLog];
  const code = await runPlayer(player, playerArgs, 240000);
  report.commands.push({command: [player, ...playerArgs], exitCode: code});
  await save();
  if (code !== 0) throw Error('World evidence player failed. See WorldPlayer.log.');
  const facts = JSON.parse(await readFile(resolve(renders, 'facts.json'), 'utf8'));
  if (facts.status !== 'ok') throw Error('World evidence capture reported failure: ' + facts.error);
  if (!facts.graphicsDeviceType || /Null/i.test(facts.graphicsDeviceType))
    throw Error('World evidence ran without a graphics device.');
  const expected = ['01-central-plaza-spawn.png', '02-central-plaza-fire-portal.png',
    '03-cinder-terraces-arena.png', '04-central-plaza-return.png', '05-tideglass-lagoon-arena.png'];
  const byFile = new Map((facts.captures ?? []).map(capture => [capture.file, capture]));
  for (const name of expected) {
    const capture = byFile.get(name);
    if (!capture) throw Error('Missing rendered world capture: ' + name);
    const bytes = await readFile(resolve(renders, name));
    if (bytes.length < 15000) throw Error('Rendered evidence is too small: ' + name);
    if (bytes[0] !== 0x89 || bytes.toString('ascii', 1, 4) !== 'PNG') throw Error('Rendered evidence is not a PNG: ' + name);
    if (bytes.readUInt32BE(16) !== 1280 || bytes.readUInt32BE(20) !== 720)
      throw Error('Rendered evidence has unexpected dimensions: ' + name);
    if (!capture.scene || capture.rendererCount < 50) throw Error('Rendered scene is empty: ' + name);
  }
  const scenes = new Set((facts.captures ?? []).map(capture => capture.scene));
  for (const scene of ['CentralPlaza', 'CinderTerraces', 'TideglassLagoon'])
    if (!scenes.has(scene)) throw Error('World evidence did not load ' + scene);
  const boards = (facts.captures ?? []).filter(capture => capture.boardTileCount === 64);
  if (boards.length < 2) throw Error('Both 8x8 arena boards must be rendered with 64 visible tiles.');
  const transitions = facts.transitions ?? '';
  for (const transition of ['CentralPlaza -> CinderTerraces', 'CinderTerraces -> CentralPlaza',
    'CentralPlaza -> TideglassLagoon'])
    if (!transitions.includes(transition)) throw Error('World evidence missed transition: ' + transition);
  report.worldEvidence = {
    graphicsDeviceType: facts.graphicsDeviceType,
    graphicsDeviceName: facts.graphicsDeviceName,
    unityVersion: facts.unityVersion,
    screenshots: expected,
    scenes: [...scenes],
    transitions,
  };
  await save();
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
    await run(['-executeMethod', 'Aetheria.Editor.ProjectBuild.Prepare', '-quit'], 'prepare');
    if (action === 'tests') {
      for (const mode of ['EditMode', 'PlayMode']) {
        const results = resolve(directory, mode + '.xml');
        // The external-process fixture has its own licensed Linux player runner.
        // Ordinary Editor tests must all pass without counting an ignored fixture.
        await run(['-runTests', '-testPlatform', mode, '-testCategory', '!NativePlayerFixture', '-testResults', results], mode);
        const xml = await readFile(results, 'utf8');
        if (!/<test-run\b[^>]*result="Passed"/.test(xml) || !/\bpassed="[1-9]\d*"/.test(xml))
          throw Error('Unity test results contain no passing test run');
      }
    } else if (action === 'linux-player-tests') {
      if (process.platform !== 'linux') throw Error('Linux player tests require a Linux workstation');
      const results = resolve(directory, 'LinuxPlayer.xml');
      await run(['-runTests', '-testPlatform', 'StandaloneLinux64', '-testFilter', 'Aetheria.Blockout.Tests.BlockoutTests',
        '-buildPlayerPath', resolve(directory, 'Player'), '-testResults', results, '-playerHeartbeatTimeout', '120'], 'LinuxPlayer');
      const xml = await readFile(results, 'utf8');
      if (!/<test-run\b[^>]*result="Passed"/.test(xml) || !/\bpassed="2"/.test(xml) || !/\bskipped="0"/.test(xml))
        throw Error('Both actual Linux player blockout tests must pass without skips');
    } else if (action === 'world') {
      await runWorldEvidence();
    } else if (action !== 'prepare') {
      const method = action === 'linux' ? 'Linux' : 'WindowsMono';
      await run(['-executeMethod', 'Aetheria.Editor.ProjectBuild.' + method, '-quit'], action);
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
