import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {Pool} from 'pg';
import {validateTestDatabaseURL} from './test-environment.mjs';

const require=createRequire(import.meta.url);
const url=validateTestDatabaseURL(process.env.TEST_DATABASE_URL);
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const input=JSON.parse(await readFile(new URL('../specs/pet-arena/campaign-v4-content.json',import.meta.url),'utf8'));
if(input.schemaVersion!==1||input.releaseState!=='draft-only'||input.routeAcquisitionEnabled!==false)
  throw new Error('Expected a gated repository campaign route draft');
const {migrate}=require('../apps/platform-api/src/shared/database/migrations.ts');
const {CampaignRouteDraftStore}=require('../apps/platform-api/src/features/pets/modules/campaign-routes/infrastructure/draft-store.ts');
const pool=new Pool({connectionString:url});
try{
 await migrate(pool);
 const result=await new CampaignRouteDraftStore(pool).insert({
  version:input.schemaVersion,state:input.releaseState,acquisitionEnabled:input.routeAcquisitionEnabled,maps:input.maps,
 },sourceRevision);
 console.log(JSON.stringify({
  version:result.version,digest:result.digest,sourceRevision:result.sourceRevision,
  maps:result.draft.maps.length,routes:result.draft.maps.reduce((sum,map)=>sum+map.routes.length,0),
  acquisitionEnabled:result.draft.acquisitionEnabled,
 }));
}finally{await pool.end();}
