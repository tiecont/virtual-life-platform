import {execFileSync} from 'node:child_process';
import {artifactPolicy, repository} from './artifact-policy.mjs';

const policy = await artifactPolicy();
function query(path, select) {
  try {return {status: 'AVAILABLE', value: select(JSON.parse(execFileSync('gh', ['api', 'repos/' + repository + path], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})))};}
  catch (error) {
    let body; try {body = JSON.parse(String(error.stdout));} catch { /* Non-JSON errors remain unknown. */ }
    return {status: body?.status === '403' ? 'UNAVAILABLE_403' : body?.status === '404' ? 'ABSENT_404' : 'UNKNOWN', httpStatus: body?.status ?? null};
  }
}
const repo = query('', value => ({private: value.private, defaultBranch: value.default_branch, allowAutoMerge: value.allow_auto_merge}));
const branch = query('/branches/main', value => ({sourceRevision: value.commit.sha, protected: value.protected, checks: value.protection?.required_status_checks?.contexts ?? []}));
const rulesets = query('/rulesets', value => value.map(rule => ({id: rule.id, enforcement: rule.enforcement})));
const protection = query('/branches/main/protection', value => ({requiredChecks: value.required_status_checks?.contexts ?? [], enforceAdmins: value.enforce_admins?.enabled ?? false}));
const publishVariable = query('/actions/variables/VLP_PUBLISH_ENABLED', value => ({enabled: value.value === 'true'}));
const observedTechnicalProtection = branch.value?.protected === true && protection.status === 'AVAILABLE' && protection.value.requiredChecks.includes('quality');
const result = {observedAt: new Date().toISOString(), repository, repo, branch, rulesets, protection, publishVariable, committedPublishEnabled: policy.publishEnabled, observedTechnicalProtection, requiredCheck: 'quality', policy: {autoMerge: policy.autoMerge, productionAutoPromotion: policy.productionAutoPromotion, ownerPromotionRequired: policy.ownerPromotionRequired}, fallback: 'Owner verifies exact source, successful hosted checks, registry digests and staging evidence before promotion; this is not technical branch protection'};
console.log(JSON.stringify(result, null, 2));
if (repo.value?.allowAutoMerge !== false || policy.autoMerge || policy.productionAutoPromotion || !policy.ownerPromotionRequired) process.exitCode = 1;
