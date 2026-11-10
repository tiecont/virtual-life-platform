import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readTaskPlan,taskStatus,validateTaskPlan} from '../../scripts/task-plan.mjs';
const task=(id,dependsOn=[],extra={})=>({id,title:id,dependsOn,acceptance:['actual check'],qualificationRequirements:[],status:'TODO',...extra});
const plan=tasks=>({schemaVersion:2,execution:'single-agent',policy:{reservationsRequired:false,independentReviewRequired:false},tasks});
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
test('the active backlog preserves historical work and exposes independent work immediately',async()=>{
 const p=await readTaskPlan(),s=taskStatus(p);
 assert.equal(s.total,110);assert.equal(s.counts.VERIFIED,15);
 for(const t of p.tasks.filter(t=>t.status!=='VERIFIED'))assert.doesNotMatch(t.qualificationRequirements.join(' '),/handoff|agent|reservation/i);
 for(const id of ['VL-010','VL-018','VL-020','VL-035','VL-043','VL-050','VL-065','VL-080'])assert(s.ready.some(t=>t.id===id));
});
