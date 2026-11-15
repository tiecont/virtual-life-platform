import {expect,it} from 'vitest';
import {catalog,elements,roles,sources,skillNames,skillEffects,motionPets} from './content';
it('every public draft profile has bounded unique identity and valid localized references',()=>{
 expect(catalog.sourceStatus).toBe('DESIGN_CANDIDATE_NOT_GAMEPLAY');expect(catalog.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
 expect(catalog.pets).toHaveLength(240);expect(new Set(catalog.pets.map(p=>p.id)).size).toBe(240);expect(Object.keys(elements)).toHaveLength(19);
 for(const p of catalog.pets){expect(p.id).toMatch(/^[a-z0-9-]{1,80}$/);expect(elements[p.element]).toHaveLength(2);expect(sources[p.source]).toHaveLength(2);expect(roles[p.role]).toHaveLength(2);expect(p.color).toMatch(/^#[a-fA-F0-9]{6}$/);expect(p.accent).toMatch(/^#[a-fA-F0-9]{6}$/);for(const id of p.skills){expect(skillNames[id]).toHaveLength(2);expect(skillEffects[id]).toHaveLength(2);expect(catalog.skills.some(s=>s.id===id)).toBe(true);}}
 expect(catalog.pets.filter(p=>motionPets.includes(p.name.toLowerCase()))).toHaveLength(6);
 expect(catalog.pets.filter(p=>p.source==='standard_gacha').every(p=>p.signature===null)).toBe(true);
});
it('the website projection matches the merged candidate catalog without asserting asset readiness',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=JSON.parse(await readFile('specs/pet-arena/v3.1/data/pets_initial_240.json','utf8')) as {pets:{id:string;name:string;element:string;rank:string;source:string;combat:{role:string;skillRefs:string[]};assetStatus:string;productionReady:boolean}[]};
 expect(catalog.pets.map(p=>p.id)).toEqual(source.pets.map(p=>p.id));
 for(const pet of catalog.pets){const original=source.pets.find(p=>p.id===pet.id)!;expect({name:pet.name,element:pet.element,rank:pet.rank,source:pet.source,role:pet.role,skills:pet.skills}).toEqual({name:original.name,element:original.element,rank:original.rank,source:original.source,role:original.combat.role,skills:original.combat.skillRefs});expect(original.assetStatus).toBe('MISSING');expect(original.productionReady).toBe(false);}
});

it('skill costs and unlocks match the canonical design used by the detailed pages',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=JSON.parse(await readFile('specs/pet-arena/v3.1/data/skills_16.json','utf8')) as {skills:{id:string;manaCost:number;rageCost:number;cooldownTurns:number;unlockLevel:number;ultimateName?:string;ultimateCosts?:{rage:number;mana:number};fusionCardActivationCost?:{mana:number;rage:number}}[]};
 expect(catalog.skills).toEqual(source.skills.map(s=>({id:s.id,mana:s.manaCost,rage:s.rageCost,cooldown:s.cooldownTurns,unlock:s.unlockLevel,ultimate:s.ultimateName??null})));
 for(const skill of source.skills.filter(s=>s.ultimateName)){expect(skill.ultimateCosts).toEqual({rage:100,mana:0});expect(skill.fusionCardActivationCost).toEqual({mana:200,rage:150});}
});
