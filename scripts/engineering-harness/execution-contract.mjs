const own = (value, id) => value && typeof id === 'string' && Object.hasOwn(value, id);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const idPattern = /^[a-z][a-z0-9-]*$/;
const gateKinds = new Set(['workflow', 'technical', 'review', 'owner']);

export function repositoryPath(value) {
  return typeof value === 'string' && value.length <= 300 && !/[\\:\x00-\x1f\x7f]/.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..');
}

function covers(parent, child) {
  return child === parent || child.startsWith(parent + '/');
}

export function scopedRules(registry, paths) {
  return ['AGENTS.md', ...registry.scopedRules.filter(path => {
    const directory = path.slice(0, -'/AGENTS.md'.length);
    return paths.some(candidate => covers(directory, candidate));
  })];
}

export function describeRoute(registry, id) {
  if (!own(registry.routes, id)) throw new Error('UNKNOWN_EXECUTION_ROUTE');
  const route = registry.routes[id];
  return {
    id, ...route,
    rules: scopedRules(registry, route.paths),
    stages: route.stages.map(stage => ({id: stage, description: registry.stages[stage]})),
    gates: route.gates.map(gate => ({id: gate, ...registry.gates[gate]})),
  };
}

export function checkpointRequirements(registry, id) {
  const {stages, gates, rules, skills} = describeRoute(registry, id);
  return {
    version: registry.version,
    stages: stages.map(stage => stage.id),
    gates: gates.map(({id, kind, stage, workflow, input, revisionPolicy}) => ({
      id, kind, stage, ...(workflow ? {workflow} : {}), ...(input ? {input} : {}),
      ...(revisionPolicy ? {revisionPolicy} : {}),
    })),
    rules,
    skills,
  };
}

const words = value => value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const phrase = value => ' ' + words(value).join(' ') + ' ';

export function discoverRoutes(registry, query, paths = []) {
  if (typeof query !== 'string' || query.length > 512 || (!query.trim() && !paths.length) ||
      paths.length > 32 || !paths.every(repositoryPath)) throw new Error('INVALID_EXECUTION_QUERY');
  const terms = phrase(query);
  const uniquePaths = [...new Set(paths)];
  const matches = Object.entries(registry.routes).map(([id, route]) => {
    const tags = route.tags.filter(tag => terms.includes(phrase(tag)));
    const ownedPaths = uniquePaths.filter(path => route.paths.some(scope => covers(scope, path)));
    const score = Number(terms === phrase(id)) * 12 + ownedPaths.length * 12 +
      tags.reduce((weight, tag) => weight + words(tag).length, 0);
    return {id, summary: route.summary, tags, paths: ownedPaths, score};
  }).filter(route => route.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const candidate = matches[0];
  return {
    version: registry.version,
    selection: !candidate ? 'REVIEW_SCOPE' : candidate.score === matches[1]?.score ? 'AMBIGUOUS' : 'SUGGESTED',
    routes: matches.slice(0, 6).map(({score, ...route}) => route),
  };
}

export function executionMode({allowDelegation = false, nativeParallel = false,
  boundedParallel = false, isolatedWrites = false} = {}) {
  if (!allowDelegation) return 'sequential';
  if (nativeParallel && isolatedWrites) return 'native-parallel';
  if (nativeParallel || boundedParallel) return 'limited-parallel';
  return 'sequential';
}

function uniqueStrings(items, valid, canBeEmpty = false) {
  return Array.isArray(items) && (canBeEmpty || items.length > 0) &&
    new Set(items).size === items.length && items.every(item => typeof item === 'string' && valid(item));
}

export function validateRegistry(registry, checkWorkflow) {
  if (registry?.version !== 2 || !repositoryPath(registry.contract) ||
      !uniqueStrings(registry.scopedRules, path => repositoryPath(path) && path.endsWith('/AGENTS.md'), true) ||
      !record(registry.skills) || !record(registry.stages) || !record(registry.gates) || !record(registry.routes)) {
    throw new Error('INVALID_EXECUTION_REGISTRY');
  }
  const skills = Object.values(registry.skills);
  const failures = [];
  const unusedGates = new Set(Object.keys(registry.gates));
  for (const [id, path] of Object.entries(registry.skills)) {
    if (!idPattern.test(id) || path !== '.agents/skills/' + id + '/SKILL.md') failures.push(id);
  }
  for (const [id, description] of Object.entries(registry.stages)) {
    if (!idPattern.test(id) || typeof description !== 'string' || !description.trim()) failures.push(id);
  }
  for (const [id, gate] of Object.entries(registry.gates)) {
    if (!idPattern.test(id) || !gateKinds.has(gate?.kind) || !own(registry.stages, gate?.stage) ||
        typeof gate.description !== 'string' || !gate.description.trim() ||
        (gate.revisionPolicy !== undefined && gate.revisionPolicy !== 'stage') ||
        (gate.kind === 'workflow' ? !checkWorkflow(gate.workflow, gate.input ?? {}) :
          ('workflow' in gate || 'input' in gate))) failures.push(id);
  }
  for (const [id, route] of Object.entries(registry.routes)) {
    if (!idPattern.test(id) || typeof route?.summary !== 'string' || !route.summary.trim() ||
        !uniqueStrings(route.tags, tag => words(tag).length > 0) ||
        !uniqueStrings(route.paths, repositoryPath, true) || !uniqueStrings(route.references, repositoryPath) ||
        !uniqueStrings(route.skills, path => skills.includes(path)) ||
        !uniqueStrings(route.stages, stage => own(registry.stages, stage)) ||
        route.stages[0] !== 'scope' || route.stages.at(-1) !== 'handoff' ||
        !uniqueStrings(route.gates, gate => own(registry.gates, gate))) {
      failures.push(id);
      continue;
    }
    let last = -1;
    for (const gate of route.gates) {
      unusedGates.delete(gate);
      const next = route.stages.indexOf(registry.gates[gate]?.stage);
      if (next < 0 || next < last) failures.push(id + '/' + gate);
      last = next;
    }
  }
  if (failures.length || unusedGates.size) throw new Error('INVALID_EXECUTION_REGISTRY');
  return {
    version: registry.version,
    routes: Object.keys(registry.routes).length,
    gates: Object.keys(registry.gates).length,
    skills: skills.length,
  };
}
