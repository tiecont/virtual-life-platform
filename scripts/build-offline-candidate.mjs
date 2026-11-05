import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, readdir, lstat, cp } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Local rehearsal image,using inspected cached dependencies only. No install/pull.
const exec = promisify(execFile);
const args = process.argv.slice(2), values = {};
for (let n = 0; n < args.length; n += 2) {
  assert(['--tag', '--runtime-root', '--revision'].includes(args[n]) && args[n + 1]);
  assert(!(args[n] in values)); values[args[n]] = args[n + 1];
}
const tag = values['--tag'];
assert(/^virtual-life-platform:m23-[a-z0-9-]+$/.test(tag ?? ''), 'Explicit local rehearsal tag required');
const root = resolve(values['--runtime-root'] ?? '.');
const revision = (await exec('git', ['rev-parse', values['--revision'] ?? 'HEAD'])).stdout.trim();
assert(/^[a-f0-9]{40}$/.test(revision));
const dir = resolve('artifacts', 'offline-candidate-' + randomUUID().slice(0, 8)), context = resolve(dir, 'context');
await mkdir(context, { recursive: true, mode: 0o700 });
const run = async (command, parameters) => (await exec(command, parameters, { maxBuffer: 8 * 1024 * 1024 })).stdout;
const base = (await run('docker', ['image', 'inspect', '--format', '{{.Id}}', 'virtual-life-platform:m21-deployment'])).trim();
assert(/^sha256:[a-f0-9]{64}$/.test(base));
const baseTag = 'virtual-life-platform:m23-cache-' + base.slice(7, 19);
await run('docker', ['tag', base, baseTag]);
const packages = (await readdir(resolve(root, 'packages'))).sort();
const manifests = ['package.json', 'apps/platform-api/package.json', 'apps/portal-web/package.json', ...packages.map(name => 'packages/' + name + '/package.json')];
const inspectCode = `import{readFileSync,existsSync}from'node:fs';const paths=${JSON.stringify(manifests)};console.log(JSON.stringify({lock:readFileSync('pnpm-lock.yaml','utf8'),manifests:paths.filter(existsSync).map(path=>[path,JSON.parse(readFileSync(path))])}));`;
const cached = JSON.parse(await run('docker', ['run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', base, '--input-type=module', '-e', inspectCode]));
const cachedManifests = new Map(cached.manifests);
const lock = await readFile(resolve(root, 'pnpm-lock.yaml'), 'utf8');
assert(lock.includes('\npackages:\n') && cached.lock.includes('\npackages:\n'));
assert.equal(lock.split('\npackages:\n')[1], cached.lock.split('\npackages:\n')[1], 'External dependency graph changed;offline cache not approved');
for (const path of manifests) {
  const current = JSON.parse(await readFile(resolve(root, path), 'utf8'));
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(current[group] ?? {})) {
      if (version.startsWith('workspace:')) continue;
      assert.equal(cachedManifests.get(path)?.[group]?.[name], version, 'Cached external dependency mismatch: ' + path + '/' + name);
    }
  }
}
const sha = data => createHash('sha256').update(data).digest('hex');
async function files(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', 'cache'].includes(entry.name)) continue;
    const next = resolve(path, entry.name);
    assert(!entry.isSymbolicLink(), 'No symlinks in curated output');
    if (entry.isDirectory()) result.push(...await files(next));
    else { assert(entry.isFile() && !/^\.env|\.(pem|key)$/.test(entry.name)); result.push(next); }
  }
  return result.sort();
}
// Verify the selected runtime source and manifests against the explicit commit.
const sourcePaths = ['apps/platform-api/src', ...packages.filter(name => name !== 'config').map(name => 'packages/' + name + '/src')];
const sourceFiles = [...manifests, 'pnpm-lock.yaml', 'config/safety-policy.json', 'config/lounge-media-clearance.json'];
for (const path of sourcePaths) for (const file of await files(resolve(root, path))) sourceFiles.push(relative(root, file));
const sourceEntries = [];
for (const path of sourceFiles.sort()) {
  const contents = await readFile(resolve(root, path));
  const original = (await exec('git', ['show', revision + ':' + path], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })).stdout;
  assert.equal(sha(contents), sha(original), 'Source differs from explicit revision: ' + path);
  sourceEntries.push([path, sha(contents)]);
}
const copy = async (from, path) => {
  assert((await lstat(from)).isDirectory() || (await lstat(from)).isFile());
  await mkdir(resolve(context, path, '..'), { recursive: true });
  await cp(from, resolve(context, path), { recursive: true, filter: file => !['cache', 'node_modules'].includes(file.split('/').at(-1)) });
};
for (const path of manifests) await copy(resolve(root, path), path);
await copy(resolve(root, 'pnpm-lock.yaml'), 'pnpm-lock.yaml');
await copy(resolve(root, 'apps/platform-api/dist'), 'apps/platform-api/dist');
for (const name of packages.filter(name => name !== 'config')) await copy(resolve(root, 'packages', name, 'dist'), 'packages/' + name + '/dist');
// API-only rollback keeps the currently built web artifact fixed for both images.
for (const path of ['apps/portal-web/.next', 'apps/portal-web/public']) await copy(resolve(path), path);
const entries = [];
for (const path of await files(context)) entries.push([relative(context, path), sha(await readFile(path))]);
const metadata = { schemaVersion: 1, scope: 'offline-api-rehearsal;fixed-current-web;not-public-artifact', sourceRevision: revision, cachedBase: base, externalGraphIdentical: true, sourceCount: sourceEntries.length, sourceDigest: sha(JSON.stringify(sourceEntries)), fileCount: entries.length, fileDigest: sha(JSON.stringify(entries)), entries };
await writeFile(resolve(context, 'candidate-manifest.json'), JSON.stringify(metadata));
const aliases = [];
for (const name of packages.filter(name => name !== 'config')) {
  const pkg = JSON.parse(await readFile(resolve(root, 'packages', name, 'package.json'), 'utf8'));
  assert(/^@virtual-city\/[a-z-]+$/.test(pkg.name));
  aliases.push('ln -sfn /app/packages/' + name + ' /app/node_modules/' + pkg.name);
}
await writeFile(resolve(context, 'Dockerfile'), `FROM ${baseTag}\nUSER root\nRUN rm -rf /app/apps/platform-api/dist /app/apps/portal-web/.next /app/apps/portal-web/public /app/packages/*/dist\nCOPY --chown=node:node . /app/\nRUN mkdir -p /app/node_modules/@virtual-city && ${aliases.join(' && ')}\nUSER node\nLABEL org.virtual-life.source=${revision}\n`);
await writeFile(resolve(context, '.dockerignore'), 'Dockerfile\n.dockerignore\n');
await writeFile(resolve(dir, 'build.log'), await run('docker', ['build', '--pull=false', '--network=none', '-t', tag, context]));
assert.equal((await run('docker', ['image', 'inspect', '--format', '{{.Id}}', baseTag])).trim(), base);
const verifyCode = "import{readFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';const m=JSON.parse(readFileSync('candidate-manifest.json'));for(const[p,h]of m.entries)if(createHash('sha256').update(readFileSync(p)).digest('hex')!==h)throw Error('Artifact hash mismatch');for(const name of ['contracts','world-sdk','park-world','deadline-world','maid-world'])await import('@virtual-city/'+name);const count=readdirSync('apps/platform-api/dist/db/migrations').filter(n=>n.endsWith('.sql')).length;console.log(JSON.stringify({count,files:m.entries.length,digest:m.fileDigest}));";
const verified = JSON.parse(await run('docker', ['run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', tag, '--input-type=module', '-e', verifyCode]));
assert.equal(verified.count, 38, 'Current rehearsal requires38migrations');
const imageID = (await run('docker', ['image', 'inspect', '--format', '{{.Id}}', tag])).trim();
const facts = { ...metadata, entries: undefined, imageID, tag, verified, network: 'none;no-install-no-pull', artifactDirectory: dir };
await writeFile(resolve(dir, 'facts.json'), JSON.stringify(facts, null, 2) + '\n');
console.log(JSON.stringify(facts, null, 2));
