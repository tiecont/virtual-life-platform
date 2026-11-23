import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {validateTestDatabaseURL} from './test-environment.mjs';
const require=createRequire(import.meta.url),{validatePetAcquisitionCatalogV3}=require('@aetheria/contracts/pet-acquisition-v3');
const root=new URL('../specs/pet-arena/',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
export const petAcquisitionDraftId='c56a7890-7531-4131-b240-000000000001';
// Reads repository-owned, hash-verified candidate data only. No uploaded baseline,
// remote URLs, alternate directory or player-controlled content path is accepted.
export async function petAcquisitionDraft(){
 const manifest=JSON.parse(await readFile(new URL('v3.1/data/catalog_manifest.json',root),'utf8'));
 assert.equal(manifest.schemaVersion,1);assert.equal(manifest.contentVersion,'3.1');assert.equal(manifest.state,'DRAFT_ONLY');assert.equal(manifest.enabled,false);assert.equal(manifest.publishAllowed,false);assert.equal(manifest.catalog,'pets_initial_240.json');assert.equal(manifest.assets,'pet_asset_manifest_240.json');assert.equal(manifest.hashAlgorithm,'sha256_exact_utf8_file_bytes');
 const expected=['admin_studio_configuration.json','board_effects.json','board_rules_10x10.json','element_effectiveness_matrix.json','element_status_and_reactions.json','elements.json','fusion_rules.json','gacha_economy.json','level_progression_100.json','limited_animation_profiles.json','localization_initial_vi_en.json','maps_19.json','pet_asset_manifest_240.json','pets_initial_240.json','player_settings_schema.json','races.json','skills_16.json','standard_animation_profiles.json','standard_gacha_pets_6.json','upstream_114_id_manifest.json','weekly_boss_and_lobby.json'];
 assert.deepEqual(Object.keys(manifest.files).sort(),expected.sort());const files={};
 for(const [name,digest] of Object.entries(manifest.files)){assert.match(digest,/^[a-f0-9]{64}$/);const bytes=await readFile(new URL('v3.1/data/'+name,root));assert(bytes.length<=8*1024*1024);assert.equal(sha(bytes),digest,'Candidate manifest hash mismatch: '+name);files[name]=JSON.parse(bytes.toString('utf8'));}
 const upstream=JSON.parse(await readFile(new URL('catalog-v2.json',root),'utf8')).species.map(p=>({id:p.id,name:p.displayName,element:p.element,sourceRarityLegacy:p.rarity,mapId:p.mapId}));
 const catalog=files['pets_initial_240.json'];assert.equal(catalog.state,'DRAFT_ONLY');assert.equal(catalog.enabled,false);assert.equal(catalog.publishAllowed,false);
 const value=validatePetAcquisitionCatalogV3({schemaVersion:3,ruleset:'pet-arena-pve-v3',contentVersion:'3.1',state:'DRAFT_ONLY',enabled:false,publishAllowed:false,sourceSha256:manifest.files['pets_initial_240.json'],maps:files['maps_19.json'].maps.map(m=>({id:m.id,element:m.primaryElement})),pets:catalog.pets.map(p=>{
  assert.equal(p.availability,'DRAFT_ONLY');assert.equal(p.assetStatus,'MISSING');assert.equal(p.published,false);assert.equal(p.productionReady,false);assert.deepEqual(p.seedSafety,{dbWriteAllowed:'unpublished_drafts_only',playerEntitlementGrant:false,autoPublish:false});
  return {id:p.id,name:p.name,element:p.element,race:p.race,bodyPlan:p.bodyPlan,rig:p.rigArchetype,sourceRarityLegacy:p.sourceRarityLegacy,acquisition:{rank:p.rank,source:p.source,mapId:p.mapId,requiredUniqueWins:p.capture.requiredUniqueWins,signatureCard:p.combat.signatureCard,awakeningEnabled:p.awakening.applies}};
 })},upstream);
 return {value,upstream};
}
async function main(){
 // Validate the target before reading content or opening a database connection.
 const url=validateTestDatabaseURL(process.env.TEST_DATABASE_URL),{value,upstream}=await petAcquisitionDraft();
 const {migrate}=require('../apps/platform-api/src/shared/database/migrations.ts'),{PetAcquisitionDraftStore}=require('../apps/platform-api/src/features/pets/modules/content/infrastructure/acquisition-draft-store.ts'),pool=new Pool({connectionString:url});
 try{await migrate(pool);const result=await new PetAcquisitionDraftStore(pool,upstream).seed(petAcquisitionDraftId,value);console.log(JSON.stringify({...result,pets:value.pets.length,state:'DRAFT_ONLY',enabled:false,publishAllowed:false,ownedPetsGranted:0}));}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
