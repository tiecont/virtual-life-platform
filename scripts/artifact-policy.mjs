import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {releaseTargets} from './artifact-targets.mjs';

export const repository = 'tiecont/virtual-life-platform';
export const qualityWorkflow = '.github/workflows/quality.yml';
export const shaPattern = /^[a-f0-9]{40}$/;
export const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function validateArtifactPolicy(value) {
  assert.deepEqual(Object.keys(value).sort(), ['autoMerge', 'branch', 'candidate', 'images', 'ownerPromotionRequired', 'productionAutoPromotion', 'publishEnabled', 'qualityWorkflow', 'repository', 'schemaVersion'].sort());
  const targets=releaseTargets(value.schemaVersion); assert.equal(value.repository, repository);
  assert.equal(value.branch, 'main'); assert.equal(value.qualityWorkflow, qualityWorkflow);
  assert.equal(typeof value.publishEnabled, 'boolean');
  assert.equal(value.autoMerge, false); assert.equal(value.productionAutoPromotion, false); assert.equal(value.ownerPromotionRequired, true);
  assert.deepEqual(value.images,Object.fromEntries(targets.map(target=>[target,'ghcr.io/tiecont/vlp-'+target])));
  assert(value.candidate === null || /^releases\/[a-z0-9-]+$/.test(value.candidate));
  return value;
}
export async function artifactPolicy() {return validateArtifactPolicy(JSON.parse(await readFile('config/artifact-release.json', 'utf8')));}

// Unknown paths rebuild every artifact. Only inert documentation and deployment metadata skip images.
export function imageChanges(files) {
  assert(Array.isArray(files) && files.length > 0 && files.length <= 100000);
  for (const file of files) assert(typeof file === 'string' && file && !file.startsWith('/') && !file.split('/').some(part => part === '..' || part === '.') && !file.includes('\n'));
  return files.some(file => !(/^(?:docs\/|plans\/|[^/]+\.md$)/.test(file) && /\.(?:md|json|svg|png|webp)$/.test(file)) && !(/^(?:infra\/(?:k8s|argocd)\/|releases\/)/.test(file) && /\.(?:yaml|yml|json)$/.test(file)));
}

export function artifactCiResult(needs) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs) || Object.keys(needs).sort().join(',') !== 'browser,core,images,plan') return false;
  if (!['plan', 'core', 'browser'].every(job => needs[job]?.result === 'success')) return false;
  const images = needs.plan.outputs?.images;
  return images === 'true' ? needs.images?.result === 'success' : images === 'false' && needs.images?.result === 'skipped';
}

export function trustedRun(run, jobs, groups, {allowNoImages = false} = {}) {
  assert(run && run.repository?.full_name === repository && run.head_repository?.full_name === repository);
  assert.equal(run.path, qualityWorkflow); assert.equal(run.name, 'Quality');
  assert.equal(run.event, 'push'); assert.equal(run.head_branch, 'main'); assert(shaPattern.test(run.head_sha));
  assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success');
  assert(Number.isSafeInteger(run.id) && run.id > 0 && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  const names = ['change-plan', 'core-checks', 'runtime-images', 'quality', ...groups.map(group => 'browser (' + group + ')')];
  assert(Array.isArray(jobs));
  for (const name of names) {
    const matches = jobs.filter(job => job.name === name);
    assert.equal(matches.length, 1, 'Missing/duplicate required job: ' + name);
    assert.equal(matches[0].status, 'completed');
    if (name === 'runtime-images' && allowNoImages && matches[0].conclusion === 'skipped') continue;
    assert.equal(matches[0].conclusion, 'success');
    assert.equal(matches[0].head_sha, run.head_sha, 'Job source mismatch');
  }
  return {repository, workflow: qualityWorkflow, sourceRevision: run.head_sha, runId: run.id, runAttempt: run.run_attempt, event: 'push', branch: 'main', jobs: names};
}

export function githubJson(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}));
}
export async function hostedProof(runId, attempt, options = {}) {
  assert(Number.isSafeInteger(runId) && runId > 0 && Number.isSafeInteger(attempt) && attempt > 0);
  const run = githubJson('repos/' + repository + '/actions/runs/' + runId + '/attempts/' + attempt);
  const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', 'repos/' + repository + '/actions/runs/' + runId + '/attempts/' + attempt + '/jobs?per_page=100'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}));
  const plan = JSON.parse(await readFile('config/ci-browser-groups.json', 'utf8'));
  const jobs = pages.flatMap(page => page.jobs), proof = trustedRun(run, jobs, Object.keys(plan.groups), options);
  return options.allowNoImages && jobs.find(job => job.name === 'runtime-images')?.conclusion === 'skipped' ? null : proof;
}
