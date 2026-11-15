import {z} from 'zod';

export const PetElementSchema=z.enum(['normal','fire','water','grass','electric','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy','light']);
export const PetContentIdSchema=z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const coefficient=z.number().int().min(800).max(1200);
const profile=z.strictObject({id:PetContentIdSchema,hp:coefficient,attack:coefficient,defense:coefficient,speed:coefficient})
 .refine(p=>p.hp+p.attack+p.defense+p.speed===4000,'Stat budget must equal 4000');
const growth=z.strictObject({id:PetContentIdSchema,perLevelPermille:z.number().int().min(1).max(50),maxLevel:z.literal(100)});
const skill=z.strictObject({id:PetContentIdSchema,opcode:z.enum(['damage','shield','heal','dot','cleanse','attack_buff','shield_damage','initiative_debuff','resource_mana','damage_and_heal']),powerPermille:z.number().int().min(0).max(2000),manaCost:z.number().int().min(0).max(100),cooldown:z.number().int().min(1).max(5),target:z.enum(['self','enemy']),stackCap:z.number().int().min(1).max(3),durationTurns:z.number().int().min(1).max(3).optional()});
export const PetSpeciesDraftSchema=z.strictObject({id:PetContentIdSchema,displayName:z.string().min(1).max(64),element:PetElementSchema,rarity:z.enum(['common','uncommon','rare','epic','legendary']),statProfile:PetContentIdSchema,growthProfile:PetContentIdSchema,skills:z.array(PetContentIdSchema).min(1).max(2),levelCap:z.literal(100),assetState:z.literal('MISSING'),productionReady:z.literal(false)});
export const PetContentDraftSchema=z.strictObject({schemaVersion:z.literal(2),ruleset:z.literal('pet-arena-pve-v2'),
 elements:z.array(z.strictObject({id:PetElementSchema,displayName:z.string().min(1).max(64)})).length(19),
 effectiveness:z.array(z.strictObject({attacker:PetElementSchema,defender:PetElementSchema,permille:z.union([z.literal(0),z.literal(800),z.literal(1000),z.literal(1250)])})).length(361),
 profiles:z.array(profile).min(1).max(32),growth:z.array(growth).min(1).max(32),skills:z.array(skill).min(1).max(64),species:z.array(PetSpeciesDraftSchema).min(1).max(1024),
}).superRefine((c,ctx)=>{
 const unique=(values:string[],path:string)=>{if(new Set(values).size!==values.length)ctx.addIssue({code:'custom',path:[path],message:'Duplicate content identifier'});};
 for(const key of ['elements','profiles','growth','skills','species'] as const)unique(c[key].map(x=>x.id),key);
 unique(c.effectiveness.map(x=>x.attacker+':'+x.defender),'effectiveness');
 const elements=new Set(c.elements.map(x=>x.id)),profiles=new Set(c.profiles.map(x=>x.id)),growth=new Set(c.growth.map(x=>x.id)),skills=new Set(c.skills.map(x=>x.id));
 for(const row of c.effectiveness)if(!elements.has(row.attacker)||!elements.has(row.defender))ctx.addIssue({code:'custom',path:['effectiveness'],message:'Missing element'});
 for(const pet of c.species){
  if(!elements.has(pet.element)||!profiles.has(pet.statProfile)||!growth.has(pet.growthProfile)||pet.skills.some(id=>!skills.has(id)))ctx.addIssue({code:'custom',path:['species'],message:'Missing content reference'});
  unique(pet.skills,'species');
 }
});
export type PetContentDraft=z.infer<typeof PetContentDraftSchema>;
export type PetSpeciesDraft=z.infer<typeof PetSpeciesDraftSchema>;
