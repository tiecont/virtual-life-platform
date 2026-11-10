import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {lstat, readFile, readdir, realpath, unlink, writeFile} from 'node:fs/promises';
import {basename, dirname, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export function containsCredential(text) {
  return /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----(?:\r?\n|\\n)[A-Za-z0-9+/=\r\n\\]{32,}/.test(text)
    || /\bAKIA[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(text);
}

export async function inspectApiImage() {
  const root = '/app/apps/platform-api', seen = new Set(), inventory = [], components = new Map(), own = [];
  assert.notEqual(process.getuid(), 0, 'Runtime must not be root');
  for (const path of ['/usr/local/bin/npm', '/usr/local/bin/pnpm', '/usr/local/bin/yarn', '/app/package.json', '/app/apps/portal-web']) {
    await assert.rejects(lstat(path), error => error.code === 'ENOENT', 'Unexpected runtime/build file: ' + path);
  }
  const probe = resolve(root, '.write-probe-' + randomUUID());
  let denied = false;
  try { await writeFile(probe, 'probe', {flag: 'wx'}); }
  catch (error) { assert(['EROFS', 'EACCES'].includes(error.code)); denied = true; }
  finally { if (!denied) await unlink(probe); }
  assert(denied, 'Runtime application files are writable');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  let scannedTextFiles = 0;
  async function walk(path) {
    const actual = await realpath(path);
    assert(actual === root || actual.startsWith(root + sep), 'Dependency link escapes image closure');
    if (seen.has(actual)) return;
    seen.add(actual);
    const stat = await lstat(actual);
    if (stat.isDirectory()) {
      const entries = await readdir(actual);
      const isPackage = actual === root || basename(dirname(actual)) === 'node_modules' || basename(dirname(actual)).startsWith('@') && basename(dirname(dirname(actual))) === 'node_modules';
      if (isPackage && entries.includes('package.json')) {
        const pkg = JSON.parse(await readFile(resolve(actual, 'package.json')));
        assert(typeof pkg.name === 'string' && typeof pkg.version === 'string');
        const purl = 'pkg:npm/' + pkg.name.replace('@', '%40') + '@' + pkg.version;
        components.set(purl, {type: 'library', name: pkg.name, version: pkg.version, purl, 'bom-ref': purl});
        if (pkg.name.startsWith('@virtual-city/')) {
          assert(entries.every(name => ['package.json', 'dist', 'node_modules'].includes(name)), 'First-party source leaked into runtime');
          own.push({name: pkg.name, path: actual});
        }
      }
      for (const name of entries.sort()) await walk(resolve(actual, name));
      return;
    }
    assert(stat.isFile(), 'Unexpected runtime filesystem object');
    assert(!/^\.env(?:\.|$)|\.(?:pem|key)$/.test(basename(actual)), 'Unexpected credential file');
    const bytes = await readFile(actual);
    inventory.push({path: actual.slice(root.length + 1), size: bytes.length, sha256: sha(bytes)});
    if (/\.(?:[cm]?js|tsx?|json|ya?ml|env)$/.test(actual)) {
      assert(bytes.length <= 4 * 1024 * 1024, 'Text scan bound exceeded');
      assert(!containsCredential(bytes.toString('utf8')), 'Credential pattern found in runtime file');
      scannedTextFiles++;
    }
  }
  await walk(root);
  for (const pkg of own) for (const file of inventory.filter(file => resolve(root, file.path).startsWith(pkg.path + '/dist/'))) {
    assert(!/\.(?:test|spec)\./.test(file.path) && (!file.path.endsWith('.ts') || file.path.endsWith('.d.ts')), 'First-party test/source output leaked');
  }
  const names = new Set([...components.values()].map(component => component.name));
  for (const name of ['typescript', 'vitest', 'tsx', 'eslint', '@playwright/test', 'next', 'react', 'pixi.js']) assert(!names.has(name), 'Development/web dependency leaked: ' + name);
  const migrationDirectory = resolve(root, 'dist/shared/database/migrations'), migrations = {};
  for (const name of (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql')).sort()) migrations[name] = sha(await readFile(resolve(migrationDirectory, name)));
  assert(own.some(pkg => pkg.name === '@virtual-city/platform-api'));
  const sbom = {bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, serialNumber: 'urn:uuid:' + randomUUID(),
    metadata: {component: {type: 'application', name: 'vlp-api', version: '0.1.0'}}, components: [...components.values()].sort((a, b) => a.purl < b.purl ? -1 : 1)};
  return {uid: process.getuid(), node: process.versions.node, filesystemWriteDenied: denied,
    firstPartyPackages: own.map(pkg => pkg.name).sort(), inventory, inventorySha256: sha(JSON.stringify(inventory)), migrations,
    credentialScan: {scannedTextFiles, patterns: ['PEM private key body', 'AWS access key ID', 'GitHub classic token', 'credential filenames'], findings: 0, scope: 'Application dependency filesystem; bounded text files; not a CVE or universal secret certification'},
    sbom};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await inspectApiImage()));
