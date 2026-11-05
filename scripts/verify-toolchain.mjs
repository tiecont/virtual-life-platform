import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const sourceOnly = new Set(['@virtual-city/config', '@virtual-city/ui']);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const digest = value => createHash('sha256').update(value).digest('hex');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

export function assertBuildAll(root) {
  assert.equal(root.scripts?.build, 'pnpm -r build', 'Build every application and compiled package');
  assert.equal(root.scripts?.['build:packages'], "pnpm --filter './packages/*' -r build", 'Build every shared package');
  assert(/&& pnpm build$/.test(root.scripts?.check ?? ''), 'Full check must retain the complete production build');
}

export function workspaceGraph(projects) {
  const byName = new Map(projects.map(project => [project.manifest.name, project]));
  assert.equal(byName.size, projects.length, 'Duplicate workspace name');
  const edges = new Map();
  for (const project of projects) {
    const names = new Set();
    assert(/^@virtual-city\/[a-z][a-z0-9-]*$/.test(project.manifest.name), 'Invalid workspace name');
    if (project.path.startsWith('apps/') || !sourceOnly.has(project.manifest.name)) {
      assert(project.manifest.scripts?.build, 'Missing build target: ' + project.manifest.name);
      assert(project.manifest.scripts?.typecheck, 'Missing typecheck target: ' + project.manifest.name);
    }
    for (const section of sections) for (const [name, version] of Object.entries(project.manifest[section] ?? {})) {
      if (name.startsWith('@virtual-city/') || version.startsWith('workspace:')) {
        assert(byName.has(name) && version === 'workspace:*', 'Unknown or unbound workspace dependency: ' + name);
        names.add(name);
      } else assert(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version), 'External dependency needs exact pin: ' + name);
    }
    for (const name of project.configurationDependencies ?? []) {
      assert(byName.has(name), 'Unknown configuration workspace');
      names.add(name);
    }
    edges.set(project.manifest.name, [...names].sort());
  }
  const done = new Set(), active = new Set(), order = [];
  function visit(name) {
    assert(!active.has(name), 'Workspace dependency cycle');
    if (done.has(name)) return;
    active.add(name);
    edges.get(name).forEach(visit);
    active.delete(name); done.add(name); order.push(name);
  }
  [...byName.keys()].sort().forEach(visit);
  function dependsOn(name, dependency) {
    return edges.get(name).some(child => child === dependency || dependsOn(child, dependency));
  }
  return {order, projects: projects.map(project => ({
    name: project.manifest.name, path: project.path,
    kind: project.path.startsWith('apps/') ? 'application' : sourceOnly.has(project.manifest.name) ? 'source-only' : 'compiled-package',
    build: project.manifest.scripts?.build ?? null,
    typecheck: project.manifest.scripts?.typecheck ?? null,
    dependencies: edges.get(project.manifest.name),
    configurationDependencies: project.configurationDependencies ?? [],
    compilerInputs: project.compilerInputs ?? [],
    externalPins: Object.fromEntries(sections.map(section => [section, Object.fromEntries(Object.entries(project.manifest[section] ?? {}).filter(([name]) => !byName.has(name)).sort(([a], [b]) => compare(a, b)))])),
    applicationConsumers: projects.filter(candidate => candidate.path.startsWith('apps/') && dependsOn(candidate.manifest.name, project.manifest.name)).map(candidate => candidate.manifest.name).sort()
  })).sort((a, b) => compare(a.name, b.name))};
}

export function assertQualityToolchain(workflow, pnpm) {
  assert(!/pull_request_target|secrets\.|write-all|^\s*secrets:|^\s+[a-z][a-z-]*:\s*["']?write\b|permissions:\s*\{[^}]*\bwrite\b/m.test(workflow), 'Untrusted quality workflow cannot publish or receive secrets');
  assert(/permissions:\s*\n\s+contents: read/.test(workflow), 'Quality needs explicit read-only contents permission');
  assert.equal((workflow.match(/pnpm install --frozen-lockfile/g) ?? []).length, 3, 'Core, browser and runtime images require frozen install');
  const versions = [...workflow.matchAll(/^\s+version:\s*([^\s]+)\s*$/gm)].map(match => match[1]);
  assert.deepEqual(versions, [pnpm, pnpm, pnpm], 'CI pnpm must match packageManager');
  assert.equal((workflow.match(/node-version-file: \.node-version/g) ?? []).length, 5, 'Every current job uses the same Node pin');
  assert(workflow.includes('pnpm check') && workflow.includes('- run: pnpm build'), 'Core and browser build all');
}

export async function describeToolchain(root = process.cwd()) {
  const manifest = await readJson(resolve(root, 'package.json'));
  assertBuildAll(manifest);
  const node = (await readFile(resolve(root, '.node-version'), 'utf8')).trim();
  assert(/^\d+\.\d+\.\d+$/.test(node));
  assert.equal(manifest.engines.node, node.split('.').slice(0, 2).join('.') + '.x');
  assert(/^pnpm@\d+\.\d+\.\d+$/.test(manifest.packageManager));
  const projects = [];
  for (const folder of ['apps', 'packages']) for (const entry of (await readdir(resolve(root, folder), {withFileTypes: true})).sort((a, b) => compare(a.name, b.name))) {
    if (!entry.isDirectory()) continue;
    const path = folder + '/' + entry.name;
    projects.push({path, manifest: await readJson(resolve(root, path, 'package.json'))});
  }
  for (const project of projects) {
    project.configurationDependencies = [];
    project.compilerInputs = [];
    if (!project.manifest.scripts?.build && project.manifest.name !== '@virtual-city/config') continue;
    let file = resolve(root, project.path, 'tsconfig.json');
    const seen = new Set();
    while (file) {
      const local = relative(root, file).split(sep).join('/');
      assert(!local.startsWith('../') && !seen.has(file), 'Escaping/cyclic compiler configuration');
      seen.add(file);
      const bytes = await readFile(file), config = JSON.parse(bytes.toString());
      project.compilerInputs.push({path: local, sha256: digest(bytes)});
      const owner = projects.find(candidate => resolve(root, candidate.path, 'tsconfig.json') === file);
      if (owner && owner !== project) project.configurationDependencies.push(owner.manifest.name);
      assert(config.extends === undefined || typeof config.extends === 'string' && config.extends.startsWith('.'), 'Review nonlocal or multi-parent compiler configuration');
      file = config.extends ? resolve(dirname(file), config.extends) : undefined;
    }
    project.configurationDependencies.sort();
  }
  const graph = workspaceGraph(projects);
  for (const section of sections) for (const [name, version] of Object.entries(manifest[section] ?? {})) {
    if (name.startsWith('@virtual-city/') || version.startsWith('workspace:')) assert(projects.some(project => project.manifest.name === name) && version === 'workspace:*', 'Unknown root workspace dependency');
    else assert(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version), 'Root dependency needs exact pin: ' + name);
  }
  const workspace = await readFile(resolve(root, 'pnpm-workspace.yaml'));
  assert(/^ {2}- apps\/\*$/m.test(workspace.toString()) && /^ {2}- packages\/\*$/m.test(workspace.toString()));
  const dockerfile = await readFile(resolve(root, 'infra/docker/Dockerfile'), 'utf8');
  assert(dockerfile.includes('FROM node:' + node + '-bookworm-slim AS build'), 'Legacy fixture Node pin drift');
  assert(dockerfile.includes('RUN npm install --global ' + manifest.packageManager), 'Legacy fixture pnpm pin drift');
  const map = {schemaVersion: 1, strategy: 'build-all', node, packageManager: manifest.packageManager,
    rootBuild: manifest.scripts.build, packagesBuild: manifest.scripts['build:packages'],
    lockSha256: digest(await readFile(resolve(root, 'pnpm-lock.yaml'))), workspaceConfigSha256: digest(workspace),
    rootDependencies: Object.fromEntries(sections.map(section => [section, manifest[section] ?? {}])),
    buildOrder: graph.order.filter(name => graph.projects.find(project => project.name === name).build), projects: graph.projects};
  return {map, manifest, projects};
}

async function installedVersion(base, name) {
  const require = createRequire(resolve(base, 'package.json'));
  let file;
  try { file = require.resolve(name + '/package.json'); }
  catch { file = require.resolve(name); }
  let directory = dirname(file);
  for (;;) {
    try { const pkg = await readJson(resolve(directory, 'package.json')); if (pkg.name === name) return pkg.version; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(directory);
    assert.notEqual(parent, directory, 'Installed package metadata unavailable: ' + name);
    directory = parent;
  }
}

export async function verifyToolchain(root = process.cwd()) {
  const {map, manifest, projects} = await describeToolchain(root);
  assert.deepEqual(await readJson(resolve(root, 'config/build-targets.json')), map, 'Build target map is stale; regenerate and review it');
  assert.equal(process.versions.node, map.node, 'Use the pinned Node runtime');
  const pnpm = map.packageManager.slice('pnpm@'.length);
  assert.equal(execFileSync('pnpm', ['--version'], {cwd: root, encoding: 'utf8'}).trim(), pnpm);
  assertQualityToolchain(await readFile(resolve(root, '.github/workflows/quality.yml'), 'utf8'), pnpm);
  const installed = [];
  for (const project of [{path: '.', manifest}, ...projects]) for (const section of sections) for (const [name, version] of Object.entries(project.manifest[section] ?? {})) {
    if (version === 'workspace:*') continue;
    assert(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version), 'External dependency needs exact pin: ' + name);
    assert.equal(await installedVersion(resolve(root, project.path), name), version, 'Installed pin mismatch: ' + project.path + '/' + name);
    installed.push({project: project.path, section, name, version});
  }
  return {node: map.node, pnpm, workspaces: projects.length, buildTargets: map.buildOrder.length,
    installedDeclarations: installed.length, installed, strategy: map.strategy,
    scope: 'Installed local toolchain and source build graph; not hosted CI or multi-platform certification'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 3 && process.argv[2] === '--write-map') {
    await writeFile('config/build-targets.json', JSON.stringify((await describeToolchain()).map, null, 2) + '\n');
    console.log('Generated source build map; review the diff and run toolchain:check. No build/test result inferred.');
  } else {
    assert.equal(process.argv.length, 2, 'Unknown toolchain option');
    console.log(JSON.stringify(await verifyToolchain(), null, 2));
  }
}
