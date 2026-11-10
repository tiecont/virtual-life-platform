import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {schedulerStore,readyTasks,sha256,overlaps,scopePath,approveReview} from '../../scripts/desktop-scheduler.mjs';

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
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  git(['init','-q']);await writeFile(join(root,'facts.json'),'verified fixture\n');
  git(['add','facts.json']);git(['-c','user.name=Scheduler Test','-c','user.email=scheduler@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture evidence']);
  const revision=git(['rev-parse','HEAD']),artifacts=[{ref:'facts.json',sha256:sha256('verified fixture\n')}];
  return {root,taskdoc,state,source:revision,artifacts,git,store:schedulerStore(root,tasksRef,root),location:{sourceRevision:revision,branch:'codex/test',worktree:root}};
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
  const handoff={taskId:'VL-001',owner:'agent1',sourceRevision:f.source,acceptanceMet:true,commands:[{command:'node --test',exitCode:0}],artifacts:f.artifacts};
  const handoffRef='handoffs/VL-001.json',reviewRef='reviews/VL-001.json';
  await writeFile(join(f.root,handoffRef),serialize(handoff));await f.store.submit('VL-001',handoffRef);
  assert(!readyTasks(f.taskdoc,(await f.store.load()).state,'agent1').some(task=>task.id==='VL-002'));
  const review={taskId:'VL-001',reviewer:'agent1',sourceRevision:f.source,handoffSha256:sha256(serialize(handoff)),decision:'APPROVED',reviewedAt:new Date().toISOString(),findings:[]};
  await writeFile(join(f.root,reviewRef),serialize(review));await assert.rejects(f.store.verify('VL-001',reviewRef),/Independent reviewer/);
  review.reviewer='agent2';review.handoffSha256='b'.repeat(64);
  await writeFile(join(f.root,reviewRef),serialize(review));await assert.rejects(f.store.verify('VL-001',reviewRef),/different handoff/);
  review.handoffSha256=sha256(serialize(handoff));review.sourceRevision='2'.repeat(40);
  await writeFile(join(f.root,reviewRef),serialize(review));await assert.rejects(f.store.verify('VL-001',reviewRef),/different source/);
  review.sourceRevision=f.source;
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
  const ref='handoffs/VL-001.json';await writeFile(join(f.root,ref),serialize({taskId:'VL-001',owner:'agent1',sourceRevision:f.source,commands:[{command:'test',exitCode:0}],artifacts:f.artifacts}));
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
test('coordinator narrows reservations without losing immutable mirrors or enabling expansion',async t=>{
  const f=await fixture(t),original=await f.store.reserve('VL-001','agent1',['crates/**','Cargo.toml'],f.location);
  await f.store.start('VL-001');
  await assert.rejects(f.store.narrowReservation('VL-001',['crates/vl-security'],'handoff','agent2'),/coordinator/);
  await assert.rejects(f.store.narrowReservation('VL-001',[],'handoff'),/nonempty/);
  await assert.rejects(f.store.narrowReservation('VL-001',['crates/vl-security','crates/vl-security'],'handoff'),/Unique/);
  await assert.rejects(f.store.narrowReservation('VL-001',['crate'],'handoff'),/cannot expand/);
  await assert.rejects(f.store.narrowReservation('VL-001',['crates/**','Cargo.toml'],'handoff'),/must narrow/);
  await assert.rejects(f.store.narrowReservation('VL-001',['crates/vl-security'],''),/reason/);
  const narrowed=await f.store.narrowReservation('VL-001',['crates/vl-security/**'],'Committed shared files released');
  assert.equal(narrowed.id,original.id);assert.notEqual(narrowed.ref,original.ref);
  assert.deepEqual(JSON.parse(await readFile(join(f.root,original.ref))),original);
  assert.equal((await f.store.load()).state.tasks['VL-001'].status,'IN_PROGRESS');
  await f.store.reserve('VL-003','agent2',['Cargo.toml','crates/vl-game-core/**'],f.location);
  await assert.rejects(f.store.narrowReservation('VL-001',['Cargo.toml'],'reclaim'),/cannot expand/);
  const twice=await f.store.narrowReservation('VL-001',['crates/vl-security/src/**'],'Smaller scope');
  assert.equal(twice.history.length,2);await f.store.load();
  await writeFile(join(f.root,original.ref),serialize({...original,paths:['elsewhere']}));
  await assert.rejects(f.store.load(),/Historical reservation changed/);
});
test('explicit scope extension is coordinator-only, conflict checked and retains immutable history',async t=>{
  const f=await fixture(t),original=await f.store.reserve('VL-001','agent1',['crates/vl-game-core/**'],f.location);
  await f.store.reserve('VL-003','agent2',['apps/unity/**'],f.location);
  await assert.rejects(f.store.extendReservation('VL-001',['Cargo.toml'],'fix','agent2'),/coordinator/);
  await assert.rejects(f.store.extendReservation('VL-001',['apps/**'],'fix'),/ownership conflict/);
  await assert.rejects(f.store.extendReservation('VL-001',['Cargo.toml'],''),/reason/);
  await assert.rejects(f.store.extendReservation('VL-001',['../secret'],'fix'));
  await assert.rejects(f.store.extendReservation('VL-001',['crates/vl-game-core/**'],'fix'),/new paths/);
  const extended=await f.store.extendReservation('VL-001',['Cargo.toml'],'Required build graph ownership');
  assert.deepEqual(extended.paths,['crates/vl-game-core/**','Cargo.toml']);
  assert.equal(extended.owner,original.owner);assert.equal(extended.history[0].sha256,sha256(serialize(original)));
  await f.store.start('VL-001');
  const ref='handoffs/scope.json';await writeFile(join(f.root,ref),serialize({taskId:'VL-001',owner:'agent1',sourceRevision:f.source,commands:[{command:'test',exitCode:0}],artifacts:f.artifacts}));
  await f.store.submit('VL-001',ref);
  await assert.rejects(f.store.extendReservation('VL-001',['docs/architecture'],'after submit'),/editable/);
  await writeFile(join(f.root,original.ref),'{}');
  await assert.rejects(f.store.load(),/Historical reservation changed/);
});
test('submit, verify and persisted verification reject unbound source evidence',async t=>{
  for(const variant of ['missing-commit','missing-artifact','wrong-hash','directory','traversal'])await t.test(variant,async t=>{
    const f=await fixture(t);
    await f.store.reserve('VL-001','agent1',['crates'],f.location);await f.store.start('VL-001');
    const handoff={taskId:'VL-001',owner:'agent1',sourceRevision:f.source,acceptanceMet:true,commands:[{command:'test',exitCode:0}],artifacts:f.artifacts.map(row=>({...row}))};
    if(variant==='missing-commit')handoff.sourceRevision=source;
    if(variant==='missing-artifact')handoff.artifacts[0].ref='does-not-exist.json';
    if(variant==='wrong-hash')handoff.artifacts[0].sha256='a'.repeat(64);
    if(variant==='directory')handoff.artifacts[0].ref='.';
    if(variant==='traversal')handoff.artifacts[0].ref='../facts.json';
    const handoffRef='handoffs/proof.json',reviewRef='reviews/proof.json';
    await writeFile(join(f.root,handoffRef),serialize(handoff));
    await assert.rejects(f.store.submit('VL-001',handoffRef));
    // Exercise records published by the earlier scheduler, which had no source gate.
    const stateRef=join(f.root,'live-state.json'),state=JSON.parse(await readFile(stateRef));
    Object.assign(state.tasks['VL-001'],{status:'IN_REVIEW',handoffRef,handoffSha256:sha256(serialize(handoff))});
    await writeFile(stateRef,serialize(state));
    const review={taskId:'VL-001',reviewer:'agent2',sourceRevision:handoff.sourceRevision,handoffSha256:state.tasks['VL-001'].handoffSha256,decision:'APPROVED',reviewedAt:new Date().toISOString(),findings:[]};
    await writeFile(join(f.root,reviewRef),serialize(review));
    await assert.rejects(f.store.verify('VL-001',reviewRef));
    assert.equal((await f.store.load()).state.tasks['VL-001'].status,'IN_REVIEW');
    Object.assign(state.tasks['VL-001'],{status:'VERIFIED',reviewRef,reviewSha256:sha256(serialize(review))});
    await writeFile(stateRef,serialize(state));await assert.rejects(f.store.load());
  });
});
test('source-bound artifacts survive later legitimate working tree changes',async t=>{
  const f=await fixture(t);
  await f.store.reserve('VL-001','agent1',['crates'],f.location);await f.store.start('VL-001');
  const handoff={taskId:'VL-001',owner:'agent1',sourceRevision:f.source,acceptanceMet:true,commands:[{command:'test',exitCode:0}],artifacts:f.artifacts};
  const ref='handoffs/first.json',reviewRef='reviews/first.json';
  await writeFile(join(f.root,ref),serialize(handoff));await f.store.submit('VL-001',ref);
  await writeFile(join(f.root,reviewRef),serialize({taskId:'VL-001',reviewer:'agent2',sourceRevision:f.source,handoffSha256:sha256(serialize(handoff)),decision:'APPROVED',reviewedAt:new Date().toISOString(),findings:[]}));
  await writeFile(join(f.root,'facts.json'),'later task evidence\n');
  await f.store.verify('VL-001',reviewRef);await f.store.load();
});
test('failed required checks cannot be approved; diagnostic failures retain explicit limits',()=>{
  const handoff={taskId:'VL-001',sourceRevision:source,acceptanceMet:true,commands:[{command:'test',exitCode:1}],artifacts:[{ref:'facts.json',sha256:'a'.repeat(64)}]};
  const review={taskId:'VL-001',reviewer:'agent2',sourceRevision:source,handoffSha256:'b'.repeat(64),decision:'APPROVED',reviewedAt:new Date().toISOString(),findings:[]},current={status:'IN_REVIEW',owner:'agent1'};
  assert.throws(()=>approveReview(current,handoff,review,review.handoffSha256),/acceptance check failed/);
  handoff.commands[0].required=false;
  assert.throws(()=>approveReview(current,handoff,review,review.handoffSha256),/No required/);
  handoff.commands.push({command:'required test',exitCode:0});
  assert.throws(()=>approveReview(current,handoff,review,review.handoffSha256),/explicit limitation/);
  handoff.commands[0].limitation='Known optional browser performance failure; not Windows acceptance';
  assert(approveReview(current,handoff,review,review.handoffSha256));
});
test('changes requested preserves immutable review history and supports a new handoff',async t=>{
  const f=await fixture(t);
  await f.store.reserve('VL-001','agent1',['crates'],f.location);await f.store.start('VL-001');
  const handoff={taskId:'VL-001',owner:'agent1',sourceRevision:f.source,acceptanceMet:true,commands:[{command:'test',exitCode:0}],artifacts:f.artifacts};
  const oldRef='handoffs/first.json',reviewRef='reviews/first.json';
  await writeFile(join(f.root,oldRef),serialize(handoff));await f.store.submit('VL-001',oldRef);
  const review={taskId:'VL-001',reviewer:'agent2',sourceRevision:f.source,handoffSha256:sha256(serialize(handoff)),decision:'CHANGES_REQUESTED',reviewedAt:new Date().toISOString(),findings:[{id:'R1',message:'Fix evidence gate'}]};
  await writeFile(join(f.root,reviewRef),serialize(review));
  await f.store.requestChanges('VL-001',reviewRef);
  assert.equal((await f.store.load()).state.tasks['VL-001'].status,'IN_PROGRESS');
  const nextRef='handoffs/second.json';await writeFile(join(f.root,nextRef),serialize({...handoff,revision:2}));
  await f.store.submit('VL-001',nextRef);
  await assert.rejects(f.store.verify('VL-001',reviewRef),/different handoff/);
  await writeFile(join(f.root,reviewRef),serialize({...review,findings:[]}));
  await assert.rejects(f.store.load(),/Historical review changed/);
});

test('owner single-agent policy requires a separate honest audit and exact successful CI before unlocking dependencies',async t=>{
  const f=await fixture(t),policyRef='policies/single-agent.json';await mkdir(join(f.root,'policies'));
  const policy={schemaVersion:1,mode:'SINGLE_AGENT_SEQUENTIAL_AUDIT',authorizedBy:'owner',independent:false,requireSuccessfulCI:true,
    ownerInstruction:'Use one agent with a separate audit and actual CI; label review as not independent',authorizedAt:'2026-11-10T00:00:00Z',lanes:['A0-Coordinator','A3-Web-UX']};
  await writeFile(join(f.root,policyRef),serialize(policy));
  await assert.rejects(f.store.adoptSingleAgentPolicy(policyRef,'agent2'),/coordinator/);
  await f.store.adoptSingleAgentPolicy(policyRef);
  await assert.rejects(f.store.adoptSingleAgentPolicy(policyRef),/already adopted/);
  let loaded=await f.store.load();
  assert(readyTasks(f.taskdoc,loaded.state,'agent1').some(task=>task.id==='VL-003'));
  await assert.rejects(f.store.reserve('VL-004','agent1',['hardware'],f.location),/not READY/);
  await f.store.reserve('VL-001','agent1',['crates'],f.location);await f.store.start('VL-001');
  const handoff={taskId:'VL-001',owner:'agent1',sourceRevision:f.source,completedAt:'2026-11-10T01:00:00Z',acceptanceMet:true,commands:[{command:'test',exitCode:0}],artifacts:f.artifacts};
  const handoffRef='handoffs/single.json',reviewRef='reviews/single.json';
  await writeFile(join(f.root,handoffRef),serialize(handoff));await f.store.submit('VL-001',handoffRef);
  const review={taskId:'VL-001',reviewer:'agent1',reviewMode:policy.mode,independent:false,policySha256:sha256(serialize(policy)),sourceRevision:f.source,
    handoffSha256:sha256(serialize(handoff)),decision:'APPROVED',reviewedAt:'2026-11-10T01:20:00Z',findings:[],
    audit:{startedAt:'2026-11-10T01:10:00Z',sourceUnchanged:true,checks:[{command:'actual audit check',exitCode:0}]},
    ci:[{runId:123,url:'https://github.com/example/fixture/actions/runs/123',sourceRevision:f.source,conclusion:'success'}]};
  for(const mutate of [r=>{delete r.reviewMode;},r=>{r.independent=true;},r=>{r.policySha256='a'.repeat(64);},
    r=>{r.audit.startedAt='2026-11-10T00:50:00Z';},r=>{r.audit.sourceUnchanged=false;},r=>{r.audit.checks[0].exitCode=1;},
    r=>{r.ci=[];},r=>{r.ci[0].sourceRevision='a'.repeat(40);},r=>{r.ci[0].conclusion='cancelled';},r=>{r.ci[0].url='file:///tmp/123';},r=>{r.ci[0].url='https://github.com/example/fixture/actions/runs/456';}]){
    const invalid=JSON.parse(serialize(review));mutate(invalid);
    await writeFile(join(f.root,reviewRef),serialize(invalid));await assert.rejects(f.store.verify('VL-001',reviewRef));
  }
  const rejection={...review,decision:'CHANGES_REQUESTED',findings:['Actual audit check failed'],audit:{...review.audit,checks:[{command:'failing audit',exitCode:1}]},ci:[]};
  await writeFile(join(f.root,reviewRef),serialize(rejection));await f.store.requestChanges('VL-001',reviewRef);
  assert.equal((await f.store.load()).state.tasks['VL-001'].status,'IN_PROGRESS');
  await f.store.submit('VL-001',handoffRef);
  const approvedRef='reviews/single-approved.json';
  await writeFile(join(f.root,approvedRef),serialize(review));await f.store.verify('VL-001',approvedRef);
  loaded=await f.store.load();assert.equal(loaded.state.tasks['VL-001'].reviewMode,policy.mode);
  assert(readyTasks(f.taskdoc,loaded.state,'agent1').some(task=>task.id==='VL-002'));
  const failed={...handoff,commands:[{command:'required test',exitCode:1}]};
  assert.throws(()=>approveReview({status:'IN_REVIEW',owner:'agent1'},failed,review,review.handoffSha256,loaded.reviewPolicy),/acceptance check failed/);
  await writeFile(join(f.root,policyRef),serialize({...policy,independent:true}));
  await assert.rejects(f.store.load(),/policy changed/);
});

test('single-agent policy cannot invent lanes or imply independent review',async t=>{
  const f=await fixture(t);await mkdir(join(f.root,'policies'));
  const policy={schemaVersion:1,mode:'SINGLE_AGENT_SEQUENTIAL_AUDIT',authorizedBy:'owner',independent:false,requireSuccessfulCI:true,
    ownerInstruction:'Explicit test owner instruction',authorizedAt:'2026-11-10T00:00:00Z',lanes:['unknown-lane']};
  await writeFile(join(f.root,'policies/bad.json'),serialize(policy));
  await assert.rejects(f.store.adoptSingleAgentPolicy('policies/bad.json'),/Unknown policy lane/);
  await writeFile(join(f.root,'policies/bad.json'),serialize({...policy,lanes:['A0-Coordinator'],requireSuccessfulCI:false}));
  await assert.rejects(f.store.adoptSingleAgentPolicy('policies/bad.json'));
  assert.equal((await f.store.load()).state.reviewPolicy,undefined);
});
