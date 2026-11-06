import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildPromotionPlan, validateOverlayRelease, assertPromotionPaths} from '../../scripts/promotion-contract.mjs';
import {imageChanges} from '../../scripts/artifact-policy.mjs';
import {hash, jsonBytes, checkManifest} from '../../scripts/release-manifest.mjs';
import {validatePromotionPolicy, validatePromotionEvent, authorizePublisher, promotionBranch, verifyExistingPromotionHead} from '../../scripts/promotion-bot.mjs';
import {assertPromotionWorkflow} from '../../scripts/verify-artifact-workflows.mjs';
import {promotionApiFixture} from '../support/promotion-api-fixture.mjs';

// Synthetic shape fixtures only. No hosted/registry result or real digest is
// minted by these tests; the production writer must verify remote evidence.
const h = 'a'.repeat(64), revision = 'b'.repeat(40);
const overlay = environment => ({apiVersion: 'kustomize.config.k8s.io/v1beta1', kind: 'Kustomization', namespace: 'vlp-' + environment, resources: ['../../base', 'database-egress.json']});
function manifest() {
  const descriptor = file => ({file, sha256: h});
  return {schemaVersion: 1, kind: 'vlp-release-candidate', source: {repository: 'tiecont/virtual-life-platform', revision}, quality: {runId: 123, runAttempt: 2, workflow: '.github/workflows/quality.yml', event: 'push', branch: 'main'}, artifacts: Object.fromEntries(['api', 'web'].map(target => [target, {image: 'ghcr.io/tiecont/vlp-' + target + '@sha256:' + h, localImageId: 'sha256:' + h, sbom: descriptor(target + '-sbom.cdx.json'), provenance: descriptor(target + '-provenance.json')}])), compatibility: {protocol: {minimum: 1, current: 1, maximum: 1}, schema: {metadataVersion: 1, minimumMigrations: 38, maximumMigrations: 38, manifestSha256: h, policySha256: h}, assets: {manifestSha256: h}}, promotion: {autoMerge: false, productionAutoPromotion: false, ownerRequired: true, publicRelease: false}, evidence: {quality: descriptor('quality-proof.json'), imageChecks: descriptor('image-checks.json')}, vulnerabilities: {status: 'NOT_RUN', promotionRequiresReview: true}};
}
const plan = (environment = 'staging', options = {}) => buildPromotionPlan(manifest(), {environment, releaseId: 'synthetic-fixture', manifestSha256: h, baseRevision: revision, currentOverlay: overlay(environment), ...options});
test('promotion preview binds both digests without granting artifact/deployment authority or rebuilding', () => {
  const result = plan(); assert.equal(result.kind, 'vlp-unverified-promotion-preview'); assert.equal(result.remoteEvidenceVerified, false); assert.equal(result.productionReleaseAuthorized, false);
  assert.equal(result.changed, true); assert.equal(result.binding.releasePath, 'releases/synthetic-fixture'); validateOverlayRelease(result.binding);
  assert.deepEqual(result.overlay.images.map(image => image.digest), ['sha256:' + h, 'sha256:' + h]); assert(result.overlay.images.every(image => !Object.hasOwn(image, 'newTag')));
  assert.equal(plan('staging', {currentOverlay: result.overlay, currentBinding: result.binding}).changed, false);
});
test('production can propose only the identical staging release set, never a rebuilt or changed descriptor', () => {
  const staging = plan(); const production = plan('production', {stagingBinding: staging.binding}); assert.deepEqual(production.binding, staging.binding);
  assert.throws(() => plan('production'));
  for (const mutate of [value => {value.manifestSha256 = 'c'.repeat(64);}, value => {value.images.web = 'ghcr.io/tiecont/vlp-web@sha256:' + 'd'.repeat(64);}, value => {value.releasePath = 'releases/other';}]) {
    const changed = globalThis.structuredClone(staging.binding); mutate(changed); assert.throws(() => plan('production', {stagingBinding: changed}));
  }
});
test('preview rejects mutable/foreign/rehearsal inputs and unreviewed paths/namespace transforms', () => {
  for (const mutate of [m => {m.artifacts.api.image = 'ghcr.io/tiecont/vlp-api:latest';}, m => {m.kind = 'local-registry-rehearsal';}, m => {m.source.repository = 'foreign/repo';}, m => {m.promotion.autoMerge = true;}]) {
    const m = manifest(); mutate(m); assert.throws(() => buildPromotionPlan(m, {environment: 'staging', releaseId: 'fixture', manifestSha256: h, baseRevision: revision, currentOverlay: overlay('staging')}));
  }
  for (const options of [{environment: 'dev'}, {releaseId: '../secret'}, {baseRevision: 'main'}, {currentOverlay: {...overlay('staging'), namespace: 'default'}}, {currentOverlay: {...overlay('staging'), generators: ['remote']}}]) assert.throws(() => plan('staging', options));
});
test('promotion path allowlist remains deploy-only and cannot change code, workflows or another environment', () => {
  const paths = ['releases/synthetic-fixture/release.json', 'infra/k8s/overlays/staging/release.json', 'infra/k8s/overlays/staging/kustomization.yaml'];
  assertPromotionPaths(paths, 'staging', 'synthetic-fixture'); assert.equal(imageChanges(paths), false);
  for (const file of ['package.json', '.github/workflows/quality.yml', 'scripts/promotion-contract.mjs', 'infra/k8s/overlays/production/kustomization.yaml', 'releases/other/release.json', 'releases/synthetic-fixture/../secret']) assert.throws(() => assertPromotionPaths([...paths, file], 'staging', 'synthetic-fixture'));
});
test('actual preview CLI produces an applicable diff without repository mutation; synthetic proof never verifies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vlp-promotion-fixture-')), script = resolve('scripts/promotion-proposal.mjs'), planner = resolve('scripts/artifact-plan.mjs');
  try {
    const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    await cp('infra/k8s', join(root, 'infra/k8s'), {recursive: true}); await mkdir(join(root, 'config'));
    await writeFile(join(root, 'config/artifact-release.json'), await readFile('config/artifact-release.json')); await writeFile(join(root, '.gitignore'), 'artifacts/\n');
    git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=Synthetic fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--no-gpg-sign', '-qm', 'Synthetic baseline']); const before = git(['rev-parse', 'HEAD']);
    const input = join(root, 'artifacts/input'); await mkdir(input, {recursive: true}); const m = manifest();
    const save = async (file, value) => {const bytes = jsonBytes(value); await writeFile(join(input, file), bytes); return {file, sha256: hash(bytes)};};
    m.evidence.quality = await save('quality-proof.json', {...m.quality, repository: m.source.repository, sourceRevision: m.source.revision});
    m.evidence.imageChecks = await save('image-checks.json', {sourceRevision: m.source.revision, result: 'PASS', apiScenarios: 6, webScenarios: 6, cleanupComplete: true, images: {api: m.artifacts.api.localImageId, web: m.artifacts.web.localImageId}});
    for (const target of ['api', 'web']) {
      const artifact = m.artifacts[target]; artifact.sbom = await save(target + '-sbom.cdx.json', {bomFormat: 'CycloneDX', components: [{name: 'SYNTHETIC_NOT_RELEASED'}]});
      artifact.provenance = await save(target + '-provenance.json', {_type: 'https://in-toto.io/Statement/v1', subject: [{name: artifact.image.split('@')[0], digest: {sha256: h}}], predicateType: 'https://github.com/tiecont/virtual-life-platform/provenance/v1', predicate: {source: m.source, quality: m.quality, compatibility: m.compatibility, imageId: artifact.localImageId, sbomSha256: artifact.sbom.sha256, checksSha256: m.evidence.imageChecks.sha256, signed: false}});
    }
    await save('release.json', m); assert.equal((await checkManifest(input)).remoteImagesVerified, false);
    const output = execFileSync('node', [script, 'preview', 'staging', 'synthetic-fixture', input, 'artifacts/preview'], {cwd: root, encoding: 'utf8'}), result = JSON.parse(output);
    assert.equal(result.kind, 'vlp-unverified-promotion-preview'); assert.equal(result.remoteEvidenceVerified, false); assert.equal(result.edits, 9); assert.equal(git(['status', '--porcelain']), '');
    const rejected = spawnSync('node', [script, 'verify', 'staging', 'synthetic-fixture', input, 'artifacts/must-not-exist'], {cwd: root, encoding: 'utf8'}); assert.equal(rejected.status, 1); assert.equal(git(['status', '--porcelain']), '');
    git(['apply', '--check', 'artifacts/preview/proposal.diff']); git(['apply', 'artifacts/preview/proposal.diff']); git(['add', '.']);
    const policyModule = pathToFileURL(resolve('scripts/kubernetes-policy.mjs')).href;
    const inspect = environment => `const m=await import(${JSON.stringify(policyModule)});const s=await m.readKubernetesSource(${JSON.stringify(environment)});console.log(JSON.stringify(m.verifyKubernetesPolicy(s.objects,${JSON.stringify(environment)},s.budget,s.release)));`;
    const policy = JSON.parse(execFileSync('node', ['--input-type=module', '-e', inspect('staging')], {cwd: root, encoding: 'utf8'})); assert.equal(policy.artifactEvidence, 'LOCAL_INTEGRITY_ONLY'); assert.equal(policy.deploymentEligible, false);
    const checksPath = join(root, 'releases/synthetic-fixture/image-checks.json'), originalChecks = await readFile(checksPath); await writeFile(checksPath, '{}'); assert.equal(spawnSync('node', ['--input-type=module', '-e', inspect('staging')], {cwd: root}).status, 1); await writeFile(checksPath, originalChecks);
    const paths = git(['diff', '--cached', '--name-only']).split('\n'); assert.equal(paths.length, 9); assertPromotionPaths(paths, 'staging', 'synthetic-fixture'); assert.equal(imageChanges(paths), false);
    assert.equal((await checkManifest(join(root, 'releases/synthetic-fixture'))).hostedChecksVerified, false);
    git(['-c', 'user.name=Synthetic fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--no-gpg-sign', '-qm', 'Synthetic digest-only proposal']);
    const eventPath = join(root, 'artifacts/event.json'); await writeFile(eventPath, JSON.stringify({before, pull_request: {base: {sha: before}}}));
    for (const event of ['pull_request', 'push']) assert(execFileSync('node', [planner], {cwd: root, env: {...process.env, GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: eventPath}, encoding: 'utf8'}).includes('images=false'));
    const production = JSON.parse(execFileSync('node', [script, 'preview', 'production', 'synthetic-fixture', input, 'artifacts/production-preview'], {cwd: root, encoding: 'utf8'})); assert.equal(production.edits, 2, 'Production reuses all immutable release files');
    git(['apply', '--check', 'artifacts/production-preview/proposal.diff']); git(['apply', 'artifacts/production-preview/proposal.diff']);
    assert.equal(await readFile(join(root, 'infra/k8s/overlays/production/release.json'), 'utf8'), await readFile(join(root, 'infra/k8s/overlays/staging/release.json'), 'utf8'));
    assert.equal(JSON.parse(execFileSync('node', ['--input-type=module', '-e', inspect('production')], {cwd: root, encoding: 'utf8'})).deploymentEligible, false);
  } finally {
    if (process.env.VLP_CAPTURE_PROMOTION_FIXTURE === '1') {
      const destination = resolve('artifacts/vnext/n04-02/bound-render-fixture'); await cp(root, destination, {recursive: true, errorOnExist: true, force: false});
    }
    await rm(root, {recursive: true, force: true});
  }
});
test('manual bot context and publisher artifact authorization reject forks, wrong events, mutable identities and missing proofs', async () => {
  const policy = JSON.parse(await readFile('config/digest-promotion.json', 'utf8')); validatePromotionPolicy(policy); assert.equal(policy.manualWorkflowEnabled, false);
  for (const name of ['automaticPromotion', 'autoMerge', 'productionAutoPromotion']) assert.throws(() => validatePromotionPolicy({...policy, [name]: true}));
  const event = {repository: {full_name: 'tiecont/virtual-life-platform'}, inputs: {environment: 'staging', release_id: 'fixture', publish_run_id: '123'}}, context = {event: 'workflow_dispatch', repository: 'tiecont/virtual-life-platform', ref: 'refs/heads/main', revision};
  assert.equal(validatePromotionEvent(event, context).publisherRunId, 123);
  for (const patch of [{event: 'pull_request'}, {ref: 'refs/heads/feature'}, {repository: 'attacker/fork'}, {revision: 'main'}]) assert.throws(() => validatePromotionEvent(event, {...context, ...patch}));
  const run = {id: 123, repository: event.repository, head_repository: event.repository, path: '.github/workflows/publish.yml', name: 'Publish verified artifacts', event: 'workflow_run', head_branch: 'main', status: 'completed', conclusion: 'success'}, artifact = {name: 'release-candidate-' + revision + '-2', expired: false};
  assert.equal(authorizePublisher(run, [artifact], 123).source, revision);
  for (const patch of [{path: '.github/workflows/other.yml'}, {event: 'pull_request'}, {conclusion: 'failure'}, {head_repository: {full_name: 'attacker/fork'}}, {id: 124}]) assert.throws(() => authorizePublisher({...run, ...patch}, [artifact], 123));
  for (const artifacts of [[], [artifact, artifact], [{...artifact, expired: true}], [{...artifact, name: 'release-candidate-main-2'}]]) assert.throws(() => authorizePublisher(run, artifacts, 123));
  assert.equal(spawnSync('node', ['scripts/promotion-bot.mjs', 'authorize'], {encoding: 'utf8'}).status, 1, 'Default disabled bot must not request credentials or mutate');
});
test('immutable promotion branches can reuse only the same base/tree/message without force updates', () => {
  const proposal = plan(), branch = promotionBranch(proposal); assert(branch.startsWith('promotion/staging/synthetic-fixture-')); assert(!branch.includes('refs/heads/main'));
  const expected = {baseRevision: revision, tree: 'c'.repeat(40), message: 'Promote staging release fixture'}, commit = {sha: 'd'.repeat(40), tree: {sha: expected.tree}, parents: [{sha: revision}], message: expected.message};
  assert.equal(verifyExistingPromotionHead(commit, expected), commit.sha);
  for (const patch of [{tree: {sha: 'e'.repeat(40)}}, {parents: [{sha: 'f'.repeat(40)}]}, {parents: []}, {message: 'foreign'}]) assert.throws(() => verifyExistingPromotionHead({...commit, ...patch}, expected));
});
test('promotion workflow keeps a manual trusted-main gate and mints a narrow App token only after proof preparation', async () => {
  const workflow = await readFile('.github/workflows/promote.yml', 'utf8'), pins = JSON.parse(await readFile('config/ci-actions.json', 'utf8')); assertPromotionWorkflow(workflow, pins);
  for (const mutate of [text => text.replace('workflow_dispatch:', 'pull_request:'), text => text.replace("github.ref == 'refs/heads/main'", "github.ref == 'refs/heads/feature'"), text => text.replace('packages: read', 'packages: write'), text => text.replace('repositories: virtual-life-platform', 'repositories: another-repo'), text => text.replace('node scripts/promotion-bot.mjs prepare', 'echo PASS'), text => text.replace('secrets.VLP_PROMOTION_APP_PRIVATE_KEY', 'secrets.BROAD_TOKEN'), text => text.replace('permission-contents: write', 'permission-administration: write'), text => text.replace('persist-credentials: false', 'persist-credentials: true'), text => text + '\n  unsafe:\n    permissions: write-all\n']) assert.throws(() => assertPromotionWorkflow(mutate(workflow), pins));
});
test('isolated CLI protocol stand-ins exercise read/write credentials, proof recheck, partial PR failure and immutable branch reuse; no real GitHub request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vlp-bot-protocol-')), bot = resolve('scripts/promotion-bot.mjs');
  try {
    await cp('infra/k8s', join(root, 'infra/k8s'), {recursive: true}); await mkdir(join(root, 'config')); await writeFile(join(root, '.gitignore'), 'artifacts/\n');
    const policy = JSON.parse(await readFile('config/digest-promotion.json', 'utf8')); policy.manualWorkflowEnabled = true; await writeFile(join(root, 'config/digest-promotion.json'), jsonBytes(policy));
    const groups = JSON.parse(await readFile('config/ci-browser-groups.json', 'utf8')); await writeFile(join(root, 'config/ci-browser-groups.json'), jsonBytes(groups));
    const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim(); git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=Synthetic protocol', '-c', 'user.email=fixture@example.invalid', 'commit', '--no-gpg-sign', '-qm', 'Synthetic protocol baseline']); const source = git(['rev-parse', 'HEAD']);
    const candidate = join(root, 'artifacts/promotion-candidate'), bin = join(root, 'artifacts/bin'); await mkdir(candidate, {recursive: true}); await mkdir(bin);
    for (const name of ['gh', 'docker']) await writeFile(join(bin, name), promotionApiFixture, {mode: 0o700});
    const m = manifest(); m.source.revision = source;
    const save = async (file, value) => {const bytes = jsonBytes(value); await writeFile(join(candidate, file), bytes); return {file, sha256: hash(bytes)};};
    const names = ['change-plan', 'core-checks', 'runtime-images', 'quality', ...Object.keys(groups.groups).map(group => 'browser (' + group + ')')];
    const proof = {repository: m.source.repository, workflow: m.quality.workflow, sourceRevision: source, runId: 123, runAttempt: 2, event: 'push', branch: 'main', jobs: names}; m.evidence.quality = await save('quality-proof.json', proof);
    m.evidence.imageChecks = await save('image-checks.json', {sourceRevision: source, result: 'PASS', apiScenarios: 6, webScenarios: 6, cleanupComplete: true, images: {api: m.artifacts.api.localImageId, web: m.artifacts.web.localImageId}});
    for (const target of ['api', 'web']) {const artifact = m.artifacts[target]; artifact.sbom = await save(target + '-sbom.cdx.json', {bomFormat: 'CycloneDX', components: [{name: 'SYNTHETIC_PROTOCOL_ONLY'}]}); artifact.provenance = await save(target + '-provenance.json', {_type: 'https://in-toto.io/Statement/v1', subject: [{name: artifact.image.split('@')[0], digest: {sha256: h}}], predicateType: 'https://github.com/tiecont/virtual-life-platform/provenance/v1', predicate: {source: m.source, quality: m.quality, compatibility: m.compatibility, imageId: artifact.localImageId, sbomSha256: artifact.sbom.sha256, checksSha256: m.evidence.imageChecks.sha256, signed: false}});}
    await save('release.json', m);
    const publisher = {id: 456, repository: {full_name: m.source.repository}, head_repository: {full_name: m.source.repository}, path: '.github/workflows/publish.yml', name: 'Publish verified artifacts', event: 'workflow_run', head_branch: 'main', status: 'completed', conclusion: 'success'};
    const qualityRun = {id: 123, run_attempt: 2, repository: publisher.repository, head_repository: publisher.repository, path: '.github/workflows/quality.yml', name: 'Quality', event: 'push', head_branch: 'main', head_sha: source, status: 'completed', conclusion: 'success'};
    const stateFile = join(root, 'artifacts/api-state.json'); const initial = {revision: source, manifest: m, candidate, publisher, qualityRun, jobs: names.map(name => ({name, status: 'completed', conclusion: 'success', head_sha: source})), bundle: {sourceRevision: source, compatibility: m.compatibility, checks: m.evidence.imageChecks, images: Object.fromEntries(['api', 'web'].map(target => [target, {id: m.artifacts[target].localImageId, sbom: m.artifacts[target].sbom}]))}, allowedPaths: [...['release.json', 'quality-proof.json', 'image-checks.json', 'api-sbom.cdx.json', 'api-provenance.json', 'web-sbom.cdx.json', 'web-provenance.json'].map(file => 'releases/protocol-fixture/' + file), 'infra/k8s/overlays/staging/release.json', 'infra/k8s/overlays/staging/kustomization.yaml'].sort(), calls: []}; await writeFile(stateFile, jsonBytes(initial));
    const eventPath = join(root, 'artifacts/event.json'), outputs = join(root, 'artifacts/outputs'); await writeFile(eventPath, jsonBytes({repository: publisher.repository, inputs: {environment: 'staging', release_id: 'protocol-fixture', publish_run_id: '456'}})); await writeFile(outputs, '');
    const env = {...process.env, PATH: bin + ':' + process.env.PATH, GH_TOKEN: 'synthetic-read', PROMOTION_APP_TOKEN: 'synthetic-write', PROMOTION_FIXTURE_STATE: stateFile, VLP_PROMOTION_ENABLED: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: m.source.repository, GITHUB_REF: 'refs/heads/main', GITHUB_SHA: source, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputs, EXPECTED_SOURCE: source, EXPECTED_ATTEMPT: '2'};
    const call = mode => spawnSync('node', [bot, mode], {cwd: root, env, encoding: 'utf8'}), state = async () => JSON.parse(await readFile(stateFile, 'utf8'));
    assert.equal(call('authorize').status, 0); assert.equal(call('prepare').status, 0); const prepared = await readFile(join(root, 'artifacts/promotion-proposal/proposal.json')); env.PROMOTION_PROPOSAL_SHA = hash(prepared);
    assert(!(await state()).calls.some(call => call.role === 'write'), 'No App role before proof preparation');
    let value = await state(); value.mainOverride = 'f'.repeat(40); value.calls = []; await writeFile(stateFile, jsonBytes(value)); assert.equal(call('publish').status, 1); assert(!(await state()).calls.some(call => call.method === 'POST'));
    value = await state(); delete value.mainOverride; value.installationCount = 2; value.calls = []; await writeFile(stateFile, jsonBytes(value)); assert.equal(call('publish').status, 1); assert(!(await state()).calls.some(call => call.method === 'POST'));
    value = await state(); value.installationCount = 1; value.failPrOnce = true; value.calls = []; await writeFile(stateFile, jsonBytes(value)); assert.equal(call('publish').status, 1); assert((await state()).ref); assert(!(await state()).pr);
    const result = call('publish'); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).hostedPrChecks, 'NOT_OBSERVED'); assert.equal(call('publish').status, 0);
    const final = await state(), posts = final.calls.filter(call => call.method === 'POST'); assert.equal(posts.filter(call => call.endpoint.endsWith('/git/refs')).length, 1); assert.equal(posts.filter(call => call.endpoint.endsWith('/git/commits')).length, 1); assert.equal(posts.filter(call => call.endpoint.endsWith('/pulls')).length, 2, 'One controlled failure and one draft creation');
    assert(posts.every(call => call.role === 'write')); assert(!final.calls.some(call => ['PUT', 'PATCH', 'DELETE'].includes(call.method))); assert(final.calls.filter(call => call.tool === 'docker').every(call => call.role === 'read')); assert.equal(git(['status', '--porcelain']), '');
    const firstWrite = final.calls.findIndex(call => call.method === 'POST'); assert(firstWrite > final.calls.findIndex(call => call.operation === 'metadata-download'), 'Fresh proof precedes every Git mutation sequence');
  } finally {await rm(root, {recursive: true, force: true});}
});
