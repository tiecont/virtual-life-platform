import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const auditIds = Array.from({ length: 8 }, (_, n) => `AUD-${String(n + 1).padStart(2, '0')}`);
const states = new Set(['TODO', 'IN_PROGRESS', 'VERIFIED', 'BLOCKED_TECHNICAL', 'BLOCKED_EXTERNAL', 'DEFERRED_APPROVED']);
export function dependencies(value) {
  return value.split(',').flatMap(part => {
    const item = part.trim();
    if (item === 'audit' || item === 'AUD-01..08') return auditIds;
    return item ? [item] : [];
  });
}
export function validateGraph(modules) {
  const graph = new Map(modules.map(m => [m.moduleId, dependencies(m.dependsOn)]));
  if (graph.size !== modules.length) throw new Error('Duplicate module ID');
  const visited = new Set();
  const active = new Set();
  function visit(id) {
    if (auditIds.includes(id)) return;
    if (!graph.has(id)) throw new Error(`Unknown dependency ${id}`);
    if (active.has(id)) throw new Error(`Dependency cycle at ${id}`);
    if (visited.has(id)) return;
    active.add(id);
    graph.get(id).forEach(visit);
    active.delete(id);
    visited.add(id);
  }
  graph.forEach((_, id) => visit(id));
  return graph;
}
export function summarize(manifest, checkpoint) {
  const graph = validateGraph(manifest.plans);
  const known = new Set([...auditIds, ...manifest.plans.flatMap(m => m.tasks)]);
  for (const [id, entry] of Object.entries(checkpoint.tasks)) {
    if (!known.has(id)) throw new Error(`Unknown task ${id}`);
    if (!states.has(entry.status)) throw new Error(`Invalid state for ${id}`);
    if (entry.status === 'VERIFIED' && (!entry.evidence || !entry.verification)) {
      throw new Error(`Missing evidence for ${id}`);
    }
  }
  const verified = id => checkpoint.tasks[id]?.status === 'VERIFIED';
  const complete = id => auditIds.includes(id) ? verified(id) : manifest.plans.find(m => m.moduleId === id).tasks.every(verified);
  for (const module of manifest.plans) {
    if (module.tasks.some(verified) && !graph.get(module.moduleId).every(complete)) {
      throw new Error(`Verified task has unverified dependency in ${module.moduleId}`);
    }
  }
  return {
    modules: Object.fromEntries(manifest.plans.map(m => [m.moduleId, complete(m.moduleId) ? 'VERIFIED' : 'PENDING'])),
    ready: manifest.plans.filter(m => graph.get(m.moduleId).every(complete))
      .flatMap(m => m.tasks.filter(id => ['TODO', 'IN_PROGRESS'].includes(checkpoint.tasks[id]?.status ?? 'TODO'))),
    blocked: Object.entries(checkpoint.tasks).filter(([, e]) => e.status.startsWith('BLOCKED')).map(([id]) => id),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(await readFile('PLAN-MANIFEST.json', 'utf8'));
  const checkpoint = JSON.parse(await readFile('docs/agent/task-state.json', 'utf8'));
  console.log(JSON.stringify(summarize(manifest, checkpoint), null, 2));
}
