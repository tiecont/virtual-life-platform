import {spawn, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {copyFile, cp, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {icarusActions, validateIcarusImport} from './icarus-import-contract.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--model' || !/\.fbx$/i.test(args[1]))
  throw Error('Usage: UNITY_EDITOR=/absolute/path/Unity node scripts/art/icarus-unity-audit.mjs --model /path/to/candidate.fbx');
const model = resolve(args[1]);
if (!(await stat(model)).isFile()) throw Error('Candidate must be a regular FBX file');
const modelBytes = await readFile(model);
const output = resolve(repository, 'artifacts/character-production/icarus-unity-audit', new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
await mkdir(output, {recursive: true});
const report = {sourceRevision: spawnSync('git', ['rev-parse', 'HEAD'], {cwd: repository, encoding: 'utf8'}).stdout.trim(),
  sourceDirty: Boolean(spawnSync('git', ['status', '--porcelain'], {cwd: repository, encoding: 'utf8'}).stdout.trim()),
  model, modelSha256: createHash('sha256').update(modelBytes).digest('hex'),
  classification: 'MISSING_OPTIONAL_LOCAL_TOOLING', productionReady: false, runtimeEnabled: false};
try {
  if (!process.env.UNITY_EDITOR) {
    report.reason = 'Set UNITY_EDITOR to the installed, licensed pinned Editor';
    process.exitCode = 2;
  } else {
    const project = resolve(output, 'project');
    await mkdir(resolve(project, 'Assets/Editor'), {recursive: true});
    await mkdir(resolve(project, 'Assets/IcarusCandidate'), {recursive: true});
    await cp(resolve(repository, 'apps/unity-client/Packages'), resolve(project, 'Packages'), {recursive: true});
    await mkdir(resolve(project, 'ProjectSettings'), {recursive: true});
    await copyFile(resolve(repository, 'apps/unity-client/ProjectSettings/ProjectVersion.txt'), resolve(project, 'ProjectSettings/ProjectVersion.txt'));
    await copyFile(resolve(repository, 'scripts/art/unity/IcarusImportAudit.cs'), resolve(project, 'Assets/Editor/IcarusImportAudit.cs'));
    await writeFile(resolve(project, 'Assets/IcarusCandidate', basename(model)), modelBytes);
    // Preserve an existing import identity in the isolated copy, never edit the source importer.
    try { await copyFile(model + '.meta', resolve(project, 'Assets/IcarusCandidate', basename(model) + '.meta')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const actions = await icarusActions();
    const factsPath = resolve(output, 'import-facts.json');
    const log = resolve(output, 'Unity.log');
    const command = [process.env.UNITY_EDITOR, '-batchmode', '-nographics', '-projectPath', project, '-logFile', log, '-executeMethod', 'Aetheria.ArtValidation.IcarusImportAudit.Run', '-quit'];
    report.command = command;
    report.exitCode = await new Promise((ok, reject) => {
      const child = spawn(command[0], command.slice(1), {cwd: dirname(project), stdio: 'ignore', env: {...process.env,
        VL_ICARUS_AUDIT_MODEL: 'Assets/IcarusCandidate/' + basename(model), VL_ICARUS_AUDIT_ACTIONS: JSON.stringify({actions}), VL_ICARUS_AUDIT_OUTPUT: factsPath}});
      child.once('error', reject);
      child.once('close', code => ok(code ?? 1));
    });
    if (report.exitCode !== 0) throw Error('Unity failed; inspect ' + log);
    report.importSettingsSha256 = createHash('sha256').update(await readFile(resolve(project, 'Assets/IcarusCandidate', basename(model) + '.meta'))).digest('hex');
    const facts = JSON.parse(await readFile(factsPath, 'utf8'));
    report.validation = validateIcarusImport(facts, actions);
    report.classification = report.validation.status;
    if (report.validation.failures.length) process.exitCode = 1;
  }
} catch (error) {
  report.classification = 'IMPORT_AUDIT_FAILED';
  report.reason = error.message;
  process.exitCode = 1;
}
await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({report: resolve(output, 'result.json'), ...report}, null, 2));
