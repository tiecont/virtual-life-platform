import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const spec = new URL('../specs/pet-arena/', import.meta.url);
const release = new URL('../config/gameplay/arena8-coop-advanced-v1.candidate.json', import.meta.url);
const locales = ['en', 'ja', 'ko', 'vi', 'zh'];
const abilitySlots = ['guard', 'skill', 'signature', 'ultimate'];

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

function byId(rows, label) {
  const result = new Map(rows.map(row => [row.id, row]));
  assert.equal(result.size, rows.length, `Duplicate ${label} ID`);
  return result;
}

function sameIds(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

export function prepareCampaignV4Content(bundle, content, canonical, historical) {
  assert.equal(bundle.schemaVersion, 6, 'The typed V4 gameplay bundle is required');
  assert.equal(content.schemaVersion, 1);
  assert.equal(content.id, 'arena8-campaign-v4-content-candidate');
  assert.equal(content.releaseState, 'draft-only');
  assert.equal(content.routeAcquisitionEnabled, false);
  assert.deepEqual(content.standardSBanner, {enabled: false, ratesAuthored: false});

  const roster = byId(canonical.pets, 'canonical Pet');
  const existingPets = byId(historical.pets, 'historical Pet');
  const existingSkills = byId(historical.skills, 'historical ability');
  const maps = byId(content.maps, 'map');
  const bossMapElements = new Map(historical.bosses.map(boss => [boss.mapId, boss.element]));
  const areaBySpecies = new Map();
  const routeBySpecies = new Map();
  const encounterIds = new Set();
  sameIds(maps.keys(), bossMapElements.keys(), 'Canonical map set');

  for (const map of content.maps) {
    assert.equal(map.element, bossMapElements.get(map.id), `Map element for ${map.id}`);
    assert.deepEqual(map.routes.map(route => route.tier), [
      'entry', 'entry', 'entry', 'advanced', 'advanced', 'advanced', 'boss', 'boss',
    ], `Invalid tier order for ${map.id}`);

    for (const [index, route] of map.routes.entries()) {
      const pet = roster.get(route.opponentPetId);
      assert.equal(pet?.rosterState, 'ACTIVE', `Inactive or unknown opponent ${route.opponentPetId}`);
      assert.equal(pet.element, map.element, `Opponent ${pet.id} belongs to another element`);
      assert.equal(route.encounterId, `recruit-${pet.id}`);
      assert(!areaBySpecies.has(pet.id), `Duplicate map opponent ${pet.id}`);
      assert(!encounterIds.has(route.encounterId), `Duplicate encounter ${route.encounterId}`);
      assert.equal(route.prerequisiteEncounterId, map.routes[index - 1]?.encounterId ?? null,
        `Route ${route.encounterId} must require the preceding encounter`);
      assert.equal(route.recruitment, 'first-qualified-clear');
      const expectedTier = pet.family === 'dragon' || pet.sourceCategory === 'map_legendary' ? 'boss'
        : pet.family === 'bird' || pet.catalogRank === 'A' ? 'advanced' : 'entry';
      assert.equal(route.tier, expectedTier, `Incorrect tier for ${pet.id}`);
      if (pet.family === 'core') assert.equal(pet.mapId, map.id, `Incorrect map for ${pet.id}`);
      areaBySpecies.set(pet.id, map.id);
      routeBySpecies.set(pet.id, route);
      encounterIds.add(route.encounterId);
    }
  }
  const expectedMapPets = [...roster.values()].filter(pet => pet.mapId || ['dragon', 'bird'].includes(pet.family));
  sameIds(areaBySpecies.keys(), expectedMapPets.map(pet => pet.id), 'Map Pet coverage');

  const gated = new Map();
  for (const candidate of content.standardSCandidates) {
    const pet = candidate.runtimePet;
    const identity = roster.get(pet.id);
    assert.equal(identity?.rosterState, 'CANDIDATE', `Unknown gated candidate ${pet.id}`);
    assert.equal(identity.family, 's_offrate');
    assert.equal(identity.candidateGate.acquisition, 'BLOCKED');
    assert(!gated.has(pet.id), `Duplicate candidate ${pet.id}`);
    gated.set(pet.id, candidate);
    assert.equal(candidate.acquisition, 'blocked');
    assert.equal(candidate.modelState, 'not-produced');
    assert.equal(candidate.vfxState, 'not-produced');
    assert.equal(candidate.animationContract, 'standard-animation-v3.1');
    assert.equal(candidate.rigProfile, identity.bodyPlan === 'insectoid' ? 'rig_insect' : 'rig_q4');
    sameIds(Object.keys(candidate.nameByLocale), locales, `Locale coverage for ${pet.id}`);
    for (const name of Object.values(candidate.nameByLocale)) assert(name.trim(), `Missing localized name for ${pet.id}`);
    assert.equal(candidate.nameByLocale.en, identity.name);
    assert.equal(pet.element, identity.element);
    assert.equal(pet.rarity, 'standard-s');
    assert.equal(pet.powerClass, 's');
    assert.deepEqual(pet.catalog, {name: identity.name, mapId: null});
    assert.equal(pet.fireZone, undefined);
    const candidateSkills = byId(candidate.runtimeSkills, 'candidate ability');
    sameIds(candidateSkills.keys(), abilitySlots.map(slot => pet[slot]), `Ability slots for ${pet.id}`);
    for (const slot of abilitySlots) {
      assert(pet[slot].startsWith(`${pet.id}-`));
      assert.equal(candidateSkills.get(pet[slot]).kind, slot);
    }
  }
  sameIds(gated.keys(), [...roster.values()].filter(pet => pet.rosterState === 'CANDIDATE').map(pet => pet.id),
    'Gated candidate coverage');

  const bundlePets = byId(bundle.pets, 'bundle Pet');
  const bundleSkills = byId(bundle.skills, 'bundle ability');
  for (const pet of bundle.pets) {
    const prior = existingPets.get(pet.id);
    if (prior === undefined) {
      assert.deepEqual(pet, gated.get(pet.id)?.runtimePet, `Unexpected or modified gated Pet ${pet.id}`);
      continue;
    }
    for (const slot of [...abilitySlots, 'fireZone']) {
      assert.equal(pet[slot], prior[slot], `Legacy ability binding changed for ${pet.id}.${slot}`);
    }
    const canonicalMap = areaBySpecies.get(pet.id) ?? null;
    assert(pet.catalog.mapId === prior.catalog.mapId || pet.catalog.mapId === canonicalMap,
      `Unexpected map reassignment for ${pet.id}`);
    assert.equal(pet.catalog.name, prior.catalog.name);
  }
  for (const id of existingPets.keys()) assert(bundlePets.has(id), `Missing historical Pet ${id}`);
  for (const id of existingSkills.keys()) assert(bundleSkills.has(id), `Missing historical ability ${id}`);

  const additionalSkills = byId(content.standardSCandidates.flatMap(candidate => candidate.runtimeSkills),
    'gated ability');
  for (const [id, skill] of bundleSkills) {
    if (!existingSkills.has(id)) assert.deepEqual(skill, additionalSkills.get(id), `Unexpected or modified gated ability ${id}`);
  }
  for (const id of additionalSkills.keys()) assert(!existingSkills.has(id), `Reused historical ability ID ${id}`);

  // Draft authoring keeps the published grant paths and Warden identities intact.
  // Qualification of the new routes needs a versioned encounter/settlement contract.
  const historicalBosses = byId(historical.bosses, 'historical Warden');
  sameIds(bundle.bosses.map(boss => boss.id), historicalBosses.keys(), 'Canonical Warden coverage');
  for (const boss of bundle.bosses) {
    const prior = historicalBosses.get(boss.id);
    assert.equal(boss.mapId, prior.mapId);
    assert.deepEqual(boss.rewardPolicy.recruitmentPetIds, prior.rewardPolicy.recruitmentPetIds,
      `Recruitment stays on the historical route for ${boss.id}`);
    for (const recruitId of boss.rewardPolicy.recruitmentPetIds) {
      assert(!gated.has(recruitId), `Standard S candidate ${recruitId} is acquisition-gated`);
    }
  }

  const prepared = {
    ...bundle,
    pets: [
      ...bundle.pets.filter(pet => existingPets.has(pet.id)).map(pet => ({
        ...pet,
        catalog: {...pet.catalog, mapId: areaBySpecies.get(pet.id) ?? null},
      })),
      ...content.standardSCandidates.map(candidate => candidate.runtimePet),
    ],
    skills: [...bundle.skills.filter(skill => existingSkills.has(skill.id)), ...additionalSkills.values()],
  };

  const inventory = canonical.pets.map(pet => {
    const route = routeBySpecies.get(pet.id);
    const meshCandidate = content.meshCandidates?.[pet.id];
    if (meshCandidate) assert.equal(meshCandidate.referenceSha256, pet.concept.sha256, `Mesh source for ${pet.id}`);
    const candidate = gated.get(pet.id);
    return {
      id: pet.id,
      name: pet.name,
      element: pet.element,
      family: pet.family,
      mapId: areaBySpecies.get(pet.id) ?? null,
      route: route ? {encounterId: route.encounterId, tier: route.tier, acquisition: 'draft-only'} : null,
      standardSCandidate: candidate ? {acquisition: candidate.acquisition, nameByLocale: candidate.nameByLocale} : null,
      concept: pet.concept,
      modelState: meshCandidate ? 'untextured-mesh-candidate' : candidate?.modelState ?? pet.runtime.modelStatus,
      ...(meshCandidate ? {meshCandidate} : {}),
      rigProfile: candidate?.rigProfile ?? pet.rigProfile,
      animationState: pet.runtime.animationStatus,
      vfxState: candidate?.vfxState ?? pet.runtime.vfxStatus,
    };
  });
  return {bundle: prepared, inventory, mapPets: areaBySpecies.size};
}

export async function loadCampaignV4Content(bundlePath) {
  const [bundle, content, canonical, historical] = await Promise.all([
    readJson(bundlePath),
    readJson(new URL('campaign-v4-content.json', spec)),
    readJson(new URL('wave-a-canonical-roster-v1.json', spec)),
    readJson(release),
  ]);
  return prepareCampaignV4Content(bundle, content, canonical, historical);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [bundlePath, output = '--summary', ...extra] = process.argv.slice(2);
  assert(bundlePath && extra.length === 0 && ['--summary', '--bundle', '--inventory'].includes(output),
    'Usage: node scripts/campaign-v4-content.mjs V4_BUNDLE [--summary|--bundle|--inventory]');
  const prepared = await loadCampaignV4Content(bundlePath);
  if (output === '--bundle') {
    console.log(JSON.stringify(prepared.bundle, null, 2));
  } else if (output === '--inventory') {
    console.log(JSON.stringify(prepared.inventory, null, 2));
  } else {
    console.log(JSON.stringify({
      pets: prepared.bundle.pets.length,
      abilities: prepared.bundle.skills.length,
      mapPets: prepared.mapPets,
      gatedStandardS: prepared.inventory.filter(pet => pet.standardSCandidate).length,
      enabledNewAcquisitionRoutes: 0,
    }));
  }
}
