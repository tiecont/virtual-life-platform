import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {PetBattleVisualDraftSchema,petAnimationSemantics} from '@aetheria/contracts';
import {readPetDesign,validatePetDesign} from './pet-design-check.mjs';
import {verifyPetAssetBytes} from './pet-asset-files.mjs';

export function createMissingPetVisualDraft(c,contentHash){
 return PetBattleVisualDraftSchema.parse({schemaVersion:1,ruleset:c.ruleset,contentHash,state:'DRAFT_ONLY',runtimeEnabled:false,productionReady:false,compatibility:{unity:'6000.3.14f1',urp:'17.3.0'},assets:[],tileAtlas:null,
  pets:[...c.priorityVisualSet,c.priorityBoss].map(id=>({speciesId:id,formId:c.species.find(p=>p.id===id).formId,portrait:null,icon:null,model:null,prefab:null,controller:null,localization:null,materials:[],animations:petAnimationSemantics.map(semantic=>({semantic,clip:null,vfx:null,audio:null}))})),
 });
}
export async function verifyPetAssetFiles(input,root=process.cwd()){
 const value=PetBattleVisualDraftSchema.parse(input);
 const filesVerified=await verifyPetAssetBytes(value.assets.flatMap(asset=>[asset,asset.source,asset.importSettings]),root);
 const missing=[];if(value.tileAtlas===null)missing.push('tile-atlas');
 for(const pet of value.pets){
  for(const key of ['portrait','icon','model','prefab','controller','localization'])if(pet[key]===null)missing.push(pet.speciesId+':'+key);
  if(!pet.materials.length)missing.push(pet.speciesId+':materials');
  for(const a of pet.animations){if(a.clip===null)missing.push(pet.speciesId+':'+a.semantic+':clip');if(a.vfx===null)missing.push(pet.speciesId+':'+a.semantic+':vfx');if(a.audio===null)missing.push(pet.speciesId+':'+a.semantic+':audio');}
 }
 return {state:value.state,pets:value.pets.length,filesVerified,missing,rightsReview:'PENDING',unityImport:'NOT_TESTED',renderedPreview:'NOT_TESTED',productionReady:false,runtimeEnabled:false};
}
async function main(){
 if(process.argv.length===3&&process.argv[2]==='--icarus-accessories'){
  const {verifyIcarusAccessories}=await import('./art/check-icarus-accessories.mjs');
  console.log(JSON.stringify(await verifyIcarusAccessories()));
  return;
 }
 if(process.argv[2]==='--limited-v31'){
  const {readLimitedPetCatalog,createMissingLimitedPetVisualDraft,verifyLimitedPetAssetFiles}=await import('./pet-limited-asset-check.mjs');
  const args=process.argv.slice(3),requireComplete=args.at(-1)==='--require-complete';if(requireComplete)args.pop();
  if(args.length>1||args.some(arg=>arg.startsWith('--')))throw Error('Usage: node --import tsx scripts/pet-asset-check.mjs --limited-v31 [bindings.json] [--require-complete]');
  const catalog=await readLimitedPetCatalog(),value=args.length?JSON.parse(await readFile(args[0],'utf8')):createMissingLimitedPetVisualDraft(catalog);
  console.log(JSON.stringify(await verifyLimitedPetAssetFiles(value,catalog,process.cwd(),{requireComplete})));
  return;
 }
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
