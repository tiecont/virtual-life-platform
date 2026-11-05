import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { ciResult,validateBrowserGroups,validateBrowserBatches } from '../../scripts/ci-policy.mjs';

test('quality succeeds only for both successful required jobs;failure,cancellation,skip,missing or malformed results cannot pass',()=>{
 assert.equal(ciResult({core:{result:'success'},browser:{result:'success'}}),true);
 for(const status of ['failure','cancelled','skipped','timed_out','unknown'])for(const job of ['core','browser'])assert.equal(ciResult({core:{result:'success'},browser:{result:'success'},[job]:{result:status}}),false);
 for(const value of [null,{},[],{core:{result:'success'}},{core:{result:'success'},browser:{result:'success'},unexpected:{result:'success'}}])assert.equal(ciResult(value),false);
});
test('browser groups cover every existing spec exactly once and reject omitted,duplicated,foreign or traversing paths',async()=>{
 const files=(await readdir('tests/e2e')).filter(value=>value.endsWith('.spec.ts')).sort(),plan=JSON.parse(await readFile('config/ci-browser-groups.json','utf8'));
 const groups=validateBrowserGroups(plan,files);assert.equal(groups.length,6);
 const first=Object.keys(plan.groups)[0],file=plan.groups[first][0];
 for(const mutation of [p=>p.groups[first].pop(),p=>p.groups[first].push(file),p=>p.groups[first].push('../private.spec.ts'),p=>p.groups[first].push('missing.spec.ts')]){const copy=JSON.parse(JSON.stringify(plan));mutation(copy);assert.throws(()=>validateBrowserGroups(copy,files));}
});
test('successful reports require both devices for the exact spec and reject stale,foreign,duplicated or incomplete metadata',()=>{
 const spec='identity.spec.ts',batch=project=>({project,batch:1,filters:['tests/e2e/'+spec],exitCode:0}),good=[batch('desktop'),batch('mobile')];
 assert.doesNotThrow(()=>validateBrowserBatches(good,spec,0));
 for(const value of [[],[batch('desktop')],[batch('desktop'),batch('desktop')],[{...batch('desktop'),filters:['tests/e2e/social.spec.ts']},batch('mobile')],[batch('desktop'),{...batch('mobile'),exitCode:1}]])assert.throws(()=>validateBrowserBatches(value,spec,0));
 assert.doesNotThrow(()=>validateBrowserBatches([{...batch('desktop'),exitCode:1}],spec,1));
});
