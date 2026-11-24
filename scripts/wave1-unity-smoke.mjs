import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import appModule from '../apps/platform-api/src/app.ts';
import configModule from '../apps/platform-api/src/shared/config/environment.ts';
import migrationsModule from '../apps/platform-api/src/shared/database/migrations.ts';
import {validateTestDatabaseURL} from './test-environment.mjs';

if(process.platform!=='linux')throw Error('The Wave 1 smoke uses a separate Linux user-data directory');
const {createApp}=appModule;
const {readConfig}=configModule;
const {migrate}=migrationsModule;
const editor=process.env.UNITY_EDITOR;
if(!editor)throw Error('Set UNITY_EDITOR to the pinned Unity 6000.3.14f1 executable');
const databaseUrl=validateTestDatabaseURL(process.env.TEST_DATABASE_URL);
const config=readConfig({...process.env,NODE_ENV:'test',DATABASE_URL:databaseUrl});
const pool=new Pool({connectionString:databaseUrl});
const evidence=resolve('artifacts/mvp-phase2','unity-smoke-'+randomUUID().slice(0,8));
const profile=await mkdtemp(resolve(tmpdir(),'aetheria-wave1-'));
await mkdir(evidence,{recursive:true});
let app;

async function listen(port){
  // All rolls produce Icarus in the fixture so a single ten-pull crosses Lv 20.
  app=await createApp(config,pool,true,{petArenaWave1:{enabled:true,entropy:{int:()=>0}}});
  await app.app.listen(port,'127.0.0.1');
  return app.http.server.address().port;
}

async function run(test,port){
  const results=resolve(evidence,test+'.xml');
  const args=['-batchmode','-nographics','-projectPath',resolve('apps/unity-client'),
    '-runTests','-testPlatform','PlayMode','-testFilter','Aetheria.Tests.PlayMode.Wave1CampaignTests.'+test,
    '-testResults',results,'-logFile',resolve(evidence,test+'.log')];
  const env={...process.env,XDG_CONFIG_HOME:profile,AETHERIA_WAVE1_API:'http://127.0.0.1:'+port,
    AETHERIA_WAVE1_WEB_ORIGIN:config.WEB_ORIGIN};
  const code=await new Promise((done,reject)=>{
    const unity=spawn(editor,args,{env,stdio:'ignore',timeout:420_000});
    unity.once('error',reject);
    unity.once('close',done);
  });
  if(code!==0)throw Error(test+' failed with Unity exit '+code+'; see '+evidence);
  const xml=await readFile(results,'utf8');
  const summary=xml.match(/<test-run [^>]+>/)?.[0]??'';
  if(!summary.includes('result="Passed"')||!summary.includes('passed="1"')||!summary.includes('skipped="0"')){
    throw Error(test+' did not pass exactly one test; see '+evidence);
  }
  console.log(test+' passed');
}

try{
  await migrate(pool);
  const port=await listen(0);
  await run('PlaysAndSavesTheCampaign',port);
  await app.app.close();
  app=undefined;
  await listen(port);
  await run('ReopensWithPersistedSessionAndState',port);
  console.log('Unity and API restart verified; reports: '+evidence);
}finally{
  try{await app?.app.close();}
  finally{await pool.end();await rm(profile,{recursive:true,force:true});}
}
