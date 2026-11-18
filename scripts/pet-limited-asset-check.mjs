import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {LimitedPetVisualDraftSchema,limitedPetAnimationActions} from '@virtual-city/contracts';
import {verifyPetAssetBytes} from './pet-asset-files.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function readLimitedPetCatalog(){
 const manifestURL=new URL('../specs/pet-arena/v3.1/data/catalog_manifest.json',import.meta.url);
 const bytes=await readFile(manifestURL),manifest=JSON.parse(bytes);
 // Reuse the canonical semantic/upstream validator, including every exact-byte
 // content hash, rather than inventing a second gameplay catalog validator.
 await promisify(execFile)('python3',[fileURLToPath(new URL('./validate-pet-v31.py',import.meta.url))],{timeout:30000,maxBuffer:65536});
 const read=async name=>{
  const data=await readFile(new URL(name,manifestURL));
  if(digest(data)!==manifest.files[name])throw Error('Canonical content changed during validation');
  return JSON.parse(data);
 };
 const catalog=await read(manifest.catalog),profiles=await read('limited_animation_profiles.json');
 if(digest(await readFile(manifestURL))!==digest(bytes))throw Error('Canonical manifest changed during validation');
 return {catalogManifestHash:digest(bytes),pets:catalog.pets.filter(p=>p.source==='limited_event_gacha'),profiles:profiles.petAnimations};
}
export function createMissingLimitedPetVisualDraft(catalog){
 return LimitedPetVisualDraftSchema.parse({schemaVersion:2,ruleset:'pet-arena-v3.1-limited',catalogManifestHash:catalog.catalogManifestHash,
  state:'DRAFT_ONLY',runtimeEnabled:false,productionReady:false,compatibility:{blender:'4.5 LTS',unity:'6000.3.14f1',urp:'17.3.0'},assets:[],
  pets:catalog.pets.map(p=>({petId:p.id,designRevision:'initial-draft',reference:null,signatureOpcode:p.limited.signatureBoardOpcode,serverOutcomeIndependent:true,
   portrait:null,icon:null,model:null,prefab:null,controller:null,localization:null,materials:[],preview:null,reducedMotionPreview:null,
   animations:limitedPetAnimationActions.map(action=>({action,clip:null,vfx:null,audio:null})),
  })),
 });
}
export async function verifyLimitedPetAssetFiles(input,catalog,root=process.cwd(),{requireComplete=false}={}){
 const value=LimitedPetVisualDraftSchema.parse(input);
 if(value.catalogManifestHash!==catalog.catalogManifestHash)throw Error('Limited visual catalog manifest hash mismatch');
 const pets=new Map(catalog.pets.map(p=>[p.id,p])),profiles=new Map(catalog.profiles.map(p=>[p.petId,p]));
 const missing=[],files=value.assets.flatMap(a=>[a,a.source,a.importSettings]);
 for(const pet of value.pets){
  const canonical=pets.get(pet.petId),profile=profiles.get(pet.petId);
  if(!canonical||!profile)throw Error('Unknown canonical Limited Pet');
  if(pet.signatureOpcode!==canonical.limited.signatureBoardOpcode||pet.signatureOpcode!==profile.signatureOpcode)throw Error('Limited signature opcode mismatch');
  if(!profile.serverOutcomeIndependent||profile.actions.length!==16||profile.actions.some(action=>!pet.animations.some(a=>a.action===action)))throw Error('Limited animation profile mismatch');
  if(pet.reference===null)missing.push(pet.petId+':reference');else files.push(pet.reference);
  for(const key of ['portrait','icon','model','prefab','controller','localization','preview','reducedMotionPreview'])if(pet[key]===null)missing.push(pet.petId+':'+key);
  if(!pet.materials.length)missing.push(pet.petId+':materials');
  for(const animation of pet.animations)for(const key of ['clip','vfx','audio'])if(animation[key]===null)missing.push(pet.petId+':'+animation.action+':'+key);
 }
 const filesVerified=await verifyPetAssetBytes(files,root);
 if(requireComplete&&missing.length)throw Error('Incomplete Limited bindings: '+missing.join(', '));
 return {state:value.state,bindingStatus:missing.length?'MISSING_BINDINGS':'BOUND_DRAFT',pets:value.pets.length,filesVerified,missing,
  rightsReview:'PENDING',modelInspection:'NOT_TESTED',unityImport:'NOT_TESTED',renderedPreview:'NOT_TESTED',productionReady:false,runtimeEnabled:false};
}
