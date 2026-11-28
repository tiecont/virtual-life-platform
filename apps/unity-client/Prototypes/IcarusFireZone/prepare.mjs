import {cp, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const source = fileURLToPath(new URL('./', import.meta.url));
const client = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('../../../../artifacts/icarus-prototype/', import.meta.url));
await mkdir(output, {recursive: true});
const project = await mkdtemp(resolve(output, 'project-'));
await cp(resolve(source, 'Assets'), resolve(project, 'Assets'), {recursive: true});

// Stage only review art and the pinned URP assets. Asset paths and GUIDs survive the copy.
for (const entry of [
  'Assets/Aetheria.meta', 'Assets/Aetheria/ArtStudies.meta',
  'Assets/Aetheria/ArtStudies/Icarus.meta', 'Assets/Aetheria/ArtStudies/Icarus',
  'Assets/Aetheria/Settings.meta', 'Assets/Aetheria/Settings',
  'ProjectSettings/ProjectVersion.txt', 'ProjectSettings/GraphicsSettings.asset',
]) {
  const destination = resolve(project, entry);
  await mkdir(dirname(destination), {recursive: true});
  await cp(resolve(client, entry), destination, {recursive: true, force: false, errorOnExist: true});
}
const manifest = JSON.parse(await readFile(resolve(client, 'Packages/manifest.json'), 'utf8'));
const lock = JSON.parse(await readFile(resolve(client, 'Packages/packages-lock.json'), 'utf8'));
for (const module of ['com.unity.modules.particlesystem', 'com.unity.modules.animation']) {
  manifest.dependencies[module] = '1.0.0';
  lock.dependencies[module] = {version: '1.0.0', depth: 0, source: 'builtin', dependencies: {}};
}
await mkdir(resolve(project, 'Packages'));
await writeFile(resolve(project, 'Packages/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(project, 'Packages/packages-lock.json'), JSON.stringify(lock, null, 2) + '\n');
console.log(relative(process.cwd(), project));
