import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatingPolicySchema,SafetyPolicySchema } from '@virtual-city/contracts';
async function main(){
const policy=DatingPolicySchema.parse(JSON.parse(await readFile('config/dating-policy.json','utf8'))),safety=SafetyPolicySchema.parse(JSON.parse(await readFile('config/safety-policy.json','utf8'))),rollout=JSON.parse(await readFile('config/rollout.json','utf8'));
assert.equal(rollout.publicRelease,false);assert.equal(rollout.worlds.dating.enabled,false);assert.equal(rollout.worlds.dating.requiresReviewedAdultVerification,true);assert.equal(rollout.worlds.dating.globallyDiscoverable,false);
assert.equal(safety.contexts.dating.reviewedAdultRequired,true);assert.equal(safety.contexts.dating.liveOperatorRequired,true);assert.equal(safety.contexts.dating.discloseActivity,false);assert.equal(safety.contexts.dating.audience,'isolated-session');
assert.equal(policy.draftRetentionHours.reportEvidenceOwner,'platform.safety');
// The synthetic profile uses fixed reviewed-in-code defaults,not hot-reloaded
// operational retention. Reject draft drift until implementation/review changes.
assert.equal(policy.eligibility.maxProofAgeSeconds,86400);
assert.equal(policy.draftRetentionHours.inactiveProfile,720);
assert.equal(policy.draftRetentionHours.eligibilityMetadata,24);
assert.equal(policy.draftRetentionHours.mutationReceipts,24);
assert.equal(policy.draftRetentionHours.negativeConsent,2160);
console.log(JSON.stringify({task:'M20-01',policy:policy.version,state:policy.state,approvalState:policy.approvals,verificationProvider:policy.eligibility.provider,scope:'Strict definition/gate consistency only;does not verify private runtime,real eligibility,operator signoff or public/pilot approval'},null,2));
}
void main().catch(()=>{console.error('Dating draft policy or release/safety gate is inconsistent');process.exitCode=1;});
