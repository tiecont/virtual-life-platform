import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPetDesign,validatePetDesign} from '../../scripts/pet-design-check.mjs';

test('original Pet design covers 19 elements and 114 unpublished species with coherent map and loadout gates',async()=>{
 assert.deepEqual(validatePetDesign(await readPetDesign()),{elements:19,maps:19,species:114,status:'DRAFT_ONLY',runtimeEnabled:false});
});
test('design validation rejects broken content references and unearned publication claims',async()=>{
 const original=await readPetDesign();
 for(const mutate of [
  c=>c.species.push(globalThis.structuredClone(c.species[0])),
  c=>{c.species[0].skillLoadout=['execute-script'];},
  c=>{c.species[0].comboId='warded-strike';},
  c=>{c.species[0].productionReady=true;},
  c=>{c.species[0].encounterLevels=[101,102];},
  c=>{c.maps[0].prerequisiteClear=c.maps[1].id+':gate';},
  c=>{c.elements.find(e=>e.id==='electric').immuneDefenders=[];},
  c=>{c.statProfiles.striker.attack=1201;},
  c=>{c.upgrade.successPermille.fill(1000);},
  c=>{c.sharedSkills[0].script='arbitrary';},
  c=>{c.runtimeEnabled=true;},
 ]){const broken=globalThis.structuredClone(original);mutate(broken);assert.throws(()=>validatePetDesign(broken));}
});
