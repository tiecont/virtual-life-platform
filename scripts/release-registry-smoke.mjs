import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {cp, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {imageTestTools} from './image-test-tools.mjs';
import {checkManifest, jsonBytes} from './release-manifest.mjs';

const args = process.argv.slice(2); assert(args.length === 4 && args[0] === '--bundle' && args[2] === '--output');
const directory = resolve(args[3]), tools = await imageTestTools(directory), name = 'vlp-release-registry-' + randomUUID().slice(0, 8);
const facts = {scope: 'Disposable loopback OCI registry; real tested-image load/push/digest-pull and unsigned metadata verification; hosted/GHCR publish NOT_RUN', result: 'FAIL', cleanupComplete: false};
let created = false;
try {
  await tools.run('registry-image', 'docker', ['pull', 'registry:3.0.0']);
  const registryImage = JSON.parse((await tools.run('registry-image', 'docker', ['image', 'inspect', '--format', '{{json .RepoDigests}}', 'registry:3.0.0'])).stdout); facts.registryImage = registryImage;
  await tools.run('registry-start', 'docker', ['run', '-d', '--name', name, '--read-only', '--user', '65534:65534', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--memory', '512m', '--pids-limit', '128', '--tmpfs', '/var/lib/registry:uid=65534,gid=65534,mode=0700,size=1g', '-p', '127.0.0.1::5000', 'registry:3.0.0']); created = true;
  const ports = JSON.parse((await tools.run('registry-port', 'docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', name])).stdout)['5000/tcp']; assert.equal(ports.length, 1); assert.equal(ports[0].HostIp, '127.0.0.1');
  const registry = '127.0.0.1:' + ports[0].HostPort;
  let ready = false;
  for (let i = 0; i < 60 && !tools.signal.aborted; i++) {
    try {ready = (await fetch('http://' + registry + '/v2/', {signal: globalThis.AbortSignal.timeout(1000)})).status === 200;} catch { /* Bounded readiness. */ }
    if (ready) break; await new Promise(done => setTimeout(done, 250));
  }
  assert(ready && !tools.signal.aborted);
  const output = resolve(directory, 'candidate');
  const result = await tools.run('push-and-verify', 'node', ['scripts/release-publish.mjs', 'rehearse', resolve(args[1]), output, registry]);
  assert.equal(JSON.parse(result.stdout).remoteImagesVerified, true);
  const manifest = JSON.parse(await readFile(resolve(output, 'release.json'), 'utf8'));
  facts.sourceRevision = manifest.source.revision; facts.artifacts = manifest.artifacts; facts.sameTestedImageIds = true;
  // Containerd-backed Docker can identify a local image by its OCI index digest too.
  // Verify both sources independently rather than assuming the two hashes differ.
  facts.daemonAndRegistryIdentityEqual = Object.fromEntries(Object.entries(manifest.artifacts).map(([target, artifact]) => [target, artifact.image.split('@')[1] === artifact.localImageId]));
  await assert.rejects(() => checkManifest(output), 'Rehearsal cannot be used as an actual release candidate');
  const negative = resolve(directory, 'corrupt-candidate'); await cp(output, negative, {recursive: true});
  for (const target of Object.keys(manifest.artifacts)) {
    const file = resolve(negative, target + '-sbom.cdx.json'), original = await readFile(file);
    await writeFile(file, '{}'); await assert.rejects(() => checkManifest(negative, {rehearsal: true})); await writeFile(file, original);
  }
  if (manifest.schemaVersion === 2) {
    const missing = globalThis.structuredClone(manifest); delete missing.artifacts.admin;
    await writeFile(resolve(negative, 'release.json'), jsonBytes(missing)); await assert.rejects(() => checkManifest(negative, {rehearsal: true}));
    const wrongSource = globalThis.structuredClone(manifest); wrongSource.artifacts.admin.sourceRevision = '0'.repeat(40);
    await writeFile(resolve(negative, 'release.json'), jsonBytes(wrongSource)); await assert.rejects(() => checkManifest(negative, {rehearsal: true}));
    facts.missingAdminAndWrongSourceDenied = true;
  }
  await writeFile(resolve(negative, 'release.json'), jsonBytes({...manifest, artifacts: {...manifest.artifacts, api: {...manifest.artifacts.api, image: registry + '/vlp-api:latest'}}}));
  await assert.rejects(() => checkManifest(negative, {rehearsal: true}));
  await rm(negative, {recursive: true});
  facts.corruptSbomDenied = true; facts.mutableTagDenied = true; facts.rehearsalNotProduction = true; facts.result = 'PASS';
} catch (error) {facts.error = error.message; process.exitCode = 1;}
finally {
  if (created) {const removal = await tools.run('cleanup', 'docker', ['rm', '-f', name], {allowFailure: true, ignoreCancellation: true}); facts.cleanupComplete = removal.code === 0;}
  if (!facts.cleanupComplete || tools.signal.aborted) {facts.result = 'FAIL'; process.exitCode = 1;}
  await tools.save('commands.json', tools.commands); await tools.save('facts.json', facts); tools.dispose(); console.log(JSON.stringify(facts, null, 2));
}
