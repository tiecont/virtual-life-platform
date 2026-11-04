import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateBudget } from '../../scripts/verify-resource-budget.mjs';
const current=JSON.parse(await readFile('infra/environments/resource-budget.json','utf8'));
test('resource ceiling accounts for memory,disk reserves and unpriced monthly allocations',()=>{
 const result=validateBudget(current);assert.equal(result.monthlyCeilingUSD,25);assert.equal(result.memoryAllocatedMiB,4096);assert.equal(result.diskAllocatedGiB,80);
 for(const mutate of [b=>b.allocationsCents.compute=3000,b=>b.memoryMiB.api=4096,b=>b.diskGiB.postgres=80,b=>b.memoryMiB.reserve=1,b=>b.diskGiB.reserve=1,b=>b.investigationThresholds.cpuRatio=NaN,b=>delete b.memoryMiB.postgres]){const next=globalThis.structuredClone(current);mutate(next);assert.throws(()=>validateBudget(next));}
});
test('budget edits cannot silently enable purchases,Redis or multiple room owners',()=>{
 for(const key of ['purchasesApproved','automaticScaling','redisEnabled','vendorQuotesVerified']){const next=globalThis.structuredClone(current);next[key]=true;assert.throws(()=>validateBudget(next));}
 const next=globalThis.structuredClone(current);next.singleRoomOwner=false;assert.throws(()=>validateBudget(next));next.singleRoomOwner=true;next.redisPrerequisites=next.redisPrerequisites.filter(value=>value!=='explicit owner fencing');assert.throws(()=>validateBudget(next));
});
