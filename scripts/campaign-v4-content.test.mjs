import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {prepareCampaignV4Content} from './campaign-v4-content.mjs';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [baseline, canonical, draft] = await Promise.all([
  read('../config/gameplay/arena8-coop-advanced-v1.candidate.json'),
  read('../specs/pet-arena/wave-a-canonical-roster-v1.json'),
  read('../specs/pet-arena/campaign-v4-content.json'),
]);

// These checks exercise roster composition. The integrated schema-six draft
// still needs the Rust engine validator for its combat values and typed rules.
const input = () => ({
  bundle: {...globalThis.structuredClone(baseline), schemaVersion: 6},
  content: globalThis.structuredClone(draft),
});
const prepare = ({bundle, content}) => prepareCampaignV4Content(bundle, content, canonical, baseline);

test('prepares all 61 canonical identities and preserves the 221 historical ability IDs', () => {
  const value = input();
  const result = prepare(value);
  assert.equal(result.inventory.length, 61);
  assert.equal(result.bundle.pets.length, 61);
  assert.equal(result.mapPets, 48);
  assert.equal(result.bundle.skills.length, 245);
  assert.equal(new Set(result.bundle.skills.map(skill => skill.id)).size, 245);
  assert.deepEqual(result.bundle.skills.slice(0, 221), baseline.skills);
  assert.deepEqual(result.bundle.bosses, baseline.bosses);
  assert.deepEqual(value.bundle.pets, baseline.pets);

  const mapFamilies = result.inventory.filter(pet => ['bird', 'dragon'].includes(pet.family));
  assert.equal(mapFamilies.length, 12);
  for (const pet of mapFamilies) {
    assert(pet.mapId);
    assert.equal(pet.route.tier, pet.family === 'bird' ? 'advanced' : 'boss');
    assert.equal(pet.route.acquisition, 'draft-only');
  }

  const candidates = result.inventory.filter(pet => pet.standardSCandidate);
  assert.equal(candidates.length, 6);
  for (const pet of candidates) {
    assert.equal(pet.standardSCandidate.acquisition, 'blocked');
    assert.equal(pet.route, null);
    assert.equal(pet.concept.rights, 'PENDING_REVIEW');
  }
  assert.deepEqual(prepare({...value, bundle: result.bundle}), result);
});

test('rejects swapped elements and an advanced route with no prerequisite', () => {
  const crossed = input();
  crossed.content.maps[0].routes[5].opponentPetId = 'bird-water-tidewren';
  assert.throws(() => prepare(crossed), /belongs to another element/);

  const skipped = input();
  skipped.content.maps[0].routes[5].prerequisiteEncounterId = null;
  assert.throws(() => prepare(skipped), /must require the preceding encounter/);
});

test('rejects a gated candidate through a Warden reward or banner activation', () => {
  const reward = input();
  reward.bundle.bosses[0].rewardPolicy.recruitmentPetIds.unshift('pet-s-fire-vulcaryn');
  assert.throws(() => prepare(reward), /Recruitment stays on the historical route/);

  const banner = input();
  banner.content.standardSBanner.enabled = true;
  assert.throws(() => prepare(banner), /enabled/);
});

test('rejects historical binding drift and duplicate candidate skills', () => {
  const renamed = input();
  renamed.bundle.pets[0].skill = 'unbound-skill';
  assert.throws(() => prepare(renamed), /Legacy ability binding changed/);

  const duplicate = input();
  const skills = duplicate.content.standardSCandidates[0].runtimeSkills;
  skills.push(skills[0]);
  assert.throws(() => prepare(duplicate), /Duplicate candidate ability ID/);
});

test('refuses the historical schema and unsupported identities', () => {
  assert.throws(() => prepare({bundle: baseline, content: draft}), /typed V4/);

  const injected = input();
  injected.bundle.pets.push({...injected.bundle.pets[0], id: 'new-invented-pet'});
  assert.throws(() => prepare(injected), /Unexpected or modified gated Pet/);
});
