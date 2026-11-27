import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {Pool} from 'pg';

const require=createRequire(import.meta.url);
const bundlePath=process.argv[2]??'config/gameplay/arena8-coop-v2.seed.json';
const binary=process.env.GAMEPLAY_CONFIG_VALIDATOR_BINARY,database=process.env.DATABASE_URL;
if(!database||!/^postgres(ql)?:\/\//.test(database))throw Error('DATABASE_URL is required for gameplay configuration installation');
if(!binary||!binary.startsWith('/'))throw Error('GAMEPLAY_CONFIG_VALIDATOR_BINARY must be an absolute path to aetheria-game-runtime');
let validator,installer;
try{
 ({EngineGameplayBundleValidator:validator}=require('../apps/platform-api/dist/features/gameplay/modules/config/infrastructure/engine-validator.js'));
 ({installGameplayConfig:installer}=require('../apps/platform-api/dist/features/gameplay/modules/config/application/seed-gameplay-config.js'));
}catch{throw Error('Build the platform API first: pnpm --filter @aetheria/platform-api build');}
const bundle=JSON.parse(await readFile(resolve(bundlePath),'utf8'));
if(!bundle||typeof bundle!=='object'||Array.isArray(bundle))throw Error('Seed bundle must be a JSON object');
const pool=new Pool({connectionString:database,connectionTimeoutMillis:5000,max:1});
try{
 const result=await installer(pool,'arena8-coop-pve',bundle,new validator(binary));
 console.log(JSON.stringify({bundle:bundlePath,...result},null,2));
}finally{await pool.end();}
