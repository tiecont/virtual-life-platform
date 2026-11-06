import path from 'node:path';
import { validatePlan } from './validate-plan.mjs';
import { inspectUpstream,chooseUpstream } from './check-upstream.mjs';

try{
 const {manifest,state,gate,errors}=validatePlan();
 if(errors.length)throw new Error('Invalid Phase 2 pack:\n'+errors.join('\n'));
 const status=inspectUpstream(manifest,gate,chooseUpstream());
 const waves=new Map(manifest.waves.map(w=>[w.id,w]));
 const counts={};
 for(const task of Object.values(state.tasks))counts[task.status]=(counts[task.status]||0)+1;
 const blocked=[];const ready=[];
 for(const task of manifest.tasks.filter(t=>state.tasks[t.id].status==='TODO')){
  const missingLocal=task.depends_on.filter(id=>state.tasks[id]?.status!=='VERIFIED');
  const missingUpstream=task.upstream_requires.filter(id=>status.upstreamTasks?.[id]?.status!=='VERIFIED'||!status.upstreamTasks?.[id]?.evidence_refs?.length);
  const milestone=waves.get(task.wave_id)?.unlock_after;
  const missingWave=milestone&&state.tasks[milestone]?.status!=='VERIFIED'?milestone:null;
  const item={id:task.id,title:task.title,wave:task.wave_id,missingLocal,missingUpstream,missingWave};
  if(status.status==='ACTIVE'&&!missingLocal.length&&!missingUpstream.length&&!missingWave)ready.push(item);
  else blocked.push(item);
 }
 ready.sort((a,b)=>manifest.tasks.find(t=>t.id===a.id).priority-manifest.tasks.find(t=>t.id===b.id).priority);
 console.log(JSON.stringify({planOnly:true,phase:'LAN-L02',status:status.status,phaseReasons:status.reasons,counts,next:ready[0]||null,ready,blockedCount:blocked.length,blockedPreview:blocked.slice(0,6),ownerActionRequired:gate.phase_state!=='ACTIVE'||status.status==='CONFLICT_UPSTREAM_GAME_TASKS'},null,2));
}catch(e){console.error(String(e.stack||e));process.exitCode=1;}
