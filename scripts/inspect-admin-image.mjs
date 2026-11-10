import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {lstat, readFile, readdir, realpath, unlink, writeFile} from 'node:fs/promises';
import {basename, dirname, resolve, sep} from 'node:path';

export async function inspectAdminImage(containsCredential) {
  const root = '/app', app = resolve(root, 'apps/admin-web'), seen = new Set(), inventory = [], components = new Map();
  assert.notEqual(process.getuid(), 0);
  for (const file of ['server.js', 'start-runtime.mjs', '.next/BUILD_ID']) assert((await lstat(resolve(app, file))).isFile());
  for (const path of ['/usr/local/bin/npm', '/usr/local/bin/pnpm', '/usr/local/bin/yarn', '/app/apps/platform-api', '/app/apps/portal-web', '/app/artifacts', '/app/docs']) await assert.rejects(lstat(path), error => error.code === 'ENOENT');
  const probe = resolve(app, '.write-probe-' + randomUUID()); let denied = false;
  try {await writeFile(probe, 'probe', {flag: 'wx'});} catch (error) {assert(['EROFS', 'EACCES'].includes(error.code)); denied = true;}
  finally {if (!denied) await unlink(probe);}
  assert(denied);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  let scannedTextFiles = 0, clientJs = 0, clientCss = 0;
  async function walk(path) {
    const actual = await realpath(path); assert(actual === root || actual.startsWith(root + sep), 'Standalone link escapes runtime');
    if (seen.has(actual)) return; seen.add(actual);
    const stat = await lstat(actual);
    if (stat.isDirectory()) {
      const entries = await readdir(actual), parent = dirname(actual);
      const pkg = actual === root || actual === app || basename(parent) === 'node_modules' || basename(parent).startsWith('@') && basename(dirname(parent)) === 'node_modules';
      if (pkg && entries.includes('package.json')) {
        const manifest = JSON.parse(await readFile(resolve(actual, 'package.json')));
        if (manifest.name && manifest.version) {const purl = 'pkg:npm/' + manifest.name.replace('@', '%40') + '@' + manifest.version; components.set(purl, {type: 'library', name: manifest.name, version: manifest.version, purl, 'bom-ref': purl});}
      }
      for (const name of entries.sort()) await walk(resolve(actual, name)); return;
    }
    assert(stat.isFile());
    assert(!/^\.env(?:\.|$)|\.(?:pem|key|sql)$/.test(basename(actual)), 'Unexpected credential/database file');
    assert(!actual.startsWith(app + '/app/') && !actual.endsWith('.unit.test.js'), 'Untraced application/test source');
    const bytes = await readFile(actual); inventory.push({path: actual.slice(root.length + 1), size: bytes.length, sha256: hash(bytes)});
    if (/\.(?:[cm]?js|tsx?|json|ya?ml|env)$/.test(actual)) {assert(bytes.length <= 32 * 1024 * 1024, 'Web text scan bound exceeded'); assert(!containsCredential(bytes.toString()), 'Credential pattern in web artifact'); scannedTextFiles++;}
    if (actual.startsWith(app + '/.next/static/')) {
      for (const marker of ['build-only-admin.invalid', 'build-only-admin-api.invalid', 'abababababababababababababababababababababababababababababababab', '/internal/telemetry']) assert(!bytes.includes(Buffer.from(marker)), 'Private admin configuration or route leaked into browser assets');
      if (actual.endsWith('.js')) clientJs++; if (actual.endsWith('.css')) clientCss++;
    }
  }
  await walk(root); assert(clientJs > 0 && clientCss > 0);
  const names = new Set([...components.values()].map(component => component.name));
  for (const name of ['@nestjs/core', 'pg', 'drizzle-orm', 'vitest', 'typescript', '@playwright/test', 'eslint']) assert(!names.has(name), 'Backend/development package leaked: ' + name);
  const buildId = (await readFile(resolve(app, '.next/BUILD_ID'), 'utf8')).trim(); assert(buildId.length > 0);
  return {uid: process.getuid(), node: process.versions.node, filesystemWriteDenied: denied, buildId, clientJs, clientCss, scannedTextFiles, definedCredentialFindings: 0,
    inventory, inventorySha256: hash(JSON.stringify(inventory)),
    sbom: {bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, serialNumber: 'urn:uuid:' + randomUUID(), metadata: {component: {type: 'application', name: 'vlp-admin', version: '0.1.0'}}, components: [...components.values()].sort((a, b) => a.purl < b.purl ? -1 : 1)}};
}
