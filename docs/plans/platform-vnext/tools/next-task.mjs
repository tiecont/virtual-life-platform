import { validatePlan } from './validate-plan.mjs';

try {
  const { manifest, state } = validatePlan();
  const modules = new Map(manifest.modules.map(m => [m.id, m]));
  const ready = manifest.tasks
    .filter(t => state.tasks[t.id].status === 'TODO')
    .filter(t => state.module_activation[t.module].state === 'ACTIVE')
    .filter(t => t.depends_on.every(id => state.tasks[id].status === 'VERIFIED'))
    .filter(t => (t.conditional_gates || []).every(gate => state.runtime_context[gate.when_field] === false || state.tasks[gate.requires_task].status === 'VERIFIED'))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map(t => ({ id: t.id, title: t.title, priority: t.priority, plan: modules.get(t.module).file, ownerLane: modules.get(t.module).owner, dependsOn: t.depends_on }));
  const counts = {};
  for (const task of Object.values(state.tasks)) counts[task.status] = (counts[task.status] || 0) + 1;
  console.log(JSON.stringify({ scope: 'Plan scheduling only; no application commands executed', counts, ready, inactiveConditionalModules: manifest.modules.filter(m => state.module_activation[m.id].state === 'CONDITIONAL_NOT_ACTIVE').map(m => m.id) }, null, 2));
} catch (error) {
  console.error(String(error.message));
  process.exitCode = 1;
}

