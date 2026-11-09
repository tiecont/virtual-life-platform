import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const planRoot = fileURLToPath(new URL('../', import.meta.url));

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(planRoot, relative), 'utf8'));
}
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlink not allowed in plan pack: ' + p);
    return entry.isDirectory() ? listFiles(p) : [p];
  });
}
export function validatePlan() {
  const manifest = readJson('PLAN-MANIFEST.json');
  const state = readJson('state/task-state.json');
  const evidence = readJson('state/evidence-index.json');
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  const modules = new Map();
  const tasks = new Map();
  const records = new Map();
  for (const field of ['android_clients_distributed', 'ios_clients_distributed', 'mobile_clients_distributed']) {
    check(state.runtime_context && [true, false, null].includes(state.runtime_context[field]), 'Missing/bad distribution context: ' + field);
  }
  const android = state.runtime_context?.android_clients_distributed;
  const ios = state.runtime_context?.ios_clients_distributed;
  const aggregate = android === true || ios === true ? true : android === false && ios === false ? false : null;
  check(state.runtime_context?.mobile_clients_distributed === aggregate, 'Aggregate mobile context disagrees with platform contexts');
  for (const m of manifest.modules) {
    check(!modules.has(m.id), 'Duplicate module: ' + m.id);
    modules.set(m.id, m);
    check(fs.existsSync(path.join(planRoot, m.file)), 'Missing module plan: ' + m.file);
    check(['active', 'conditional'].includes(m.activation), 'Bad activation: ' + m.id);
    check(state.module_activation[m.id], 'Missing module state: ' + m.id);
    check(['ACTIVE', 'CONDITIONAL_NOT_ACTIVE'].includes(state.module_activation[m.id]?.state), 'Bad module activation state: ' + m.id);
    if (m.activation === 'conditional' && state.module_activation[m.id]?.state === 'ACTIVE') {
      check(Boolean(state.module_activation[m.id].evidence_ref), 'Conditional activation needs measured evidence: ' + m.id);
    }
  }
  for (const t of manifest.tasks) {
    check(!tasks.has(t.id), 'Duplicate task: ' + t.id);
    tasks.set(t.id, t);
    check(modules.has(t.module), 'Unknown module: ' + t.id);
    check(t.deliverables?.length > 0 && t.acceptance?.length > 0, 'Missing outputs/acceptance: ' + t.id);
    check(Boolean(t.rollback), 'Missing rollback/recovery: ' + t.id);
    check(t.verification && ['existing', 'planned', 'manual'].every(k => Array.isArray(t.verification[k])), 'Bad verification classification: ' + t.id);
    check(Number.isFinite(t.priority), 'Missing priority: ' + t.id);
    check(/^N[0-9]{2}-[0-9]{2}$/.test(t.id) && t.id.startsWith(t.module + '-'), 'Invalid task ID/module: ' + t.id);
    check(!Object.hasOwn(t, 'status'), 'Runtime status must live only in state/task-state.json: ' + t.id);
  }
  for (const record of evidence.records) {
    check(typeof record.id === 'string' && !records.has(record.id), 'Missing/duplicate evidence ID');
    records.set(record.id, record);
    check(tasks.has(record.taskId), 'Evidence references unknown task: ' + record.id);
    check(Boolean(record.sourceRevision && record.environment && record.executedAt), 'Evidence missing provenance: ' + record.id);
    check(Array.isArray(record.commands) && Array.isArray(record.artifacts), 'Evidence missing commands/artifacts arrays: ' + record.id);
    check((record.commands?.length || 0) + (record.scenarios?.length || 0) > 0, 'Evidence needs actual commands or scenarios: ' + record.id);
    check(record.artifacts?.length > 0 && Array.isArray(record.limitations), 'Evidence needs artifact refs and limitations: ' + record.id);
    check(Number.isFinite(Date.parse(record.executedAt)), 'Invalid evidence timestamp: ' + record.id);
    for (const artifact of record.artifacts || []) check(Boolean(artifact.ref) && /^[a-f0-9]{64}$/.test(artifact.sha256), 'Invalid artifact provenance: ' + record.id);
    for (const command of record.commands || []) {
      check(typeof command.command === 'string' && Number.isInteger(command.exitCode), 'Invalid command result: ' + record.id);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visiting.has(id)) { errors.push('Dependency cycle at ' + id); return; }
    if (visited.has(id) || !tasks.has(id)) return;
    visiting.add(id);
    for (const dependency of [...tasks.get(id).depends_on, ...(tasks.get(id).conditional_gates || []).map(g => g.requires_task)]) {
      check(tasks.has(dependency), 'Unknown dependency: ' + id + ' -> ' + dependency);
      if (tasks.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const t of tasks.values()) {
    visit(t.id);
    const current = state.tasks[t.id];
    check(current, 'Missing runtime task state: ' + t.id);
    if (!current) continue;
    check(manifest.status_values.includes(current.status), 'Invalid status: ' + t.id);
    for (const dep of t.depends_on) {
      if (current.status === 'VERIFIED' && state.tasks[dep]?.status !== 'VERIFIED') errors.push('VERIFIED task has unverified dependency: ' + t.id + ' -> ' + dep);
    }
    for (const gate of t.conditional_gates || []) {
      check(tasks.has(gate.requires_task), 'Unknown conditional dependency: ' + t.id);
      check(Object.hasOwn(state.runtime_context, gate.when_field), 'Unknown conditional field: ' + t.id);
      if (current.status === 'VERIFIED' && state.runtime_context[gate.when_field] !== false) check(state.tasks[gate.requires_task]?.status === 'VERIFIED', 'Unmet conditional gate: ' + t.id + ' -> ' + gate.requires_task);
    }
    if (current.status === 'VERIFIED') {
      check(current.evidence_refs?.length > 0, 'VERIFIED task lacks evidence: ' + t.id);
      for (const id of current.evidence_refs || []) {
        const record = records.get(id);
        check(record?.taskId === t.id, 'Mismatched/missing evidence: ' + t.id + ' -> ' + id);
        check(record?.acceptance_met === true, 'Evidence must state acceptance_met: ' + id);
      }
    }
    if (current.status === 'DEFERRED_APPROVED') {
      check(Boolean(current.defer_approval?.by && current.defer_approval?.at && current.defer_approval?.reason), 'Deferral needs actual approval record: ' + t.id);
    }
  }
  if (state.tasks['N11-04']?.status === 'VERIFIED') check(state.runtime_context.android_clients_distributed === true, 'Verified Android beta requires Android context=true');
  if (state.tasks['N14-05']?.status === 'VERIFIED') check(state.runtime_context.ios_clients_distributed === true, 'Verified iOS beta requires iOS context=true');
  for (const m of manifest.modules) {
    const doc = fs.readFileSync(path.join(planRoot, m.file), 'utf8');
    for (const t of manifest.tasks.filter(t => t.module === m.id)) check(doc.includes('### ' + t.id + ' — '), 'Task missing in module plan: ' + t.id);
  }
  for (const id of Object.keys(state.tasks)) check(tasks.has(id), 'Unknown task in state: ' + id);
  for (const m of manifest.modules) {
    const ref = state.module_activation[m.id]?.evidence_ref;
    if (ref) check(records.has(ref), 'Missing activation evidence: ' + m.id + ' -> ' + ref);
  }
  let localLinkCount = 0;
  const files = listFiles(planRoot);
  for (const filename of files.filter(p => p.endsWith('.md'))) {
    const content = fs.readFileSync(filename, 'utf8');
    const matches = content.matchAll(/(?<!!)\[[^\]\n]+\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g);
    for (const match of matches) {
      const target = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const local = target.split('#')[0];
      if (!local) continue;
      const resolved = path.resolve(path.dirname(filename), local);
      localLinkCount++;
      check(resolved === planRoot.slice(0, -1) || resolved.startsWith(planRoot), 'Relative link escapes pack: ' + target);
      check(fs.existsSync(resolved), 'Broken local link in ' + path.relative(planRoot, filename) + ': ' + target);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { manifest, state, summary: { modules: modules.size, tasks: tasks.size, evidenceRecords: records.size, localLinks: localLinkCount, files: files.length, dag: 'ACYCLIC' } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify({ result: 'PASS', ...validatePlan().summary }, null, 2)); }
  catch (error) { console.error(String(error.message)); process.exitCode = 1; }
}
