import {Pool} from 'pg';
import {PetContentDraftSchema} from '@aetheria/contracts';
import {createRequire} from 'node:module';
import {readPetDesign,validatePetDesign} from './pet-design-check.mjs';
import {validateTestDatabaseURL} from './test-environment.mjs';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);

export const petDesignDraftId='c70802c0-4ac9-4c17-8313-3cb870d6c631';
export async function petDesignDraft(){
 const c=await readPetDesign();validatePetDesign(c);
 return PetContentDraftSchema.parse({schemaVersion:2,ruleset:c.ruleset,
  elements:c.elements.map(e=>({id:e.id,displayName:e.displayNameViAscii})),
  effectiveness:c.elements.flatMap(a=>c.elements.map(d=>({attacker:a.id,defender:d.id,permille:a.immuneDefenders.includes(d.id)?0:a.advantage.includes(d.id)?1250:a.resistedBy.includes(d.id)?800:1000}))),
  profiles:Object.entries(c.statProfiles).map(([id,p])=>({id,...p})),
  growth:c.growthProfiles.map(g=>({id:g.id,perLevelPermille:g.perLevelPermille,maxLevel:g.maxLevel})),skills:c.sharedSkills,
  species:c.species.map(p=>({id:p.id,displayName:p.displayName,element:p.element,rarity:p.rarity,statProfile:p.statProfile,growthProfile:p.growthProfile,skills:p.skillLoadout,levelCap:p.ownedLevelCap,assetState:p.assetStatus,productionReady:p.productionReady})),
 });
}
async function main(){
 const {PetDraftStore}=require('../apps/platform-api/src/features/pets/modules/content/infrastructure/draft-store.ts');
 const {migrate}=require('../apps/platform-api/src/shared/database/migrations.ts');
 // This command intentionally refuses production URLs and never provisions roles.
 const url=validateTestDatabaseURL(process.env.TEST_DATABASE_URL),pool=new Pool({connectionString:url});
 try{await migrate(pool);const result=await new PetDraftStore(pool).seed(petDesignDraftId,await petDesignDraft());console.log(JSON.stringify({...result,state:'draft',runtimeEnabled:false,productionReady:false}));}
 finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
