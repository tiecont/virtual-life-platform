import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, realpath, rm, symlink} from 'node:fs/promises';
import {basename, dirname, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validName = name => /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(name);
export async function packageApiRuntime(sourceRoot, destination) {
  sourceRoot = await realpath(sourceRoot); destination = resolve(destination);
  assert(!destination.startsWith(sourceRoot + sep) && destination !== sourceRoot, 'Output cannot overwrite source');
  const sourcePackages = new Set();
  for (const folder of ['apps', 'packages']) for (const entry of await readdir(resolve(sourceRoot, folder), {withFileTypes: true})) {
    if (entry.isDirectory()) sourcePackages.add(await realpath(resolve(sourceRoot, folder, entry.name)));
  }
  const api = resolve(sourceRoot, 'apps/platform-api');
  assert.equal(JSON.parse(await readFile(resolve(api, 'package.json'))).name, '@virtual-city/platform-api');
  await mkdir(destination); // New output only; never replace an existing artifact.
  const packages = new Map(), records = [];
  async function removeTests(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) await removeTests(file);
      else if (/\.(?:test|spec)\.(?:js|mjs|cjs|d\.ts)(?:\.map)?$/.test(entry.name)) await rm(file);
    }
  }
  async function binding(source, name, optional) {
    assert(validName(name), 'Invalid runtime dependency name');
    const candidates = [resolve(source, 'node_modules', name)];
    let parent = dirname(source);
    if (basename(parent).startsWith('@')) parent = dirname(parent);
    if (basename(parent) === 'node_modules') candidates.push(resolve(parent, name));
    for (const candidate of candidates) {
      try {
        const actual = await realpath(candidate);
        assert(actual.startsWith(sourceRoot + sep), 'Installed dependency escapes frozen source');
        return actual;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    assert(optional, 'Missing production dependency binding: ' + name);
  }
  async function copy(source, target) {
    source = await realpath(source);
    assert(source.startsWith(sourceRoot + sep), 'Runtime package escapes frozen source');
    if (packages.has(source)) return packages.get(source);
    const manifest = JSON.parse(await readFile(resolve(source, 'package.json')));
    assert(validName(manifest.name) && typeof manifest.version === 'string');
    target ??= resolve(destination, 'node_modules/.runtime', hash(relative(sourceRoot, source)).slice(0, 24), 'node_modules', manifest.name);
    packages.set(source, target);
    await mkdir(target, {recursive: true});
    const firstParty = sourcePackages.has(source);
    if (firstParty) {
      await cp(resolve(source, 'package.json'), resolve(target, 'package.json'));
      await cp(resolve(source, 'dist'), resolve(target, 'dist'), {recursive: true});
      await removeTests(resolve(target, 'dist'));
    } else {
      assert(!manifest.name.startsWith('@virtual-city/'), 'Unrecognized first-party package');
      await cp(source, target, {recursive: true, filter: file => file !== resolve(source, 'node_modules')});
    }
    const dependencies = new Map(Object.keys(manifest.dependencies ?? {}).map(name => [name, false]));
    for (const name of Object.keys(manifest.optionalDependencies ?? {})) dependencies.set(name, true);
    for (const name of Object.keys(manifest.peerDependencies ?? {})) if (!dependencies.has(name)) dependencies.set(name, manifest.peerDependenciesMeta?.[name]?.optional === true);
    const linked = [];
    for (const [name, optional] of dependencies) {
      const actual = await binding(source, name, optional);
      if (!actual) continue;
      const dependency = await copy(actual), link = resolve(target, 'node_modules', name);
      await mkdir(dirname(link), {recursive: true});
      await symlink(relative(dirname(link), dependency), link);
      linked.push(name);
    }
    records.push({name: manifest.name, version: manifest.version, firstParty, source: relative(sourceRoot, source), dependencies: linked.sort()});
    return target;
  }
  await copy(api, destination);
  records.sort((a, b) => a.source < b.source ? -1 : 1);
  return {packages: records, sourceLockSha256: hash(await readFile(resolve(sourceRoot, 'pnpm-lock.yaml'))), closureSha256: hash(JSON.stringify(records)),
    scope: 'Declared production/optional dependencies and locally bound peers from the frozen installation; no resolver, download or global hoist fallback'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3); assert.equal(process.argv[2], '/runtime-api');
  console.log(JSON.stringify(await packageApiRuntime('/app', '/runtime-api')));
}
