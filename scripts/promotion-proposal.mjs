import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {lstat, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve, relative, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkManifest, hash, jsonBytes, validateManifest} from './release-manifest.mjs';
import {assertPromotionPaths, buildPromotionPlan, promotionTarget, releaseFiles} from './promotion-contract.mjs';

const git = args => execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
async function optional(path) {try {const stat = await lstat(path); assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16 * 1024 ** 2); return await readFile(path);} catch (error) {if (error.code === 'ENOENT') return null; throw error;}}
export async function promotionProposal({mode, environment, releaseId, candidate}) {
  assert(['preview', 'verify'].includes(mode)); const target = promotionTarget(environment, releaseId), baseRevision = git(['rev-parse', 'HEAD']);
  const directory = resolve(candidate), stat = await lstat(directory); assert(stat.isDirectory() && !stat.isSymbolicLink()); assert.deepEqual((await readdir(directory)).sort(), [...releaseFiles].sort());
  const original = await optional(join(directory, 'release.json')); assert(original); const manifest = validateManifest(JSON.parse(original.toString()));
  if (mode === 'verify') {
    assert.equal(git(['status', '--porcelain']), '', 'Verified proposal requires a clean source checkout');
    execFileSync('git', ['merge-base', '--is-ancestor', manifest.source.revision, baseRevision], {stdio: ['ignore', 'pipe', 'pipe']});
  }
  const validation = await checkManifest(directory, {remote: mode === 'verify'});
  assert.equal(validation.remoteImagesVerified, mode === 'verify'); assert.equal(validation.hostedChecksVerified, mode === 'verify');
  assert.equal(hash(await readFile(join(directory, 'release.json'))), hash(original), 'Release changed during verification');
  const payloads = new Map();
  for (const file of releaseFiles) {const bytes = await optional(join(directory, file)); assert(bytes); assert(Buffer.from(bytes.toString('utf8')).equals(bytes)); JSON.parse(bytes.toString()); payloads.set(file, bytes);}
  assert.equal(hash(payloads.get('release.json')), hash(original), 'Release changed while capturing proposal payloads');
  const descriptors = [manifest.evidence.quality, manifest.evidence.imageChecks, ...['api', 'web'].flatMap(name => [manifest.artifacts[name].sbom, manifest.artifacts[name].provenance])];
  assert.deepEqual(descriptors.map(descriptor => descriptor.file).sort(), releaseFiles.filter(file => file !== 'release.json').sort());
  for (const descriptor of descriptors) assert.equal(hash(payloads.get(descriptor.file)), descriptor.sha256, 'Release payload changed after proof');
  const currentOverlayBytes = await optional(target.overlay + '/kustomization.yaml'); assert(currentOverlayBytes);
  const currentBinding = await optional(target.overlay + '/release.json'), stagingBinding = environment === 'production' ? await optional('infra/k8s/overlays/staging/release.json') : null;
  const preview = buildPromotionPlan(manifest, {environment, releaseId, manifestSha256: hash(original), baseRevision, currentOverlay: JSON.parse(currentOverlayBytes.toString()), currentBinding: currentBinding ? JSON.parse(currentBinding.toString()) : null, stagingBinding: stagingBinding ? JSON.parse(stagingBinding.toString()) : null});
  const files = new Map([...payloads].map(([file, bytes]) => [target.releasePath + '/' + file, bytes])); files.set(target.overlay + '/release.json', Buffer.from(jsonBytes(preview.binding))); files.set(target.overlay + '/kustomization.yaml', Buffer.from(jsonBytes(preview.overlay)));
  const edits = [];
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const before = await optional(path);
    if (path.startsWith(target.releasePath + '/') && before) assert(before.equals(bytes), 'Existing release directory is immutable');
    if (before?.equals(bytes)) continue;
    edits.push({path, beforeSha256: before ? hash(before) : null, afterSha256: hash(bytes), content: bytes.toString('utf8'), before: before?.toString('utf8') ?? null});
  }
  if (edits.length) assertPromotionPaths(edits.map(edit => edit.path), environment, releaseId);
  assert.equal(git(['rev-parse', 'HEAD']), baseRevision, 'Source changed during verification');
  if (mode === 'verify') assert.equal(git(['status', '--porcelain']), '', 'Source changed during verified proposal capture');
  return {...preview, kind: mode === 'verify' ? 'vlp-proof-checked-promotion-proposal' : preview.kind, changed: edits.length > 0, remoteEvidenceVerified: mode === 'verify', sourceValidation: validation, edits, scope: 'Reviewable proposal only. This command never writes overlays/releases, calls GitHub mutation APIs, deploys or authorizes production. Any future writer must reverify remote proof and exact edits.'};
}
export function promotionDiff(proposal) {
  return proposal.edits.map(edit => {
    const lines = text => text === null || text === '' ? [] : text.replace(/\n$/, '').split('\n');
    const before = lines(edit.before), after = lines(edit.content);
    const block = (text, lines, prefix) => lines.map(line => prefix + line + '\n').join('') + (text && !text.endsWith('\n') ? '\\ No newline at end of file\n' : '');
    return 'diff --git a/' + edit.path + ' b/' + edit.path + '\n' + (edit.before === null ? 'new file mode 100644\n' : '') + '--- ' + (edit.before === null ? '/dev/null' : 'a/' + edit.path) + '\n+++ b/' + edit.path + '\n@@ -' + (before.length ? '1,' + before.length : '0,0') + ' +' + (after.length ? '1,' + after.length : '0,0') + ' @@\n' + block(edit.before, before, '-') + block(edit.content, after, '+');
  }).join('');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, environment, releaseId, candidate, output, ...extra] = process.argv.slice(2); assert(candidate && output && !extra.length, 'Expected preview|verify ENV RELEASE_ID CANDIDATE OUTPUT');
    const folder = resolve(output), inside = relative(resolve('artifacts'), folder); assert(inside && !inside.startsWith('..') && !inside.startsWith('/'), 'Proposal output must be a new ignored artifacts directory');
    const proposal = await promotionProposal({mode, environment, releaseId, candidate});
    // Ancestors must be real directories, never symlinked destinations.
    let parent = resolve('.'); for (const part of relative(parent, folder).split('/').slice(0, -1)) {parent = join(parent, part); await mkdir(parent, {mode: 0o700}).catch(error => {if (error.code !== 'EEXIST') throw error;}); const stat = await lstat(parent); assert(stat.isDirectory() && !stat.isSymbolicLink());}
    await mkdir(folder, {mode: 0o700}); const bytes = jsonBytes(proposal); await writeFile(join(folder, 'proposal.json'), bytes, {flag: 'wx', mode: 0o600}); await writeFile(join(folder, 'proposal.diff'), promotionDiff(proposal), {flag: 'wx', mode: 0o600});
    console.log(JSON.stringify({kind: proposal.kind, changed: proposal.changed, remoteEvidenceVerified: proposal.remoteEvidenceVerified, productionReleaseAuthorized: false, deploymentEligible: false, edits: proposal.edits.length, proposal: join(folder, 'proposal.json'), sha256: hash(bytes)}));
  } catch {console.error('Promotion proposal rejected; complete immutable release evidence and an explicit valid target are required. No overlay or remote mutation performed.'); process.exitCode = 1;}
}
