import {z} from 'zod';
import {PetContentIdSchema} from './pet-content';

export const petAnimationSemantics=['idle','summon','normal','rage','skill','combo','hurt','defend','status','defeat','victory'] as const;
export const PetAssetHashSchema=z.string().regex(/^[a-f0-9]{64}$/);
export const PetAssetPathSchema=z.string().min(1).max(240).regex(/^[a-zA-Z0-9_./-]+$/).refine(p=>!p.startsWith('/')&&!p.split('/').some(s=>s===''||s==='.'||s==='..'),'Portable relative asset path required');
const hash=PetAssetHashSchema,path=PetAssetPathSchema;
const reference=PetContentIdSchema.nullable();
export const PetVisualAssetSchema=z.strictObject({id:PetContentIdSchema,kind:z.enum(['portrait','icon','model','prefab','controller','clip','material','vfx','audio','localization','tile_atlas']),path,sha256:hash,
 source:z.strictObject({path,sha256:hash,origin:z.enum(['original','licensed','generated']),author:z.string().min(1).max(120),provenanceRef:z.string().min(1).max(240),rights:z.literal('PENDING_REVIEW')}),
 importSettings:z.strictObject({path,sha256:hash}),
});
const animation=z.strictObject({semantic:z.enum(petAnimationSemantics),clip:reference,vfx:reference,audio:reference});
export const PetBattleVisualDraftSchema=z.strictObject({schemaVersion:z.literal(1),ruleset:z.literal('pet-arena-pve-v2'),contentHash:hash,state:z.literal('DRAFT_ONLY'),runtimeEnabled:z.literal(false),productionReady:z.literal(false),
 compatibility:z.strictObject({unity:z.literal('6000.3.14f1'),urp:z.literal('17.3.0')}),
 assets:z.array(PetVisualAssetSchema).max(256),tileAtlas:reference,
 pets:z.array(z.strictObject({speciesId:PetContentIdSchema,formId:PetContentIdSchema,portrait:reference,icon:reference,model:reference,prefab:reference,controller:reference,localization:reference,materials:z.array(PetContentIdSchema).max(8),animations:z.array(animation).length(11)})).min(1).max(128),
}).superRefine((c,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:'custom',message});
 const assets=new Map(c.assets.map(a=>[a.id,a]));
 if(assets.size!==c.assets.length||new Set(c.assets.map(a=>a.path)).size!==c.assets.length)issue('Duplicate asset ID or runtime path');
 if(new Set(c.pets.map(p=>p.speciesId)).size!==c.pets.length||new Set(c.pets.map(p=>p.formId)).size!==c.pets.length)issue('Duplicate species or visual form');
 const ref=(id:string|null,kind:string)=>{if(id!==null&&assets.get(id)?.kind!==kind)issue('Missing or incompatible '+kind+' binding');};
 ref(c.tileAtlas,'tile_atlas');
 for(const pet of c.pets){
  for(const key of ['portrait','icon','model','prefab','controller','localization'] as const)ref(pet[key],key);
  if(new Set(pet.materials).size!==pet.materials.length)issue('Duplicate material binding');
  for(const material of pet.materials)ref(material,'material');
  if(new Set(pet.animations.map(a=>a.semantic)).size!==petAnimationSemantics.length)issue('Duplicate or missing animation semantic');
  for(const a of pet.animations){ref(a.clip,'clip');ref(a.vfx,'vfx');ref(a.audio,'audio');}
  const normal=pet.animations.find(a=>a.semantic==='normal')?.clip,rage=pet.animations.find(a=>a.semantic==='rage')?.clip;
  if(normal&&normal===rage)issue('Normal and rage require distinct animation bindings');
 }
});
export type PetBattleVisualDraft=z.infer<typeof PetBattleVisualDraftSchema>;
