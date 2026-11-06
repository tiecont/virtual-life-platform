import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {artifactPolicy, digestPattern, hostedProof, repository, shaPattern} from './artifact-policy.mjs';
import {checkManifest, hash, jsonBytes, keys, validateManifest, verifiedFile} from './release-manifest.mjs';
import {releaseTargets} from './artifact-targets.mjs';

async function authorization(options = {}) {
  const policy = await artifactPolicy(); assert(policy.publishEnabled, 'Registry publish disabled by policy');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_run'); assert.equal(process.env.GITHUB_REPOSITORY, repository);
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')), run = event.workflow_run;
  assert.equal(event.action, 'completed'); assert.equal(event.repository?.full_name, repository);
  assert.equal(run?.head_repository?.full_name, repository); assert.equal(run?.event, 'push'); assert.equal(run?.head_branch, 'main'); assert.equal(run?.conclusion, 'success');
  const proof = await hostedProof(run.id, run.run_attempt, options);
  if (proof === null) return null;
  assert.equal(proof.sourceRevision, run.head_sha); assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), proof.sourceRevision);
  return proof;
}
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === 'authorize') {
  const proof = await authorization({allowNoImages: true}); console.log('publish=' + (proof !== null));
  if (proof) {console.log('source=' + proof.sourceRevision); console.log('attempt=' + proof.runAttempt);}
} else {
  assert(args.length === 4 && ['publish', 'rehearse'].includes(args[0]), 'Expected publish|rehearse BUNDLE OUTPUT REGISTRY');
  const [mode, input, output, registry] = args, rehearsal = mode === 'rehearse';
  assert(rehearsal ? /^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(registry) && Number(registry.split(':')[1]) <= 65535 : registry === 'ghcr.io/tiecont');
  const bundle = JSON.parse(await readFile(resolve(input, 'bundle.json'), 'utf8'));
  keys(bundle, 'schemaVersion,repository,sourceRevision,compatibility,images,checks'); const targets=releaseTargets(bundle.schemaVersion); assert.equal(bundle.repository, repository); assert(shaPattern.test(bundle.sourceRevision)); keys(bundle.images,targets.join(','));
  const proof = rehearsal ? {repository, workflow: '.github/workflows/quality.yml', sourceRevision: bundle.sourceRevision, runId: 0, runAttempt: 0, event: 'local-rehearsal', branch: 'main', jobs: [], hostedChecks: 'NOT_RUN'} : await authorization();
  if (!rehearsal) assert.equal(bundle.schemaVersion, (await artifactPolicy()).schemaVersion, 'Current publish policy requires its complete artifact set');
  assert.equal(bundle.sourceRevision, proof.sourceRevision);
  const checks = await verifiedFile(input, bundle.checks); assert.equal(checks.sourceRevision, bundle.sourceRevision); assert.equal(checks.result, 'PASS'); assert.equal(checks.cleanupComplete, true); for(const target of targets)assert.equal(checks[target+'Scenarios'],6);keys(checks.images,targets.join(','));
  await mkdir(output, {mode: 0o700});
  const save = async (file, bytes) => {await writeFile(resolve(output, file), bytes, {mode: 0o600, flag: 'wx'}); return {file, sha256: hash(bytes)};};
  const manifest = {schemaVersion: bundle.schemaVersion, kind: rehearsal ? 'local-registry-rehearsal' : 'vlp-release-candidate', source: {repository, revision: bundle.sourceRevision}, quality: {runId: proof.runId, runAttempt: proof.runAttempt, workflow: proof.workflow, event: proof.event, branch: proof.branch}, artifacts: {}, compatibility: bundle.compatibility, promotion: {autoMerge: false, productionAutoPromotion: false, ownerRequired: true, publicRelease: false}, evidence: {quality: await save('quality-proof.json', jsonBytes(proof)), imageChecks: await save('image-checks.json', jsonBytes(checks))}, vulnerabilities: {status: 'NOT_RUN', promotionRequiresReview: true}};
  const provisional = globalThis.structuredClone(manifest);
  for (const target of targets) provisional.artifacts[target] = {...bundle.schemaVersion===2?{sourceRevision:bundle.sourceRevision}:{},image: registry + '/vlp-' + target + '@sha256:' + '0'.repeat(64), localImageId: bundle.images[target].id, sbom: {file: target + '-sbom.cdx.json', sha256: '0'.repeat(64)}, provenance: {file: target + '-provenance.json', sha256: '0'.repeat(64)}};
  validateManifest(provisional, {rehearsal});
  // Validate every payload before the first registry mutation.
  for (const target of targets) {
    const image = bundle.images[target]; keys(image, 'id,archive,archiveSha256,sbom'); assert(digestPattern.test(image.id)); assert.equal(image.id, checks.images[target]); assert.equal(image.archive, target + '.tar.gz'); assert(/^[a-f0-9]{64}$/.test(image.archiveSha256));
    const archive = resolve(input, image.archive), stat = await lstat(archive); assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2 * 1024 ** 3); assert.equal(hash(await readFile(archive)), image.archiveSha256);
    assert.equal(image.sbom.file, target + '-sbom.cdx.json'); const sbom = await verifiedFile(input, image.sbom); assert.equal(sbom.bomFormat, 'CycloneDX'); assert(sbom.components.length > 0);
    execFileSync('docker', ['load', '--input', archive], {timeout: 1200000, stdio: ['ignore', 'pipe', 'pipe']});
    const metadata = JSON.parse(execFileSync('docker', ['image', 'inspect', image.id], {encoding: 'utf8'}))[0];
    assert.equal(metadata.Config.Labels['org.opencontainers.image.revision'], bundle.sourceRevision); assert.equal(metadata.Config.Labels['org.opencontainers.image.title'], 'vlp-' + target); assert.equal(metadata.Config.User, 'node');
  }
  for (const target of targets) {
    const image = bundle.images[target], name = registry + '/vlp-' + target, tag = name + ':sha-' + bundle.sourceRevision + '-run-' + proof.runId + '-' + proof.runAttempt;
    execFileSync('docker', ['tag', image.id, tag]); execFileSync('docker', ['push', tag], {timeout: 1200000, stdio: ['ignore', 'pipe', 'pipe']});
    const metadata = JSON.parse(execFileSync('docker', ['image', 'inspect', tag], {encoding: 'utf8'}))[0]; assert.equal(metadata.Id, image.id);
    const remote = JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', tag, '--format', '{{json .Manifest}}'], {encoding: 'utf8', timeout: 120000}));
    assert(digestPattern.test(remote.digest)); const reference = name + '@' + remote.digest;
    const sbom = await readFile(resolve(input, image.sbom.file)); assert.equal(hash(sbom), image.sbom.sha256);
    const descriptor = await save(target + '-sbom.cdx.json', sbom);
    const provenance = {_type: 'https://in-toto.io/Statement/v1', subject: [{name, digest: {sha256: remote.digest.slice(7)}}], predicateType: 'https://github.com/tiecont/virtual-life-platform/provenance/v1', predicate: {source: manifest.source, quality: manifest.quality, compatibility: manifest.compatibility, imageId: image.id, sbomSha256: descriptor.sha256, checksSha256: manifest.evidence.imageChecks.sha256, signed: false}};
    manifest.artifacts[target] = {...bundle.schemaVersion===2?{sourceRevision:bundle.sourceRevision}:{},image: reference, localImageId: image.id, sbom: descriptor, provenance: await save(target + '-provenance.json', jsonBytes(provenance))};
  }
  await save('release.json', jsonBytes(manifest));
  console.log(JSON.stringify(await checkManifest(output, {rehearsal, remote: true})));
}
