import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validatePlan as validateUpstream} from '../../platform-vnext/tools/validate-plan.mjs';

export const root=fileURLToPath(new URL('../',import.meta.url));
const json=ref=>JSON.parse(readFileSync(resolve(root,ref),'utf8'));
const native=id=>/^N(?:10|11|14)-/.test(id)||['N12-03','N19-04'].includes(id);
export function validateGraph(manifest,state,evidence,upstream){
 const tasks=new Map(),records=new Map();
 assert.equal(manifest.native_hard_dependencies,false);
 assert.equal(manifest.public_release_authorized,false);
 assert.equal(manifest.optional_bridges_default,'OFF');
 assert(['PLANNED','ACTIVE','PAUSED'].includes(state.activation),'Bad activation');
 assert(Array.isArray(state.active_stages)&&state.active_stages.every(stage=>manifest.stages[stage]),'Bad active stage scope');
 for(const task of manifest.tasks){
  assert(/^PA-\d{3}$/.test(task.id)&&!tasks.has(task.id),'Duplicate/bad PA task');
  assert(manifest.stages[task.stage],'Unknown stage');
  assert(task.title&&task.owner_role&&task.plan&&task.acceptance?.length,'Missing task scope/acceptance');
  assert(Array.isArray(task.depends_on)&&Array.isArray(task.upstream_requires),'Missing dependencies');
  assert(!Object.hasOwn(task,'status'),'Status belongs in state');
  for(const id of task.upstream_requires){assert(upstream.tasks[id],'Unknown upstream task');assert(!native(id),'Native hard dependency');}
  tasks.set(task.id,task);
 }
 assert.deepEqual([...tasks.keys()].sort(),Array.from({length:20},(_,i)=>'PA-'+String(i+1).padStart(3,'0')),'Preserve PA identifiers');
 assert.deepEqual(Object.keys(state.tasks).sort(),[...tasks.keys()].sort(),'Task ledger mismatch');
 for(const record of evidence.records){
  assert(record.id&&!records.has(record.id)&&tasks.has(record.taskId),'Bad evidence identity');
  assert(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.sourceRevision)&&record.environment&&Number.isFinite(Date.parse(record.executedAt)),'Missing provenance');
  assert(record.commands?.length&&record.commands.every(c=>c.command&&Number.isInteger(c.exitCode))&&record.artifacts?.length&&record.artifacts.every(a=>a.ref&&/^[a-f0-9]{64}$/.test(a.sha256))&&Array.isArray(record.limitations),'Missing actual evidence');
  records.set(record.id,record);
 }
 const visiting=new Set(),visited=new Set();
 function visit(id){assert(tasks.has(id),'Unknown dependency '+id);assert(!visiting.has(id),'Dependency cycle');if(visited.has(id))return;visiting.add(id);for(const dependency of tasks.get(id).depends_on)visit(dependency);visiting.delete(id);visited.add(id);}
 for(const task of tasks.values()){
  visit(task.id);const current=state.tasks[task.id];assert(manifest.status_values.includes(current.status),'Bad task status');
  assert(Array.isArray(current.evidence_refs),'Missing evidence refs');
  for(const id of current.evidence_refs)assert(records.get(id)?.taskId===task.id,'Foreign/missing evidence');
  if(current.status==='VERIFIED'){
   assert(current.evidence_refs.some(id=>records.get(id).acceptance_met===true),'VERIFIED needs accepted evidence');
   assert(task.depends_on.every(id=>state.tasks[id].status==='VERIFIED'),'VERIFIED dependency missing');
  }
 }
 function ancestors(id,seen=new Set()){for(const dependency of tasks.get(id).depends_on)if(!seen.has(dependency)){seen.add(dependency);ancestors(dependency,seen);}return seen;}
 for(const task of tasks.values()){
  const parents=ancestors(task.id);
  if(task.stage==='S1')assert(![...parents].some(id=>['S2','S3'].includes(tasks.get(id).stage)),'S1 must not require S2/S3');
  if(task.stage==='S2')assert(![...parents].some(id=>tasks.get(id).stage==='S3'),'S2 must not require PvP');
  if(task.stage==='S3')assert(['PA-017','PA-018'].every(id=>parents.has(id)),'PvP requires both S1/S2 gates');
 }
 assert(state.release_status==='NOT_REQUESTED','Release decision needs a separately reviewed plan revision');
 return {tasks:tasks.size,records:records.size,dag:'ACYCLIC'};
}
export function validatePlan(){
 const {state:upstream}=validateUpstream();
 const manifest=json('execution/PLAN-MANIFEST.json'),state=json('execution/state.json'),evidence=json('execution/evidence-index.json');
 const result=validateGraph(manifest,state,evidence,upstream);
 for(const row of json('execution/PROPOSAL-SNAPSHOT.json').files){assert(!row.ref.includes('..')&&!row.ref.startsWith('/'));assert.equal(createHash('sha256').update(readFileSync(resolve(root,row.ref))).digest('hex'),row.sha256,'Original proposal changed: '+row.ref);}
 for(const task of manifest.tasks)assert(existsSync(resolve(root,task.plan)),'Missing task plan');
 const roadmap=json('../ROADMAP-STATE.json'),lodgeGate=json('../LANTERN-LODGE-PHASE-2/state/phase-gate.json');
 return {manifest,state,evidence,upstream,roadmap,lodgeGate,result};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{const {result}=validatePlan();console.log(JSON.stringify({result:'PASS',scope:'Plan structure and original proposal hashes;not game implementation',...result},null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
