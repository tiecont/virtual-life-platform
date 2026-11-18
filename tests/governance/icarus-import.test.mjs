import {test} from 'node:test';
import assert from 'node:assert/strict';
import {icarusActions, validateIcarusImport} from '../../scripts/art/icarus-import-contract.mjs';

const actions = await icarusActions();
// Synthetic measurements exercise rejection logic; they are never character assets or acceptance evidence.
function measurements() {
  return {editor: '6000.3.14f1', urp: '17.3.0', imported: true, animationType: 'Generic', applyRootMotion: false, lodGroups: 1,
    lods: [[28000, 74, 3, 2048], [15000, 52, 2, 1024], [7500, 32, 1, 512]].map(([triangles, bones, materials, size], level) => ({
      level, triangles, bones, materials, skinnedVertices: 1000, unweightedVertices: 0, invalidWeights: 0, missingBones: 0,
      maximumInfluences: 4, missingMaterials: 0, textures: [{path: 'synthetic-measurement', width: size, height: size}]})),
    clips: actions.map((name, index) => ({name, seconds: 1, invalidBindings: 0, transformBindings: 12, lodDisplacementMeters: [.01, .01, .01], motionHash: index.toString(16).padStart(64, '0')}))};
}
function reject(change, expected) {
  const facts = measurements();
  change(facts);
  const result = validateIcarusImport(facts, actions);
  assert.equal(result.status, 'IMPORT_REVISION_REQUIRED');
  assert(result.failures.some(failure => expected.test(failure)), JSON.stringify(result.failures));
}
test('canonical profile preserves all sixteen Icarus actions and technical pass cannot confer production status', () => {
  assert.equal(actions.length, 16);
  assert(actions.includes('normal_sword_hit'));
  assert(actions.includes('rage_sword_100'));
  const result = validateIcarusImport(measurements(), actions);
  assert.equal(result.status, 'IMPORT_CONTRACT_PASS');
  assert.equal(result.productionReady, false);
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.artAcceptance, 'NOT_TESTED');
  assert.equal(result.playerPerformance, 'NOT_TESTED');
  assert.equal(result.rightsReview, 'PENDING');
});
test('an older four-clip rig, missing LODGroup, or incomplete canonical binding never passes', () => {
  reject(facts => { facts.lodGroups = 0; facts.lods = facts.lods.slice(0, 1); facts.lods[0].bones = 44; facts.clips = facts.clips.slice(0, 4); }, /LODGroup/);
  reject(facts => { facts.clips.pop(); }, /defeat: exactly one/);
  reject(facts => { facts.clips.push({...facts.clips[0]}); }, /idle: exactly one/);
});
test('every LOD checks total geometry, reduced joints, materials, textures and real normalized weights', () => {
  for (let lod = 0; lod < 3; lod++) {
    for (const [field, value, failure] of [['triangles', 5000000, /triangle budget/], ['bones', 44, /joint budget/],
      ['materials', 4, /material budget/], ['unweightedVertices', 1, /skin weights/], ['invalidWeights', 1, /skin weights/],
      ['missingBones', 1, /skin weights/], ['maximumInfluences', 5, /four skin/], ['missingMaterials', 1, /material slots/]]) {
      reject(facts => { facts.lods[lod][field] = value; }, failure);
    }
    reject(facts => { facts.lods[lod].textures[0].width = 4096; }, /texture .* exceeds/);
    reject(facts => { facts.lods[lod].textures = []; }, /actual material textures/);
  }
});
test('stills, unresolved curves, nonfinite motion, renamed copies and motion missing from one LOD fail', () => {
  reject(facts => { facts.clips[0].seconds = 0; }, /duration/);
  reject(facts => { facts.clips[0].invalidBindings = 1; }, /resolved transform/);
  reject(facts => { facts.clips[0].transformBindings = 0; }, /resolved transform/);
  reject(facts => { facts.clips[0].lodDisplacementMeters[0] = 0; }, /deformation/);
  reject(facts => { facts.clips[0].lodDisplacementMeters[1] = NaN; }, /deformation/);
  reject(facts => { facts.clips[0].lodDisplacementMeters = [.01]; }, /deformation/);
  reject(facts => { facts.clips[1].motionHash = facts.clips[0].motionHash; }, /same sampled joint motion as idle/);
  reject(facts => { facts.clips[0].motionHash = ''; }, /motion fingerprint/);
});
test('unmeasured import facts and authoritative root motion fail closed', () => {
  reject(facts => { delete facts.imported; }, /Actual FBX import/);
  reject(facts => { facts.editor = '6000.6.9f1'; }, /Pinned Unity/);
  reject(facts => { facts.urp = '17.6.0'; }, /Pinned URP/);
  reject(facts => { facts.applyRootMotion = true; }, /root motion/);
});
test('missing LOD measurements and sparse motion arrays cannot skip required checks', () => {
  reject(facts => { facts.lods = new Array(3); }, /LOD0: measured level required/);
  reject(facts => { delete facts.lods[1]; }, /LOD1: measured level required/);
  reject(facts => { facts.lods[2] = null; }, /LOD2: measured level required/);
  reject(facts => { facts.clips[0].lodDisplacementMeters = new Array(3); }, /deformation/);
  reject(facts => { delete facts.clips[0].lodDisplacementMeters[1]; }, /deformation/);
});
test('skin influence and transform binding counts must be finite positive integers', () => {
  for (const count of [1.5, Infinity, '4']) {
    reject(facts => { facts.lods[0].maximumInfluences = count; }, /four skin/);
    reject(facts => { facts.clips[0].transformBindings = count; }, /resolved transform/);
  }
});
