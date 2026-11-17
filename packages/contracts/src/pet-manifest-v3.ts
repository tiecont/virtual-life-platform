import {z} from 'zod';
import {PetContentDraftSchema,PetContentIdSchema,PetElementSchema,validatePetCatalog} from './pet-content';

export const PetContentHashSchema=z.string().regex(/^[a-f0-9]{64}$/);
const ids=(max:number)=>z.array(PetContentIdSchema).max(max);
const stats=z.strictObject({hp:z.number().int().min(1).max(1000000),attack:z.number().int().min(1).max(100000),defense:z.number().int().min(0).max(100000),speed:z.number().int().min(1).max(100000)});
// A sealed offline manifest is immutable input for future v3 allocation. It is
// deliberately not a production publication or an instruction to enable gameplay.
export const PetContentManifestV3Schema=z.strictObject({
 ...PetContentDraftSchema.shape,
 schemaVersion:z.literal(3),ruleset:z.literal('pet-arena-pve-v3'),release:z.literal('OFFLINE_ONLY'),rulesHash:PetContentHashSchema,
 cards:z.array(z.strictObject({id:PetContentIdSchema,skill:PetContentIdSchema,element:PetElementSchema})).min(1).max(64),
 combinations:z.array(z.strictObject({id:PetContentIdSchema,cards:ids(3).min(2),skill:PetContentIdSchema})).max(64),
 loadouts:z.array(z.strictObject({id:PetContentIdSchema,species:PetContentIdSchema,cards:ids(4).min(1),combinations:ids(4)})).min(1).max(1024),
 maps:z.array(z.strictObject({id:PetContentIdSchema,displayName:z.string().min(1).max(64)})).min(1).max(64),
 encounters:z.array(z.strictObject({id:PetContentIdSchema,map:PetContentIdSchema,species:PetContentIdSchema,level:z.number().int().min(1).max(100),revision:z.number().int().min(1).max(2147483647)})).min(1).max(1024),
 assets:z.array(z.strictObject({id:PetContentIdSchema,species:PetContentIdSchema,sha256:PetContentHashSchema.nullable(),provenanceRef:z.string().min(1).max(240),rights:z.literal('PENDING_REVIEW')})).max(4096),
}).superRefine((c,ctx)=>{
 validatePetCatalog(c,ctx);
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 const unique=(items:string[])=>{if(new Set(items).size!==items.length)fail('Duplicate manifest reference');};
 for(const key of ['cards','combinations','loadouts','maps','encounters','assets'] as const)unique(c[key].map(x=>x.id));
 const skills=new Map(c.skills.map(s=>[s.id,s])),species=new Map(c.species.map(s=>[s.id,s])),cards=new Map(c.cards.map(x=>[x.id,x])),combinations=new Map(c.combinations.map(x=>[x.id,x])),maps=new Set(c.maps.map(x=>x.id));
 for(const card of c.cards)if(!skills.has(card.skill))fail('Missing card skill');
 for(const combo of c.combinations){unique(combo.cards);if(!skills.has(combo.skill)||combo.cards.some(id=>!cards.has(id)))fail('Missing combination dependency');}
 for(const encounter of c.encounters)if(!species.has(encounter.species)||!maps.has(encounter.map))fail('Missing encounter dependency');
 for(const asset of c.assets)if(!species.has(asset.species))fail('Missing asset species');
 const matrix=new Map(c.effectiveness.map(x=>[x.attacker+':'+x.defender,x.permille]));
 for(const loadout of c.loadouts){
  unique(loadout.cards);unique(loadout.combinations);
  const pet=species.get(loadout.species);
  if(!pet||loadout.cards.some(id=>!cards.has(id))||loadout.combinations.some(id=>!combinations.has(id))){fail('Missing loadout dependency');continue;}
  if(loadout.combinations.some(id=>combinations.get(id)!.cards.some(card=>!loadout.cards.includes(card))))fail('Unequipped combination card');
  // An alternate elemental strike must remain usable from zero mana; a costly
  // skill alone cannot prove escape from an immunity/resource softlock.
  const damageElements=[pet.element,...loadout.cards.flatMap(id=>{
   const card=cards.get(id)!,skill=skills.get(card.skill);
   return skill?.opcode==='damage'&&skill.target==='enemy'&&skill.powerPermille>0&&skill.manaCost===0?[card.element]:[];
  })];
  for(const encounter of c.encounters){const enemy=species.get(encounter.species);if(enemy&&!damageElements.some(element=>(matrix.get(element+':'+enemy.element)??0)>0))fail('Immunity softlock');}
 }
});
export type PetContentManifestV3=z.infer<typeof PetContentManifestV3Schema>;
export const PetMatchContentPinV3Schema=z.strictObject({
 schemaVersion:z.literal(3),ruleset:z.literal('pet-arena-pve-v3'),contentHash:PetContentHashSchema,rulesHash:PetContentHashSchema,
 encounter:PetContentIdSchema,encounterRevision:z.number().int().min(1).max(2147483647),loadout:PetContentIdSchema,
 level:z.number().int().min(1).max(100),stats,
});
export type PetMatchContentPinV3=z.infer<typeof PetMatchContentPinV3Schema>;
