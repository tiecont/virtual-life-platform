import {DomainError} from '../../../../../shared/common/errors';

type SkillCosts={skillId:string;materials:readonly number[]};

function record(value:unknown):Record<string,unknown>|undefined{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
}

export function petSkillIds(bundle:Record<string,unknown>,petId:string):string[]|undefined{
 if(!Array.isArray(bundle.pets))return undefined;
 const pet=record(bundle.pets.find(value=>record(value)?.id===petId));
 if(!pet)return undefined;
 const required=[pet.guard,pet.skill,pet.signature,pet.ultimate];
 if(!required.every((value):value is string=>typeof value==='string'))return undefined;
 return typeof pet.fireZone==='string'?[...required,pet.fireZone]:required;
}

// The publication process validates all gameplay semantics in Rust. This
// projection only extracts the upgrade costs needed to debit the wallet.
export function publishedSkillCosts(bundle:Record<string,unknown>,petId:string):SkillCosts[]{
 const ids=petSkillIds(bundle,petId),skills=bundle.skills;
 if(!ids)throw new DomainError('NOT_AVAILABLE',409,'Pet is unavailable in the published gameplay configuration');
 if(!Array.isArray(skills))throw new DomainError('NOT_AVAILABLE',503,'Published skill configuration is unavailable');
 return [...new Set(ids)].map(skillId=>{
  const skill=record(skills.find(value=>record(value)?.id===skillId));
  if(!skill)throw new DomainError('NOT_AVAILABLE',503,'Published skill configuration is unavailable');
  const upgrades=skill.upgradeLevels;
  if(upgrades===undefined||upgrades===null)return {skillId,materials:[]};
  if(!Array.isArray(upgrades)||upgrades.length<1||upgrades.length>9)
   throw new DomainError('NOT_AVAILABLE',503,'Published skill configuration is unavailable');
  const materials=upgrades.map(upgrade=>record(upgrade)?.materials);
  if(!materials.every((cost):cost is number=>typeof cost==='number'&&Number.isInteger(cost)&&cost>0&&cost<=1_000_000))
   throw new DomainError('NOT_AVAILABLE',503,'Published skill configuration is unavailable');
  return {skillId,materials};
 });
}
