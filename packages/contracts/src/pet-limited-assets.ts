import {z} from 'zod';
import {PetContentIdSchema} from './pet-content';
import {PetAssetHashSchema,PetAssetPathSchema,PetVisualAssetSchema} from './pet-battle-assets';

export const limitedPetAnimationActions=['idle','world_walk_or_hover','world_follow','emote','summon','normal_sword_hit','rage_sword_100','signature_skill_windup','signature_skill_cast','ultimate_cut_in','ultimate_impact','damage_reaction','defend','status_affected','victory','defeat'] as const;
const reference=PetContentIdSchema.nullable();
const file=z.strictObject({path:PetAssetPathSchema,sha256:PetAssetHashSchema});
const asset=PetVisualAssetSchema.extend({kind:z.enum([...PetVisualAssetSchema.shape.kind.options,'preview'])});

// Authored bindings overlay the frozen candidate; they never change its
// MISSING declarations or authorize a runtime/catalog import.
export const LimitedPetVisualDraftSchema=z.strictObject({
 schemaVersion:z.literal(2),ruleset:z.literal('pet-arena-v3.1-limited'),catalogManifestHash:PetAssetHashSchema,
 state:z.literal('DRAFT_ONLY'),runtimeEnabled:z.literal(false),productionReady:z.literal(false),
 compatibility:z.strictObject({blender:z.literal('4.5 LTS'),unity:z.literal('6000.3.14f1'),urp:z.literal('17.3.0')}),
 assets:z.array(asset).max(512),
 pets:z.array(z.strictObject({
  petId:PetContentIdSchema,designRevision:PetContentIdSchema,reference:file.nullable(),
  signatureOpcode:z.enum(['FIRE_ZONE','FROST_LINE','CHAIN_MARK','CURSE_SIGIL','GROWTH_GLYPH','TIDE_CURRENT']),
  serverOutcomeIndependent:z.literal(true),
  portrait:reference,icon:reference,model:reference,prefab:reference,controller:reference,localization:reference,
  materials:z.array(PetContentIdSchema).max(3),preview:reference,reducedMotionPreview:reference,
  animations:z.array(z.strictObject({action:z.enum(limitedPetAnimationActions),clip:reference,vfx:reference,audio:reference})).length(16),
 })).min(1).max(6),
}).superRefine((c,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:'custom',message});
 const assets=new Map(c.assets.map(a=>[a.id,a]));
 if(assets.size!==c.assets.length||new Set(c.assets.map(a=>a.path)).size!==c.assets.length)issue('Duplicate asset ID or runtime path');
 if(new Set(c.pets.map(p=>p.petId)).size!==c.pets.length)issue('Duplicate Limited Pet');
 const ref=(id:string|null,kind:string)=>{if(id!==null&&assets.get(id)?.kind!==kind)issue('Missing or incompatible '+kind+' binding');};
 for(const pet of c.pets){
  for(const key of ['portrait','icon','model','prefab','controller','localization'] as const)ref(pet[key],key);
  ref(pet.preview,'preview');ref(pet.reducedMotionPreview,'preview');
  if(pet.preview&&pet.preview===pet.reducedMotionPreview)issue('Reduced motion requires a distinct preview');
  if(new Set(pet.materials).size!==pet.materials.length)issue('Duplicate material binding');
  for(const id of pet.materials)ref(id,'material');
  if(new Set(pet.animations.map(a=>a.action)).size!==16)issue('Duplicate or missing Limited animation action');
  for(const a of pet.animations){ref(a.clip,'clip');ref(a.vfx,'vfx');ref(a.audio,'audio');}
  const normal=pet.animations.find(a=>a.action==='normal_sword_hit')?.clip,rage=pet.animations.find(a=>a.action==='rage_sword_100')?.clip;
  if(normal&&normal===rage)issue('Normal and rage require distinct animation bindings');
  const model=pet.model&&assets.get(pet.model);
  if(model&&(!/\.(glb|fbx)$/i.test(model.path)||!model.source.path.endsWith('.blend')))issue('Limited model requires Blender source and GLB/FBX export');
  for(const id of [pet.preview,pet.reducedMotionPreview])if(id&&!assets.get(id)?.path.endsWith('.mp4'))issue('Limited preview must be MP4');
 }
});
export type LimitedPetVisualDraft=z.infer<typeof LimitedPetVisualDraftSchema>;
