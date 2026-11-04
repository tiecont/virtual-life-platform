import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const paths=[
 'plans/20-dating-world.md','apps/platform-api/src/app.ts',
 'apps/platform-api/src/dating/profiles.ts','apps/platform-api/src/dating/matching.ts',
 'apps/platform-api/src/dating/dates.ts','apps/platform-api/src/dating/date-http.ts',
 'apps/platform-api/src/identity/service.ts','apps/platform-api/src/social/service.ts',
 'apps/platform-api/src/db/migrations/0034_private_dating_matching.sql',
 'apps/platform-api/src/db/migrations/0035_private_date_rooms.sql',
 'config/dating-policy.json','config/rollout.json',
];
// Pin the actual audited baseline so this read-only report remains reproducible
// after the continuation implementation changes these owner ports.
const baseline=execFileSync('git',['rev-parse','aff4b2f'],{encoding:'utf8'}).trim();
const sources=new Map(paths.map(path=>[path,execFileSync('git',['show',baseline+':'+path],{encoding:'utf8'})]));
const policy=JSON.parse(sources.get('config/dating-policy.json')),rollout=JSON.parse(sources.get('config/rollout.json'));
assert(Object.values(policy.approvals).every(value=>value===false));assert.equal(policy.eligibility.provider,null);assert.equal(rollout.worlds.dating.enabled,false);
assert(sources.get('apps/platform-api/src/dating/matching.ts').includes("'dating-matcher:v1'"));
assert(sources.get('apps/platform-api/src/dating/profiles.ts').includes('attachWithdrawal'));
assert(sources.get('apps/platform-api/src/app.ts').includes('datingProfiles.attachWithdrawal((transaction,account)=>datingMatching.invalidate'));
assert(sources.get('apps/platform-api/src/dating/dates.ts').includes('async contact(token:string,id:string,requireStarted=true)'));
assert(sources.get('apps/platform-api/src/db/migrations/0034_private_dating_matching.sql').includes('account_id uuid PRIMARY KEY REFERENCES identity_accounts'));
console.log(JSON.stringify({taskID:'M20-05',phase:'read-only-audit-not-runtime-verification',head:baseline,files:[...sources].map(([path,source])=>({path,sha256:createHash('sha256').update(source).digest('hex')})),observedMarkers:{currentMatcherMutex:'dating-matcher:v1',profileWithdrawalRegistration:'one matcher callback',dateReportContact:'historical reporting port;not positive continuation authority',allocation:'one primary-key enrollment/account'},manualAuditFindings:['Current matching invalidation follows active enrollment only;cannot revoke historical kept connections by itself.','Date contact provenance does not establish current adult/profile eligibility.','Independent negative continuation hooks must precede proposal/date invalidation to avoid header/proposal inversion.','Positive work must prelock sorted union of related active continuation headers before profile callbacks;independent per-profile header sets can cycle across two actors.','General/private return queue source isolation and actual fresh two-party consent are not implemented.'],realApprovals:policy.approvals,provider:policy.eligibility.provider,publicDatingEnabled:rollout.worlds.dating.enabled,nextExactAction:'Implement actual red acceptance for mutual continuation/return/revoke,then closed private runtime/ports/queue isolation and verification. M20-05 remains IN_PROGRESS.'},null,2));
