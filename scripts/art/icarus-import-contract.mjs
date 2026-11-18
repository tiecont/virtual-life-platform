import {readFile} from 'node:fs/promises';

export async function icarusActions() {
  const profile = JSON.parse(await readFile(new URL('../../specs/pet-arena/v3.1/data/limited_animation_profiles.json', import.meta.url), 'utf8'));
  const icarus = profile.petAnimations.find(pet => pet.petId === 'pet-v3-fire-icarus');
  if (!icarus || icarus.signatureOpcode !== 'FIRE_ZONE' || new Set(icarus.actions).size !== 16)
    throw Error('Canonical Icarus animation profile changed; reconcile the import contract');
  return icarus.actions;
}

// These are measured import requirements, not art, rights or player acceptance.
export function validateIcarusImport(facts, actions) {
  const failures = [];
  const check = (condition, failure) => { if (!condition) failures.push(failure); };
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  check(facts.editor === '6000.3.14f1', 'Pinned Unity Editor 6000.3.14f1 required');
  check(facts.urp === '17.3.0', 'Pinned URP 17.3.0 required');
  check(facts.imported === true, 'Actual FBX import required');
  check(facts.animationType === 'Generic', 'Generic character animation importer required');
  check(facts.applyRootMotion === false, 'Presentation must not apply authoritative root motion');
  check(facts.lodGroups === 1, 'One actual imported LODGroup required');
  check(Array.isArray(facts.lods) && facts.lods.length === 3, 'Exactly three imported LOD levels required');
  const budgets = [[26000, 29500, 74, 74, 3, 2048], [14000, 16500, 48, 56, 2, 1024], [6500, 8000, 28, 34, 1, 512]];
  for (const [index, [minTris, maxTris, minBones, maxBones, materials, textureSize]] of budgets.entries()) {
    const lod = facts.lods?.[index];
    if (!lod) continue;
    check(lod.level === index, `LOD${index}: ordered level required`);
    check(Number.isInteger(lod.triangles) && lod.triangles >= minTris && lod.triangles <= maxTris, `LOD${index}: total triangle budget ${minTris}-${maxTris}`);
    check(Number.isInteger(lod.bones) && lod.bones >= minBones && lod.bones <= maxBones, `LOD${index}: skin joint budget ${minBones}-${maxBones}`);
    check(Number.isInteger(lod.materials) && lod.materials > 0 && lod.materials <= materials, `LOD${index}: material budget 1-${materials}`);
    check(lod.skinnedVertices > 0 && Number.isInteger(lod.skinnedVertices), `LOD${index}: skinned vertices required`);
    check(lod.unweightedVertices === 0 && lod.invalidWeights === 0 && lod.missingBones === 0, `LOD${index}: complete normalized finite skin weights and joints required`);
    check(lod.maximumInfluences > 0 && lod.maximumInfluences <= 4, `LOD${index}: one to four skin influences required`);
    check(lod.missingMaterials === 0, `LOD${index}: missing material slots`);
    check(Array.isArray(lod.textures) && lod.textures.length > 0, `LOD${index}: actual material textures required`);
    for (const texture of lod.textures ?? []) {
      check(Number.isInteger(texture.width) && Number.isInteger(texture.height) && texture.width > 0 && texture.height > 0 && texture.width <= textureSize && texture.height <= textureSize,
        `LOD${index}: texture ${texture.path} exceeds ${textureSize} or has invalid dimensions`);
    }
  }
  const clips = Array.isArray(facts.clips) ? facts.clips : [];
  const fingerprints = new Map();
  for (const action of actions) {
    const matches = clips.filter(clip => clip.name === action);
    check(matches.length === 1, `${action}: exactly one canonical clip required`);
    if (matches.length !== 1) continue;
    const clip = matches[0];
    check(finite(clip.seconds) && clip.seconds > 0, `${action}: positive duration required`);
    check(clip.invalidBindings === 0 && clip.transformBindings > 0, `${action}: resolved transform bindings required`);
    check(Array.isArray(clip.lodDisplacementMeters) && clip.lodDisplacementMeters.length === 3 && clip.lodDisplacementMeters.every(delta => finite(delta) && delta > .0001), `${action}: actual deformation on all three LODs required`);
    check(typeof clip.motionHash === 'string' && /^[a-f0-9]{64}$/.test(clip.motionHash), `${action}: measured motion fingerprint required`);
    if (clip.motionHash) {
      check(!fingerprints.has(clip.motionHash), `${action}: same sampled joint motion as ${fingerprints.get(clip.motionHash)}`);
      fingerprints.set(clip.motionHash, action);
    }
  }
  return {petId: 'pet-v3-fire-icarus', signatureOpcode: 'FIRE_ZONE', status: failures.length ? 'IMPORT_REVISION_REQUIRED' : 'IMPORT_CONTRACT_PASS', failures,
    scope: 'Imported geometry, skin weights and sampled action motion only; sampled uniqueness is not expressive animation acceptance',
    artAcceptance: 'NOT_TESTED', playerPerformance: 'NOT_TESTED', rightsReview: 'PENDING', productionReady: false, runtimeEnabled: false};
}
