import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const statuses=new Set(['TODO','IN_PROGRESS','VERIFIED','DEFERRED_APPROVED']);
export function validateTaskPlan(plan){
 assert.equal(plan.schemaVersion,2);
 assert.equal(plan.execution,'single-agent');
 assert.equal(plan.policy.reservationsRequired,false);
 assert.equal(plan.policy.independentReviewRequired,false);
 assert(Array.isArray(plan.tasks)&&plan.tasks.length>0);
 const tasks=new Map();
 for(const task of plan.tasks){
  assert(/^VL-\d{3}$/.test(task.id)&&!tasks.has(task.id),'Invalid or duplicate task ID');
  assert(typeof task.title==='string'&&task.title.trim());
  assert(statuses.has(task.status),'Invalid task status');
  assert(Array.isArray(task.dependsOn)&&new Set(task.dependsOn).size===task.dependsOn.length);
  assert(Array.isArray(task.acceptance)&&task.acceptance.length>0);
  assert(Array.isArray(task.qualificationRequirements));
  if(task.status==='VERIFIED'){
   const v=task.verification;
   assert(v&&/^[a-f0-9]{40}$/.test(v.sourceRevision),'Verified task needs exact source revision');
   assert(Array.isArray(v.commands)&&v.commands.some(c=>c.exitCode===0)&&v.commands.every(c=>typeof c.command==='string'&&c.command.trim()&&Number.isInteger(c.exitCode)&&(c.exitCode===0||c.required===false)),'Verified task needs actual passing required commands');
   assert(['HISTORICAL_INDEPENDENT','SINGLE_AGENT_AUDIT','SINGLE_AGENT_SEQUENTIAL_AUDIT','INDEPENDENT'].includes(v.reviewMode),'Honest review mode required');
  }
  tasks.set(task.id,task);
 }
 const visited=new Set(),active=new Set();
 function visit(id){
  assert(tasks.has(id),'Unknown implementation dependency '+id);
  assert(!active.has(id),'Implementation dependency cycle at '+id);
  if(visited.has(id))return;
  active.add(id);tasks.get(id).dependsOn.forEach(visit);active.delete(id);visited.add(id);
 }
 for(const task of tasks.values()){
  visit(task.id);
  for(const id of task.qualificationDependencies??[])assert(tasks.has(id)&&id!==task.id,'Unknown qualification dependency '+id);
  if(task.status==='VERIFIED')assert(task.dependsOn.every(id=>tasks.get(id).status==='VERIFIED'),'Verified task has incomplete implementation dependency');
 }
 return tasks;
}
export function taskStatus(plan){
 const tasks=validateTaskPlan(plan),counts={};
 for(const task of tasks.values())counts[task.status]=(counts[task.status]??0)+1;
 const pending=[...tasks.values()].filter(t=>['TODO','IN_PROGRESS'].includes(t.status));
 return {execution:plan.execution,total:tasks.size,counts,remaining:tasks.size-(counts.VERIFIED??0),
  ready:pending.filter(t=>t.dependsOn.every(id=>tasks.get(id).status==='VERIFIED')).map(({id,title,qualificationRequirements})=>({id,title,qualificationRequirements})),
  waitingOnImplementation:pending.filter(t=>t.dependsOn.some(id=>tasks.get(id).status!=='VERIFIED')).map(t=>({id:t.id,dependencies:t.dependsOn.filter(id=>tasks.get(id).status!=='VERIFIED')}))};
}
export async function readTaskPlan(){return JSON.parse(await readFile(new URL('../config/development-plan.json',import.meta.url),'utf8'));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(taskStatus(await readTaskPlan()),null,2));
