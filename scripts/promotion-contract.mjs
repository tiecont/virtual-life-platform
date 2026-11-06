import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {keys, validateManifest} from './release-manifest.mjs';
import {shaPattern} from './artifact-policy.mjs';

export const releaseFiles = ['release.json', 'quality-proof.json', 'image-checks.json', 'api-sbom.cdx.json', 'api-provenance.json', 'web-sbom.cdx.json', 'web-provenance.json'];
export function promotionTarget(environment, releaseId) {
  assert(['staging', 'production'].includes(environment)); assert(typeof releaseId === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(releaseId));
  return {overlay: 'infra/k8s/overlays/' + environment, releasePath: 'releases/' + releaseId};
}
export function validateOverlayRelease(binding) {
  keys(binding, 'schemaVersion,kind,releasePath,manifestSha256,sourceRevision,quality,images,ownerReviewRequired,autoMerge,productionReleaseAuthorized,deploymentEligible');
  assert.equal(binding.schemaVersion, 1); assert.equal(binding.kind, 'vlp-overlay-release'); assert(/^releases\/[a-z0-9][a-z0-9-]{0,79}$/.test(binding.releasePath)); assert(/^[a-f0-9]{64}$/.test(binding.manifestSha256)); assert(shaPattern.test(binding.sourceRevision));
  keys(binding.quality, 'runId,runAttempt'); assert(Number.isSafeInteger(binding.quality.runId) && binding.quality.runId >= 1); assert(Number.isSafeInteger(binding.quality.runAttempt) && binding.quality.runAttempt >= 1);
  keys(binding.images, 'api,web');
  for (const target of ['api', 'web']) assert(new RegExp('^ghcr\\.io/tiecont/vlp-' + target + '@sha256:[a-f0-9]{64}$').test(binding.images[target]));
  assert.equal(binding.ownerReviewRequired, true); assert.equal(binding.autoMerge, false); assert.equal(binding.productionReleaseAuthorized, false); assert.equal(binding.deploymentEligible, false); return binding;
}
export function imageTransforms(binding) {
  validateOverlayRelease(binding);
  return ['api', 'web'].map(target => {const [newName, digest] = binding.images[target].split('@'); return {name: 'registry.invalid/vlp-' + target, newName, digest};});
}
export function assertPromotionPaths(paths, environment, releaseId) {
  const target = promotionTarget(environment, releaseId), allowed = new Set([...releaseFiles.map(file => target.releasePath + '/' + file), target.overlay + '/release.json', target.overlay + '/kustomization.yaml']);
  assert(Array.isArray(paths) && paths.length > 0 && paths.length <= allowed.size && new Set(paths).size === paths.length);
  assert(paths.every(path => allowed.has(path)), 'Promotion cannot change code, another environment or unreviewed metadata');
}
// This pure preview deliberately has no artifact/hosted authority. The writer
// must run actual remote manifest/registry/hosted proof before any Git mutation.
export function buildPromotionPlan(manifest, {environment, releaseId, manifestSha256, baseRevision, currentOverlay, currentBinding, stagingBinding}) {
  validateManifest(manifest); const target = promotionTarget(environment, releaseId); assert(shaPattern.test(baseRevision)); assert(/^[a-f0-9]{64}$/.test(manifestSha256));
  keys(currentOverlay, 'apiVersion,kind,namespace,resources' + (Object.hasOwn(currentOverlay, 'images') ? ',images' : ''));
  assert.equal(currentOverlay.apiVersion, 'kustomize.config.k8s.io/v1beta1'); assert.equal(currentOverlay.kind, 'Kustomization'); assert.equal(currentOverlay.namespace, 'vlp-' + environment); assert.deepEqual(currentOverlay.resources, ['../../base', 'database-egress.json']);
  if (currentOverlay.images) assert.deepEqual(currentOverlay.images, imageTransforms(currentBinding)); else assert(currentBinding == null, 'Binding without corresponding image transforms');
  const binding = validateOverlayRelease({schemaVersion: 1, kind: 'vlp-overlay-release', releasePath: target.releasePath, manifestSha256, sourceRevision: manifest.source.revision, quality: {runId: manifest.quality.runId, runAttempt: manifest.quality.runAttempt}, images: Object.fromEntries(['api', 'web'].map(name => [name, manifest.artifacts[name].image])), ownerReviewRequired: true, autoMerge: false, productionReleaseAuthorized: false, deploymentEligible: false});
  if (environment === 'production') assert.deepEqual(validateOverlayRelease(stagingBinding), binding, 'Production must use the identical staging release descriptor and digests');
  const overlay = {...currentOverlay, images: imageTransforms(binding)}, changed = !isDeepStrictEqual(currentBinding, binding) || !isDeepStrictEqual(currentOverlay, overlay);
  return {schemaVersion: 1, kind: 'vlp-unverified-promotion-preview', environment, releaseId, baseRevision, changed, remoteEvidenceVerified: false, productionReleaseAuthorized: false, deploymentEligible: false, binding, overlay};
}
