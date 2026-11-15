import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {PetAcquisitionDraftV3Schema,PetTaxonomyDraftV3Schema,PetBodyPlanV3Schema,PetRigV3Schema} from '../src/pet-taxonomy-v3';
const data=(name:string)=>JSON.parse(readFileSync(new URL('../../../specs/pet-arena/v3.1/data/'+name,import.meta.url),'utf8'));
function taxonomy(){
 return {schemaVersion:3,ruleset:'pet-arena-pve-v3',state:'DRAFT_ONLY',enabled:false,
  elements:data('elements.json').elements.map((e:{id:string;strongAgainst:string[];resistedBy:string[];noEffectAgainst:string[]})=>({id:e.id,strongAgainst:e.strongAgainst,resistedBy:e.resistedBy,noEffectAgainst:e.noEffectAgainst})),
  effectiveness:data('element_effectiveness_matrix.json').attackerRowsDefenderColumns,
  races:data('races.json').races.map((r:{id:string;defaultBodyPlan:string;defaultRig:string;locomotion:string})=>({id:r.id,defaultBodyPlan:r.defaultBodyPlan,defaultRig:r.defaultRig,locomotion:r.locomotion}))};
}
describe('versioned Pet taxonomy and acquisition drafts',()=>{
 it('accepts actual19 elements,361 directed pairs and22 race templates',()=>{
  const parsed=PetTaxonomyDraftV3Schema.parse(taxonomy());expect(parsed.elements).toHaveLength(19);expect(parsed.races).toHaveLength(22);
  expect(parsed.effectiveness.electric.ground).toBe(0);expect(parsed.effectiveness.ground.electric).toBe(1250);
 });
 it('rejects unknown, duplicate, incomplete, inconsistent and executable taxonomy data',()=>{
  const original=PetTaxonomyDraftV3Schema.parse(taxonomy());
  for(const change of [
   (c:typeof original)=>{c.elements[0]=c.elements[1];},
   (c:typeof original)=>{c.races[0]=c.races[1];},
   (c:typeof original)=>{c.effectiveness.electric.ground=1000;},
   (c:typeof original)=>{c.elements[0].strongAgainst.push('fire','fire');},
   (c:typeof original)=>{Reflect.deleteProperty(c.effectiveness.fire,'water');},
   (c:typeof original)=>{Reflect.set(c.effectiveness.fire,'arcane',1000);},
   (c:typeof original)=>{Reflect.set(c.races[0],'script','execute');},
   (c:typeof original)=>{Reflect.set(c,'enabled',true);},
   (c:typeof original)=>{Reflect.set(c,'schemaVersion',2);},
  ]){const c=structuredClone(original);change(c);expect(PetTaxonomyDraftV3Schema.safeParse(c).success).toBe(false);}
 });
 it('validates every240 catalog acquisition and explicit morphology override',()=>{
  for(const p of data('pets_initial_240.json').pets){
   expect(PetAcquisitionDraftV3Schema.safeParse({rank:p.rank,source:p.source,mapId:p.mapId,requiredUniqueWins:p.capture.requiredUniqueWins,signatureCard:p.combat.signatureCard,awakeningEnabled:p.awakening.applies}).success).toBe(true);
   expect(PetBodyPlanV3Schema.safeParse(p.bodyPlan).success).toBe(true);expect(PetRigV3Schema.safeParse(p.rigArchetype).success).toBe(true);
  }
 });
 it('denies Standard map capture, signature leaks, extra ranks and wrong win rules',()=>{
  const standard={rank:'S',source:'standard_gacha',mapId:null,requiredUniqueWins:0,signatureCard:null,awakeningEnabled:true};
  for(const patch of [{rank:'A'},{rank:'SSR'},{source:'unknown'},{mapId:'fire-map'},{requiredUniqueWins:3},{signatureCard:'limited-card'},{awakeningEnabled:false},{script:'x'}])expect(PetAcquisitionDraftV3Schema.safeParse({...standard,...patch}).success).toBe(false);
  expect(PetAcquisitionDraftV3Schema.safeParse({...standard,source:'map_legendary',mapId:'fire-map',requiredUniqueWins:3,awakeningEnabled:false}).success).toBe(false);
  expect(PetAcquisitionDraftV3Schema.safeParse({...standard,source:'limited_event_gacha'}).success).toBe(false);
 });
});
