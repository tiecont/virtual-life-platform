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
