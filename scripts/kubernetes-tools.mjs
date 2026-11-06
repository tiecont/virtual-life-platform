import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir, lstat, mkdtemp, link, rm, chmod} from 'node:fs/promises';
import {resolve, relative, join} from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifyKubernetesToolchain(lock) {
  assert.equal(lock.schemaVersion, 1); assert.equal(lock.platform, 'linux-amd64'); assert(/^\d+\.\d+\.\d+$/.test(lock.kubernetesVersion));
  assert.deepEqual(lock.tools.map(tool => tool.name).sort(), ['k3d', 'kubeconform', 'kubectl', 'kustomize']);
  for (const tool of lock.tools) {
    assert(/^v\d+\.\d+\.\d+$/.test(tool.version));
    const version = tool.version, urls = {
      kustomize: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize/${version}/kustomize_${version}_linux_amd64.tar.gz`,
      kubeconform: `https://github.com/yannh/kubeconform/releases/download/${version}/kubeconform-linux-amd64.tar.gz`,
      kubectl: `https://dl.k8s.io/release/${version}/bin/linux/amd64/kubectl`,
      k3d: `https://github.com/k3d-io/k3d/releases/download/${version}/k3d-linux-amd64`,
    };
    assert.equal(tool.url, urls[tool.name]); assert.equal(tool.archive, ['kustomize', 'kubeconform'].includes(tool.name));
    for (const field of ['downloadSha256', 'binarySha256']) assert(/^[a-f0-9]{64}$/.test(tool[field]));
    assert(Number.isInteger(tool.bytes) && tool.bytes > 0 && tool.bytes <= 80 * 1024 * 1024);
  }
  assert.deepEqual(lock.schemas.map(schema => schema.name).sort(), ['deployment-apps-v1.json', 'networkpolicy-networking-v1.json', 'service-v1.json']);
  const revisions = new Set();
  for (const schema of lock.schemas) {
    const match = /^https:\/\/raw\.githubusercontent\.com\/yannh\/kubernetes-json-schema\/([a-f0-9]{40})\/v(\d+\.\d+\.\d+)-standalone-strict\/([a-z0-9-]+\.json)$/.exec(schema.url);
    assert(match && match[2] === lock.kubernetesVersion && match[3] === schema.name); revisions.add(match[1]); assert(/^[a-f0-9]{64}$/.test(schema.sha256));
  }
  assert.equal(revisions.size, 1); return lock;
}
async function directory(path) {
  // Refuse existing symlink ancestors, including the ignored artifact root.
  const target = resolve(path), inside = relative(resolve('artifacts'), target);
  assert(inside && !inside.startsWith('..') && !inside.startsWith('/'));
  let current = resolve('.');
  for (const part of relative(current, target).split('/')) {
    current = join(current, part); await mkdir(current, {mode: 0o700}).catch(error => {if (error.code !== 'EEXIST') throw error;});
    const stat = await lstat(current); assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Tool cache symlink refused');
  }
  return target;
}
async function cached(path, sha256) {
  try {const stat = await lstat(path); assert(stat.isFile() && !stat.isSymbolicLink(), 'Invalid tool cache entry'); const bytes = await readFile(path); assert.equal(digest(bytes), sha256, 'Pinned cache checksum mismatch'); return true;}
  catch (error) {if (error.code === 'ENOENT') return false; throw error;}
}
async function download(url) {
  const response = await fetch(url, {signal: globalThis.AbortSignal.timeout(60000)}); assert(response.ok && new URL(response.url).protocol === 'https:', 'Pinned download unavailable');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {size += chunk.length; assert(size <= 80 * 1024 * 1024, 'Pinned download too large'); chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function publish(temp, target, sha256) {
  try {await link(temp, target);} catch (error) {if (error.code !== 'EEXIST') throw error;}
  assert(await cached(target, sha256));
}
export async function ensureKubernetesTools(names = ['kustomize', 'kubeconform', 'kubectl'], options = {}) {
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64', 'Pinned validation tools currently target Linux amd64');
  const lock = verifyKubernetesToolchain(JSON.parse(await readFile('infra/k8s/toolchain.json', 'utf8')));
  assert(names.length && new Set(names).size === names.length && names.every(name => lock.tools.some(tool => tool.name === name)));
  const root = await directory(options.cacheRoot ?? 'artifacts/k8s-tools/linux-amd64'), schemaDirectory = await directory(join(root, 'schemas'));
  const fetchBytes = options.fetchBytes ?? download, tools = {};
  for (const name of names) {
    const tool = lock.tools.find(tool => tool.name === name), target = join(root, name);
    if (!await cached(target, tool.binarySha256)) {
      const temp = await mkdtemp(join(root, '.install-'));
      try {
        const archive = await fetchBytes(tool.url); assert.equal(digest(archive), tool.downloadSha256, 'Pinned download checksum mismatch');
        let binary = archive;
        if (tool.archive) {const path = join(temp, 'download.tar.gz'); await writeFile(path, archive, {mode: 0o600}); binary = execFileSync('tar', ['-xOzf', path, name], {maxBuffer: 80 * 1024 * 1024, timeout: 10000});}
        assert.equal(binary.length, tool.bytes); assert.equal(digest(binary), tool.binarySha256, 'Pinned executable checksum mismatch');
        const path = join(temp, name); await writeFile(path, binary, {mode: 0o700}); await publish(path, target, tool.binarySha256);
      } finally {await rm(temp, {recursive: true, force: true});}
    }
    await chmod(target, 0o700); tools[name] = target;
  }
  for (const schema of lock.schemas) {
    const target = join(schemaDirectory, schema.name);
    if (!await cached(target, schema.sha256)) {
      const bytes = await fetchBytes(schema.url); assert.equal(digest(bytes), schema.sha256, 'Pinned schema checksum mismatch'); JSON.parse(bytes.toString('utf8'));
      const temp = await mkdtemp(join(root, '.schema-'));
      try {const path = join(temp, schema.name); await writeFile(path, bytes, {mode: 0o600}); await publish(path, target, schema.sha256);} finally {await rm(temp, {recursive: true, force: true});}
    }
  }
  return {lock, tools, schemaDirectory};
}
