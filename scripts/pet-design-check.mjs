import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const expectedElements='normal fire water grass electric ice fighting poison ground flying psychic bug rock ghost dragon dark steel fairy light'.split(' ');
function indexed(items){
 assert(Array.isArray(items));
 const map=new Map();
 for(const item of items){assert(/^[a-z][a-z0-9_-]*$/.test(item.id)&&!map.has(item.id),'Duplicate or invalid identifier');map.set(item.id,item);}
 return map;
}
export function validatePetDesign(c){
 assert.equal(c.schemaVersion,2);assert.equal(c.ruleset,'pet-arena-pve-v2');
 assert.equal(c.state,'DRAFT_ONLY');assert.equal(c.runtimeEnabled,false);
 assert.equal(c.scope,'OFFLINE_ONLY');assert.equal(c.publicDecision,'NO_GO_PUBLIC');
 const elements=indexed(c.elements),maps=indexed(c.maps),species=indexed(c.species),skills=indexed(c.sharedSkills),cards=indexed(c.cards),combos=indexed(c.combinations);
 assert.deepEqual([...elements.keys()].sort(),expectedElements.toSorted());
 assert.deepEqual(c.effectivenessPermille,{default:1000,advantage:1250,resistedBy:800,immuneDefenders:0});
 for(const element of elements.values()){
  const edges=[...element.advantage,...element.resistedBy,...element.immuneDefenders];
  assert(edges.every(id=>elements.has(id))&&new Set(edges).size===edges.length,'Invalid element relations');
  assert(element.advantage.length<elements.size-1,'Universally dominant element');
  assert([...elements.values()].some(other=>other.advantage.includes(element.id)),'Element lacks an offensive counter');
 }
 assert.equal(elements.get('normal').advantage.length,0);
 assert(elements.get('electric').immuneDefenders.includes('ground'));
 assert(elements.get('normal').immuneDefenders.includes('ghost')&&elements.get('fighting').immuneDefenders.includes('ghost'));
 for(const profile of Object.values(c.statProfiles)){
  assert.deepEqual(Object.keys(profile).sort(),['attack','defense','hp','speed']);
  assert(Object.values(profile).every(n=>Number.isInteger(n)&&n>=800&&n<=1200));
  assert.equal(Object.values(profile).reduce((sum,n)=>sum+n,0),4000,'Unbounded stat budget');
 }
 const growth=indexed(c.growthProfiles);
 for(const profile of growth.values())assert(profile.minLevel===1&&profile.maxLevel===100&&profile.perLevelPermille>0&&profile.perLevelPermille<=50&&profile.rarityMultiplier===1000);
 const opcodes=new Set(['damage','shield','heal','dot','cleanse','attack_buff','shield_damage','initiative_debuff','resource_mana','damage_and_heal']);
 for(const skill of skills.values()){
  assert(opcodes.has(skill.opcode)&&['self','enemy'].includes(skill.target));
  assert(Number.isInteger(skill.powerPermille)&&skill.powerPermille>=0&&skill.powerPermille<=2000);
  assert(Number.isInteger(skill.manaCost)&&skill.manaCost>=0&&skill.manaCost<=100);
  assert(Number.isInteger(skill.cooldown)&&skill.cooldown>=1&&skill.cooldown<=5);
  assert(Number.isInteger(skill.stackCap)&&skill.stackCap>=1&&skill.stackCap<=3);
  assert(skill.durationTurns===undefined||Number.isInteger(skill.durationTurns)&&skill.durationTurns>=1&&skill.durationTurns<=3);
  assert(Object.keys(skill).every(key=>['id','opcode','powerPermille','manaCost','cooldown','target','stackCap','durationTurns'].includes(key)),'Unexpected skill field');
 }
 for(const card of cards.values())assert(skills.has(card.skill)&&card.manaCost>=0&&card.manaCost<=100&&card.cooldown>=1&&card.cooldown<=5);
 for(const combo of combos.values())assert(combo.components.length===2&&new Set(combo.components).size===2&&combo.components.every(id=>skills.has(id))&&combo.manaCost<=100&&combo.comboCharges<=3);
 for(const map of maps.values()){
  assert(elements.has(map.primaryElement)&&map.secondaryElements.every(id=>elements.has(id)));
  assert(map.recommendedLevel[0]>=1&&map.recommendedLevel[1]<=100&&map.recommendedLevel[0]<=map.recommendedLevel[1]);
  assert(map.achievementPoints>=0&&map.firstClearAchievement>0&&map.repeatAchievementCapPerWeek>=0);
  if(map.prerequisiteClear)assert(maps.has(map.prerequisiteClear.replace(/:gate$/,'')),'Missing map prerequisite');
  assert(species.get(map.bossSpeciesId)?.boss&&species.get(map.bossSpeciesId).mapId===map.id,'Missing map boss');
  const seen=new Set();let current=map;
  while(current){assert(!seen.has(current.id),'Cyclic map gate');seen.add(current.id);current=current.prerequisiteClear?maps.get(current.prerequisiteClear.replace(/:gate$/,'')):null;}
 }
 const counts=new Map(),names=new Set();
 for(const pet of species.values()){
  assert(elements.has(pet.element)&&maps.has(pet.mapId)&&maps.get(pet.mapId).primaryElement===pet.element);
  assert(!names.has(pet.displayName));names.add(pet.displayName);
  assert(maps.get(pet.mapId).subzones.includes(pet.subzone));
  assert(pet.encounterLevels[0]>=1&&pet.encounterLevels[1]<=100&&pet.encounterLevels[0]<=pet.encounterLevels[1]&&pet.ownedLevelCap===100);
  assert(c.statProfiles[pet.statProfile]&&growth.has(pet.growthProfile));
  assert(pet.skillLoadout.length>=1&&pet.skillLoadout.length<=2&&pet.skillLoadout.every(id=>skills.has(id)));
  assert(pet.cards.length<=2&&pet.cards.every(id=>cards.has(id)));
  if(pet.comboId)assert(combos.has(pet.comboId)&&combos.get(pet.comboId).components.every(id=>pet.skillLoadout.includes(id)),'Unusable equipped combination');
  assert.equal(pet.capture.requiredUniqueWins,3);assert.equal(pet.capture.reset,'never');assert.equal(pet.capture.duplicateReceiptProgress,0);
  assert(pet.silhouette.length>10&&pet.formId&&pet.palette.length===3);
  assert(pet.availability==='DRAFT_ONLY'&&pet.gameplayStatus==='NOT_VALIDATED'&&pet.assetStatus==='MISSING'&&pet.productionReady===false,'Unverified content must remain unpublished');
  counts.set(pet.element,(counts.get(pet.element)??0)+1);
 }
 assert.equal(species.size,114);assert.equal(maps.size,19);assert([...elements.keys()].every(id=>counts.get(id)===6));
 assert.equal(c.priorityVisualSet.length,6);assert.equal(new Set(c.priorityVisualSet.map(id=>species.get(id)?.element)).size,6);
 assert(c.priorityVisualSet.every(id=>species.has(id))&&species.get(c.priorityBoss)?.boss);
 assert.deepEqual(c.upgrade.successPermille,[1000,900,800,700,600,500,400,300,250,200]);
 assert.equal(c.upgrade.maxTier,10);assert.equal(c.upgrade.pity,false);assert.equal(c.upgrade.paidAdvantage,false);
 return {elements:elements.size,maps:maps.size,species:species.size,status:'DRAFT_ONLY',runtimeEnabled:false};
}
export async function readPetDesign(){return JSON.parse(await readFile(new URL('../specs/pet-arena/catalog-v2.json',import.meta.url),'utf8'));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(validatePetDesign(await readPetDesign())));
