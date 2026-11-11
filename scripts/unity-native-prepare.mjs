import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

// Generated bindings remain canonical in contracts/. Never resolve arbitrary/latest packages.
const root = resolve('apps/unity-client/Assets/VirtualLife/Features/Native');
const packages = [
  {id: 'google.protobuf', version: '3.36.2', hash: '1182590db175f9057707857a1df48b217226d0732716cd353fa4aa4683d38dcb', file: 'lib/netstandard2.0/Google.Protobuf.dll'},
  {id: 'system.runtime.compilerservices.unsafe', version: '4.5.2', hash: 'f1e5175c658ed8b2fbb804cc6727b6882a503844e7da309c8d4846e9ca11e4ef', file: 'lib/netstandard2.0/System.Runtime.CompilerServices.Unsafe.dll'},
];
await mkdir(resolve(root, 'Generated'), {recursive: true});
await mkdir(resolve(root, 'Plugins'), {recursive: true});
const cache = resolve('artifacts/unity-packages'); await mkdir(cache, {recursive: true});
const guid = name => createHash('sha256').update('virtuallife-native/' + name).digest('hex').slice(0, 32);
for (const item of packages) {
  const name = `${item.id}.${item.version}.nupkg`, path = resolve(cache, name);
  let bytes;
  try { bytes = await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!bytes) {
    const response = await fetch(`https://api.nuget.org/v3-flatcontainer/${item.id}/${item.version}/${name}`, {signal: globalThis.AbortSignal.timeout(60000)});
    if (!response.ok) throw Error('Pinned NuGet download failed');
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== item.hash) throw Error('Pinned NuGet checksum mismatch');
  await writeFile(path, bytes);
  const library = spawnSync('unzip', ['-p', path, item.file], {maxBuffer: 16 * 1024 * 1024});
  if (library.status !== 0 || !library.stdout.length) throw Error('unzip failed for pinned managed library');
  const file = resolve(root, 'Plugins', item.file.split('/').at(-1));
  await writeFile(file, library.stdout);
  await writeFile(file + '.meta', `fileFormatVersion: 2\nguid: ${guid(item.file)}\nPluginImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  isPreloaded: 0\n  isOverridable: 0\n  isExplicitlyReferenced: 1\n  validateReferences: 1\n  platformData:\n  - first:\n      Any: \n    second:\n      enabled: 1\n      settings: {}\n`);
  // Retain upstream notices beside the fetched binary in the ignored staging folder.
  const notice = spawnSync('unzip', ['-p', path, item.id === 'google.protobuf' ? 'Google.Protobuf.nuspec' : 'System.Runtime.CompilerServices.Unsafe.nuspec']);
  if (notice.status !== 0) throw Error('Missing dependency notice');
  await writeFile(file + '.license.xml', notice.stdout);
}
await writeFile(resolve(root, 'Generated/Public.cs'), await readFile('contracts/generated/csharp/Public.cs'));
await writeFile(resolve(root, 'Generated/Public.cs.meta'), `fileFormatVersion: 2\nguid: ${guid('Public.cs')}\n`);
console.log('Staged generated C# and checksum-pinned protobuf runtime. Unity import remains required.');
