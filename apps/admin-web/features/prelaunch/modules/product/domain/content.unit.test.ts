import {expect,it} from 'vitest';
import {catalog,elements,roles,sources,skillNames,motionPets} from './content';
it('every public draft profile has bounded unique identity and valid localized references',()=>{
 expect(catalog.sourceStatus).toBe('UNMERGED_DESIGN_CANDIDATE_NOT_GAMEPLAY');expect(catalog.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
 expect(catalog.pets).toHaveLength(240);expect(new Set(catalog.pets.map(p=>p.id)).size).toBe(240);expect(Object.keys(elements)).toHaveLength(19);
 for(const p of catalog.pets){expect(p.id).toMatch(/^[a-z0-9-]{1,80}$/);expect(elements[p.element]).toHaveLength(2);expect(sources[p.source]).toHaveLength(2);expect(roles[p.role]).toHaveLength(2);expect(p.color).toMatch(/^#[a-fA-F0-9]{6}$/);expect(p.accent).toMatch(/^#[a-fA-F0-9]{6}$/);for(const id of p.skills){expect(skillNames[id]).toHaveLength(2);expect(catalog.skills.some(s=>s.id===id)).toBe(true);}}
 expect(catalog.pets.filter(p=>motionPets.includes(p.name.toLowerCase()))).toHaveLength(6);
 expect(catalog.pets.filter(p=>p.source==='standard_gacha').every(p=>p.signature===null)).toBe(true);
});
