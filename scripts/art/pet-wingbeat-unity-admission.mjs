import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const qualificationRevision = '634f445903a8c17da69414b2f4c078c2c7a44d19';
const inputs = [
  {
    id: 'dragon-fire-ignivar',
    sourceSha256: '068de744f73bedf0d86d31e39011ae808402500663cfa2692370533d9b0a54cb',
    wingbeatSha256: 'f2228c2d0fe833c36d6d562deef1f9ff4f32db2781c5088b5c867aedd65e007a',
    partCount: 38, triangles: 11016, torsoPart: 5,
    wingParts: [0, 9, ...Array.from({length: 26}, (_, index) => 10 + index)],
  },
  {
    id: 'bird-fire-cinderquill',
    sourceSha256: '105a55a239a046e49fd7183e8e95cb95502958cd1971dfb123b29a3793a27292',
    wingbeatSha256: '8355c15eadd00501f2822ae8bc6cffa9d64553d377e8beb5fa495509568ad220',
    partCount: 25, triangles: 8386, torsoPart: 0, wingParts: [3, 5, 20, 21, 22, 23, 24],
  },
];

const [privateWorkspace] = process.argv.slice(2);
const editor = process.env.UNITY_EDITOR;
if (process.argv.length !== 3 || !isAbsolute(privateWorkspace) || !isAbsolute(editor ?? '')) {
  throw Error('Usage: UNITY_EDITOR=/absolute/path/to/Unity node scripts/art/pet-wingbeat-unity-admission.mjs /absolute/path/to/private-workspace/mvp-wave1');
}
const git = args => execFileSync('git', args, {cwd: repository, encoding: 'utf8'}).trim();
const report = {
  classification: 'PRIVATE_UNITY_WINGBEAT_FAILED', qualificationRevision,
  sourceRevision: git(['rev-parse', 'HEAD']), sourceDirty: Boolean(git(['status', '--porcelain'])),
  productionReady: false, ownerReview: 'PENDING', inputs,
};
const outputRoot = join(repository, 'artifacts', 'pet-wingbeat-unity-admission');
await mkdir(outputRoot, {recursive: true});
const output = await mkdtemp(join(outputRoot, 'review-'));
const project = join(output, 'project');
const unitySource = join(repository, 'apps', 'unity-client');
const factsPath = join(output, 'unity-facts.json');

try {
  const staged = [];
  for (const input of inputs) {
    for (const [tree, name, expected] of [
      ['segmented-uv-132a40c9', input.id + '-segmented-uv.glb', input.sourceSha256],
      ['wingbeat-qa-522058f7', input.id + '.glb', input.wingbeatSha256],
    ]) {
      const bytes = await readFile(join(privateWorkspace, tree, input.id, name));
      if (createHash('sha256').update(bytes).digest('hex') !== expected)
        throw Error(input.id + ': unexpected hash for ' + name);
      staged.push({name, bytes});
    }
  }

  await mkdir(join(project, 'Assets', 'Editor'), {recursive: true});
  await writeFile(join(project, 'Assets', 'Editor', 'PetWingbeatAdmission.asmdef'), JSON.stringify({
    name: 'Aetheria.PetWingbeatAdmission.Editor', includePlatforms: ['Editor'], references: ['UniGLTF.Editor', 'UniGLTF'],
  }));
  await mkdir(join(project, 'Assets', 'Candidates'));
  await mkdir(join(project, 'ProjectSettings'));
  await cp(join(unitySource, 'Packages'), join(project, 'Packages'), {recursive: true});
  await copyFile(join(unitySource, 'ProjectSettings', 'ProjectVersion.txt'), join(project, 'ProjectSettings', 'ProjectVersion.txt'));
  await copyFile(join(repository, 'scripts', 'art', 'unity', 'PetWingbeatAdmission.cs'), join(project, 'Assets', 'Editor', 'PetWingbeatAdmission.cs'));
  for (const {name, bytes} of staged) await writeFile(join(project, 'Assets', 'Candidates', name), bytes);
  const specsPath = join(output, 'inputs.json');
  await writeFile(specsPath, JSON.stringify({inputs}));

  report.command = [editor, '-batchmode', '-nographics', '-projectPath', project, '-logFile', join(output, 'Unity.log'),
    '-executeMethod', 'Aetheria.ArtValidation.PetWingbeatAdmission.Run', '-quit'];
  const env = {...process.env, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/dev/null',
    AETHERIA_PET_WINGBEAT_INPUTS: specsPath, AETHERIA_PET_WINGBEAT_FACTS: factsPath};
  delete env.DISPLAY;
  delete env.WAYLAND_DISPLAY;
  report.exitCode = await new Promise((accept, reject) => {
    const child = spawn(editor, report.command.slice(1), {cwd: output, env, stdio: 'ignore'});
    child.once('error', reject);
    child.once('close', code => accept(code ?? 1));
  });
  if (report.exitCode !== 0) throw Error('Unity failed. Inspect ' + join(output, 'Unity.log'));
  const facts = JSON.parse(await readFile(factsPath, 'utf8'));
  if (facts.models?.length !== inputs.length || !facts.models.every((model, index) =>
    model.id === inputs[index].id && model.framesMeasured === 49))
    throw Error('Unity omitted required model or frame evidence');
  report.unityFacts = factsPath;
  report.motionQualified = true;
  if (!facts.models.every(model => model.expectedMaterialOnAllParts))
    throw Error('Motion measured. Imported material failed the URP/Lit fallback check. See unity-facts.json.');
  report.classification = 'PRIVATE_UNITY_WINGBEAT_PASS';
} catch (error) {
  report.reason = error.message;
  process.exitCode = 1;
} finally {
  // The retained logs contain the measurements. Discard the temporary imported GLBs and Unity project.
  await rm(project, {recursive: true, force: true});
  const path = join(output, 'result.json');
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({report: path, classification: report.classification}));
}
