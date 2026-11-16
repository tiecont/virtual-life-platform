import {z} from 'zod';
import {PetContentIdSchema,PetElementSchema} from './pet-content';

export const PetRankV3Schema=z.enum(['B','A','S']);
export const PetSourceV3Schema=z.enum(['map_regular','map_legendary','limited_event_gacha','standard_gacha']);
export const PetBodyPlanV3Schema=z.enum(['quadruped','floating','insectoid','serpentine','avian','humanoid','golem','plant','slime','spectral','amorphous','mechanical','centaur','aquatic','radial','hexapod']);
export const PetRigV3Schema=z.enum(['rig_q4','rig_serpent','rig_float','rig_humanoid','rig_avian','rig_flora','rig_aquatic','rig_spectral','rig_heavy','rig_machine','rig_soft','rig_insect','rig_centaur']);
export const PetRaceV3Schema=z.enum(['beast','dragonkin','spirit','celestial','demon','avian','flora','aquatic','undead','construct','machine','slime','insectoid','mythborn','humanoid','elemental','fungal','arthropod','amorphous','crystalborn','living_artifact','cephalopod']);
const permille=z.union([z.literal(0),z.literal(800),z.literal(1000),z.literal(1250)]);
const relations=z.array(PetElementSchema).max(18);
const element=z.strictObject({id:PetElementSchema,strongAgainst:relations,resistedBy:relations,noEffectAgainst:relations});
const race=z.strictObject({id:PetRaceV3Schema,defaultBodyPlan:PetBodyPlanV3Schema,defaultRig:PetRigV3Schema,locomotion:z.enum(['walk','hover','fly','swim'])});

// Presentation taxonomy is versioned data, never an extra damage element or reducer.
export const PetTaxonomyDraftV3Schema=z.strictObject({
 schemaVersion:z.literal(3),ruleset:z.literal('pet-arena-pve-v3'),state:z.literal('DRAFT_ONLY'),enabled:z.literal(false),
 elements:z.array(element).length(19),
 effectiveness:z.record(PetElementSchema,z.record(PetElementSchema,permille)),
 races:z.array(race).length(22),
}).superRefine((value,ctx)=>{
 const issue=(path:(string|number)[],message:string)=>ctx.addIssue({code:'custom',path,message});
 for(const key of ['elements','races'] as const)if(new Set(value[key].map(row=>row.id)).size!==value[key].length)issue([key],'Duplicate taxonomy ID');
 for(const [index,e] of value.elements.entries()){
  const targets=[...e.strongAgainst,...e.resistedBy,...e.noEffectAgainst];
  if(new Set(targets).size!==targets.length)issue(['elements',index],'Overlapping or duplicate relations');
  for(const defender of PetElementSchema.options){
   const expected=e.strongAgainst.includes(defender)?1250:e.resistedBy.includes(defender)?800:e.noEffectAgainst.includes(defender)?0:1000;
   if(value.effectiveness[e.id][defender]!==expected)issue(['effectiveness',e.id,defender],'Matrix differs from declared attack relations');
  }
  if(!value.elements.some(other=>other.strongAgainst.includes(e.id)))issue(['elements',index],'Element lacks an offensive counter');
 }
});

// Candidate acquisition contract. Parsing never authorizes ownership or publication.
export const PetAcquisitionDraftV3Schema=z.strictObject({
 rank:PetRankV3Schema,source:PetSourceV3Schema,mapId:PetContentIdSchema.nullable(),
 requiredUniqueWins:z.union([z.literal(0),z.literal(3),z.literal(5)]),
 signatureCard:PetContentIdSchema.nullable(),awakeningEnabled:z.boolean(),
}).superRefine((value,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 const banner=value.source==='standard_gacha'||value.source==='limited_event_gacha';
 if(value.source==='map_regular'?value.rank==='S':value.rank!=='S')fail('Rank does not match acquisition source');
 if((value.mapId===null)!==banner)fail('Banner Pets cannot be map encounters');
 if(value.requiredUniqueWins!==(banner?0:value.source==='map_legendary'?5:3))fail('Recruitment requires exact source-specific win count');
 if((value.signatureCard!==null)!==(value.source==='limited_event_gacha'))fail('Only Limited owns a signature card');
 if(value.awakeningEnabled!==banner)fail('C0-C6 belongs to banner S sources');
});
export type PetTaxonomyDraftV3=z.infer<typeof PetTaxonomyDraftV3Schema>;
export type PetAcquisitionDraftV3=z.infer<typeof PetAcquisitionDraftV3Schema>;
