import {readFileSync} from 'node:fs';
import {EnvironmentSafetyPolicySchema} from '@virtual-city/contracts';
import {RuntimeWorldPolicySchema,safetyPolicyDigest,type ReleasePolicy,type ReleaseEnvironment} from '../../apps/platform-api/src/config/release-policy';

// Synthetic policy references only; never real owner/operator/public approval.
export function releasePolicyFixture(environment:ReleaseEnvironment='production'){
 const release=JSON.parse(readFileSync('config/release-policy.json','utf8')) as ReleasePolicy;
 const safety=EnvironmentSafetyPolicySchema.parse(JSON.parse(readFileSync('config/safety-policy-v2.example.json','utf8')));
 safety.approval={publicRelease:environment==='production',operatorCoverageApproved:true,retentionReviewed:true};
 safety.escalation={operator:'secret:synthetic-operator',safetyLead:'secret:synthetic-operator',privacyOwner:'secret:synthetic-operator',automaticExternalMessages:false};
 safety.appeals.contact='https://synthetic.example.invalid/appeals';
 release.environment=environment;release.operator.subjectRef='secret:synthetic-operator';
 release.approvals={ownerRelease:'evidence:synthetic-only',safetyPrivacy:'evidence:synthetic-only',contentRights:'evidence:synthetic-only',operatorSecurity:'evidence:synthetic-only',backupMonitoring:'evidence:synthetic-only'};
 release.capabilities.confidentialReports=true;release.capabilities.quickInteractions=true;release.safetyPolicySha256=safetyPolicyDigest(safety);
 for(const slug of ['deadline','maid'] as const){release.worlds[slug].install=true;release.worlds[slug].entitled=true;}
 const runtime=RuntimeWorldPolicySchema.parse(JSON.parse(readFileSync('config/runtime-world-policy.json','utf8')));runtime.environment=environment;runtime.maintenance=false;runtime.quickInteractions=true;runtime.worlds.deadline=true;runtime.worlds.maid=true;
 return {release,safety,runtime};
}
