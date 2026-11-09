import {existsSync,readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,validatePlan} from './validate-plan.mjs';

export function selectTasks({manifest,state,upstream,roadmap,lodgeGate,handoffValid}){
 const reasons=[];
 if(state.activation!=='ACTIVE')reasons.push('Arena is '+state.activation+';planning does not activate implementation');
 if(roadmap.active_lane!=='PET_ARENA')reasons.push('Source lane belongs to '+roadmap.active_lane);
 if(lodgeGate.phase_state==='ACTIVE')reasons.push('Lodge scheduler is active;checkpoint ownership before switching');
 if(!handoffValid)reasons.push('Missing reviewed source-bound handoff and cleared source ownership');
 const verified=id=>state.tasks[id]?.status==='VERIFIED',upstreamVerified=id=>upstream.tasks[id]?.status==='VERIFIED'&&upstream.tasks[id]?.evidence_refs?.length>0;
 const ready=[],blocked=[];
 for(const task of manifest.tasks.filter(task=>state.tasks[task.id].status==='TODO')){
  const missingLocal=task.depends_on.filter(id=>!verified(id)),missingUpstream=task.upstream_requires.filter(id=>!upstreamVerified(id));
  const missingStage=[...(!state.active_stages.includes(task.stage)?['STAGE_NOT_ACTIVE:'+task.stage]:[]),...(task.stage==='S3'?['PA-017','PA-018'].filter(id=>!verified(id)):[])];
  const item={id:task.id,title:task.title,stage:task.stage,missingLocal,missingUpstream,missingStage};
  if(!reasons.length&&!missingLocal.length&&!missingUpstream.length&&!missingStage.length)ready.push(item);else blocked.push(item);
 }
 ready.sort((a,b)=>a.id.localeCompare(b.id));
 return {planOnly:true,status:reasons.length?'WAITING':'ACTIVE',reasons,next:ready[0]??null,ready,blocked};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const data=validatePlan(),handoff=data.state.handoff,ref=handoff.record,absolute=typeof ref==='string'?resolve(root,ref):'';
  const handoffValid=handoff.source_ownership_cleared===true&&/^[a-f0-9]{40}$/.test(handoff.source_revision??'')&&absolute.startsWith(resolve(root)+sep)&&existsSync(absolute)&&readFileSync(absolute,'utf8').includes(handoff.source_revision);
  console.log(JSON.stringify(selectTasks({...data,handoffValid}),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
