import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';

export const planRoot = 'docs/plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First';
export const runtimeRoot = planRoot + '/.agent-runtime';
const statuses = new Set(['TODO','RESERVED','IN_PROGRESS','IN_REVIEW','VERIFIED','FAILED','BLOCKED_EXTERNAL','DEFERRED_APPROVED']);
const claimed = new Set(['RESERVED','IN_PROGRESS','IN_REVIEW']);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = async ref => JSON.parse(await readFile(ref,'utf8'));
const serialize = value => JSON.stringify(value,null,2)+'\n';

export function scopePath(value) {
  assert(typeof value==='string' && value.length>0 && !isAbsolute(value) && !value.includes('\\'), 'Expected repository-relative scope');
  const path=value.endsWith('/**')?value.slice(0,-3):value;
  assert(!path.split('/').some(part=>!part||part==='.'||part==='..') && !/[?*\0]/.test(path),'Invalid reservation path');
  return path;
}
export function overlaps(a,b) {
  a=scopePath(a);b=scopePath(b);
  return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
}
function dependencies(task,state) {
  return task.depends_on.filter(id=>state.tasks[id]?.status!=='VERIFIED');
}
function gates(task,state) {
  return task.external_gates.filter(gate=>!state.gateEvidence?.[task.id]?.some(row=>row.gate===gate&&row.evidenceRefs?.length>0));
}
export function validateState(taskdoc,state) {
  assert.equal(state.schemaVersion,1);
  assert.equal(state.coordinator,'agent1');
  assert.equal(state.releaseStatus,'NOT_REQUESTED');
  assert(state.tasks && state.reservations && state.agents && state.gateEvidence,'Incomplete live state');
  assert.deepEqual(Object.keys(state.tasks).sort(),taskdoc.tasks.map(task=>task.id).sort(),'Live task IDs differ from plan');
  const ids=new Set(taskdoc.tasks.map(task=>task.id)),visiting=new Set(),visited=new Set();
  assert.equal(ids.size,taskdoc.tasks.length,'Duplicate task ID');
  const byId=new Map(taskdoc.tasks.map(task=>[task.id,task]));
  function visit(id) {
    assert(ids.has(id),'Unknown dependency '+id);
    assert(!visiting.has(id),'Dependency cycle '+id);
    if(visited.has(id))return;
    visiting.add(id);byId.get(id).depends_on.forEach(visit);visiting.delete(id);visited.add(id);
  }
  const active=[];
  for(const task of taskdoc.tasks) {
    visit(task.id);
    const current=state.tasks[task.id];assert(statuses.has(current.status),'Unknown status '+task.id);
    if(claimed.has(current.status)||current.status==='VERIFIED') {
      assert.equal(dependencies(task,state).length,0,'Unverified dependencies '+task.id);
      assert.equal(gates(task,state).length,0,'Missing external gates '+task.id);
      assert(state.agents[current.owner]?.lanes.includes(task.lane),'Lane ownership mismatch '+task.id);
      const reservation=state.reservations[current.reservationId];
      assert(reservation&&reservation.taskId===task.id&&reservation.owner===current.owner,'Missing task reservation '+task.id);
      assert(reservation.paths.length>0&&reservation.branch&&isAbsolute(reservation.worktree)&&/^[a-f0-9]{40}$/.test(reservation.sourceRevision),'Incomplete reservation '+task.id);
      reservation.paths.forEach(scopePath);
      if(claimed.has(current.status))active.push(reservation);
    }
    if(current.status==='IN_REVIEW'||current.status==='VERIFIED')assert(current.handoffRef&&current.handoffSha256,'Missing handoff '+task.id);
    if(current.status==='VERIFIED')assert(current.reviewRef&&current.reviewSha256,'Missing independent review '+task.id);
  }
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++) {
    assert(active[i].taskId!==active[j].taskId,'Duplicate reservation');
    assert(!active[i].paths.some(a=>active[j].paths.some(b=>overlaps(a,b))),'Overlapping active reservations');
  }
  for(const [id,reservation] of Object.entries(state.reservations))assert(id===reservation.id&&state.tasks[reservation.taskId]?.reservationId===id,'Orphan/duplicate reservation');
  return true;
}
export function readyTasks(taskdoc,state,agent) {
  validateState(taskdoc,state);assert(state.agents[agent],'Unknown agent');
  return taskdoc.tasks.filter(task=>state.tasks[task.id].status==='TODO'&&state.agents[agent].lanes.includes(task.lane)&&dependencies(task,state).length===0&&gates(task,state).length===0)
    .sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
}
export function approveReview(current,handoff,review,handoffHash) {
  assert.equal(current.status,'IN_REVIEW');
  assert.equal(handoff.acceptanceMet,true,'Handoff acceptance incomplete');
  assert.equal(review.taskId,handoff.taskId);
  assert.equal(review.sourceRevision,handoff.sourceRevision,'Review covers a different source');
  assert.equal(review.handoffSha256,handoffHash,'Review covers a different handoff');
  assert.equal(review.decision,'APPROVED');
  assert(review.reviewer&&review.reviewer!==current.owner,'Independent reviewer required');
  assert(Number.isFinite(Date.parse(review.reviewedAt))&&review.findings?.length===0,'Review has unresolved findings');
  assert(handoff.commands?.length>0&&handoff.commands.every(command=>Number.isInteger(command.exitCode)),'Missing actual commands');
  assert(handoff.commands.every(command=>typeof command.command==='string'&&command.command.length>0),'Missing command names');
  assert(handoff.artifacts?.length>0&&handoff.artifacts.every(artifact=>artifact.ref&&/^[a-f0-9]{64}$/.test(artifact.sha256)),'Missing artifact hashes');
  assert(/^[a-f0-9]{40}$/.test(handoff.sourceRevision),'Commit SHA required');
  return true;
}

export function schedulerStore(root=runtimeRoot,tasksRef=planRoot+'/06-execution/TASKS.json') {
  const stateRef=resolve(root,'live-state.json');
  const localRef=ref=>{scopePath(ref);const full=resolve(root,ref);assert(!relative(resolve(root),full).startsWith('..'),'Reference escapes runtime');return full;};
  async function load() {
    const taskBytes=await readFile(tasksRef),taskdoc=JSON.parse(taskBytes),state=await json(stateRef);
    assert.equal(state.taskGraphSha256,sha256(taskBytes),'Plan graph changed without reconciliation');
    validateState(taskdoc,state);
    for(const current of Object.values(state.tasks))if(claimed.has(current.status)) {
      const reservation=state.reservations[current.reservationId];
      assert.deepEqual(await json(localRef(reservation.ref)),reservation,'Reservation mirror mismatch');
    }
    for(const current of Object.values(state.tasks))if(current.handoffRef)assert.equal(sha256(await readFile(localRef(current.handoffRef))),current.handoffSha256,'Handoff changed after publication');
    for(const current of Object.values(state.tasks))if(current.status==='VERIFIED') {
      const bytes=await readFile(localRef(current.reviewRef));assert.equal(sha256(bytes),current.reviewSha256,'Review changed after verification');
      const review=JSON.parse(bytes);assert(state.agents[review.reviewer],'Unknown reviewer');
      approveReview({...current,status:'IN_REVIEW'},await json(localRef(current.handoffRef)),review,current.handoffSha256);
    }
    for(const [taskId,rows] of Object.entries(state.gateEvidence)) {
      const task=taskdoc.tasks.find(task=>task.id===taskId);assert(task,'Gate for unknown task');
      for(const row of rows) {
        assert(task.external_gates.includes(row.gate)&&row.evidenceRefs.length>0,'Unknown/empty external gate');
        for(const artifact of row.evidenceRefs) {
          assert(artifact.ref&&/^[a-f0-9]{64}$/.test(artifact.sha256),'External gate needs hashed evidence');
          assert.equal(sha256(await readFile(localRef(artifact.ref))),artifact.sha256,'External gate evidence changed');
        }
      }
    }
    return {taskdoc,state};
  }
  async function mutate(actor,work) {
    assert.equal(actor,'agent1','Only the coordinator mutates live state');
    const lock=resolve(root,'.state-write-lock');
    await mkdir(lock); // An abandoned lock needs coordinator inspection, never automatic expiry.
    let temporary;
    try {
      const {taskdoc,state}=await load(),result=await work(taskdoc,state);
      validateState(taskdoc,state);state.updatedAt=new Date().toISOString();
      temporary=stateRef+'.'+randomUUID()+'.tmp';
      await writeFile(temporary,serialize(state),{flag:'wx'});await rename(temporary,stateRef);
      return result;
    } finally {if(temporary)await rm(temporary,{force:true});await rm(lock,{recursive:true});}
  }
  return {
    load,
    reserve: (taskId,owner,paths,location,actor='agent1') => mutate(actor,async(taskdoc,state)=>{
      assert(readyTasks(taskdoc,state,owner).some(task=>task.id===taskId),'Task is not READY for this owner');
      assert(paths.length>0,'Explicit paths required');paths.forEach(scopePath);
      for(const task of Object.values(state.tasks))if(claimed.has(task.status)) {
        const other=state.reservations[task.reservationId];
        assert(!paths.some(a=>other.paths.some(b=>overlaps(a,b))),'File ownership conflict');
      }
      assert(location.branch&&isAbsolute(location.worktree)&&/^[a-f0-9]{40}$/.test(location.sourceRevision),'Branch/worktree/source required');
      const id=taskId+'-'+randomUUID(),ref='reservations/'+id+'.json';
      const reservation={id,ref,taskId,owner,paths,branch:location.branch,worktree:location.worktree,sourceRevision:location.sourceRevision,createdAt:new Date().toISOString()};
      await writeFile(localRef(ref),serialize(reservation),{flag:'wx'});
      state.reservations[id]=reservation;
      state.tasks[taskId]={...state.tasks[taskId],status:'RESERVED',owner,reservationId:id};
      return reservation;
    }),
    start: (taskId,actor='agent1') => mutate(actor,async(_taskdoc,state)=>{
      assert.equal(state.tasks[taskId]?.status,'RESERVED');state.tasks[taskId].status='IN_PROGRESS';return state.tasks[taskId];
    }),
    submit: (taskId,handoffRef,actor='agent1') => mutate(actor,async(_taskdoc,state)=>{
      const current=state.tasks[taskId];assert.equal(current?.status,'IN_PROGRESS');
      const bytes=await readFile(localRef(handoffRef)),handoff=JSON.parse(bytes);
      assert.equal(handoff.taskId,taskId);assert.equal(handoff.owner,current.owner);
      assert(/^[a-f0-9]{40}$/.test(handoff.sourceRevision)&&handoff.commands?.length>0,'Actual source/commands required');
      current.status='IN_REVIEW';current.handoffRef=handoffRef;current.handoffSha256=sha256(bytes);return current;
    }),
    verify: (taskId,reviewRef,actor='agent1') => mutate(actor,async(_taskdoc,state)=>{
      const current=state.tasks[taskId];assert(current,'Unknown task');
      const handoff=await json(localRef(current.handoffRef)),bytes=await readFile(localRef(reviewRef)),review=JSON.parse(bytes);
      approveReview(current,handoff,review,current.handoffSha256);
      assert(state.agents[review.reviewer]&&review.reviewer!==current.owner,'Unknown/own reviewer');
      current.status='VERIFIED';current.reviewRef=reviewRef;current.reviewSha256=sha256(bytes);return current;
    })
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [command='status',agent='agent1',...extra]=process.argv.slice(2);
  assert.equal(command,'status','Use the exported coordinator API for mutations');assert.equal(extra.length,0);
  const {taskdoc,state}=await schedulerStore().load();
  console.log(JSON.stringify({sourceBaseline:state.sourceBaseline,agent,ready:readyTasks(taskdoc,state,agent).map(task=>({id:task.id,priority:task.priority,lane:task.lane})),inReview:Object.entries(state.tasks).filter(([,task])=>task.status==='IN_REVIEW').map(([id,task])=>({id,owner:task.owner,handoffRef:task.handoffRef})),counts:Object.values(state.tasks).reduce((counts,task)=>(counts[task.status]=(counts[task.status]||0)+1,counts),{})},null,2));
}
