import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const nativeTask = task => ['N10', 'N11', 'N14'].includes(task.module) || ['N12-03', 'N19-04'].includes(task.id);
export function webDependencyFailures(upstream, phase) {
  const tasks = new Map([...upstream.tasks, ...phase.tasks].map(task => [task.id, task]));
  const failures = [];
  for (const task of tasks.values()) {
    if (nativeTask(task)) continue;
    const visited = new Set();
    function visit(id, chain) {
      if (visited.has(id)) return; visited.add(id);
      const dependency = tasks.get(id); assert(dependency, 'Unknown dependency: ' + id);
      const next = [...chain, id];
      if (nativeTask(dependency)) {failures.push(next.join(' -> ')); return;}
      for (const child of [...dependency.depends_on, ...dependency.upstream_requires ?? []]) visit(child, next);
    }
    for (const id of [...task.depends_on, ...task.upstream_requires ?? []]) visit(id, [task.id]);
  }
  return failures;
}
export async function verifyWebFirstPlan() {
  const json = async ref => JSON.parse(await readFile(ref, 'utf8'));
  const root = 'docs/plans/platform-vnext/', phaseRoot = 'docs/plans/LANTERN-LODGE-PHASE-2/';
  const [manifest, state, phase, phaseState] = await Promise.all([json(root + 'PLAN-MANIFEST.json'), json(root + 'state/task-state.json'), json(phaseRoot + 'PLAN-MANIFEST.json'), json(phaseRoot + 'state/task-state.json')]);
  assert.equal(manifest.execution_policy.priority, 'WEB_SERVER_FIRST');
  assert.equal(phase.execution_policy.priority, 'WEB_SERVER_FIRST');
  assert.deepEqual(webDependencyFailures(manifest, phase), [], 'Web/platform must not wait for native development');
  for (const module of ['N10', 'N11', 'N14']) assert.equal(state.module_activation[module].state, 'CONDITIONAL_NOT_ACTIVE');
  const pending = [...manifest.tasks, ...phase.tasks].filter(nativeTask);
  let deferred = 0;
  for (const task of pending) {
    const current = (task.id.startsWith('N19') ? phaseState : state).tasks[task.id];
    if (current.status === 'VERIFIED') continue; // Retain historical evidence; no fresh certification implied.
    assert.equal(current.status, 'DEFERRED_APPROVED', task.id);
    assert(current.defer_approval?.by && current.defer_approval?.at && current.defer_approval?.reason);
    deferred++;
  }
  // Deferring new mobile work never disables compatibility for supported clients.
  for (const id of ['N12-01', 'N12-04', 'N12-05']) {
    const gates = manifest.tasks.find(task => task.id === id).conditional_gates;
    assert.deepEqual(gates.map(gate => [gate.when_field, gate.requires_task]), [['android_clients_distributed', 'N12-03'], ['ios_clients_distributed', 'N14-04']]);
  }
  return {result: 'PASS', scope: 'Planning only; no gameplay/art/native/release acceptance', hardNativeDependenciesForWeb: 0, deferredNativeTasks: deferred};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWebFirstPlan()));
