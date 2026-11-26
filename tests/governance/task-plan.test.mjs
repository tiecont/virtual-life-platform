import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readTaskPlan,taskStatus,validateTaskPlan} from '../../scripts/task-plan.mjs';
const task=(id,dependsOn=[],extra={})=>({id,title:id,dependsOn,acceptance:['actual check'],qualificationRequirements:[],status:'TODO',...extra});
const plan=tasks=>({schemaVersion:2,execution:'single-agent',policy:{reservationsRequired:false,independentReviewRequired:false},tasks});
test('explicit delegation preserves task readiness',()=>{
 const p=plan([task('VL-001')]);
 assert.deepEqual(taskStatus({...p,execution:'opt-in-multi-agent'}).ready,taskStatus(p).ready);
 assert.throws(()=>validateTaskPlan({...p,execution:'unrestricted'}));
});
test('all independent implementations are ready without an agent, phase, hardware or review reservation',()=>{
 const p=plan([task('VL-001',[],{qualificationRequirements:['physical Windows GPU']}),task('VL-002'),task('VL-003',['VL-001']),task('VL-004',[],{qualificationDependencies:['VL-001']})]);
 assert.deepEqual(taskStatus(p).ready.map(t=>t.id),['VL-001','VL-002','VL-004']);
 assert.deepEqual(taskStatus(p).waitingOnImplementation,[{id:'VL-003',dependencies:['VL-001']}]);
});
test('real implementation dependencies, invalid states, cycles and invented verification fail closed',()=>{
 for(const tasks of [[task('VL-001',['VL-999'])],[task('VL-001',['VL-002']),task('VL-002',['VL-001'])],[task('VL-001'),task('VL-001')],[task('VL-001',[],{status:'VERIFIED'})],[task('VL-001',[],{status:'BLOCKED_AGENT'})]])assert.throws(()=>validateTaskPlan(plan(tasks)));
 assert.throws(()=>validateTaskPlan(plan([
  task('VL-001',['VL-002']),task('VL-002',[],{qualificationDependencies:['VL-001']}),
 ])),/dependency cycle/);
 const verification={sourceRevision:'a'.repeat(40),reviewMode:'SINGLE_AGENT_AUDIT',commands:[{command:'pnpm test',exitCode:0}]};
 assert.doesNotThrow(()=>validateTaskPlan(plan([task('VL-001',[],{status:'VERIFIED',verification})])));
 assert.throws(()=>validateTaskPlan(plan([task('VL-001',[],{status:'VERIFIED',verification:{...verification,commands:[{command:'pnpm test',exitCode:1}]}})])));
 assert.throws(()=>validateTaskPlan(plan([task('VL-001'),task('VL-002',['VL-001'],{status:'VERIFIED',verification})])));
});
test('priority orders ready work without overriding real dependencies or imposing qualification locks',()=>{
 const p=plan([task('VL-001'),task('VL-002',[],{priority:2}),task('VL-003',['VL-001'],{priority:0}),task('VL-004',[],{priority:1}),task('VL-005',[],{priority:0,qualificationRequirements:['owner policy approval']})]);
 assert.deepEqual(taskStatus(p).ready.map(t=>[t.id,t.priority]),[['VL-005',0],['VL-004',1],['VL-002',2],['VL-001',undefined]]);
 assert.deepEqual(taskStatus(p).waitingOnImplementation,[{id:'VL-003',dependencies:['VL-001']}]);
 for(const priority of [-1,3,0.5,'0',null])assert.throws(()=>validateTaskPlan(plan([task('VL-001',[],{priority})])));
});
test('the active backlog classifies every task by MVP milestone and scope',async()=>{
 const p=await readTaskPlan();
 assert.equal(p.mvpProgram.milestones.length,7);
 assert.deepEqual(p.mvpProgram.milestones.map(m=>m.id),['M0','M1','M2','M3','M4','M5','M6']);
 for(const t of p.tasks){assert(t.mvpMilestone,'missing milestone '+t.id);assert(t.mvpScope,'missing scope '+t.id);}
 const deferred=p.tasks.filter(t=>t.mvpScope==='DEFERRED_EXPANSION');
 assert(deferred.length>0&&deferred.every(t=>t.deferredExpansion?.trim()));
 const byId=new Map(p.tasks.map(t=>[t.id,t]));
 for(const t of p.tasks.filter(t=>t.mvpScope==='MVP'))
   assert(t.dependsOn.every(id=>byId.get(id)?.mvpScope==='MVP'),'MVP task has deferred dependency '+t.id);
 const crossed=plan([task('VL-001',['VL-002'],{mvpScope:'MVP',mvpMilestone:'M1'}),task('VL-002',[],{mvpScope:'DEFERRED_EXPANSION',mvpMilestone:'M4',deferredExpansion:'later'})]);
 assert.throws(()=>validateTaskPlan(crossed),/deferred implementation dependency/);
 assert.throws(()=>validateTaskPlan({...p,tasks:[...p.tasks,{...p.tasks[0],id:'VL-999',mvpMilestone:'M9'}]}));
 assert.throws(()=>validateTaskPlan({...p,tasks:[...p.tasks,{...p.tasks[0],id:'VL-998',mvpScope:'DEFERRED_EXPANSION',deferredExpansion:undefined}]}));
});
test('the active backlog preserves historical work and exposes independent work immediately',async()=>{
 const p=await readTaskPlan(),s=taskStatus(p);
  assert(s.total>=110);
 assert.equal(p.tasks.filter(t=>t.verification?.archiveRef).length,15);
 assert(p.tasks.some(t=>t.id==='VL-111'));
 assert(p.tasks.find(t=>t.id==='VL-023').dependsOn.includes('VL-111'));
 for(const t of p.tasks.filter(t=>t.status!=='VERIFIED'))assert.doesNotMatch(t.qualificationRequirements.join(' '),/handoff|agent|reservation/i);
 for(const id of ['VL-010','VL-018','VL-020','VL-035','VL-043','VL-050','VL-065','VL-080'])assert(p.tasks.find(t=>t.id===id).status==='VERIFIED'||s.ready.some(t=>t.id===id));
});
test('current wave, milestone totals and targeted task discovery use canonical data',async()=>{
 const p=await readTaskPlan(),s=taskStatus(p);
 assert.equal(s.wave.id,'WAVE-D3');
 assert.equal(s.wave.status,'IN_PROGRESS');
 assert.equal(s.release,'OFFLINE_ONLY / NO_GO_PUBLIC');
 for(const milestone of s.milestones){
  const list=p.tasks.filter(t=>t.mvpScope==='MVP'&&t.mvpMilestone===milestone.id);
  assert.equal(milestone.total,list.length);
  for(const [status,count] of Object.entries(milestone.counts))assert.equal(count,list.filter(t=>t.status===status).length);
 }
 const selected=taskStatus(p,{milestone:'M3',stream:'d3-a'});
 assert(selected.tasks.every(t=>t.mvpMilestone==='M3'&&(t.workstream??t.feature)==='D3-A'));
 assert(selected.tasks.some(t=>t.id==='VL-203'));
 assert(selected.recommended.every(t=>selected.ready.some(ready=>ready.id===t.id)));
 assert(selected.recommended.every(t=>t.workstream==='D3-A'));
 assert(s.ownerDecisions.some(item=>item.decision.includes('H1, H2, H3 and H4')));
 assert.throws(()=>validateTaskPlan({...p,mvpProgram:{...p.mvpProgram,wave:'Wave C2'}}),/wave label drift/);
});

test('M4 qualifies release independently of representative packaged acceptance',async()=>{
 const p=await readTaskPlan(),byId=validateTaskPlan(p),s=taskStatus(p);
 function closure(id,fields,seen=new Set()){
  if(seen.has(id))return seen;
  seen.add(id);
  for(const field of fields)
   for(const dep of byId.get(id)[field]??[])closure(dep,fields,seen);
  return seen;
 }
 const packaged=closure('VL-199',['dependsOn','qualificationDependencies']);
 assert([...packaged].every(id=>byId.get(id).mvpMilestone!=='M4'));
 assert(!packaged.has('VL-212'));
 const beta=closure('VL-214',['dependsOn','qualificationDependencies']);
 for(const id of ['VL-199','VL-198','VL-212','VL-213'])assert(beta.has(id),id);
 assert(s.criticalPath.includes('VL-198'));
 assert(s.ready.some(t=>t.id==='VL-198'));
});

test('a source-backed interface unblocks implementation while qualification stays pending',()=>{
 const p=plan([
  task('VL-001',[],{status:'IN_PROGRESS',implementation:{availableAt:'a'.repeat(40)}}),
  task('VL-002',['VL-001'],{qualificationDependencies:['VL-001']}),
 ]);
 const s=taskStatus(p);
 assert(s.ready.some(t=>t.id==='VL-002'));
 assert.deepEqual(s.acceptanceGates,[{id:'VL-002',dependencies:['VL-001'],requirements:[]}]);
 assert.throws(()=>validateTaskPlan(plan([task('VL-001',[],{implementation:{availableAt:'latest'}})])),/source revision/);
});
