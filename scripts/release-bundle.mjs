import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {hash, jsonBytes} from './release-manifest.mjs';
import {repository, shaPattern} from './artifact-policy.mjs';

const args = process.argv.slice(2);
assert(args[0] === '--output' && (args.length === 2 || args.length === 4 && args[2] === '--source-revision' && shaPattern.test(args[3])));
const directory = resolve(args[1]); await mkdir(directory, {mode: 0o700});
const sourceRevision = execFileSync('git', ['rev-parse', args[3] ?? 'HEAD'], {encoding: 'utf8'}).trim(); assert(shaPattern.test(sourceRevision));
const web = JSON.parse(execFileSync('node', ['scripts/check-web-image.mjs', '--target=web', '--source-revision', sourceRevision], {encoding: 'utf8', timeout: 1800000, maxBuffer: 32 * 1024 * 1024}));
const api = JSON.parse(await readFile(resolve(dirname(web.api.artifacts.ref), 'facts.json'), 'utf8'));
assert.equal(web.result, 'PASS'); assert.equal(api.result, 'PASS'); assert.equal(api.sourceRevision, sourceRevision); assert.equal(web.sourceRevision, sourceRevision);
assert(web.runtime.cleanupComplete && web.runtime.generatedSecretsRemoved && api.runtime.cleanupComplete);
const sourceFile = path => execFileSync('git', ['show', sourceRevision + ':' + path]);
const schemaBytes = sourceFile('config/schema-compatibility.json'), schema = JSON.parse(schemaBytes.toString());
const protocol = Number(sourceFile('packages/contracts/src/index.ts').toString().match(/export const SCHEMA_VERSION = (\d+) as const;/)?.[1]); assert(Number.isSafeInteger(protocol) && protocol >= 1);
const assets = execFileSync('git', ['ls-tree', '-r', '--full-tree', sourceRevision, '--', 'apps/portal-web/public'], {encoding: 'utf8'});
const checks = {sourceRevision, result: 'PASS', apiScenarios: api.runtime.scenarios.length, webScenarios: web.runtime.scenarios.length, cleanupComplete: true, images: {api: api.image.id, web: web.image.id}, inspection: {api: api.inspection, web: web.inspection}};
assert.equal(checks.apiScenarios, 6); assert.equal(checks.webScenarios, 6);
const bundle = {schemaVersion: 1, repository, sourceRevision, compatibility: {protocol: {minimum: protocol, current: protocol, maximum: protocol}, schema: {metadataVersion: schema.metadataVersion, minimumMigrations: schema.minimumDatabaseMigrations, maximumMigrations: schema.maximumDatabaseMigrations, manifestSha256: schema.runtimeManifestSha256, policySha256: hash(schemaBytes)}, assets: {manifestSha256: hash(assets)}}, images: {}, checks: {file: 'image-checks.json', sha256: hash(jsonBytes(checks))}};
await writeFile(resolve(directory, 'image-checks.json'), jsonBytes(checks), {flag: 'wx', mode: 0o600});
for (const [target, facts] of Object.entries({api, web})) {
  const sbom = await readFile(facts.applicationSbom.ref); assert.equal(hash(sbom), facts.applicationSbom.sha256);
  const sbomFile = target + '-sbom.cdx.json'; await writeFile(resolve(directory, sbomFile), sbom, {flag: 'wx', mode: 0o600});
  const archive = target + '.tar', archivePath = resolve(directory, archive);
  execFileSync('docker', ['image', 'save', '--output', archivePath, facts.image.id], {timeout: 1200000, stdio: ['ignore', 'pipe', 'pipe']});
  execFileSync('gzip', ['-n', archivePath], {timeout: 1200000, stdio: ['ignore', 'pipe', 'pipe']});
  bundle.images[target] = {id: facts.image.id, archive: archive + '.gz', archiveSha256: hash(await readFile(archivePath + '.gz')), sbom: {file: sbomFile, sha256: hash(sbom)}};
}
await writeFile(resolve(directory, 'bundle.json'), jsonBytes(bundle), {flag: 'wx', mode: 0o600});
await mkdir(resolve(directory, 'metadata'), {mode: 0o700});
for (const file of ['bundle.json', 'image-checks.json', 'api-sbom.cdx.json', 'web-sbom.cdx.json']) await copyFile(resolve(directory, file), resolve(directory, 'metadata', file));
console.log(JSON.stringify({result: 'PASS', sourceRevision, bundle: resolve(directory, 'bundle.json'), sourceImagesBuiltAndTested: true, registryPublish: 'NOT_RUN'}));
