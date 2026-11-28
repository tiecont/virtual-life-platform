import {execFileSync} from 'node:child_process';
import {lstatSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {describeRoute, repositoryPath, scopedRules} from './execution-contract.mjs';

function packageMetadata(root, path) {
  const full = join(root, path);
  const stat = lstatSync(full);
  if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('INVALID_WORKSPACE_MANIFEST');
  const meta = JSON.parse(readFileSync(full, 'utf8'));
  if (typeof meta.name !== 'string' || !/^[@a-z0-9][a-z0-9/_.-]{0,100}$/.test(meta.name)) {
    throw new Error('INVALID_WORKSPACE_MANIFEST');
  }
  const dependencies = Object.entries({...meta.dependencies, ...meta.devDependencies,
    ...meta.peerDependencies, ...meta.optionalDependencies})
    .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('workspace:')).map(([name]) => name);
  return {directory: dirname(path), name: meta.name, dependencies};
}

// Carry forward Repository Excellence's package-ownership and reverse-dependency analysis.
// Only inspect checked-in workspace manifests. Git and dependency suggestions never replace a gate.
function packageImpact(root, paths) {
  if (paths.length === 0) return {directPackages: [], dependentPackages: [], unmappedPaths: []};
  const tracked = execFileSync('git', ['ls-files', '-z', '--', ':(glob)apps/*/package.json',
    ':(glob)packages/*/package.json'], {cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']}).split('\0').filter(Boolean);
  const workspaces = tracked.map(path => packageMetadata(root, path));
  const direct = new Set();
  const unmappedPaths = [];
  for (const path of paths) {
    const owner = workspaces.find(({directory}) => path === directory || path.startsWith(directory + '/'));
    if (owner) direct.add(owner.name);
    else unmappedPaths.push(path);
  }
  const affected = new Set(direct);
  // Adding to the Set appends a dependency for the same traversal; cycles terminate after one visit.
  for (const dependency of affected) {
    for (const pkg of workspaces) {
      if (pkg.dependencies.includes(dependency)) affected.add(pkg.name);
    }
  }
  return {directPackages: [...direct].sort(), dependentPackages: [...affected].filter(name => !direct.has(name)).sort(),
    unmappedPaths};
}

export function taskContext(root, registry, routeId, paths) {
  if (!Array.isArray(paths) || paths.length > 32 || !paths.every(repositoryPath)) {
    throw new Error('INVALID_EXECUTION_PATHS');
  }
  const route = describeRoute(registry, routeId);
  const uniquePaths = [...new Set(paths)];
  return {
    version: registry.version, route: route.id, rules: scopedRules(registry, [...route.paths, ...uniquePaths]),
    skills: route.skills, references: route.references, proposedPaths: uniquePaths,
    impact: packageImpact(root, uniquePaths), status: 'ADVISORY',
  };
}
