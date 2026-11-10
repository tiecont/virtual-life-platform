import {z} from 'zod';
import {createHash} from 'node:crypto';
import {SafetyPolicySchema,type SafetyPolicy} from '@virtual-city/contracts';

export const releaseWorlds=['deadline','maid','library','restaurant','park','lounge','dating'] as const;
export type ReleaseWorld=typeof releaseWorlds[number];
export const ReleaseEnvironmentSchema=z.enum(['development','test','staging','production']);
export type ReleaseEnvironment=z.infer<typeof ReleaseEnvironmentSchema>;
const world=z.object({install:z.boolean(),entitled:z.boolean(),worldVersion:z.string().regex(/^\d+\.\d+\.\d+$/)}).strict();
const worlds=z.object({deadline:world,maid:world,library:world,restaurant:world,park:world,lounge:world,dating:world}).strict();
const switches=z.object({deadline:z.boolean(),maid:z.boolean(),library:z.boolean(),restaurant:z.boolean(),park:z.boolean(),lounge:z.boolean(),dating:z.boolean()}).strict();
const review=z.string().regex(/^evidence:[a-z0-9][a-z0-9._/-]{1,127}$/).refine(value=>!value.split('/').includes('..')).nullable();
export const ReleasePolicySchema=z.object({
 schemaVersion:z.literal(1),version:z.number().int().positive(),environment:ReleaseEnvironmentSchema,worlds,safetyPolicySha256:z.string().regex(/^[a-f0-9]{64}$/),
 capabilities:z.object({confidentialReports:z.boolean(),quickInteractions:z.boolean(),textChat:z.literal(false),liveMedia:z.literal(false)}).strict(),
 operator:z.object({maxPrincipals:z.literal(1),authentication:z.literal('passkey-mfa'),subjectRef:z.string().regex(/^secret:[a-z0-9][a-z0-9-]{1,62}$/).nullable()}).strict(),
 approvals:z.object({ownerRelease:review,safetyPrivacy:review,contentRights:review,operatorSecurity:review,backupMonitoring:review}).strict(),
}).strict();
export const RuntimeWorldPolicySchema=z.object({schemaVersion:z.literal(1),version:z.number().int().positive(),releaseVersion:z.number().int().positive(),environment:ReleaseEnvironmentSchema,maintenance:z.boolean(),quickInteractions:z.boolean(),worlds:switches}).strict();
export type ReleasePolicy=z.infer<typeof ReleasePolicySchema>;
export type RuntimeWorldPolicy=z.infer<typeof RuntimeWorldPolicySchema>;
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,part])=>[key,canonical(part)]));return value;}
export function safetyPolicyDigest(policy:unknown){return createHash('sha256').update(JSON.stringify(canonical(policy))).digest('hex');}
function deny(message:string):never{throw new Error('Release policy denied: '+message);}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const part of Object.values(value))freeze(part);Object.freeze(value);}return value;}
export function parseReleasePolicy(input:unknown,environment:ReleaseEnvironment):ReleasePolicy{
 const parsed=ReleasePolicySchema.safeParse(input);if(!parsed.success)deny('missing or invalid versioned entitlement');const release=parsed.data;
 if(release.environment!==environment)deny('environment mismatch');
 if(release.worlds.dating.install||release.worlds.dating.entitled||release.worlds.lounge.entitled)deny('restricted platform gates remain closed in v1');
 const entitled=releaseWorlds.filter(slug=>release.worlds[slug].entitled);
 if(entitled.some(slug=>!release.worlds[slug].install))deny('entitlement requires installation');
 if(entitled.length&&!release.capabilities.confidentialReports)deny('social worlds require confidential reporting');
 if(release.capabilities.quickInteractions&&!release.capabilities.confidentialReports)deny('communication requires confidential reporting');
 if(release.capabilities.confidentialReports&&['staging','production'].includes(environment)&&(!release.operator.subjectRef||!release.approvals.safetyPrivacy||!release.approvals.operatorSecurity))deny('confidential capability requires safety/operator review');
 if(entitled.length&&environment==='staging'&&(!release.approvals.safetyPrivacy||!release.approvals.contentRights))deny('staging safety/content review required');
 if(entitled.length&&environment==='production'&&(!release.operator.subjectRef||Object.values(release.approvals).some(value=>value===null)))deny('production reviews and single-operator reference required');
 return freeze(release);
}
export function evaluateReleasePolicy(releaseInput:unknown,runtimeInput:unknown,environment:ReleaseEnvironment){
 const release=parseReleasePolicy(releaseInput,environment),parsed=RuntimeWorldPolicySchema.safeParse(runtimeInput);if(!parsed.success)deny('missing or invalid runtime policy');const runtime=parsed.data;
 if(runtime.environment!==environment||runtime.releaseVersion!==release.version)deny('runtime environment/release version mismatch');
 if(releaseWorlds.some(slug=>runtime.worlds[slug]&&!release.worlds[slug].entitled))deny('runtime cannot grant world entitlement');
 if(runtime.quickInteractions&&!release.capabilities.quickInteractions)deny('runtime cannot grant communication entitlement');
 const installedWorlds=releaseWorlds.filter(slug=>release.worlds[slug].install),enabledWorlds=runtime.maintenance?[]:releaseWorlds.filter(slug=>runtime.worlds[slug]);
 const quickWorlds=runtime.quickInteractions?enabledWorlds.filter(slug=>slug==='maid'||slug==='park'):[];
 return freeze({release,runtime:freeze(runtime),installedWorlds,enabledWorlds,quickWorlds});
}
export type EvaluatedReleasePolicy=ReturnType<typeof evaluateReleasePolicy>;
export function assertRuntimeTransition(previous:RuntimeWorldPolicy,next:RuntimeWorldPolicy){
 if(previous.releaseVersion!==next.releaseVersion||previous.environment!==next.environment||next.version<previous.version)deny('stale or mismatched runtime revision');
 if(next.version===previous.version&&JSON.stringify(next)!==JSON.stringify(previous))deny('same revision has different runtime payload');
}
export function assertReleaseSafety(release:ReleasePolicy,input:unknown):SafetyPolicy{
 const result=SafetyPolicySchema.safeParse(input);if(!result.success)deny('invalid safety rules');const policy=result.data;
 if(safetyPolicyDigest(policy)!==release.safetyPolicySha256)deny('safety policy hash mismatch');
 if(release.capabilities.confidentialReports||releaseWorlds.some(slug=>release.worlds[slug].entitled)){
  if(policy.schemaVersion!==2||!policy.approval.operatorCoverageApproved||!policy.approval.retentionReviewed||!policy.appeals.contact||policy.escalation.operator!==release.operator.subjectRef)deny('reviewed environment safety rules required');
  if(release.environment==='production'&&releaseWorlds.some(slug=>release.worlds[slug].entitled)&&!policy.approval.publicRelease)deny('production safety approval required');
 }
 return policy;
}
