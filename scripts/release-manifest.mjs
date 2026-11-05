import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstat, mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {artifactPolicy, digestPattern, hostedProof, qualityWorkflow, repository, shaPattern} from './artifact-policy.mjs';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => JSON.stringify(value, null, 2) + '\n';
export function keys(value, expected) {assert(value && typeof value === 'object' && !Array.isArray(value)); assert.deepEqual(Object.keys(value).sort(), expected.split(',').sort());}
function descriptorShape(descriptor) {
  keys(descriptor, 'file,sha256'); assert(/^[a-z][a-z0-9.-]{0,100}$/.test(descriptor.file)); assert(/^[a-f0-9]{64}$/.test(descriptor.sha256));
}
export async function verifiedFile(directory, descriptor) {
  descriptorShape(descriptor);
  const file = resolve(directory, descriptor.file), stat = await lstat(file); assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16 * 1024 * 1024);
  const bytes = await readFile(file); assert.equal(hash(bytes), descriptor.sha256, 'Evidence content hash mismatch'); return JSON.parse(bytes.toString());
}
export function validateManifest(value, {rehearsal = false} = {}) {
  keys(value, 'schemaVersion,kind,source,quality,artifacts,compatibility,promotion,evidence,vulnerabilities');
  assert.equal(value.schemaVersion, 1); assert.equal(value.kind, rehearsal ? 'local-registry-rehearsal' : 'vlp-release-candidate');
  keys(value.source, 'repository,revision'); assert.equal(value.source.repository, repository); assert(shaPattern.test(value.source.revision));
  keys(value.quality, 'runId,runAttempt,workflow,event,branch');
  assert.equal(value.quality.workflow, qualityWorkflow); assert.equal(value.quality.event, rehearsal ? 'local-rehearsal' : 'push'); assert.equal(value.quality.branch, 'main');
  for (const name of ['runId', 'runAttempt']) assert(Number.isSafeInteger(value.quality[name]) && value.quality[name] >= (rehearsal ? 0 : 1));
  assert.deepEqual(value.promotion, {autoMerge: false, productionAutoPromotion: false, ownerRequired: true, publicRelease: false});
  assert.deepEqual(value.vulnerabilities, {status: 'NOT_RUN', promotionRequiresReview: true});
  keys(value.artifacts, 'api,web');
  for (const target of ['api', 'web']) {
    const artifact = value.artifacts[target]; keys(artifact, 'image,localImageId,sbom,provenance'); assert(digestPattern.test(artifact.localImageId));
    const pattern = rehearsal ? new RegExp('^127\\.0\\.0\\.1:[1-9][0-9]{0,4}/vlp-' + target + '@sha256:[a-f0-9]{64}$') : new RegExp('^ghcr\\.io/tiecont/vlp-' + target + '@sha256:[a-f0-9]{64}$');
    assert(pattern.test(artifact.image), 'Deploy by allowlisted immutable digest only');
    descriptorShape(artifact.sbom); descriptorShape(artifact.provenance);
    assert.equal(artifact.sbom.file, target + '-sbom.cdx.json'); assert.equal(artifact.provenance.file, target + '-provenance.json');
  }
  keys(value.compatibility, 'protocol,schema,assets');
  keys(value.compatibility.protocol, 'minimum,current,maximum');
  const protocol = value.compatibility.protocol; assert([protocol.minimum, protocol.current, protocol.maximum].every(n => Number.isSafeInteger(n) && n >= 1)); assert(protocol.minimum <= protocol.current && protocol.current <= protocol.maximum);
  keys(value.compatibility.schema, 'metadataVersion,minimumMigrations,maximumMigrations,manifestSha256,policySha256');
  const schema = value.compatibility.schema; assert(Number.isSafeInteger(schema.metadataVersion) && schema.metadataVersion >= 1); assert(Number.isSafeInteger(schema.minimumMigrations) && schema.minimumMigrations >= 1); assert(Number.isSafeInteger(schema.maximumMigrations) && schema.maximumMigrations >= schema.minimumMigrations);
  keys(value.compatibility.assets, 'manifestSha256');
  for (const digest of [schema.manifestSha256, schema.policySha256, value.compatibility.assets.manifestSha256]) assert(/^[a-f0-9]{64}$/.test(digest));
  keys(value.evidence, 'quality,imageChecks');
  descriptorShape(value.evidence.quality); descriptorShape(value.evidence.imageChecks);
  return value;
}

export async function checkManifest(directory, {rehearsal = false, remote = false} = {}) {
  const manifest = validateManifest(JSON.parse(await readFile(resolve(directory, 'release.json'), 'utf8')), {rehearsal});
  const proof = await verifiedFile(directory, manifest.evidence.quality), checks = await verifiedFile(directory, manifest.evidence.imageChecks);
  assert.equal(proof.sourceRevision, manifest.source.revision); assert.equal(proof.repository, repository);
  assert.equal(proof.runId, manifest.quality.runId); assert.equal(proof.runAttempt, manifest.quality.runAttempt);
  assert.equal(proof.event, manifest.quality.event); assert.equal(proof.branch, 'main'); assert.equal(proof.workflow, qualityWorkflow);
  assert.equal(checks.sourceRevision, manifest.source.revision); assert.equal(checks.result, 'PASS'); assert.equal(checks.apiScenarios, 6); assert.equal(checks.webScenarios, 6); assert.equal(checks.cleanupComplete, true);
  for (const target of ['api', 'web']) {
    const artifact = manifest.artifacts[target]; assert.equal(checks.images[target], artifact.localImageId);
    const sbom = await verifiedFile(directory, artifact.sbom), provenance = await verifiedFile(directory, artifact.provenance);
    assert.equal(sbom.bomFormat, 'CycloneDX'); assert(Array.isArray(sbom.components) && sbom.components.length > 0);
    assert.equal(provenance._type, 'https://in-toto.io/Statement/v1'); assert.equal(provenance.predicateType, 'https://github.com/tiecont/virtual-life-platform/provenance/v1');
    assert.deepEqual(provenance.subject, [{name: artifact.image.split('@')[0], digest: {sha256: artifact.image.split('@sha256:')[1]}}]);
    assert.deepEqual(provenance.predicate, {source: manifest.source, quality: manifest.quality, compatibility: manifest.compatibility, imageId: artifact.localImageId, sbomSha256: artifact.sbom.sha256, checksSha256: manifest.evidence.imageChecks.sha256, signed: false});
    if (remote) {
      const descriptor = JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', artifact.image, '--format', '{{json .Manifest}}'], {encoding: 'utf8', timeout: 120000}));
      assert.equal(descriptor.digest, artifact.image.split('@')[1], 'Actual registry descriptor mismatch');
      execFileSync('docker', ['pull', artifact.image], {stdio: ['ignore', 'pipe', 'pipe'], timeout: 1200000});
      const inspected = JSON.parse(execFileSync('docker', ['image', 'inspect', artifact.image], {encoding: 'utf8'}))[0];
      assert.equal(inspected.Id, artifact.localImageId); assert.equal(inspected.Config.Labels['org.opencontainers.image.revision'], manifest.source.revision);
    }
  }
  if (remote && !rehearsal) {
    const actual = await hostedProof(manifest.quality.runId, manifest.quality.runAttempt);
    assert.deepEqual(proof, actual, 'Hosted proof differs from actual exact-SHA successful run');
    const metadataDirectory = await mkdtemp(resolve(tmpdir(), 'vlp-hosted-metadata-'));
    try {
      execFileSync('gh', ['run', 'download', String(actual.runId), '--repo', repository, '--name', 'verified-image-metadata-' + actual.sourceRevision + '-' + actual.runAttempt, '--dir', metadataDirectory], {timeout: 120000, stdio: ['ignore', 'pipe', 'pipe']});
      const bundle = JSON.parse(await readFile(resolve(metadataDirectory, 'bundle.json'), 'utf8'));
      assert.equal(bundle.sourceRevision, actual.sourceRevision); assert.deepEqual(bundle.compatibility, manifest.compatibility);
      assert.equal(bundle.checks.sha256, manifest.evidence.imageChecks.sha256);
      await verifiedFile(metadataDirectory, bundle.checks);
      for (const target of ['api', 'web']) {
        assert.equal(bundle.images[target].id, manifest.artifacts[target].localImageId);
        assert.deepEqual(bundle.images[target].sbom, manifest.artifacts[target].sbom);
        await verifiedFile(metadataDirectory, bundle.images[target].sbom);
      }
    } finally {await rm(metadataDirectory, {recursive: true, force: true});}
  }
  return {result: 'PASS', kind: manifest.kind, sourceRevision: manifest.source.revision, remoteImagesVerified: remote, hostedChecksVerified: remote && !rehearsal, signedProvenance: false, productionPromotionAuthorized: false};
}

export async function checkCommittedManifests() {
  let entries;
  try {entries = await readdir('releases', {withFileTypes: true});}
  catch (error) {if (error.code === 'ENOENT') return []; throw error;}
  const results = [];
  for (const entry of entries) {
    assert(entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name), 'Release root contains unreviewed path');
    results.push(await checkManifest('releases/' + entry.name));
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    assert(args.length <= 3 && args.slice(1).every(arg => ['--remote', '--local-rehearsal'].includes(arg)));
    const policy = await artifactPolicy(), directory = args[0] ?? policy.candidate;
    if (!directory) console.log(JSON.stringify({policy: 'PASS', candidate: 'NOT_REQUESTED', committedCandidates: await checkCommittedManifests(), artifactsVerified: false, autoMerge: false, productionAutoPromotion: false, ownerPromotionRequired: true}));
    else console.log(JSON.stringify(await checkManifest(directory, {remote: args.includes('--remote'), rehearsal: args.includes('--local-rehearsal')})));
  } catch (error) {console.error('Release manifest rejected: ' + error.message); process.exitCode = 1;}
}
