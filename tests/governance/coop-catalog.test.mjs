import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const readJson=async(path)=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));

test('the cooperative seed carries the exact active canonical identities and metadata',async()=>{
 const [seed,roster]=await Promise.all([
  readJson('../../config/gameplay/arena8-coop-v2.seed.json'),
  readJson('../../specs/pet-arena/wave-a-canonical-roster-v1.json'),
 ]);
 const active=roster.pets.filter(p=>p.rosterState==='ACTIVE');
 assert.equal(active.length,55);
 assert.equal(roster.pets.filter(p=>p.rosterState==='CANDIDATE').length,6);
 const byId=new Map(seed.pets.map(p=>[p.id,p]));
 assert.equal(seed.pets.length,active.length);
 for(const pet of active){
  const entry=byId.get(pet.id);
  assert(entry,pet.id);
  assert.equal(entry.element,pet.element,pet.id);
  assert.equal(entry.rarity,pet.summonRarity.toLowerCase().replaceAll(' ','-'),pet.id);
  assert.equal(entry.powerClass,pet.presentationPowerClass.toLowerCase(),pet.id);
  assert.deepEqual(entry.catalog,{name:pet.name,mapId:pet.mapId},pet.id);
 }
});
