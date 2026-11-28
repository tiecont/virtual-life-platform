// Materialize an operator draft from checked-in authored values. This command
// has no network or database client and never activates an encounter.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function routeCandidate(shared, content, profiles) {
  assert.equal(shared.schemaVersion, 6);
  assert.equal(content.routeAcquisitionEnabled, false);
  const pets = new Map(shared.pets.map(pet => [pet.id, pet]));
  const wardens = new Map(shared.bosses.map(boss => [boss.mapId, boss]));
  const byRoute = new Map(profiles.encounters.map(row => [row.id, row]));
  assert.equal(byRoute.size, profiles.encounters.length);
  const campaignRoutes = content.maps.flatMap(map => map.routes.map(route => {
    const {encounterId: id, opponentPetId, tier, prerequisiteEncounterId} = route;
    const tuning = byRoute.get(id);
    assert.ok(tuning, 'Missing authored encounter profile for ' + id);
    byRoute.delete(id);
    const warden = wardens.get(map.id);
    const template = tier === 'boss' ? warden : warden.regular;
    const profile = {
      id, name: pets.get(opponentPetId).catalog.name, mapId: map.id, element: map.element,
      maxHp: tuning.maxHp, attack: tuning.attack, defense: tuning.defense,
      attackModel: globalThis.structuredClone(template.attackModel), phase: globalThis.structuredClone(tuning.phase),
      critRateBp: template.critRateBp, critDamageBp: template.critDamageBp,
      telegraphTurns: template.telegraphTurns, requiredRoomPoints: 0,
      rewardPolicy: {...globalThis.structuredClone(template.rewardPolicy), recruitmentPetIds: [opponentPetId],
        minimumActions: {victory: 1, defeat: 1}},
    };
    return {id, mapId: map.id, opponentPetId, tier, prerequisiteEncounterId,
      enabled: false, mode: tier === 'entry' ? 'solo' : 'either', profile};
  }));
  assert.equal(byRoute.size, 0, 'Encounter profile has no canonical route');
  assert.equal(campaignRoutes.length, 48);
  return {...shared, schemaVersion: 7, engineCapability: 'arena8-coop-v6', campaignRoutes};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = ['../config/gameplay/arena8-coop-shared-rng-v1.candidate.json',
    '../specs/pet-arena/campaign-v4-content.json', '../config/gameplay/candidates/map-encounters.json'];
  const inputs = await Promise.all(files.map(async file => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'))));
  console.log(JSON.stringify(routeCandidate(...inputs), null, 2));
}
