import {createHash} from 'node:crypto';
import {open,realpath,readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PetBattleVisualDraftSchema,petAnimationSemantics} from '@virtual-city/contracts';
import {readPetDesign,validatePetDesign} from './pet-design-check.mjs';

export function createMissingPetVisualDraft(c,contentHash){
 return PetBattleVisualDraftSchema.parse({schemaVersion:1,ruleset:c.ruleset,contentHash,state:'DRAFT_ONLY',runtimeEnabled:false,productionReady:false,compatibility:{unity:'6000.3.14f1',urp:'17.3.0'},assets:[],tileAtlas:null,
  pets:[...c.priorityVisualSet,c.priorityBoss].map(id=>({speciesId:id,formId:c.species.find(p=>p.id===id).formId,portrait:null,icon:null,model:null,prefab:null,controller:null,localization:null,materials:[],animations:petAnimationSemantics.map(semantic=>({semantic,clip:null,vfx:null,audio:null}))})),
 });
}
export async function verifyPetAssetFiles(input,root=process.cwd()){
 const value=PetBattleVisualDraftSchema.parse(input),base=await realpath(root),verified=new Map();
 for(const asset of value.assets)for(const file of [asset,asset.source,asset.importSettings]){
  const target=await realpath(resolve(base,file.path)),rel=relative(base,target);
  if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw Error('Asset escapes workspace');
  const handle=await open(target,'r');
  try{
   const stat=await handle.stat();if(!stat.isFile()||stat.size>64*1024*1024)throw Error('Asset file missing, non-regular or exceeds 64 MiB');
   const prior=verified.get(target);if(prior){if(prior!==file.sha256)throw Error('Conflicting asset hash');continue;}
   const digest=createHash('sha256');for await(const chunk of handle.createReadStream({autoClose:false}))digest.update(chunk);
   if(digest.digest('hex')!==file.sha256)throw Error('Asset hash mismatch');verified.set(target,file.sha256);
  }finally{await handle.close();}
 }
 const missing=[];if(value.tileAtlas===null)missing.push('tile-atlas');
 for(const pet of value.pets){
  for(const key of ['portrait','icon','model','prefab','controller','localization'])if(pet[key]===null)missing.push(pet.speciesId+':'+key);
  if(!pet.materials.length)missing.push(pet.speciesId+':materials');
  for(const a of pet.animations){if(a.clip===null)missing.push(pet.speciesId+':'+a.semantic+':clip');if(a.vfx===null)missing.push(pet.speciesId+':'+a.semantic+':vfx');if(a.audio===null)missing.push(pet.speciesId+':'+a.semantic+':audio');}
 }
 return {state:value.state,pets:value.pets.length,filesVerified:verified.size,missing,rightsReview:'PENDING',unityImport:'NOT_TESTED',renderedPreview:'NOT_TESTED',productionReady:false,runtimeEnabled:false};
}
async function main(){
 const file=process.argv[2];if(process.argv.length>3)throw Error('Usage: node scripts/pet-asset-check.mjs [draft-manifest.json]');
 const c=await readPetDesign();validatePetDesign(c);
 const {petDesignDraft}=await import('./pet-content-draft-seed.mjs');
 const {createRequire}=await import('node:module'),require=createRequire(import.meta.url),{petDraftHash}=require('../apps/platform-api/src/features/pets/modules/content/infrastructure/draft-store.ts');
 const contentHash=petDraftHash(await petDesignDraft()),value=file?JSON.parse(await readFile(file,'utf8')):createMissingPetVisualDraft(c,contentHash);
 const parsed=PetBattleVisualDraftSchema.parse(value);if(parsed.contentHash!==contentHash)throw Error('Visual draft content hash mismatch');
 const species=new Map(c.species.map(p=>[p.id,p]));for(const pet of parsed.pets)if(species.get(pet.speciesId)?.formId!==pet.formId)throw Error('Unknown species or visual form');
 console.log(JSON.stringify(await verifyPetAssetFiles(parsed)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
