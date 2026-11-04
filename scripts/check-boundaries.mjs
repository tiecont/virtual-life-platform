import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
export function assertImportAllowed(from, specifier, root) {
  const path = relative(root, from).split(sep).join('/');
  const target = specifier.startsWith('.') ? relative(root, resolve(dirname(from), specifier)).split(sep).join('/') : specifier;
  const layer = path.split('/')[0];
  const project = path.split('/').slice(0, 2).join('/');
  if (target.startsWith('../') || target.startsWith('/')) throw new Error(`Import escapes workspace: ${path} → ${target}`);
  const targetProject = target.split('/').slice(0, 2).join('/');
  const worldPackages=['library-world','restaurant-world'];
  if (layer === 'packages' && worldPackages.some(name=>target.startsWith('packages/'+name+'/')&&!path.startsWith('packages/'+name+'/'))) throw new Error(`Shared package imports world implementation: ${path}`);
  if (target.startsWith('apps/') && targetProject !== project) throw new Error(`Cross-app import: ${path} → ${target}`);
  if (path.startsWith('packages/contracts/') && target.startsWith('packages/') && !target.startsWith('packages/contracts/') && !target.startsWith('packages/config/')) throw new Error(`Contracts import higher package: ${path} → ${target}`);
  if (layer === 'packages' && /^(apps|domains|worlds)\//.test(target)) throw new Error(`Package imports higher layer: ${path} → ${target}`);
  if (layer === 'worlds' && /^(apps|domains)\//.test(target)) throw new Error(`World imports domain internals: ${path} → ${target}`);
  if (layer === 'worlds' && target.startsWith('worlds/') && targetProject !== project) throw new Error(`Cross-world import: ${path} → ${target}`);
  if (specifier.startsWith('@virtual-city/')) {
    const targetPackage = specifier.split('/')[1];
    if (layer === 'packages' && worldPackages.includes(targetPackage) && !path.startsWith('packages/'+targetPackage+'/')) throw new Error(`Shared package imports world implementation: ${path}`);
    if (['apps', 'packages', 'worlds'].includes(layer) && !['contracts', 'world-sdk', 'pixi-scene', 'focus-ui', 'config', ...worldPackages].includes(targetPackage)) {
      throw new Error(`Forbidden workspace package: ${path} → ${specifier}`);
    }
    if (path.startsWith('packages/contracts/') && targetPackage !== 'config') throw new Error(`Contracts must not import SDK/apps: ${specifier}`);
    const publicRenderer = specifier === '@virtual-city/pixi-scene/renderer' && path.startsWith('apps/portal-web/');
    if (specifier.split('/').length > 2 && !publicRenderer) throw new Error(`Workspace deep import: ${specifier}`);
  }
}
export async function checkBoundaries(root) {
  const ignored = new Set(['node_modules', 'dist', '.git', '.next', 'test-results', 'playwright-report']);
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.name.startsWith('.next')) continue;
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(?:ts|tsx|mjs|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(file);
    }
  }
  for (const folder of ['apps', 'packages', 'domains', 'worlds']) {
    try { await walk(resolve(root, folder)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const manifests = new Map();
  for (const folder of ['apps', 'packages']) {
    for (const entry of await readdir(resolve(root, folder))) {
      const path = resolve(root, folder, entry, 'package.json');
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      manifests.set(manifest.name, Object.keys(manifest.dependencies ?? {}).filter(n => n.startsWith('@virtual-city/')));
    }
  }
  const active = new Set(); const done = new Set();
  function visit(name) {
    if (active.has(name)) throw new Error(`Workspace dependency cycle: ${name}`);
    if (done.has(name)) return;
    if (!manifests.has(name)) throw new Error(`Missing workspace package: ${name}`);
    active.add(name); manifests.get(name).forEach(visit); active.delete(name); done.add(name);
  }
  manifests.forEach((_, name) => visit(name));
  for (const file of files) {
    const code = await readFile(file, 'utf8');
    // The compiler resolves types; this supplementary guard enforces layering on static/literal imports.
    for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s*)['"]([^'"]+)['"]/g)) {
      assertImportAllowed(file, match[1], root);
    }
  }
  return files.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`Boundary checks passed: ${await checkBoundaries(process.cwd())} source files`);
}
