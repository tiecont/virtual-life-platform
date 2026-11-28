import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const statuses=new Set(['TODO','IN_PROGRESS','VERIFIED','DEFERRED_APPROVED']);
const milestones=new Set(['M0','M1','M2','M3','M4','M5','M6']);
const sourceRevision=/^[a-f0-9]{40}$/;
const scopes=new Set(['MVP','DEFERRED_EXPANSION']);
export function validateTaskPlan(plan){
 assert.equal(plan.schemaVersion,2);
 assert(['single-agent','opt-in-multi-agent'].includes(plan.execution),'Unknown execution policy');
 assert.equal(plan.policy.reservationsRequired,false);
 assert.equal(plan.policy.independentReviewRequired,false);
 assert(Array.isArray(plan.tasks)&&plan.tasks.length>0);
 const tasks=new Map();
 for(const task of plan.tasks){
  assert(/^VL-\d{3}$/.test(task.id)&&!tasks.has(task.id),'Invalid or duplicate task ID');
  assert(typeof task.title==='string'&&task.title.trim());
  assert(statuses.has(task.status),'Invalid task status');
  assert(task.priority===undefined||(Number.isInteger(task.priority)&&task.priority>=0&&task.priority<=2),'Invalid task priority');
  assert(Array.isArray(task.dependsOn)&&new Set(task.dependsOn).size===task.dependsOn.length);
  assert(Array.isArray(task.acceptance)&&task.acceptance.length>0);
  assert(Array.isArray(task.qualificationRequirements));
  if(task.implementation?.availableAt!==undefined)
   assert(sourceRevision.test(task.implementation.availableAt),'Available implementation needs a source revision: '+task.id);
  if(task.mvpMilestone!==undefined)assert(milestones.has(task.mvpMilestone),'Invalid MVP milestone for '+task.id);
  if(task.mvpScope!==undefined)assert(scopes.has(task.mvpScope),'Invalid MVP scope for '+task.id);
  if(task.mvpCriticalPath!==undefined)assert.equal(typeof task.mvpCriticalPath,'boolean','Invalid MVP critical-path flag for '+task.id);
  if(task.mvpScope==='DEFERRED_EXPANSION')assert(typeof task.deferredExpansion==='string'&&task.deferredExpansion.trim(),'Deferred task needs an explicit scope note: '+task.id);
  if(task.status==='VERIFIED'){
   const v=task.verification;
   assert(v&&sourceRevision.test(v.sourceRevision),'Verified task needs exact source revision');
   assert(Array.isArray(v.commands)&&v.commands.some(c=>c.exitCode===0)&&v.commands.every(c=>typeof c.command==='string'&&c.command.trim()&&Number.isInteger(c.exitCode)&&(c.exitCode===0||c.required===false)),'Verified task needs actual passing required commands');
   assert(['HISTORICAL_INDEPENDENT','SINGLE_AGENT_AUDIT','SINGLE_AGENT_SEQUENTIAL_AUDIT','INDEPENDENT'].includes(v.reviewMode),'Honest review mode required');
  }
  tasks.set(task.id,task);
 }
 if(plan.mvpProgram!==undefined){
  const {currentWave}=plan.mvpProgram;
  assert.match(currentWave?.id??'',/^WAVE-[A-Z][A-Z0-9-]*$/,'Invalid current wave');
  assert.equal(plan.mvpProgram.wave,'Wave '+currentWave.id.slice(5),'Current wave label drift');
  assert(currentWave.acceptanceTasks?.length&&currentWave.acceptanceTasks.every(id=>tasks.get(id)?.mvpScope==='MVP'),'Current wave needs MVP acceptance tasks');
  assert.equal(tasks.get(plan.mvpProgram.governance?.releaseAcceptanceTask)?.mvpScope,'MVP','Missing MVP release acceptance task');
  const waveComplete=currentWave.acceptanceTasks.every(id=>tasks.get(id).status==='VERIFIED');
  assert.equal(currentWave.status==='VERIFIED',waveComplete,'Current wave acceptance status drift');
  assert(currentWave.workstreams?.length&&currentWave.workstreams.every(name=>[...tasks.values()].some(t=>workstream(t)===name)),'Unknown current wave workstream');
  for(const decision of currentWave.ownerDecisions??[]){
   assert(decision.decision?.trim()&&decision.tasks?.length&&decision.tasks.every(id=>tasks.has(id)),'Invalid current-wave owner decision');
  }
  for(const task of tasks.values()){
   assert(task.feature&&task.objective&&Number.isInteger(task.priority),'Missing task scope or priority: '+task.id);
   assert(task.verificationRequirements?.length,'Missing verification requirements: '+task.id);
   assert(task.status==='VERIFIED'||task.remaining?.trim()||task.implementation?.remaining?.trim(),'Missing remaining work: '+task.id);
  }
  assert.equal(plan.mvpProgram.schemaVersion,1,'Unknown MVP program schema');
  assert(Array.isArray(plan.mvpProgram.milestones),'MVP program needs milestones');
  assert.deepEqual(plan.mvpProgram.milestones.map(m=>m.id),['M0','M1','M2','M3','M4','M5','M6'],'MVP program must declare M0-M6 in order');
  assert(plan.mvpProgram.milestones.every(m=>m.title&&m.objective&&Array.isArray(m.exitCriteria)&&m.exitCriteria.length),'MVP milestone lacks exit criteria');
  assert(typeof plan.mvpProgram.operatingRule==='string'&&plan.mvpProgram.operatingRule.includes('coordinated'),'MVP program needs the coordinated-wave operating rule');
 }
 const visited=new Set(),active=new Set();
 function visit(id){
  assert(tasks.has(id),'Unknown implementation dependency '+id);
  assert(!active.has(id),'Implementation dependency cycle at '+id);
  if(visited.has(id))return;
  active.add(id);
  const task=tasks.get(id);
  [...task.dependsOn,...(task.qualificationDependencies??[])].forEach(visit);
  active.delete(id);visited.add(id);
 }
 for(const task of tasks.values()){
  for(const id of task.qualificationDependencies??[]){
   assert(tasks.has(id)&&id!==task.id,'Unknown qualification dependency '+id);
   if(task.mvpScope==='MVP')assert.equal(tasks.get(id).mvpScope,'MVP','MVP task has a deferred qualification dependency '+id);
  }
  if(task.mvpScope==='MVP')for(const id of task.dependsOn)assert(tasks.get(id)?.mvpScope==='MVP','MVP task '+task.id+' has a deferred implementation dependency '+id);
  if(task.status==='VERIFIED')assert(task.dependsOn.every(id=>tasks.get(id)?.status==='VERIFIED'),'Verified task has incomplete implementation dependency');
 }
 for(const id of tasks.keys())visit(id);
 return tasks;
}
function workstream(task){
 return task.workstream??task.feature;
}

function statusCounts(tasks){
 const counts=Object.fromEntries([...statuses].map(status=>[status,0]));
 for(const task of tasks)counts[task.status]++;
 return counts;
}

export function taskStatus(plan,{milestone,stream,scope}={}){
 const tasks=validateTaskPlan(plan);
 const wave=plan.mvpProgram?.currentWave;
 const all=[...tasks.values()];
 assert(milestone===undefined||milestones.has(milestone),'Unknown milestone '+milestone);
 assert(stream===undefined||all.some(task=>workstream(task)?.toLowerCase()===stream.toLowerCase()),'Unknown workstream '+stream);
 assert(scope===undefined||scopes.has(scope),'Unknown scope '+scope);
 const selected=all.filter(task=>
  (milestone===undefined||task.mvpMilestone===milestone)&&
  (stream===undefined||workstream(task)?.toLowerCase()===stream.toLowerCase())&&
  (scope===undefined||task.mvpScope===scope));
 const counts=statusCounts(selected);
 const incomplete=task=>task.status==='TODO'||task.status==='IN_PROGRESS';
 const available=id=>tasks.get(id).status==='VERIFIED'||Boolean(tasks.get(id).implementation?.availableAt);
 const waiting=task=>task.dependsOn.filter(id=>!available(id));
 const qualify=task=>(task.qualificationDependencies??[]).filter(id=>tasks.get(id).status!=='VERIFIED');
 const critical=new Set();
 function includeRequired(id){
  if(critical.has(id))return;
  critical.add(id);
  const task=tasks.get(id);
  [...task.dependsOn,...(task.qualificationDependencies??[])].forEach(includeRequired);
 }
 if(wave){
  [...wave.acceptanceTasks,plan.mvpProgram.governance.releaseAcceptanceTask].forEach(includeRequired);
 }
 function waveOrder(task){
  const rank=wave?.workstreams.indexOf(workstream(task))??-1;
  return rank<0?(wave?.workstreams.length??0):rank;
 }
 const pending=selected.filter(incomplete).sort((a,b)=>
  (a.priority??3)-(b.priority??3)||
  waveOrder(a)-waveOrder(b)||
  Number(critical.has(b.id))-Number(critical.has(a.id))||
  a.id.localeCompare(b.id));
 const ready=pending.filter(task=>waiting(task).length===0);
 const acceptanceTasks=pending.filter(task=>(task.qualificationRequirements.length||qualify(task).length));
 const byMilestone=(plan.mvpProgram?.milestones??[]).filter(entry=>milestone===undefined||entry.id===milestone).map(entry=>{
  const group=all.filter(task=>task.mvpScope==='MVP'&&task.mvpMilestone===entry.id);
  const counts=statusCounts(group);
  return {id:entry.id,title:entry.title,total:group.length,counts,
   status:counts.VERIFIED===group.length?'VERIFIED':counts.VERIFIED||counts.IN_PROGRESS?'IN_PROGRESS':'TODO',
   ...(milestone===entry.id?{objective:entry.objective,exitCriteria:entry.exitCriteria}:{})};
 });
 return {
  execution:plan.execution,total:selected.length,counts,remaining:selected.filter(incomplete).length,
  ...(wave?{wave:{id:wave.id,title:wave.title,status:wave.status,acceptanceTasks:wave.acceptanceTasks},
   release:plan.mvpProgram.release,
   scopes:Object.fromEntries([...scopes].map(scope=>[scope,statusCounts(all.filter(t=>t.mvpScope===scope))])),
   milestones:byMilestone}:{}),
  ready:ready.map(({id,title,priority,qualificationRequirements})=>({id,title,...(priority===undefined?{}:{priority}),qualificationRequirements})),
  active:pending.filter(task=>task.status==='IN_PROGRESS').map(task=>({id:task.id,title:task.title,remaining:task.remaining??task.implementation?.remaining})),
  waitingOnImplementation:pending.filter(task=>waiting(task).length).map(task=>({id:task.id,dependencies:waiting(task)})),
  acceptanceGates:acceptanceTasks.map(task=>({id:task.id,dependencies:qualify(task),requirements:task.qualificationRequirements})),
  criticalPath:pending.filter(task=>critical.has(task.id)).map(task=>task.id),
  ownerDecisions:(wave?.ownerDecisions??[]).filter(entry=>entry.tasks.some(id=>selected.some(task=>task.id===id&&incomplete(task)))),
  recommended:ready.filter(task=>task.mvpScope==='MVP').slice(0,8).map(task=>({id:task.id,workstream:workstream(task),title:task.title})),
  ...(milestone!==undefined||stream!==undefined?{tasks:selected}:{}),
 };
}

export async function readTaskPlan(){
 return JSON.parse(await readFile(new URL('../config/development-plan.json',import.meta.url),'utf8'));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {parseArgs}=await import('node:util');
 const {values}=parseArgs({options:{milestone:{type:'string'},workstream:{type:'string'},scope:{type:'string'},summary:{type:'boolean'}}});
 const status=taskStatus(await readTaskPlan(),{milestone:values.milestone,stream:values.workstream,scope:values.scope});
 if(values.summary){
  const {execution,total,counts,remaining,wave,release,scopes,milestones,ready,recommended}=status;
  console.log(JSON.stringify({execution,total,counts,remaining,wave,release,scopes,milestones,readyCount:ready.length,recommended},null,2));
 }else{
  console.log(JSON.stringify(status,null,2));
 }
}
