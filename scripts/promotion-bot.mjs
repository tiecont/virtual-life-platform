import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {repository, shaPattern, githubJson} from './artifact-policy.mjs';
import {hash, jsonBytes, keys} from './release-manifest.mjs';
import {assertPromotionPaths, promotionTarget} from './promotion-contract.mjs';
import {promotionProposal, promotionDiff} from './promotion-proposal.mjs';

export function validatePromotionPolicy(policy) {
  keys(policy, 'schemaVersion,repository,branch,manualWorkflowEnabled,automaticPromotion,autoMerge,productionAutoPromotion,ownerReviewRequired');
  assert.equal(policy.schemaVersion, 1); assert.equal(policy.repository, repository); assert.equal(policy.branch, 'main'); assert.equal(typeof policy.manualWorkflowEnabled, 'boolean');
  for (const key of ['automaticPromotion', 'autoMerge', 'productionAutoPromotion']) assert.equal(policy[key], false); assert.equal(policy.ownerReviewRequired, true); return policy;
}
export function validatePromotionEvent(event, context) {
  assert.equal(context.event, 'workflow_dispatch'); assert.equal(context.repository, repository); assert.equal(context.ref, 'refs/heads/main'); assert(shaPattern.test(context.revision)); assert.equal(event.repository?.full_name, repository);
  const {environment, release_id: releaseId, publish_run_id: run} = event.inputs ?? {}; promotionTarget(environment, releaseId); assert(typeof run === 'string' && /^[1-9][0-9]{0,15}$/.test(run)); const runId = Number(run); assert(Number.isSafeInteger(runId));
  return {environment, releaseId, publisherRunId: runId, baseRevision: context.revision};
}
export function authorizePublisher(run, artifacts, id) {
  assert.equal(run.id, id); assert.equal(run.repository?.full_name, repository); assert.equal(run.head_repository?.full_name, repository); assert.equal(run.path, '.github/workflows/publish.yml'); assert.equal(run.name, 'Publish verified artifacts');
  assert.equal(run.event, 'workflow_run'); assert.equal(run.head_branch, 'main'); assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success');
  assert(Array.isArray(artifacts)); const candidates = artifacts.filter(artifact => /^release-candidate-[a-f0-9]{40}-[1-9][0-9]*$/.test(artifact.name)); assert.equal(candidates.length, 1); const artifact = candidates[0]; assert.equal(artifact.expired, false);
  const [, source, attempt] = /^release-candidate-([a-f0-9]{40})-([1-9][0-9]*)$/.exec(artifact.name); assert(Number.isSafeInteger(Number(attempt)));
  return {artifact: artifact.name, source, attempt: Number(attempt), publisherRunId: id};
}
export function promotionBranch(plan) {promotionTarget(plan.environment, plan.releaseId); assert(/^[a-f0-9]{64}$/.test(plan.binding.manifestSha256)); return 'promotion/' + plan.environment + '/' + plan.releaseId + '-' + plan.binding.manifestSha256;}
export function verifyExistingPromotionHead(commit, {baseRevision, tree, message}) {
  assert(shaPattern.test(commit.sha)); assert.equal(commit.tree.sha, tree); assert.equal(commit.parents.length, 1); assert.equal(commit.parents[0].sha, baseRevision); assert.equal(commit.message, message); return commit.sha;
}
async function activation() {
  const policy = validatePromotionPolicy(JSON.parse(await readFile('config/digest-promotion.json', 'utf8')));
  assert(policy.manualWorkflowEnabled && process.env.VLP_PROMOTION_ENABLED === 'true', 'Manual promotion workflow disabled');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const input = validatePromotionEvent(event, {event: process.env.GITHUB_EVENT_NAME, repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, revision: process.env.GITHUB_SHA});
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), input.baseRevision); return input;
}
async function outputs(fields) {
  assert(process.env.GITHUB_OUTPUT); const text = Object.entries(fields).map(([key, value]) => {assert(/^[a-z_]+$/.test(key) && /^[A-Za-z0-9./_-]+$/.test(String(value))); return key + '=' + value + '\n';}).join(''); await appendFile(process.env.GITHUB_OUTPUT, text);
}
async function prepare(input) {
  const proposal = await promotionProposal({mode: 'verify', environment: input.environment, releaseId: input.releaseId, candidate: 'artifacts/promotion-candidate'});
  assert.equal(proposal.baseRevision, input.baseRevision); assert.equal(proposal.binding.sourceRevision, process.env.EXPECTED_SOURCE); assert.equal(proposal.binding.quality.runAttempt, Number(process.env.EXPECTED_ATTEMPT)); return proposal;
}
async function appApi(path, method = 'GET', payload, optional = false) {
  assert(process.env.PROMOTION_APP_TOKEN, 'Explicit installation token required');
  const prefix = 'repos/' + repository + '/';
  assert(path === 'installation/repositories' && method === 'GET' || path.startsWith(prefix) && (method === 'GET' || method === 'POST' && ['git/trees', 'git/commits', 'git/refs', 'pulls'].includes(path.slice(prefix.length))), 'GitHub mutation endpoint not allowlisted');
  const env = {...process.env, GH_TOKEN: process.env.PROMOTION_APP_TOKEN}, args = ['api', path, '--method', method]; let temporary;
  try {
    if (payload !== undefined) {await mkdir('artifacts/promotion-api', {recursive: true, mode: 0o700}); temporary = await mkdtemp('artifacts/promotion-api/input-'); const file = join(temporary, 'body.json'); await writeFile(file, jsonBytes(payload), {mode: 0o600}); args.push('--input', file);}
    return JSON.parse(execFileSync('gh', args, {env, encoding: 'utf8', timeout: 30000, maxBuffer: 20 * 1024 ** 2, stdio: ['ignore', 'pipe', 'pipe']}));
  } catch (error) {let body; try {body = JSON.parse(String(error.stdout));} catch { /* No raw token/provider errors emitted. */ } if (optional && method === 'GET' && String(body?.status) === '404') return null; throw Error('GitHub promotion operation failed');}
  finally {if (temporary) await rm(temporary, {recursive: true, force: true});}
}
async function publish(input) {
  const bytes = await readFile('artifacts/promotion-proposal/proposal.json'); assert.equal(hash(bytes), process.env.PROMOTION_PROPOSAL_SHA);
  const plan = JSON.parse(bytes.toString()), actual = await prepare(input); assert.deepEqual(actual, plan, 'Proposal/source/proof changed before Git mutation'); assert(plan.changed && plan.remoteEvidenceVerified); assertPromotionPaths(plan.edits.map(edit => edit.path), plan.environment, plan.releaseId);
  // Read credentials and write credentials stay separate. The App token is
  // restricted to one installation repository and contents/PR permissions.
  const installation = await appApi('installation/repositories'); assert.equal(installation.total_count, 1); assert.equal(installation.repositories.length, 1); assert.equal(installation.repositories[0].full_name, repository);
  const main = githubJson('repos/' + repository + '/branches/main'); assert.equal(main.commit.sha, plan.baseRevision, 'Main advanced; regenerate the proposal');
  const base = githubJson('repos/' + repository + '/git/commits/' + plan.baseRevision); assert.equal(base.sha, plan.baseRevision); assert(shaPattern.test(base.tree.sha));
  const entries = plan.edits.map(edit => {assert.equal(hash(edit.content), edit.afterSha256); return {path: edit.path, mode: '100644', type: 'blob', content: edit.content};});
  assert(Buffer.byteLength(JSON.stringify(entries)) <= 16 * 1024 ** 2);
  const tree = await appApi('repos/' + repository + '/git/trees', 'POST', {base_tree: base.tree.sha, tree: entries}); assert(shaPattern.test(tree.sha));
  const branch = promotionBranch(plan), message = 'Promote ' + plan.environment + ' release ' + plan.releaseId, refPath = 'repos/' + repository + '/git/ref/heads/' + branch;
  const existing = await appApi(refPath, 'GET', undefined, true); let head;
  if (existing) head = verifyExistingPromotionHead(await appApi('repos/' + repository + '/git/commits/' + existing.object.sha), {baseRevision: plan.baseRevision, tree: tree.sha, message});
  else {
    const commit = await appApi('repos/' + repository + '/git/commits', 'POST', {message, tree: tree.sha, parents: [plan.baseRevision]}); assert(shaPattern.test(commit.sha)); head = commit.sha;
    await appApi('repos/' + repository + '/git/refs', 'POST', {ref: 'refs/heads/' + branch, sha: head});
  }
  const prs = await appApi('repos/' + repository + '/pulls?state=open&base=main&head=' + encodeURIComponent('tiecont:' + branch)); assert(Array.isArray(prs) && prs.length <= 1);
  let pr = prs[0];
  if (!pr) pr = await appApi('repos/' + repository + '/pulls', 'POST', {title: message, base: 'main', head: branch, draft: true, body: 'Proposes the same proof-checked immutable release set.\n\nSource: ' + plan.binding.sourceRevision + '\nQuality run: ' + plan.binding.quality.runId + '/' + plan.binding.quality.runAttempt + '\nAPI: ' + plan.binding.images.api + '\nWeb: ' + plan.binding.images.web + '\n\nRequired Quality must run and pass on this bot PR. Owner review remains required; no auto-merge, cluster operation or production/public authorization. Review vulnerability status, current target prerequisites, compatibility and actual staging evidence before any production promotion.'});
  assert.equal(pr.base.ref, 'main'); assert.equal(pr.head.ref, branch); assert.equal(pr.head.sha, head); assert.equal(pr.draft, true); assert.equal(pr.user.type, 'Bot'); assert(/^[A-Za-z0-9][A-Za-z0-9-]{0,99}\[bot\]$/.test(pr.user.login)); assert(/^https:\/\/github\.com\/tiecont\/virtual-life-platform\/pull\/[1-9][0-9]*$/.test(pr.html_url));
  return {result: 'DRAFT_PR_CREATED_OR_REUSED', url: pr.html_url, sourceRevision: head, botLogin: pr.user.login, hostedPrChecks: 'NOT_OBSERVED', autoMerge: false, deploymentAuthorized: false};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert(process.argv.length === 3); const mode = process.argv[2]; assert(['authorize', 'prepare', 'publish'].includes(mode)); const input = await activation();
    if (mode === 'authorize') {
      const run = githubJson('repos/' + repository + '/actions/runs/' + input.publisherRunId), artifacts = githubJson('repos/' + repository + '/actions/runs/' + input.publisherRunId + '/artifacts?per_page=100');
      assert(artifacts.total_count <= 100); const authorized = authorizePublisher(run, artifacts.artifacts, input.publisherRunId); await outputs({promotion: true, artifact: authorized.artifact, source: authorized.source, attempt: authorized.attempt, publisher_run: authorized.publisherRunId});
    } else if (mode === 'prepare') {
      const plan = await prepare(input); await mkdir('artifacts/promotion-proposal', {mode: 0o700}); const bytes = jsonBytes(plan); await writeFile('artifacts/promotion-proposal/proposal.json', bytes, {flag: 'wx', mode: 0o600}); await writeFile('artifacts/promotion-proposal/proposal.diff', promotionDiff(plan), {flag: 'wx', mode: 0o600}); await outputs({changed: plan.changed, sha: hash(bytes)});
    } else console.log(JSON.stringify(await publish(input)));
  } catch {console.error('Promotion bot rejected: manual activation, exact trusted context, immutable remote proof and scoped App credentials are required. No merge/deployment operation is supported.'); process.exitCode = 1;}
}
