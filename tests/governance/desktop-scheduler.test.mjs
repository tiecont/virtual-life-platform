import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {schedulerStore,readyTasks,sha256,overlaps,scopePath} from '../../scripts/desktop-scheduler.mjs';

const source='1'.repeat(40),serialize=value=>JSON.stringify(value,null,2)+'\n';
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'vl-scheduler-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await Promise.all(['reservations','handoffs','reviews'].map(path=>mkdir(join(root,path))));
  const taskdoc={tasks:[
    {id:'VL-001',lane:'A0-Coordinator',depends_on:[],external_gates:[],priority:1},
    {id:'VL-002',lane:'A1-Rust-Game-Core',depends_on:['VL-001'],external_gates:[],priority:2},
    {id:'VL-003',lane:'A3-Web-UX',depends_on:[],external_gates:[],priority:3},
    {id:'VL-004',lane:'A1-Rust-Game-Core',depends_on:[],external_gates:['physical GPU'],priority:4}
  ]},bytes=serialize(taskdoc),tasksRef=join(root,'tasks.json');
  const state={schemaVersion:1,coordinator:'agent1',releaseStatus:'NOT_REQUESTED',taskGraphSha256:sha256(bytes),agents:{agent1:{lanes:['A0-Coordinator','A1-Rust-Game-Core']},agent2:{lanes:['A3-Web-UX']}},tasks:Object.fromEntries(taskdoc.tasks.map(task=>[task.id,{status:'TODO',owner:null}])),reservations:{},gateEvidence:{}};
  await writeFile(tasksRef,bytes);await writeFile(join(root,'live-state.json'),serialize(state));
  return {root,taskdoc,state,store:schedulerStore(root,tasksRef),location:{sourceRevision:source,branch:'codex/test',worktree:root}};
}
test('ready tasks respect dependency, lane and external gates',async t=>{
  const f=await fixture(t);
  assert.deepEqual(readyTasks(f.taskdoc,f.state,'agent1').map(task=>task.id),['VL-001']);
  assert.deepEqual(readyTasks(f.taskdoc,f.state,'agent2').map(task=>task.id),['VL-003']);
  await assert.rejects(f.store.reserve('VL-002','agent1',['crates'],f.location),/not READY/);
  await assert.rejects(f.store.reserve('VL-004','agent1',['crates'],f.location),/not READY/);
  await assert.rejects(f.store.reserve('VL-001','agent2',['crates'],f.location),/not READY/);
});
test('atomic reservations prevent concurrent writers, duplicate task and path overlap',async t=>{
  const f=await fixture(t);
  const results=await Promise.allSettled([
    f.store.reserve('VL-001','agent1',['packages/contracts'],f.location),
    f.store.reserve('VL-001','agent1',['packages/contracts'],f.location)
  ]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  await assert.rejects(f.store.reserve('VL-001','agent1',['crates'],f.location),/not READY/);
  await assert.rejects(f.store.reserve('VL-003','agent2',['packages/contracts/src'],f.location),/ownership conflict/);
  await f.store.reserve('VL-003','agent2',['apps/unity'],f.location);
  assert.equal(Object.keys((await f.store.load()).state.reservations).length,2);
  await assert.rejects(f.store.start('VL-003','agent2'),/coordinator/);
});
test('independent review pins exact handoff and source before unlocking successors',async t=>{
  const f=await fixture(t);
  await f.store.reserve('VL-001','agent1',['crates'],f.location);await f.store.start('VL-001');
  const handoff={taskId:'VL-001',owner:'agent1',sourceRevision:source,acceptanceMet:true,commands:[{command:'node --test',exitCode:0}],artifacts:[{ref:'facts.json',sha256:'a'.repeat(64)}]};
  const handoffRef='handoffs/VL-001.json',reviewRef='reviews/VL-001.json';
  await writeFile(join(f.root,handoffRef),serialize(handoff));await f.store.submit('VL-001',handoffRef);
  assert(!readyTasks(f.taskdoc,(await f.store.load()).state,'agent1').some(task=>task.id==='VL-002'));
  const review={taskId:'VL-001',reviewer:'agent1',sourceRevision:source,handoffSha256:sha256(serialize(handoff)),decision:'APPROVED',reviewedAt:new Date().toISOString(),findings:[]};
  await writeFile(join(f.root,reviewRef),serialize(review));await assert.rejects(f.store.verify('VL-001',reviewRef),/Independent reviewer/);
  review.reviewer='agent2';review.handoffSha256='b'.repeat(64);
  await writeFile(join(f.root,reviewRef),serialize(review));await assert.rejects(f.store.verify('VL-001',reviewRef),/different handoff/);
  review.handoffSha256=sha256(serialize(handoff));review.sourceRevision='2'.repeat(40);
  await writeFile(join(f.root,reviewRef),serialize(review));await assert.rejects(f.store.verify('VL-001',reviewRef),/different source/);
  review.sourceRevision=source;
  await writeFile(join(f.root,reviewRef),serialize(review));await f.store.verify('VL-001',reviewRef);
  assert(readyTasks(f.taskdoc,(await f.store.load()).state,'agent1').some(task=>task.id==='VL-002'));
  review.decision='REJECTED';await writeFile(join(f.root,reviewRef),serialize(review));
  await assert.rejects(f.store.load(),/Review changed/);
});
test('changed task graph, handoff or reservation mirror fails closed',async t=>{
  const f=await fixture(t),reservation=await f.store.reserve('VL-001','agent1',['crates'],f.location);
  const reservationRef=join(f.root,reservation.ref),original=await readFile(reservationRef);
  await writeFile(reservationRef,serialize({...reservation,owner:'agent2'}));await assert.rejects(f.store.load(),/mirror mismatch/);
  await writeFile(reservationRef,original);await f.store.start('VL-001');
  const ref='handoffs/VL-001.json';await writeFile(join(f.root,ref),serialize({taskId:'VL-001',owner:'agent1',sourceRevision:source,commands:[{command:'test',exitCode:0}]}));
  await f.store.submit('VL-001',ref);await writeFile(join(f.root,ref),'{}');await assert.rejects(f.store.load(),/Handoff changed/);
});
test('task graph drift and unbound external gate evidence cannot enable work',async t=>{
  const f=await fixture(t),stateRef=join(f.root,'live-state.json');
  const state=JSON.parse(await readFile(stateRef));
  state.gateEvidence={'VL-004':[{gate:'physical GPU',evidenceRefs:['claimed-ready']}]};
  await writeFile(stateRef,serialize(state));await assert.rejects(f.store.load(),/hashed evidence/);
  state.gateEvidence={};await writeFile(stateRef,serialize(state));
  await writeFile(join(f.root,'tasks.json'),serialize({...f.taskdoc,changed:true}));
  await assert.rejects(f.store.load(),/graph changed/);
});
test('reservation paths reject traversal and compare directory boundaries',()=>{
  for(const path of ['../secrets','/tmp/a','a/../b','a//b','a\\b','a/*'])assert.throws(()=>scopePath(path));
  assert(overlaps('proto/**','proto/world.proto'));
  assert(!overlaps('proto','protocol'));
});
