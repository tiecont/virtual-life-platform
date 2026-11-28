#!/usr/bin/env node
/**
 * Restore the Wave 1 concept workspace from the public CDN.
 *
 * The uploader (scripts/pet-cdn-upload.mjs) records every object it published in
 * specs/pet-arena/mvp-wave1-cdn-assets.json. `pnpm assets:pull` does not cover
 * this pipeline: it only replays assets/manifests/* into the assets cache.
 *
 * Usage:
 *   pnpm cdn:pull              # download missing or hash-mismatched files
 *   pnpm cdn:pull:dry          # report what would be downloaded
 *   pnpm cdn:pull --force      # re-download every recorded file
 *   pnpm cdn:pull --workspace <path>
 *
 * Reads only public objects; no credentials are required or printed.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = path.join(repoRoot, 'specs', 'pet-arena', 'mvp-wave1-cdn-assets.json');
const defaultWorkspace = path.resolve(repoRoot, '..', 'Aetheria-Workspace', 'mvp-wave1');
const MAX_FILE = 256 * 1024 * 1024;

function option(name, fallback) {
  const inline = process.argv.find(argument => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) {
    const value = process.argv[index + 1];
    if (value && !value.startsWith('--')) return value;
  }
  return fallback;
}

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const workspace = path.resolve(option('workspace', process.env.AETHERIA_WORKSPACE || defaultWorkspace));

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function safeRelativePath(value) {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 240, 'Unsafe object path');
  assert(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value), 'Unsafe object path');
  assert(!value.split('/').some(part => !part || part === '.' || part === '..'), 'Unsafe object path');
  return value;
}

function relativeFor(key, prefix) {
  assert(key.startsWith(prefix), `Unexpected CDN key: ${key}`);
  const rest = key.slice(prefix.length);
  if (rest.startsWith('docs/')) return null;
  if (rest.startsWith('review/contact/')) {
    const parts = rest.split('/');
    assert(parts.length === 4, `Unexpected contact key: ${key}`);
    return `${parts[2]}/${parts[3]}`;
  }
  if (rest.startsWith('ledgers/')) return rest.slice('ledgers/'.length);
  return rest;
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert(manifest && manifest.schemaVersion === 1, 'Unsupported CDN manifest');
assert(typeof manifest.publicBase === 'string' && typeof manifest.prefix === 'string', 'CDN manifest lacks publicBase/prefix');
const base = new URL(manifest.publicBase);
assert(base.protocol === 'https:', 'Public base must be HTTPS');
const prefix = `${manifest.prefix.replace(/^\/+|\/+$/g, '')}/`;
assert(Array.isArray(manifest.files) && manifest.files.length > 0, 'CDN manifest has no files');
assert(existsSync(workspace), `Workspace not found: ${workspace}`);

let downloaded = 0, reused = 0, planned = 0;
const skipped = [];
for (const file of manifest.files) {
  const relative = relativeFor(file.key, prefix);
  if (!relative) continue;
  safeRelativePath(relative);
  assert(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= MAX_FILE, `Rejected size for ${relative}`);
  assert(typeof file.sha256 === 'string' && /^[a-f0-9]{64}$/.test(file.sha256), `Rejected hash for ${relative}`);

  const destination = path.join(workspace, relative);
  if (!force && existsSync(destination)) {
    const info = await stat(destination);
    if (info.isFile() && info.size === file.bytes) {
      const existing = await readFile(destination);
      if (sha256(existing) === file.sha256) { reused++; continue; }
    }
  }

  planned++;
  if (dryRun) { skipped.push(relative); continue; }

  const url = new URL(file.key, base);
  assert(url.origin === base.origin, 'Refusing a cross-origin object');
  const response = await fetch(url, {redirect: 'error'});
  assert(response.ok, `Download failed (${response.status}) for ${relative}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length === file.bytes, `Size mismatch for ${relative}`);
  assert(sha256(bytes) === file.sha256, `Hash mismatch for ${relative}`);

  await mkdir(path.dirname(destination), {recursive: true});
  const temporary = `${destination}.download`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  await rm(temporary, {force: true});
  downloaded++;
}

console.log(JSON.stringify({
  command: 'cdn:pull',
  mode: dryRun ? 'dry-run' : 'live',
  workspace,
  manifests: 1,
  recorded: manifest.files.length,
  reused,
  downloaded,
  pending: planned - downloaded,
  ...(dryRun ? {wouldDownload: skipped} : {}),
}));
