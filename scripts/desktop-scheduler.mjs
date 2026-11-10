import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export const planRoot = 'docs/plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First';
export const runtimeRoot = planRoot + '/.agent-runtime';
const statuses = new Set(['TODO','RESERVED','IN_PROGRESS','IN_REVIEW','VERIFIED','FAILED','BLOCKED_EXTERNAL','DEFERRED_APPROVED']);
const claimed = new Set(['RESERVED','IN_PROGRESS','IN_REVIEW']);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = async ref => JSON.parse(await readFile(ref,'utf8'));
const serialize = value => JSON.stringify(value,null,2)+'\n';
const execute = promisify(execFile);

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
function validateReviewPolicy(policy) {
  assert.equal(policy.schemaVersion,1);
  assert.equal(policy.mode,'SINGLE_AGENT_SEQUENTIAL_AUDIT');
  assert.equal(policy.authorizedBy,'owner');
  assert.equal(policy.independent,false);
  assert.equal(policy.requireSuccessfulCI,true);
  assert(typeof policy.ownerInstruction==='string'&&policy.ownerInstruction.trim(),'Owner instruction required');
  assert(Number.isFinite(Date.parse(policy.authorizedAt)),'Policy authorization time required');
  assert(Array.isArray(policy.lanes)&&policy.lanes.length>0&&policy.lanes.every(lane=>typeof lane==='string'),'Explicit policy lanes required');
}
function reviewIdentity(current,handoff,review,policy) {
  assert(review.reviewer,'Reviewer required');
  if(review.reviewer!==current.owner) {
    assert(!review.reviewMode||review.reviewMode==='INDEPENDENT','Different reviewer cannot claim single-agent mode');
    assert(review.independent!==false,'Independent review mislabeled');return;
  }
  assert(policy,'Independent reviewer required without owner single-agent policy');
  validateReviewPolicy(policy);
  assert.equal(review.reviewMode,policy.mode,'Single-agent review must declare its mode');
  assert.equal(review.independent,false,'Single-agent review must not claim independence');
  assert.equal(review.policySha256,policy.sha256,'Review policy mismatch');
  const finished=Date.parse(handoff.completedAt),started=Date.parse(review.audit?.startedAt),ended=Date.parse(review.reviewedAt);
  assert(Number.isFinite(finished)&&Number.isFinite(started)&&started>=finished&&ended>started,'Separate post-implementation audit required');
  assert(started>=Date.parse(policy.authorizedAt),'Audit predates owner policy');
  assert.equal(review.audit.sourceUnchanged,true,'Audit must retain committed source');
  assert(review.audit.checks?.length>0&&review.audit.checks.every(check=>check.command&&Number.isInteger(check.exitCode)),'Actual audit checks required');
  assert(Array.isArray(review.ci)&&review.ci.every(run=>run.sourceRevision===handoff.sourceRevision&&typeof run.conclusion==='string'&&run.conclusion&&Number.isSafeInteger(run.runId)&&run.runId>0&&new RegExp('^https://github\\.com/[^/]+/[^/]+/actions/runs/'+run.runId+'$').test(run.url)),'Exact-source CI records required');
  if(review.decision==='APPROVED') {
    assert(review.audit.checks.every(check=>check.exitCode===0),'Actual passing audit checks required');
    assert(review.ci.length>0&&review.ci.every(run=>run.conclusion==='success'),'Exact-source successful CI required');
  }
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
    if(current.status==='VERIFIED')assert(current.reviewRef&&current.reviewSha256,'Missing review '+task.id);
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
export function approveReview(current,handoff,review,handoffHash,policy) {
  assert.equal(current.status,'IN_REVIEW');
  assert.equal(handoff.acceptanceMet,true,'Handoff acceptance incomplete');
  assert.equal(review.taskId,handoff.taskId);
  assert.equal(review.sourceRevision,handoff.sourceRevision,'Review covers a different source');
  assert.equal(review.handoffSha256,handoffHash,'Review covers a different handoff');
  assert.equal(review.decision,'APPROVED');
  reviewIdentity(current,handoff,review,policy);
  assert(Number.isFinite(Date.parse(review.reviewedAt))&&review.findings?.length===0,'Review has unresolved findings');
  assert(handoff.commands?.length>0&&handoff.commands.every(command=>Number.isInteger(command.exitCode)),'Missing actual commands');
  assert(handoff.commands.every(command=>typeof command.command==='string'&&command.command.length>0),'Missing command names');
  assert(handoff.commands.some(command=>command.required!==false),'No required acceptance checks');
  for(const command of handoff.commands) {
    assert(command.required===undefined||typeof command.required==='boolean','Invalid check requirement');
    if(command.required===false)assert(typeof command.limitation==='string'&&command.limitation.trim(),'Diagnostic check needs an explicit limitation');
    else assert.equal(command.exitCode,0,'Required acceptance check failed');
  }
  assert(handoff.artifacts?.length>0&&handoff.artifacts.every(artifact=>artifact.ref&&/^[a-f0-9]{64}$/.test(artifact.sha256)),'Missing artifact hashes');
  assert(/^[a-f0-9]{40}$/.test(handoff.sourceRevision),'Commit SHA required');
  return true;
}

export function schedulerStore(root=runtimeRoot,tasksRef=planRoot+'/06-execution/TASKS.json',repositoryRoot=process.cwd()) {
  const stateRef=resolve(root,'live-state.json');
  const localRef=ref=>{scopePath(ref);const full=resolve(root,ref);assert(!relative(resolve(root),full).startsWith('..'),'Reference escapes runtime');return full;};
  async function readReviewPolicy(state) {
    if(!state.reviewPolicy)return undefined;
    const {ref,sha256:hash}=state.reviewPolicy,bytes=await readFile(localRef(ref));
    assert.equal(sha256(bytes),hash,'Owner review policy changed');
    const policy=JSON.parse(bytes);validateReviewPolicy(policy);return {...policy,sha256:hash};
  }
  async function verifySourceEvidence(handoff) {
    assert(/^[a-f0-9]{40}$/.test(handoff.sourceRevision),'Commit SHA required');
    const git=async args=>(await execute('git',args,{cwd:repositoryRoot,encoding:'buffer',maxBuffer:16*1024**2})).stdout;
    assert.equal((await git(['cat-file','-t',handoff.sourceRevision])).toString().trim(),'commit','Source must be an existing commit');
    assert(handoff.artifacts?.length>0,'Missing artifacts');
    for(const artifact of handoff.artifacts) {
      scopePath(artifact.ref);assert(!artifact.ref.endsWith('/**'),'Artifact must name a file');
      assert(/^[a-f0-9]{64}$/.test(artifact.sha256),'Missing artifact hash');
      // Evidence is immutable at its source commit. Later legitimate source edits
      // must not invalidate an earlier task; untracked raw logs need a committed summary.
      const object=handoff.sourceRevision+':'+artifact.ref;
      assert.equal((await git(['cat-file','-t',object])).toString().trim(),'blob','Artifact must be a committed file');
      assert.equal(sha256(await git(['show',object])),artifact.sha256,'Committed artifact hash mismatch: '+artifact.ref);
    }
  }
  async function load() {
    const taskBytes=await readFile(tasksRef),taskdoc=JSON.parse(taskBytes),state=await json(stateRef);
    assert.equal(state.taskGraphSha256,sha256(taskBytes),'Plan graph changed without reconciliation');
    validateState(taskdoc,state);
    const reviewPolicy=await readReviewPolicy(state);
    for(const current of Object.values(state.tasks))if(claimed.has(current.status)) {
      const reservation=state.reservations[current.reservationId];
      assert.deepEqual(await json(localRef(reservation.ref)),reservation,'Reservation mirror mismatch');
    }
    for(const reservation of Object.values(state.reservations)) {
      for(const previous of reservation.history??[]) {
        const bytes=await readFile(localRef(previous.ref));
        assert.equal(sha256(bytes),previous.sha256,'Historical reservation changed');
        const snapshot=JSON.parse(bytes);
        assert.equal(snapshot.id,reservation.id);assert.equal(snapshot.taskId,reservation.taskId);
        assert.equal(snapshot.owner,reservation.owner);
      }
    }
    for(const current of Object.values(state.tasks))if(current.handoffRef)assert.equal(sha256(await readFile(localRef(current.handoffRef))),current.handoffSha256,'Handoff changed after publication');
    for(const [taskId,current] of Object.entries(state.tasks))for(const attempt of current.attempts??[]) {
      const bytes=await readFile(localRef(attempt.handoffRef)),reviewBytes=await readFile(localRef(attempt.reviewRef));
      assert.equal(sha256(bytes),attempt.handoffSha256,'Historical handoff changed');
      assert.equal(sha256(reviewBytes),attempt.reviewSha256,'Historical review changed');
      const handoff=JSON.parse(bytes),review=JSON.parse(reviewBytes);
      assert.equal(handoff.taskId,taskId);assert.equal(review.taskId,taskId);assert.equal(review.sourceRevision,handoff.sourceRevision);
      assert.equal(review.handoffSha256,attempt.handoffSha256);assert.equal(review.decision,'CHANGES_REQUESTED');
      assert(state.agents[review.reviewer],'Unknown historical reviewer');
      reviewIdentity(current,handoff,review,reviewPolicy);
    }
    for(const current of Object.values(state.tasks))if(current.status==='VERIFIED') {
      const bytes=await readFile(localRef(current.reviewRef));assert.equal(sha256(bytes),current.reviewSha256,'Review changed after verification');
      const review=JSON.parse(bytes);assert(state.agents[review.reviewer],'Unknown reviewer');
      approveReview({...current,status:'IN_REVIEW'},await json(localRef(current.handoffRef)),review,current.handoffSha256,reviewPolicy);
      await verifySourceEvidence(await json(localRef(current.handoffRef)));
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
    return {taskdoc,state,reviewPolicy};
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
    adoptSingleAgentPolicy: (ref,actor='agent1') => mutate(actor,async(taskdoc,state)=>{
      assert(!state.reviewPolicy,'Owner review policy already adopted');
      const bytes=await readFile(localRef(ref)),policy=JSON.parse(bytes);validateReviewPolicy(policy);
      const lanes=new Set(taskdoc.tasks.map(task=>task.lane));
      assert(policy.lanes.every(lane=>lanes.has(lane)),'Unknown policy lane');
      state.reviewPolicy={ref,sha256:sha256(bytes)};
      state.agents.agent1.lanes=[...new Set([...state.agents.agent1.lanes,...policy.lanes])];
      return state.reviewPolicy;
    }),
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
    narrowReservation: (taskId,paths,reason,actor='agent1') => mutate(actor,async(_taskdoc,state)=>{
      const current=state.tasks[taskId];
      assert(['RESERVED','IN_PROGRESS'].includes(current?.status),'Reservation must be editable');
      const previous=state.reservations[current.reservationId];
      assert(Array.isArray(paths)&&paths.length>0&&new Set(paths).size===paths.length,'Unique nonempty paths required');
      paths.forEach(scopePath);
      assert(paths.every(path=>previous.paths.some(old=>scopePath(path)===scopePath(old)||scopePath(path).startsWith(scopePath(old)+'/'))),'Reservation cannot expand');
      assert(previous.paths.some(old=>!paths.some(path=>scopePath(path)===scopePath(old))),'Reservation must narrow');
      assert(typeof reason==='string'&&reason.trim().length>0,'Narrowing reason required');
      // Write a new mirror first; a failed state replacement leaves the old one valid.
      const ref='reservations/'+taskId+'-'+randomUUID()+'.json';
      const reservation={...previous,ref,paths,amendedAt:new Date().toISOString(),reason,
        history:[...(previous.history??[]),{ref:previous.ref,sha256:sha256(await readFile(localRef(previous.ref)))}]};
      await writeFile(localRef(ref),serialize(reservation),{flag:'wx'});
      state.reservations[previous.id]=reservation;return reservation;
    }),
    extendReservation: (taskId,paths,reason,actor='agent1') => mutate(actor,async(_taskdoc,state)=>{
      const current=state.tasks[taskId];
      assert(['RESERVED','IN_PROGRESS'].includes(current?.status),'Reservation must be editable');
      const previous=state.reservations[current.reservationId];
      assert(Array.isArray(paths)&&paths.length>0&&new Set(paths).size===paths.length,'Unique nonempty paths required');
      paths.forEach(scopePath);
      assert(paths.every(path=>!previous.paths.some(old=>scopePath(path)===scopePath(old))),'Only new paths may be added');
      assert(typeof reason==='string'&&reason.trim().length>0,'Extension reason required');
      for(const other of Object.values(state.tasks))if(claimed.has(other.status)&&other!==current) {
        const reservation=state.reservations[other.reservationId];
        assert(!paths.some(a=>reservation.paths.some(b=>overlaps(a,b))),'File ownership conflict');
      }
      const ref='reservations/'+taskId+'-'+randomUUID()+'.json';
      const reservation={...previous,ref,paths:[...previous.paths,...paths],amendedAt:new Date().toISOString(),reason,
        history:[...(previous.history??[]),{ref:previous.ref,sha256:sha256(await readFile(localRef(previous.ref)))}]};
      await writeFile(localRef(ref),serialize(reservation),{flag:'wx'});
      state.reservations[previous.id]=reservation;return reservation;
    }),
    submit: (taskId,handoffRef,actor='agent1') => mutate(actor,async(_taskdoc,state)=>{
      const current=state.tasks[taskId];assert.equal(current?.status,'IN_PROGRESS');
      const bytes=await readFile(localRef(handoffRef)),handoff=JSON.parse(bytes);
      assert.equal(handoff.taskId,taskId);assert.equal(handoff.owner,current.owner);
      assert(/^[a-f0-9]{40}$/.test(handoff.sourceRevision)&&handoff.commands?.length>0,'Actual source/commands required');
      await verifySourceEvidence(handoff);
      current.status='IN_REVIEW';current.handoffRef=handoffRef;current.handoffSha256=sha256(bytes);return current;
    }),
    verify: (taskId,reviewRef,actor='agent1') => mutate(actor,async(_taskdoc,state)=>{
      const current=state.tasks[taskId];assert(current,'Unknown task');
      const handoff=await json(localRef(current.handoffRef)),bytes=await readFile(localRef(reviewRef)),review=JSON.parse(bytes);
      approveReview(current,handoff,review,current.handoffSha256,await readReviewPolicy(state));
      assert(state.agents[review.reviewer],'Unknown reviewer');
      await verifySourceEvidence(handoff);
      current.status='VERIFIED';current.reviewRef=reviewRef;current.reviewSha256=sha256(bytes);current.reviewMode=review.reviewMode??'INDEPENDENT';return current;
    }),
    requestChanges: (taskId,reviewRef,actor='agent1') => mutate(actor,async(_taskdoc,state)=>{
      const current=state.tasks[taskId];assert.equal(current?.status,'IN_REVIEW');
      const handoff=await json(localRef(current.handoffRef)),bytes=await readFile(localRef(reviewRef)),review=JSON.parse(bytes);
      assert.equal(review.taskId,taskId);assert.equal(review.sourceRevision,handoff.sourceRevision);
      assert.equal(review.handoffSha256,current.handoffSha256);assert.equal(review.decision,'CHANGES_REQUESTED');
      assert(state.agents[review.reviewer],'Unknown reviewer');
      reviewIdentity(current,handoff,review,await readReviewPolicy(state));
      assert(Number.isFinite(Date.parse(review.reviewedAt))&&review.findings?.length>0,'Missing review findings');
      current.attempts=[...(current.attempts??[]),{handoffRef:current.handoffRef,handoffSha256:current.handoffSha256,reviewRef,reviewSha256:sha256(bytes),decision:review.decision}];
      delete current.handoffRef;delete current.handoffSha256;current.status='IN_PROGRESS';return current;
    })
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [command='status',agent='agent1',...extra]=process.argv.slice(2);
  assert.equal(command,'status','Use the exported coordinator API for mutations');assert.equal(extra.length,0);
  const {taskdoc,state}=await schedulerStore().load();
  console.log(JSON.stringify({sourceBaseline:state.sourceBaseline,agent,ready:readyTasks(taskdoc,state,agent).map(task=>({id:task.id,priority:task.priority,lane:task.lane})),inReview:Object.entries(state.tasks).filter(([,task])=>task.status==='IN_REVIEW').map(([id,task])=>({id,owner:task.owner,handoffRef:task.handoffRef})),counts:Object.values(state.tasks).reduce((counts,task)=>(counts[task.status]=(counts[task.status]||0)+1,counts),{})},null,2));
}
