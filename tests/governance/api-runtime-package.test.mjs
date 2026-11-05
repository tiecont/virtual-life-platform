import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {createRequire} from 'node:module';
import {packageApiRuntime} from '../../scripts/package-api-runtime.mjs';

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'vlp-package-')), source = resolve(root, 'source'), api = resolve(source, 'apps/platform-api');
  async function file(path, text) {await mkdir(dirname(path), {recursive: true}); await writeFile(path, text);}
  async function pkg(path, name, dependencies = {}, extra = {}) {await file(resolve(path, 'package.json'), JSON.stringify({name, version: '1.0.0', main: 'index.js', dependencies, ...extra}));}
  await mkdir(resolve(source, 'packages'), {recursive: true});
  await file(resolve(source, 'pnpm-lock.yaml'), 'synthetic frozen fixture lock\n');
  await pkg(api, '@virtual-city/platform-api', {prod: '1.0.0'}, {main: 'dist/main.js'});
  await file(resolve(api, 'dist/main.js'), 'module.exports=require("prod");');
  await file(resolve(api, 'dist/private.unit.test.js'), 'throw Error("test output must not ship");');
  await file(resolve(api, 'src/private.ts'), 'synthetic source only');
  const prod = resolve(source, 'node_modules/.pnpm/prod@1/node_modules/prod'), leaf = resolve(source, 'node_modules/.pnpm/leaf@1/node_modules/leaf');
  await pkg(prod, 'prod', {leaf: '1.0.0'}, {peerDependencies: {unused: '*'}, peerDependenciesMeta: {unused: {optional: true}}});
  await file(resolve(prod, 'index.js'), 'module.exports={leaf:require("leaf"),vendor:require("./dist/runtime.test.js")};');
  await file(resolve(prod, 'dist/runtime.test.js'), 'module.exports="required vendor file";');
  await pkg(leaf, 'leaf'); await file(resolve(leaf, 'index.js'), 'module.exports="frozen bound leaf";');
  await symlink(leaf, resolve(dirname(prod), 'leaf'));
  await mkdir(resolve(api, 'node_modules')); await symlink(prod, resolve(api, 'node_modules/prod'));
  await pkg(resolve(source, 'node_modules/unused'), 'unused');
  await pkg(resolve(source, 'node_modules/vitest'), 'vitest');
  return {root, source, api, prod, file};
}

test('packaged runtime uses frozen local bindings, excludes global dev/optional peers and own source/tests, preserving vendor files', async () => {
  const f = await fixture();
  try {
    const output = resolve(f.root, 'runtime'), summary = await packageApiRuntime(f.source, output);
    assert.deepEqual(summary.packages.map(pkg => pkg.name).sort(), ['@virtual-city/platform-api', 'leaf', 'prod']);
    assert.deepEqual(createRequire(resolve(output, 'package.json'))('./dist/main.js'), {leaf: 'frozen bound leaf', vendor: 'required vendor file'});
    for (const path of ['src/private.ts', 'dist/private.unit.test.js']) await assert.rejects(readFile(resolve(output, path)), error => error.code === 'ENOENT');
    await assert.rejects(packageApiRuntime(f.source, output), error => error.code === 'EEXIST');
    assert.equal(await readFile(resolve(f.source, 'pnpm-lock.yaml'), 'utf8'), 'synthetic frozen fixture lock\n');
  } finally {await rm(f.root, {recursive: true, force: true});}
});

test('packaging refuses an escaping dependency and a missing required binding instead of using global hoists', async () => {
  for (const escape of [true, false]) {
    const f = await fixture();
    try {
      await rm(resolve(f.api, 'node_modules/prod'));
      if (escape) {const external = resolve(f.root, 'external'); await f.file(resolve(external, 'package.json'), '{"name":"prod","version":"1.0.0"}'); await symlink(external, resolve(f.api, 'node_modules/prod'));}
      await assert.rejects(packageApiRuntime(f.source, resolve(f.root, 'runtime')), escape ? /escapes frozen source/ : /Missing production dependency binding/);
    } finally {await rm(f.root, {recursive: true, force: true});}
  }
});
