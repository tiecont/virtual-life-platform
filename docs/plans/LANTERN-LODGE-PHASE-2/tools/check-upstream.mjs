import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlan } from './validate-plan.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const DEFAULT=path.resolve(ROOT,'../platform-vnext/state/task-state.json');
const sha=/^[a-f0-9]{40}$/;

export function chooseUpstream(args=process.argv.slice(2)) {
  const pos=args.indexOf('--upstream');
  if(pos<0)return DEFAULT;
  if(!args[pos+1])throw new Error('Missing value for --upstream');
  const source=path.resolve(args[pos+1]);
  return fs.existsSync(source)&&fs.statSync(source).isDirectory()?path.join(source,'state/task-state.json'):source;
}

export function inspectUpstream(manifest,gate,file=DEFAULT) {
  const reasons=[];
  const activation=gate.phase_state==='ACTIVE';
  if(!activation) reasons.push('Phase 2 is '+gate.phase_state+'; owner has not activated it');
  if(activation){
    if(gate.owner_approved_start!==true||!gate.owner_approval_ref) reasons.push('Missing explicit owner approval');
    if(gate.no_conflicting_agents_confirmed!==true) reasons.push('No confirmation that overlapping agents stopped');
    if(gate.source_delta_reviewed!==true) reasons.push('Source delta not reviewed');
    if(!sha.test(gate.handoff_source_sha||'')) reasons.push('Missing handoff source SHA');
    if(!Number.isFinite(Date.parse(gate.activated_at||''))) reasons.push('No valid activation timestamp');
    const handoff=gate.handoff_record||'';
    const loc=handoff?path.resolve(ROOT,handoff):null;
    if(!loc||!(loc.startsWith(ROOT+path.sep))||!fs.existsSync(loc)||fs.statSync(loc).size<50)reasons.push('Missing real Phase 1 handoff in the Phase 2 state directory');
  }
  if(!fs.existsSync(file)){
    reasons.push('Upstream state file is missing; supply --upstream /real/path/state/task-state.json');
    return {status:activation?'BLOCKED':'WAITING',upstreamStatePath:file,phaseActive:activation,reasons,requires:[]};
  }
  let state;
  try{state=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(e){reasons.push('Could not parse upstream state: '+e.message);return {status:'BLOCKED',upstreamStatePath:file,phaseActive:activation,reasons,requires:[]};}
  if(!state.tasks||typeof state.tasks!=='object'||Array.isArray(state.tasks)){
    reasons.push('Upstream state lacks tasks map');
    return {status:'BLOCKED',upstreamStatePath:file,phaseActive:activation,reasons,requires:[]};
  }
  const duplicate=Object.keys(state.tasks).filter(id=>/^N(?:15|16|17|18|19)-\d\d$/.test(id));
  if(duplicate.length)reasons.push('CONFLICT_UPSTREAM_GAME_TASKS: '+duplicate.length+' N15..N19 tasks are already scheduled in Phase 1; DO NOT RUN TWO SCHEDULERS');
  const requires=manifest.upstream_required_tasks.map(id=>({id,status:state.tasks[id]?.status||'MISSING',hasEvidence:(state.tasks[id]?.evidence_refs||[]).length>0}));
  const unresolved=requires.filter(r=>r.status!=='VERIFIED'||!r.hasEvidence);
  if(!activation)return {status:duplicate.length?'CONFLICT_UPSTREAM_GAME_TASKS':'WAITING',upstreamStatePath:file,phaseActive:false,reasons,requires,unresolved:unresolved.map(r=>r.id),duplicateTasks:duplicate};
  if(duplicate.length)return {status:'CONFLICT_UPSTREAM_GAME_TASKS',upstreamStatePath:file,phaseActive:true,reasons,requires,unresolved:unresolved.map(r=>r.id),duplicateTasks:duplicate};
  if(reasons.length)return {status:'BLOCKED',upstreamStatePath:file,phaseActive:true,reasons,requires,unresolved:unresolved.map(r=>r.id),duplicateTasks:[]};
  return {status:'ACTIVE',upstreamStatePath:file,phaseActive:true,reasons,requires,unresolved:unresolved.map(r=>r.id),duplicateTasks:[],upstreamTasks:state.tasks};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {manifest,gate,errors}=validatePlan();
  if(errors.length)throw new Error('Invalid Phase 2 pack: '+errors.join('; '));
  const result=inspectUpstream(manifest,gate,chooseUpstream());
  const {upstreamTasks,...safe}=result;
  console.log(JSON.stringify({readOnly:true,...safe},null,2));
 }catch(e){console.error(String(e.stack||e));process.exitCode=1;}
}
