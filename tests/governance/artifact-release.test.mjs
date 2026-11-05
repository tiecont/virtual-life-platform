import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {artifactCiResult, imageChanges, qualityWorkflow, repository, trustedRun, validateArtifactPolicy} from '../../scripts/artifact-policy.mjs';
import {checkManifest, hash, jsonBytes, validateManifest} from '../../scripts/release-manifest.mjs';
import {assertArtifactWorkflows} from '../../scripts/verify-artifact-workflows.mjs';

test('source/shared dependency/lock/unknown changes build every artifact; inert docs and overlay-only changes do not publish', () => {
  for (const files of [['apps/portal-web/app/page.tsx'], ['apps/platform-api/src/main.ts'], ['packages/contracts/src/index.ts'], ['packages/config/tsconfig.json'], ['pnpm-lock.yaml'], ['.github/workflows/quality.yml'], ['unknown-file'], ['docs/plans/platform-vnext/tools/validate-plan.mjs'], ['docs/README.md', 'packages/ui/tokens.css']]) assert.equal(imageChanges(files), true);
  for (const files of [['README.md'], ['docs/operations/WEB-IMAGE.md'], ['docs/evidence/result.json'], ['infra/k8s/overlays/staging/kustomization.yaml'], ['infra/argocd/application.yaml', 'releases/candidate/release.json']]) assert.equal(imageChanges(files), false);
  for (const files of [[], ['../secret'], ['/tmp/file'], ['docs/../script.mjs'], ['one\ntwo']]) assert.throws(() => imageChanges(files));
});

test('real Git PR/push event planning handles source/shared/lock/docs/overlay diffs and unknown bases without suppressing the aggregate', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'vlp-ci-event-')), repo = join(temporary, 'repo');
  try {
    await mkdir(join(repo, 'config'), {recursive: true}); await writeFile(join(repo, 'config/artifact-release.json'), await readFile('config/artifact-release.json'));
    const git = args => execFileSync('git', args, {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=CI fixture', '-c', 'user.email=ci-fixture@example.invalid', 'commit', '--no-gpg-sign', '-qm', 'fixture baseline']);
    const eventPath = join(temporary, 'event.json');
    for (const [file, expected] of [['apps/portal-web/app/page.tsx', true], ['packages/contracts/src/index.ts', true], ['pnpm-lock.yaml', true], ['docs/guide.md', false], ['infra/k8s/overlays/staging/kustomization.yaml', false], ['infra/k8s/tool.mjs', true]]) {
      const before = git(['rev-parse', 'HEAD']).trim(); await mkdir(dirname(join(repo, file)), {recursive: true}); await writeFile(join(repo, file), 'fixture\n'); git(['add', '.']); git(['-c', 'user.name=CI fixture', '-c', 'user.email=ci-fixture@example.invalid', 'commit', '--no-gpg-sign', '-qm', 'fixture change']);
      for (const name of ['pull_request', 'push']) {
        await writeFile(eventPath, JSON.stringify({before, pull_request: {base: {sha: before}}}));
        const result = execFileSync('node', [resolve('scripts/artifact-plan.mjs')], {cwd: repo, env: {...process.env, GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: eventPath}, encoding: 'utf8'});
        assert(result.includes('images=' + expected + '\n'));
      }
    }
    await writeFile(eventPath, JSON.stringify({before: '0'.repeat(40)}));
    assert(execFileSync('node', [resolve('scripts/artifact-plan.mjs')], {cwd: repo, env: {...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventPath}, encoding: 'utf8'}).includes('images=true'));
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('required aggregate accepts only the planned image outcome and fails every missing, cancelled, failed or unexpected skip', () => {
  const needs = images => ({plan: {result: 'success', outputs: {images}}, core: {result: 'success'}, browser: {result: 'success'}, images: {result: images === 'true' ? 'success' : 'skipped'}});
  for (const required of ['true', 'false']) {
    assert.equal(artifactCiResult(needs(required)), true);
    for (const job of ['plan', 'core', 'browser', 'images']) for (const result of ['failure', 'cancelled', 'skipped', 'success', 'unknown']) {
      const copy = needs(required); copy[job].result = result;
      assert.equal(artifactCiResult(copy), result === needs(required)[job].result);
    }
  }
  for (const value of [null, [], {}, {...needs('true'), extra: {result: 'success'}}, needs(''), needs(true)]) assert.equal(artifactCiResult(value), false);
  const child = spawnSync('node', ['scripts/artifact-gate.mjs'], {env: {...process.env, CI_NEEDS_JSON: JSON.stringify(needs('false'))}}); assert.equal(child.status, 0);
  assert.equal(spawnSync('node', ['scripts/artifact-gate.mjs'], {env: {...process.env, CI_NEEDS_JSON: '{}'}}).status, 1);
});

test('trusted-main proof rejects forks, PRs, wrong workflow/branch/SHA, partial jobs and failed runs; docs skip cannot mint a release proof', () => {
  const revision = 'a'.repeat(40), groups = ['one', 'two'];
  const run = {repository: {full_name: repository}, head_repository: {full_name: repository}, path: qualityWorkflow, name: 'Quality', event: 'push', head_branch: 'main', head_sha: revision, status: 'completed', conclusion: 'success', id: 123, run_attempt: 2};
  const jobs = ['change-plan', 'core-checks', 'runtime-images', 'quality', ...groups.map(group => 'browser (' + group + ')')].map(name => ({name, status: 'completed', conclusion: 'success', head_sha: revision}));
  assert.equal(trustedRun(run, jobs, groups).sourceRevision, revision);
  for (const mutation of [r => r.repository.full_name = 'foreign/repo', r => r.head_repository.full_name = 'attacker/fork', r => r.path = '.github/workflows/other.yml', r => r.event = 'pull_request', r => r.head_branch = 'feature', r => r.head_sha = 'main', r => r.conclusion = 'failure', r => r.status = 'in_progress', r => r.run_attempt = 0]) {const copy = globalThis.structuredClone(run); mutation(copy); assert.throws(() => trustedRun(copy, jobs, groups));}
  for (const mutation of [j => j.pop(), j => j.push({...j[0]}), j => j[1].head_sha = 'b'.repeat(40), j => j[4].conclusion = 'cancelled', j => j[2].conclusion = 'skipped']) {const copy = globalThis.structuredClone(jobs); mutation(copy); assert.throws(() => trustedRun(run, copy, groups));}
});

test('workflow and policy retain read-only PR/security lanes and grant only bounded same-repository main publishing', async () => {
  const quality = await readFile('.github/workflows/quality.yml', 'utf8'), publish = await readFile('.github/workflows/publish.yml', 'utf8'), pins = JSON.parse(await readFile('config/ci-actions.json', 'utf8'));
  assertArtifactWorkflows(quality, publish, pins);
  for (const mutation of [p => p.replace("github.event.workflow_run.event == 'push'", "github.event.workflow_run.event == 'pull_request'"), p => p.replace('head_repository.full_name == github.repository', 'head_repository.full_name != github.repository'), p => p.replace('packages: write', 'contents: write'), p => p.replace('node scripts/release-publish.mjs authorize', 'echo approved'), p => p + '\n  other:\n    permissions: write-all\n', p => p.replace('run-id: ${{ github.event.workflow_run.id }}', 'run-id: 123')]) assert.throws(() => assertArtifactWorkflows(quality, mutation(publish), pins));
  const policy = JSON.parse(await readFile('config/artifact-release.json', 'utf8')); validateArtifactPolicy(policy);
  for (const field of ['autoMerge', 'productionAutoPromotion']) assert.throws(() => validateArtifactPolicy({...policy, [field]: true}));
  // The historical security suite remains part of the complete integration project.
  const vitest = await readFile('vitest.config.mts', 'utf8'); assert(vitest.includes('integration')); assert(quality.includes('pnpm check'));
  assert.equal(spawnSync('node', ['scripts/release-publish.mjs', 'authorize'], {env: {...process.env, GITHUB_EVENT_NAME: 'pull_request'}}).status, 1);
});

test('manifest binds immutable image/source/run, checks, package SBOM and unsigned digest provenance; corrupt/foreign/symlink evidence fails closed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vlp-manifest-'));
  try {
    const revision = 'a'.repeat(40), id = 'sha256:' + 'b'.repeat(64), digest = 'c'.repeat(64);
    const save = async (file, value) => {const bytes = jsonBytes(value); await writeFile(join(directory, file), bytes); return {file, sha256: hash(bytes)};};
    const source = {repository, revision}, quality = {runId: 123, runAttempt: 2, workflow: qualityWorkflow, event: 'push', branch: 'main'};
    const compatibility = {protocol: {minimum: 1, current: 1, maximum: 1}, schema: {metadataVersion: 1, minimumMigrations: 38, maximumMigrations: 38, manifestSha256: digest, policySha256: digest}, assets: {manifestSha256: digest}};
    const manifest = {schemaVersion: 1, kind: 'vlp-release-candidate', source, quality, artifacts: {}, compatibility, promotion: {autoMerge: false, productionAutoPromotion: false, ownerRequired: true, publicRelease: false}, evidence: {quality: await save('quality-proof.json', {...quality, sourceRevision: revision, repository}), imageChecks: await save('image-checks.json', {sourceRevision: revision, result: 'PASS', apiScenarios: 6, webScenarios: 6, cleanupComplete: true, images: {api: id, web: id}})}, vulnerabilities: {status: 'NOT_RUN', promotionRequiresReview: true}};
    for (const target of ['api', 'web']) {
      const name = 'ghcr.io/tiecont/vlp-' + target, sbom = await save(target + '-sbom.cdx.json', {bomFormat: 'CycloneDX', components: [{name: 'synthetic-fixture'}]});
      const provenance = await save(target + '-provenance.json', {_type: 'https://in-toto.io/Statement/v1', subject: [{name, digest: {sha256: digest}}], predicateType: 'https://github.com/tiecont/virtual-life-platform/provenance/v1', predicate: {source, quality, compatibility, imageId: id, sbomSha256: sbom.sha256, checksSha256: manifest.evidence.imageChecks.sha256, signed: false}});
      manifest.artifacts[target] = {image: name + '@sha256:' + digest, localImageId: id, sbom, provenance};
    }
    const reset = () => writeFile(join(directory, 'release.json'), jsonBytes(manifest)); await reset();
    assert.equal((await checkManifest(directory)).hostedChecksVerified, false);
    for (const mutation of [m => m.source.revision = 'main', m => m.artifacts.api.image = 'ghcr.io/tiecont/vlp-api:latest', m => m.artifacts.api.image = 'ghcr.io/foreign/image@sha256:' + digest, m => m.quality.runId = 0, m => m.promotion.autoMerge = true, m => m.compatibility.protocol.minimum = 2, m => m.compatibility.schema.minimumMigrations = 39, m => m.evidence.quality.file = '../quality-proof.json', m => m.artifacts.web.localImageId = 'sha256:' + 'd'.repeat(64)]) {
      const copy = globalThis.structuredClone(manifest); mutation(copy); await writeFile(join(directory, 'release.json'), jsonBytes(copy)); await assert.rejects(() => checkManifest(directory));
    }
    await reset(); await writeFile(join(directory, 'web-sbom.cdx.json'), '{}'); await assert.rejects(() => checkManifest(directory));
    await rm(join(directory, 'web-sbom.cdx.json')); await symlink(join(directory, 'api-sbom.cdx.json'), join(directory, 'web-sbom.cdx.json')); await assert.rejects(() => checkManifest(directory));
    const local = globalThis.structuredClone(manifest); local.kind = 'local-registry-rehearsal'; assert.throws(() => validateManifest(local));
    assert.equal(execFileSync('node', ['scripts/release-manifest.mjs'], {encoding: 'utf8'}).includes('NOT_REQUESTED'), true);
    const overlayRoot = join(directory, 'overlay-repo'); await mkdir(join(overlayRoot, 'config'), {recursive: true}); await mkdir(join(overlayRoot, 'releases/bad'), {recursive: true});
    await writeFile(join(overlayRoot, 'config/artifact-release.json'), await readFile('config/artifact-release.json')); await writeFile(join(overlayRoot, 'releases/bad/release.json'), '{}');
    assert.equal(spawnSync('node', [resolve('scripts/release-manifest.mjs')], {cwd: overlayRoot}).status, 1, 'Unselected committed release metadata must still be validated');
  } finally {await rm(directory, {recursive: true, force: true});}
});
