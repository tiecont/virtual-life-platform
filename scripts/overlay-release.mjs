import assert from 'node:assert/strict';
import {lstat, readFile, readdir} from 'node:fs/promises';
import {checkManifest, hash, validateManifest} from './release-manifest.mjs';
import {imageTransforms, promotionTarget, releaseFiles, validateOverlayRelease} from './promotion-contract.mjs';

async function ownedFile(path) {
  const pieces = path.split('/'); let current = '';
  for (const [index, piece] of pieces.entries()) {current += (current ? '/' : '') + piece; const stat = await lstat(current); assert(!stat.isSymbolicLink()); assert(index === pieces.length - 1 ? stat.isFile() && stat.size <= 16 * 1024 ** 2 : stat.isDirectory());}
  return readFile(path);
}
export async function loadOverlayRelease(environment, overlay) {
  const target = promotionTarget(environment, 'unused'), bindingPath = target.overlay + '/release.json'; let bytes;
  try {bytes = await ownedFile(bindingPath);} catch (error) {if (error.code !== 'ENOENT') throw error; assert(!Object.hasOwn(overlay, 'images'), 'Image transforms require a release binding'); return null;}
  const binding = validateOverlayRelease(JSON.parse(bytes.toString())); assert.deepEqual(overlay.images, imageTransforms(binding));
  const path = binding.releasePath + '/release.json', manifestBytes = await ownedFile(path); assert.equal(hash(manifestBytes), binding.manifestSha256);
  const manifest = validateManifest(JSON.parse(manifestBytes.toString())); assert.equal(manifest.source.revision, binding.sourceRevision); assert.deepEqual({runId: manifest.quality.runId, runAttempt: manifest.quality.runAttempt}, binding.quality);
  for (const name of ['api', 'web']) assert.equal(manifest.artifacts[name].image, binding.images[name]);
  assert.deepEqual((await readdir(binding.releasePath)).sort(), [...releaseFiles].sort());
  for (const file of releaseFiles) await ownedFile(binding.releasePath + '/' + file);
  const checked = await checkManifest(binding.releasePath); assert.equal(checked.remoteImagesVerified, false); assert.equal(checked.hostedChecksVerified, false);
  return {binding, images: binding.images, files: [bindingPath, ...releaseFiles.map(file => binding.releasePath + '/' + file)], evidence: 'LOCAL_INTEGRITY_ONLY', remoteEvidenceVerified: false, deploymentEligible: false};
}
