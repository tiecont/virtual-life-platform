import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Reproducible code inventory,not a runtime/security certification. The manual
// audit was read before adding the M20-06 acceptance cases.
const baseline=execFileSync('git',['rev-parse','f6e3a69'],{encoding:'utf8'}).trim();
const paths=[
 'plans/20-dating-world.md','apps/platform-api/src/app.ts',
 'apps/platform-api/src/dating/profiles.ts','apps/platform-api/src/dating/matching.ts',
 'apps/platform-api/src/dating/dates.ts','apps/platform-api/src/dating/continuations.ts',
 'apps/platform-api/src/dating/continuation-http.ts','apps/platform-api/src/identity/socket.ts',
 'apps/platform-api/src/identity/policy.ts','apps/platform-api/src/rooms/service.ts',
 'apps/platform-api/src/travel/service.ts','apps/platform-api/src/social/service.ts',
 'apps/platform-api/src/common/request-log.ts','apps/portal-web/app/private/profile/page.tsx',
 'config/dating-policy.json','config/rollout.json',
];
const sources=new Map(paths.map(path=>[path,execFileSync('git',['show',baseline+':'+path],{encoding:'utf8'})]));
const policy=JSON.parse(sources.get('config/dating-policy.json')),rollout=JSON.parse(sources.get('config/rollout.json'));
assert(Object.values(policy.approvals).every(value=>value===false));
assert.equal(policy.eligibility.provider,null);assert.equal(rollout.worlds.dating.enabled,false);assert.equal(rollout.publicRelease,false);
console.log(JSON.stringify({taskID:'M20-06',scope:'Read-only baseline inventory/manual threat findings;actual acceptance in separate logs',baseline,files:[...sources].map(([path,source])=>({path,sha256:createHash('sha256').update(source).digest('hex')})),manualFindings:[
 'Private positive eligibility is test-only,registered and strict account-bound synthetic proof;generic reviewedAdult permission is not private chat authority.',
 'Generic dating directory/join/travel deny even a trusted generic adult permission. No socket dating command or generic private room exists.',
 'HTTP profile/matching/continuation owners must all reject underage,self-attested,wrong-account,wrong-policy,future,expired,overlong or revoked synthetic proofs.',
 'Known private handles must not grant outsiders attribution or access;continuation404 message normalization hides known-vs-unknown existence.',
 'Passive current connection metadata may survive logout;all positive current commands still require a real session and fresh scoped grants. Another session must not reuse a return grant.',
 'General friend activity filters dating even if a trusted presence port returns it. Shared projections and logs must omit private aliases/source handles.',
 'Source consent survives logout intentionally;held private replies must not repopulate the logged-out native UI.',
 'No gender/exact-age matching fields are collected;tests cannot claim demographic compatibility,real identity uniqueness or effective age assurance.',
],remainingExternal:['Real18+provider/process and assurance/evasion review','Independent human privacy/retention assessment','Opaque private block management and staffed coverage','Legal/operator/pilot/public approval'],realApprovals:policy.approvals,provider:policy.eligibility.provider,publicDatingEnabled:rollout.worlds.dating.enabled},null,2));
