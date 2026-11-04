import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function validateBudget(budget){
 assert.equal(budget.schemaVersion,1);assert.equal(budget.status,'planning-only;unpriced;not purchased or capacity certified');assert.equal(budget.currency,'USD');
 assert.equal(budget.vendorQuotesVerified,false);assert.equal(budget.purchasesApproved,false);assert.equal(budget.singleRoomOwner,true);assert.equal(budget.automaticScaling,false);assert.equal(budget.redisEnabled,false);
 const positive=n=>Number.isSafeInteger(n)&&n>0,sum=values=>Object.values(values).reduce((a,b)=>a+b,0);
 for(const object of [budget.allocationsCents,budget.resources,budget.memoryMiB,budget.diskGiB])assert(Object.values(object).every(positive));assert(positive(budget.monthlyCeilingCents));
 assert.deepEqual(Object.keys(budget.allocationsCents).sort(),['compute','domain','encryptedBackup']);
 assert.deepEqual(Object.keys(budget.memoryMiB).sort(),['api','edge','maintenance','os','postgres','reserve','web']);
 assert.deepEqual(Object.keys(budget.diskGiB).sort(),['archives','images','logs','os','postgres','reserve','temporary']);
 assert.deepEqual(Object.keys(budget.resources).sort(),['diskGiB','monthlyEgressGiB','ramMiB','vcpu']);
 assert(sum(budget.allocationsCents)<=budget.monthlyCeilingCents,'Monthly allocations exceed planning ceiling');
 assert(sum(budget.memoryMiB)<=budget.resources.ramMiB,'Memory allocations exceed plan');assert(budget.memoryMiB.reserve>=budget.resources.ramMiB*.1,'Memory reserve below10percent');
 assert(sum(budget.diskGiB)<=budget.resources.diskGiB,'Disk allocations exceed plan');assert(budget.diskGiB.reserve>=budget.resources.diskGiB*.2,'Disk reserve below20percent');
 const thresholds=budget.investigationThresholds;assert(positive(thresholds.sustainedSeconds));assert(thresholds.sustainedSeconds>=300);assert(positive(thresholds.httpP95Ms));assert(positive(thresholds.heapGrowthMiBPerHour));
 for(const key of ['cpuRatio','memoryRatio','diskFreeRatio','databaseConnectionRatio','unexpectedErrorRatio','egressProjectedRatio'])assert(Number.isFinite(thresholds[key])&&thresholds[key]>0&&thresholds[key]<1,'Invalid investigation ratio');
 assert.deepEqual(budget.redisPrerequisites,['measured bottleneck','approved ADR','explicit owner fencing','no lost SQL authority','privacy review','concurrency and failover tests']);
 return {schemaVersion:1,monthlyCeilingUSD:budget.monthlyCeilingCents/100,allocatedUSD:sum(budget.allocationsCents)/100,resources:budget.resources,memoryAllocatedMiB:sum(budget.memoryMiB),diskAllocatedGiB:sum(budget.diskGiB),scope:'Unpriced planning ceilings;not a purchase,capacity result or automatic scale policy'};
}
export async function checkResourceBudget(){return validateBudget(JSON.parse(await readFile('infra/environments/resource-budget.json','utf8')));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void checkResourceBudget().then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{console.error('Resource planning budget validation failed');process.exitCode=1;});
