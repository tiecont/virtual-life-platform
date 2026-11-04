import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';

export function ciResult(needs){
 if(!needs||typeof needs!=='object'||Array.isArray(needs)||Object.keys(needs).sort().join(',')!=='browser,core')return false;
 return ['core','browser'].every(job=>needs[job]?.result==='success');
}
export function validateBrowserGroups(plan,files){
 assert(plan?.schemaVersion===1&&plan.groups&&typeof plan.groups==='object'&&!Array.isArray(plan.groups));
 const names=Object.keys(plan.groups);assert(names.length>=1&&names.length<=8);
 const seen=new Set(),known=new Set(files);
 for(const name of names){assert(/^[a-z][a-z0-9-]{0,39}$/.test(name));const group=plan.groups[name];assert(Array.isArray(group)&&group.length>=1&&group.length<=8);
  for(const file of group){assert(typeof file==='string'&&/^[a-z][a-z0-9-]*\.spec\.ts$/.test(file)&&known.has(file)&&!seen.has(file),'Browser group must cover real specs exactly once');seen.add(file);}
 }
 assert.equal(seen.size,known.size,'Browser group omitted a spec');return names;
}
export async function browserPlan(){const plan=JSON.parse(await readFile('config/ci-browser-groups.json','utf8')),files=(await readdir('tests/e2e')).filter(value=>value.endsWith('.spec.ts'));validateBrowserGroups(plan,files);return plan;}
export function validateBrowserBatches(batches,spec,code){
 assert(Array.isArray(batches)&&batches.length>=1&&batches.length<=2);const seen=new Set();
 for(const batch of batches){assert(['desktop','mobile'].includes(batch.project)&&!seen.has(batch.project));seen.add(batch.project);assert.equal(batch.batch,1);assert.deepEqual(batch.filters,['tests/e2e/'+spec]);assert(Number.isInteger(batch.exitCode)&&batch.exitCode>=0&&batch.exitCode<=255);}
 if(code===0){assert.equal(seen.size,2);assert(batches.every(batch=>batch.exitCode===0));}
}
