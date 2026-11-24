import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {loadManifests} from '../../scripts/media/assets-manifest.mjs';
import {
  validateLegacyAssetManifests,
  verifyLegacyAssetManifests,
} from '../../scripts/verify-legacy-asset-manifests.mjs';

const plan=JSON.parse(await readFile('assets/manifests/legacy-migration-plan.json','utf8'));
const manifests=await loadManifests('.');

test('every queued legacy binary has exactly one valid immutable manifest',async()=>{
  const result=validateLegacyAssetManifests(plan,manifests);
  assert.equal(result.files,23);
  assert.equal(result.matched.length,23);
  assert.equal(new Set(result.matched).size,23);
  const verified=await verifyLegacyAssetManifests();
  assert.equal(verified.files,23);
  assert.equal(verified.network,false);
  assert(verified.sourceBytes>0);
});

test('legacy manifest validation rejects missing, duplicate and altered bindings',()=>{
  const missing=manifests.filter(entry=>entry.manifest.id!=='legacy-maid-snapshot');
  assert.throws(()=>validateLegacyAssetManifests(plan,missing),/maid\.tar/);
  const duplicated=[...manifests,manifests.find(entry=>entry.manifest.id==='legacy-deadline-snapshot')];
  assert.throws(()=>validateLegacyAssetManifests(plan,duplicated),/exactly one manifest/);
  const altered=globalThis.structuredClone(manifests);
  altered.find(entry=>entry.manifest.id==='legacy-icarus-study-video').manifest.sizeBytes-=1;
  assert.throws(()=>validateLegacyAssetManifests(plan,altered),/icarus-study\.mp4/);
});
