#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const defaults={
  spec:path.join(repositoryRoot,'specs/pet-arena/mvp-wave1-43-pets.json'),
  pets:path.join(repositoryRoot,'specs/pet-arena/v3.1/data/pets_initial_240.json'),
  maps:path.join(repositoryRoot,'specs/pet-arena/v3.1/data/maps_19.json'),
  standard:path.join(repositoryRoot,'specs/pet-arena/v3.1/data/standard_gacha_pets_6.json'),
};
const argumentsList=process.argv.slice(2);

function argument(name,fallback){
  const index=argumentsList.indexOf(`--${name}`);
  if(index===-1)return fallback;
  const value=argumentsList[index+1];
  assert(value&&!value.startsWith('--'),`--${name} requires a path`);
  return path.resolve(value);
}

const paths={
  spec:argument('spec',defaults.spec),
  pets:argument('pets',defaults.pets),
  maps:argument('maps',defaults.maps),
  standard:argument('standard',defaults.standard),
};

async function readJson(file){
  return JSON.parse(await readFile(file,'utf8'));
}

function sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

function unique(values,label){
  assert.equal(new Set(values).size,values.length,`${label} contains duplicates`);
}

const [spec,petsDocument,mapsDocument,standardDocument]=await Promise.all([
  readJson(paths.spec),readJson(paths.pets),readJson(paths.maps),readJson(paths.standard),
]);

assert.equal(spec.schemaVersion,1,'spec schemaVersion');
assert.equal(spec.scopeLock.petCount,43,'scopeLock.petCount');
assert.equal(spec.pets.length,43,'spec pets length');
unique(spec.pets.map(pet=>pet.id),'spec pet IDs');

const expectedCounts={limited_event_gacha:1,standard_gacha:6,map_legendary:6,map_regular:30};
for(const [category,count] of Object.entries(expectedCounts)){
  assert.equal(spec.pets.filter(pet=>pet.category===category).length,count,`${category} count`);
}
assert.deepEqual(
  Object.fromEntries(Object.keys(expectedCounts).sort().map(key=>[key,spec.pets.filter(pet=>pet.category===key).length])),
  Object.fromEntries(Object.entries(expectedCounts).sort()),
  'category composition',
);

const canonicalPets=new Map(petsDocument.pets.map(pet=>[pet.id,pet]));
for(const pet of spec.pets){
  const canonical=canonicalPets.get(pet.id);
  assert(canonical,`unknown canonical Pet ID ${pet.id}`);
  assert.equal(pet.name,canonical.name,`${pet.id} name drift`);
  assert.equal(pet.element,canonical.element,`${pet.id} element drift`);
  assert.equal(pet.race,canonical.race,`${pet.id} race drift`);
  assert.equal(pet.bodyPlan,canonical.bodyPlan,`${pet.id} bodyPlan drift`);
  assert.equal(pet.rig,canonical.rigArchetype,`${pet.id} rig drift`);
  assert.equal(pet.category,canonical.source,`${pet.id} acquisition-source drift`);
  if(canonical.source==='standard_gacha')assert.equal(pet.mapId,null);
  else assert.equal(pet.mapId,canonical.mapId,`${pet.id} map drift`);
}

const soleLimited=spec.pets.filter(pet=>pet.category==='limited_event_gacha');
assert.deepEqual(soleLimited.map(pet=>pet.id),['pet-v3-fire-icarus'],'sole Limited S');
assert(!spec.pets.some(pet=>pet.id==='pet-v3-ice-glaciemora'||pet.id==='pet-v3-electric-voltaris'||pet.id==='pet-v3-ghost-noctalith'||pet.id==='pet-v3-grass-sylvaris'||pet.id==='pet-v3-water-leviara'),'VL-172 Limited identities included');

const canonicalStandard=standardDocument.pets.map(pet=>pet.id);
const specStandard=spec.pets.filter(pet=>pet.category==='standard_gacha').map(pet=>pet.id);
assert.equal(specStandard.length,6,'Standard count');
assert.deepEqual(new Set(specStandard),new Set(canonicalStandard),'Standard roster drift');
unique(specStandard,'Standard IDs');

assert.equal(spec.elements.length,6,'element count');
unique(spec.elements,'elements');
assert.deepEqual(new Set(spec.elements),new Set(spec.maps.map(map=>map.element)),'element/map mismatch');
assert.equal(spec.maps.length,6,'map count');
unique(spec.maps.map(map=>map.id),'map IDs');
assert.deepEqual(spec.maps.map(map=>map.id),spec.elements.map(element=>spec.maps.find(map=>map.element===element).id),'maps must follow element selection order');

const canonicalMaps=new Map(mapsDocument.maps.map(map=>[map.id,map]));
for(const waveMap of spec.maps){
  const canonical=canonicalMaps.get(waveMap.id);
  assert(canonical,`unknown map ${waveMap.id}`);
  assert.equal(waveMap.name,canonical.name,`${waveMap.id} name drift`);
  assert.equal(waveMap.element,canonical.primaryElement,`${waveMap.id} element drift`);
  assert.deepEqual(waveMap.regularPetIds,canonical.regularPetIds.slice(0,5),`${waveMap.id} regular roster drift`);
  assert.equal(waveMap.legendaryPetId,canonical.legendaryPetId,`${waveMap.id} legendary drift`);
  const members=spec.pets.filter(pet=>pet.mapId===waveMap.id);
  assert.equal(members.length,6,`${waveMap.id} spec member count`);
  assert.deepEqual(new Set(members.filter(pet=>pet.category==='map_regular').map(pet=>pet.id)),new Set(waveMap.regularPetIds),`${waveMap.id} spec regulars`);
  assert.equal(members.filter(pet=>pet.category==='map_legendary').length,1,`${waveMap.id} boss count`);
  assert.equal(members.find(pet=>pet.category==='map_legendary').id,waveMap.legendaryPetId,`${waveMap.id} spec boss`);
}

assert.equal(spec.sharedRaceBases.length,10,'shared base count');
unique(spec.sharedRaceBases.map(base=>base.id),'shared base IDs');
const bases=new Map(spec.sharedRaceBases.map(base=>[base.id,base]));
const regulars=spec.pets.filter(pet=>pet.category==='map_regular');
const mappedMembers=[];
for(const base of spec.sharedRaceBases){
  assert(Array.isArray(base.memberPetIds)&&base.memberPetIds.length>0,`${base.id} has no members`);
  for(const petId of base.memberPetIds){
    const pet=canonicalPets.get(petId);
    assert(pet,`${base.id} unknown member ${petId}`);
    assert.equal(pet.source,'map_regular',`${base.id} non-regular member ${petId}`);
    assert.equal(pet.rigArchetype,base.rig,`${base.id} rig mismatch for ${petId}`);
    assert.equal(spec.pets.find(item=>item.id===petId).baseMeshId,base.id,`${petId} baseMeshId mismatch`);
    mappedMembers.push(petId);
  }
}
assert.equal(new Set(mappedMembers).size,30,'shared base member count');
assert.equal(mappedMembers.length,30,'shared base membership duplicates');
assert.deepEqual(new Set(mappedMembers),new Set(regulars.map(pet=>pet.id)),'base membership coverage mismatch');
assert([...bases.keys()].every(id=>regulars.some(pet=>pet.baseMeshId===id)),'unused shared base');

const evolution=spec.evolutionAccessorySystem;
assert.deepEqual(evolution.levelStages,[20,40,60],'evolution stages');
assert.equal(evolution.accessories.length,18,'accessory count');
unique(evolution.accessories.map(item=>item.id),'accessory IDs');
for(const element of spec.elements){
  for(const level of evolution.levelStages){
    assert.equal(evolution.accessories.filter(item=>item.element===element&&item.level===level).length,1,`${element} Lv${level} accessory`);
  }
}
assert.equal(evolution.fitProfiles.length,10,'evolution fit profile count');
assert.deepEqual(new Set(evolution.fitProfiles),new Set(spec.sharedRaceBases.map(base=>base.id)),'evolution fit profile mismatch');

assert.equal(spec.arenaMapKits.length,6,'arena kit count');
unique(spec.arenaMapKits.map(kit=>kit.id),'arena kit IDs');
for(const waveMap of spec.maps){
  const kits=spec.arenaMapKits.filter(kit=>kit.mapId===waveMap.id);
  assert.equal(kits.length,1,`${waveMap.id} arena kit count`);
  assert.equal(kits[0].id,waveMap.arenaKitId,`${waveMap.id} arena kit mismatch`);
}

assert.equal(spec.conceptBatch1.count,22,'concept batch count');
assert.deepEqual(spec.conceptBatch1.categories,{standardGacha:6,mapLegendary:6,sharedRaceBase:10},'concept category counts');
assert.equal(spec.hardGates.publication,'NO_GO_PUBLIC','publication gate');
assert.equal(spec.hardGates.unityAdmission,'NOT_AUTHORIZED_BY_THIS_SPEC','Unity admission gate');
assert.match(spec.releaseState,/DRAFT_ONLY \/ OFFLINE_ONLY \/ NO_GO_PUBLIC/,'release state');

for(const source of spec.sourceOfTruth){
  const sourcePath=path.resolve(repositoryRoot,source.path);
  const actual=sha256(await readFile(sourcePath));
  assert.equal(actual,source.sha256,`source hash drift: ${source.path}`);
}

for(const canonical of canonicalPets.values()){
  if(spec.pets.some(pet=>pet.id===canonical.id))assert.equal(canonical.assetStatus,'MISSING',`${canonical.id} unexpectedly claims art`);
}
for(const pet of petsDocument.pets.filter(pet=>pet.id==='pet-v3-fire-icarus'||specStandard.includes(pet.id))){
  assert.equal(pet.assetStatus,'MISSING',`${pet.id} unexpectedly claims production art`);
  assert.equal(pet.published,false,`${pet.id} unexpectedly published`);
  assert.equal(pet.productionReady,false,`${pet.id} unexpectedly production ready`);
}

console.log(JSON.stringify({
  state:'PASS',
  spec:paths.spec,
  pets:spec.pets.length,
  composition:expectedCounts,
  elements:spec.elements,
  maps:spec.maps.map(map=>map.id),
  sharedRaceBases:spec.sharedRaceBases.length,
  evolutionAccessories:evolution.accessories.length,
  arenaMapKits:spec.arenaMapKits.length,
  conceptBatch:spec.conceptBatch1.count,
  release:spec.releaseState,
},null,2));
