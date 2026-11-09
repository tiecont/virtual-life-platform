import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const inside = (p) => p === ROOT || p.startsWith(ROOT + path.sep);
const exists = (p) => inside(p) && fs.existsSync(p);
const HEX64 = /^[a-f0-9]{64}$/;
const TASK_ID = /^N(?:15|16|17|18|19)-\d\d$/;

function docs(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const loc = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Forbidden symlink in plan: ' + loc);
    if (entry.isDirectory()) return docs(loc);
    return loc.endsWith('.md') ? [loc] : [];
  });
}

export function validatePlan() {
  const manifest = read('PLAN-MANIFEST.json');
  const state = read('state/task-state.json');
  const evidence = read('state/evidence-index.json');
  const gate = read('state/phase-gate.json');
  const errors = [];
  const ck = (p, issue) => { if (!p) errors.push(issue); };
  ck(manifest.phase_id === 'LAN-L02', 'Unexpected phase id');
  ck(state.phase_id === manifest.phase_id && gate.phase_id === manifest.phase_id, 'Phase ID mismatch in state/gate');
  ck(manifest.design_status === 'PLAN_ONLY_NOT_IMPLEMENTED', 'Missing plan-only disclaimer');
  ck(manifest.installation_path === 'docs/plans/lantern-lodge-phase2', 'Unexpected install path');
  ck(Array.isArray(manifest.tasks) && manifest.tasks.length === 25, 'Expected exactly 25 Phase 2 tasks');
  ck(Array.isArray(manifest.modules) && manifest.modules.length === 5, 'Expected 5 Phase 2 modules');
  ck(gate.public_release_authorized === false, 'Plan pack cannot authorize public release');
  ck(['WAITING_FOR_PHASE1_HANDOFF','ACTIVE','PAUSED'].includes(gate.phase_state), 'Unknown gate state');

  const modules = new Map();
  for (const m of manifest.modules) {
    ck(!modules.has(m.id), 'Duplicate module ' + m.id);
    modules.set(m.id, m);
    ck(/^N1[5-9]$/.test(m.id), 'Unexpected module ' + m.id);
    ck(exists(path.join(ROOT, m.file)), 'Missing plan file: ' + m.file);
  }
  const waves = new Map();
  for (const w of manifest.waves) {
    ck(!waves.has(w.id), 'Duplicate wave ' + w.id);
    waves.set(w.id, w);
    ck(modules.has(w.module), 'Wave has unknown module ' + w.id);
  }
  const tasks = new Map();
  for (const t of manifest.tasks) {
    ck(!tasks.has(t.id), 'Duplicate task ' + t.id);
    tasks.set(t.id, t);
    ck(TASK_ID.test(t.id) && t.id.startsWith(t.module+'-'), 'Task ID/module mismatch '+t.id);
    ck(modules.has(t.module), 'Task has unknown module '+t.id);
    ck(waves.get(t.wave_id)?.module === t.module, 'Task has incorrect wave '+t.id);
    ck(Array.isArray(t.depends_on) && Array.isArray(t.upstream_requires), 'Missing classified dependencies '+t.id);
    ck(Array.isArray(t.original_depends_on), 'Missing original dependency trace '+t.id);
    ck(t.original_depends_on.join('|') === [...t.depends_on,...t.upstream_requires].sort((a,b)=>t.original_depends_on.indexOf(a)-t.original_depends_on.indexOf(b)).join('|'), 'Original dependencies changed '+t.id);
    ck(t.deliverables?.length > 0 && t.acceptance?.length > 0 && t.rollback, 'No acceptance/deliverables/rollback '+t.id);
    ck(t.verification && ['existing','planned','manual'].every(k=>Array.isArray(t.verification[k])), 'Missing verification lanes '+t.id);
    ck(!Object.hasOwn(t, 'status'), 'Status should live in state only '+t.id);
    const record = state.tasks?.[t.id];
    ck(record && manifest.status_values.includes(record.status), 'Missing or invalid task state '+t.id);
  }
  for(const id of Object.keys(state.tasks || {})) ck(tasks.has(id), 'Unexpected task status outside Phase 2 '+id);
  const upstreamTaskIds = new Set();
  for(const t of tasks.values()) {
    for(const dep of t.depends_on){ ck(tasks.has(dep), 'Missing local dependency '+t.id+' -> '+dep); }
    for(const dep of t.upstream_requires){ ck(!tasks.has(dep) && /^N(?:0\d|1[0-4])-\d\d$/.test(dep), 'Invalid upstream dependency '+t.id+' -> '+dep);upstreamTaskIds.add(dep); }
  }
  ck(JSON.stringify([...upstreamTaskIds].sort())===JSON.stringify([...manifest.upstream_required_tasks].sort()), 'Upstream requirements not in sync');
  const visiting=new Set(),seen=new Set();
  function traverse(id) {
    if(visiting.has(id)){errors.push('Dependency cycle at '+id);return;}
    if(seen.has(id)||!tasks.has(id))return;
    visiting.add(id);
    for(const dep of tasks.get(id).depends_on) traverse(dep);
    visiting.delete(id);seen.add(id);
  }
  for(const t of tasks.values()) traverse(t.id);
  for(const w of waves.values()) if(w.unlock_after)ck(tasks.has(w.unlock_after),'Unknown wave unlock '+w.id+' -> '+w.unlock_after);

  const evidenceById=new Map();
  for(const e of evidence.records||[]){
    ck(typeof e.id==='string'&&!evidenceById.has(e.id),'Evidence id duplicate/missing');
    evidenceById.set(e.id,e);
    ck(tasks.has(e.taskId),'Evidence points to non-Phase-2 task '+e.id);
    ck(Boolean(e.sourceRevision && e.environment && Number.isFinite(Date.parse(e.executedAt))), 'Evidence provenance incomplete '+e.id);
    ck(Array.isArray(e.commands)&&Array.isArray(e.artifacts)&&Array.isArray(e.limitations),'Evidence fields missing '+e.id);
    for(const c of e.commands||[])ck(typeof c.command==='string'&&Number.isInteger(c.exitCode),'Evidence command invalid '+e.id);
    for(const a of e.artifacts||[])ck(Boolean(a.ref)&&HEX64.test(a.sha256),'Evidence artifact/hash invalid '+e.id);
  }
  for(const t of tasks.values()){
    const s=state.tasks?.[t.id];if(!s) continue;
    if(s.status==='VERIFIED'){
      ck(s.evidence_refs?.length>0,'VERIFIED task without evidence '+t.id);
      for(const id of s.evidence_refs||[]){
        const e=evidenceById.get(id);
        ck(e?.taskId===t.id&&e.acceptance_met===true&&e.artifacts?.length>0,'VERIFIED task lacking valid acceptance evidence '+t.id+' -> '+id);
      }
      for(const dep of t.depends_on)ck(state.tasks[dep]?.status==='VERIFIED','VERIFIED task has unverified local dependency '+t.id+' -> '+dep);
      const wave=waves.get(t.wave_id);
      if(wave?.unlock_after)ck(state.tasks[wave.unlock_after]?.status==='VERIFIED','VERIFIED task has unmet wave gate '+t.id+' -> '+wave.unlock_after);
    }
    if(s.status==='DEFERRED_APPROVED')ck(Boolean(s.defer_approval?.by&&s.defer_approval?.reason),'DEFERRED_APPROVED missing owner decision '+t.id);
    if(s.status.startsWith('BLOCKED'))ck(Boolean(s.blocker),'BLOCKED task must name blocker '+t.id);
  }
  let links=0;
  for(const file of docs(ROOT)){
    const s=fs.readFileSync(file,'utf8');
    for(const m of s.matchAll(/\]\(([^)]+)\)/g)){
      const href=m[1].trim().replace(/^<|>$/g,'').split(' ')[0];
      if(!href||href.startsWith('#')||/^[a-z][a-z\d+.-]*:/i.test(href))continue;
      const noFragment=href.split('#')[0].split('?')[0];if(!noFragment)continue;
      links++;
      let target;
      try {target=path.resolve(path.dirname(file), decodeURIComponent(noFragment));}
      catch{errors.push('Invalid link in '+path.relative(ROOT,file)+': '+href);continue;}
      ck(exists(target),'Broken relative link '+path.relative(ROOT,file)+' -> '+href);
    }
  }
  return {manifest,state,gate,summary:{modules:modules.size,tasks:tasks.size,upstreamDependencies:upstreamTaskIds.size,relativeLinksChecked:links,completed:Object.values(state.tasks||{}).filter(s=>s.status==='VERIFIED').length},errors};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{
    const {summary,gate,errors}=validatePlan();
    console.log(JSON.stringify({validation:errors.length?'FAIL':'PASS',planOnly:true,phase:gate.phase_state,...summary,errors},null,2));
    if(errors.length)process.exitCode=1;
  }catch(e){console.error(String(e.stack||e));process.exitCode=1;}
}
