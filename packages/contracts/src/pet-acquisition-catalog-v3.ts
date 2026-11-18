import {z} from 'zod';
import {PetContentIdSchema, PetElementSchema} from './pet-content';
import {PetAcquisitionDraftV3Schema, PetBodyPlanV3Schema, PetRaceV3Schema, PetRigV3Schema} from './pet-taxonomy-v3';

// Stable identities, not a second catalog or authorization to grant these Pets.
export const PetStandardIdentityV3 = [
  {id:'pet-v31-fire-cindrelis', name:'Cindrelis', element:'fire'},
  {id:'pet-v31-water-marivell', name:'Marivell', element:'water'},
  {id:'pet-v31-electric-quorion', name:'Quorion', element:'electric'},
  {id:'pet-v31-ghost-vesperyn', name:'Vesperyn', element:'ghost'},
  {id:'pet-v31-ground-gravorn', name:'Gravorn', element:'ground'},
  {id:'pet-v31-light-aurelune', name:'Aurelune', element:'light'},
] as const;
export const PetLimitedIdentityV3 = [
  {id:'pet-v3-fire-icarus', name:'Icarus', element:'fire'},
  {id:'pet-v3-ice-glaciemora', name:'Glaciemora', element:'ice'},
  {id:'pet-v3-electric-voltaris', name:'Voltaris', element:'electric'},
  {id:'pet-v3-ghost-noctalith', name:'Noctalith', element:'ghost'},
  {id:'pet-v3-grass-sylvaris', name:'Sylvaris', element:'grass'},
  {id:'pet-v3-water-leviara', name:'Leviara', element:'water'},
] as const;
const legacyRarity = z.enum(['common','uncommon','rare','epic','legendary']);
const identity = z.strictObject({id:PetContentIdSchema, name:z.string().trim().min(1).max(64), element:PetElementSchema});
const morphologyRigs = {
  quadruped:'rig_q4', floating:'rig_float', insectoid:'rig_insect', serpentine:'rig_serpent', avian:'rig_avian',
  humanoid:'rig_humanoid', golem:'rig_heavy', plant:'rig_flora', slime:'rig_soft', spectral:'rig_spectral',
  amorphous:'rig_soft', mechanical:'rig_machine', centaur:'rig_centaur', aquatic:'rig_aquatic', radial:'rig_aquatic', hexapod:'rig_insect',
} as const;
export const PetAcquisitionEntryV3Schema = identity.extend({
  race:PetRaceV3Schema, bodyPlan:PetBodyPlanV3Schema, rig:PetRigV3Schema,
  sourceRarityLegacy:legacyRarity.nullable(), acquisition:PetAcquisitionDraftV3Schema,
}).refine(p=>morphologyRigs[p.bodyPlan]===p.rig, 'Body plan and explicit rig are incompatible');

// An intentionally narrow acquisition projection; no skill payloads or published content.
export const PetAcquisitionCatalogV3Schema = z.strictObject({
  schemaVersion:z.literal(3), ruleset:z.literal('pet-arena-pve-v3'), contentVersion:z.literal('3.1'),
  state:z.literal('DRAFT_ONLY'), enabled:z.literal(false), publishAllowed:z.literal(false),
  sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),
  maps:z.array(z.strictObject({id:PetContentIdSchema, element:PetElementSchema})).length(19),
  pets:z.array(PetAcquisitionEntryV3Schema).length(240),
}).superRefine((catalog,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  for(const values of [catalog.pets.map(p=>p.id),catalog.pets.map(p=>p.name.toLowerCase()),catalog.maps.map(m=>m.id),catalog.maps.map(m=>m.element)]){
    if(new Set(values).size!==values.length)fail('Duplicate identity');
  }
  const maps=new Map(catalog.maps.map(m=>[m.id,m.element]));
  const counts={map_regular:0,map_legendary:0,limited_event_gacha:0,standard_gacha:0};
  for(const pet of catalog.pets){
    const {source,mapId}=pet.acquisition;counts[source]++;
    if(mapId!==null&&maps.get(mapId)!==pet.element)fail('Invalid map element reference');
  }
  if(counts.map_regular!==209||counts.map_legendary!==19||counts.limited_event_gacha!==6||counts.standard_gacha!==6)fail('Invalid source composition');
  if(new Set(catalog.pets.filter(p=>p.acquisition.source==='map_legendary').map(p=>p.element)).size!==19)fail('One map S per element required');
  for(const [source,identities] of [['standard_gacha',PetStandardIdentityV3],['limited_event_gacha',PetLimitedIdentityV3]] as const){
    for(const expected of identities){
      const actual=catalog.pets.find(p=>p.id===expected.id);
      if(!actual||actual.name!==expected.name||actual.element!==expected.element||actual.acquisition.source!==source)fail('Canonical banner identity mismatch');
    }
  }
});
export type PetAcquisitionCatalogV3 = z.infer<typeof PetAcquisitionCatalogV3Schema>;
const upstreamSchema=z.array(identity.extend({sourceRarityLegacy:legacyRarity,mapId:PetContentIdSchema})).length(114)
  .refine(rows=>new Set(rows.map(p=>p.id)).size===114,'Duplicate upstream identity');

/** The importer must supply its trusted v2 baseline, never an uploaded baseline. */
export function validatePetAcquisitionCatalogV3(input:unknown,trustedUpstream:unknown):PetAcquisitionCatalogV3 {
  const catalog=PetAcquisitionCatalogV3Schema.parse(input);
  for(const old of upstreamSchema.parse(trustedUpstream)){
    const current=catalog.pets.find(p=>p.id===old.id);
    if(!current||current.name!==old.name||current.element!==old.element||current.sourceRarityLegacy!==old.sourceRarityLegacy||current.acquisition.mapId!==old.mapId){
      throw new Error('Upstream Pet identity changed');
    }
  }
  return catalog;
}
