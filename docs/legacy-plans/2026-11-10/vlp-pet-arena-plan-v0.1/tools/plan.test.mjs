import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan,validateGraph} from './validate-plan.mjs';
import {selectTasks} from './next-task.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const fixture=()=>clone(validatePlan());
const activate=data=>({...data,state:{...data.state,activation:'ACTIVE'},roadmap:{...data.roadmap,active_lane:'PET_ARENA'},handoffValid:true});
test('current planning pack cannot start implementation or reassign source ownership',()=>{
 const data=fixture(),before=clone(data);const result=selectTasks({...data,handoffValid:false});
 assert.equal(result.status,'WAITING');assert.equal(result.next,null);assert.equal(result.ready.length,0);assert.deepEqual(data,before);
});
test('source ownership, Lodge scheduler and missing handoff each fail closed',()=>{
 const active=activate(fixture());assert.equal(selectTasks(active).next.id,'PA-001');
 for(const override of [{handoffValid:false},{roadmap:{active_lane:'VNEXT'}},{lodgeGate:{phase_state:'ACTIVE'}}])assert.equal(selectTasks({...active,...override}).ready.length,0);
});
test('missing upstream visual gate blocks UI without creating a native prerequisite for the engine',()=>{
 const data=activate(fixture());for(const id of ['PA-001','PA-002'])data.state.tasks[id].status='VERIFIED';
 data.upstream.tasks['N06-09'].status='TODO';const result=selectTasks(data);
 assert(result.ready.some(task=>task.id==='PA-003'));assert(!result.ready.some(task=>task.id==='PA-007'||task.id==='PA-009'));
});
test('PvP stays closed if either S1 or S2 acceptance gate is unresolved',()=>{
 for(const pending of ['PA-017','PA-018']){
  const data=activate(fixture());data.state.active_stages=['S0','S1','S2','S3'];for(const row of Object.values(data.state.tasks))row.status='VERIFIED';
  data.state.tasks[pending].status='TODO';data.state.tasks['PA-014'].status='TODO';
  assert(!selectTasks(data).ready.some(task=>task.id==='PA-014'));
 }
});
test('S1 completion cannot automatically start S2 before the product checkpoint',()=>{
 const data=activate(fixture());for(const row of Object.values(data.state.tasks))row.status='VERIFIED';
 data.state.tasks['PA-010'].status='TODO';assert.equal(selectTasks(data).next,null);
 data.state.active_stages.push('S2');assert.equal(selectTasks(data).next.id,'PA-010');
});
test('a VERIFIED label without accepted evidence is rejected',()=>{
 const data=fixture();data.state.tasks['PA-001'].status='VERIFIED';
 assert.throws(()=>validateGraph(data.manifest,data.state,data.evidence,data.upstream),/VERIFIED needs accepted evidence/);
});
test('cycles, S1 requiring S2, and accidental native blockers are rejected',()=>{
 const cyclic=fixture();cyclic.manifest.tasks[0].depends_on=['PA-002'];
 assert.throws(()=>validateGraph(cyclic.manifest,cyclic.state,cyclic.evidence,cyclic.upstream),/cycle/);
 const coupled=fixture();coupled.manifest.tasks.find(task=>task.id==='PA-019').depends_on=[];coupled.manifest.tasks.find(task=>task.id==='PA-007').depends_on.push('PA-019');
 assert.throws(()=>validateGraph(coupled.manifest,coupled.state,coupled.evidence,coupled.upstream),/S1 must not require S2/);
 const native=fixture();native.manifest.tasks[0].upstream_requires.push('N10-04');
 assert.throws(()=>validateGraph(native.manifest,native.state,native.evidence,native.upstream),/Native hard dependency/);
});
