import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {access,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {toolEnvironment,validateTestDatabaseURL} from './test-environment.mjs';
import {prepareAdmissionTestTls} from './runtime-admission-test-tls.mjs';
import {prepareGhostNatureMap,verifyGhostNatureReceipt,verifyGhostAdvancedReceipts,verifyGhostUltimateReceipt} from './packaged-solo-nature-probe.mjs';

const require=createRequire(import.meta.url);
const {createApp}=require('../apps/platform-api/src/app.ts');
const {readConfig}=require('../apps/platform-api/src/shared/config/environment.ts');
const {migrate}=require('../apps/platform-api/src/shared/database/migrations.ts');
const {installGameplayConfig}=require('../apps/platform-api/src/features/gameplay/modules/config/application/seed-gameplay-config.ts');
const {EngineGameplayBundleValidator}=require('../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-validator.ts');

function identifier(value){
 if(!/^[a-z][a-z0-9_]*$/.test(value))throw Error('Invalid database identifier');
 return '"'+value+'"';
}

function loopbackPort(){
 return new Promise((resolvePort,reject)=>{
  const listener=createServer();
  listener.once('error',reject);
  listener.listen(0,'127.0.0.1',()=>{
   const {port}=listener.address();
   listener.close(error=>error?reject(error):resolvePort(port));
  });
 });
}

async function grantRuntimeAccess(pool,role){
 const grantee=identifier(role);
 const admission=JSON.parse(await readFile('config/native-runtime-db-privileges.json','utf8'));
 const game=JSON.parse(await readFile('config/native-game-db-privileges.json','utf8'));
 for(const [table,columns] of [...Object.entries(admission.select),...Object.entries(game.rewardStatusSelect)])
  await pool.query(`GRANT SELECT (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${grantee}`);
 await pool.query(`GRANT INSERT ON platform_native_ticket_uses TO ${grantee}`);
 for(const operation of ['select','insert'])
  for(const table of game[operation])await pool.query(`GRANT ${operation.toUpperCase()} ON ${identifier(table)} TO ${grantee}`);
 for(const [table,columns] of Object.entries(game.update))
  await pool.query(`GRANT UPDATE (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${grantee}`);
}

let phase='preflight',pool,app,privateDirectory,player,killTimer,stopping=false;
const stop=()=>{
 stopping=true;
 if(!player||killTimer)return;
 player.kill('SIGTERM');
 killTimer=setTimeout(()=>player.kill('SIGKILL'),2000);
 killTimer.unref();
};
process.once('SIGINT',stop);
process.once('SIGTERM',stop);

try{
 const mode=process.argv[2]??'functional';
 const capture=mode==='--shared-capture';
 const captureNature=mode==='--shared-nature-capture';
 const captureUltimate=mode==='--shared-ultimate-capture';
 const captureExtended=mode==='--shared-frost-astral-extended-capture';
 const captureAdvanced=mode==='--shared-frost-astral-capture'||captureExtended;
 const candidates={
  functional:'arena8-coop-functional-v1.candidate.json',
  '--timed':'arena8-coop-functional-v2.candidate.json',
  '--shared':'arena8-coop-shared-rng-v1.candidate.json',
  '--shared-capture':'arena8-coop-shared-rng-v1.candidate.json',
  '--shared-nature-capture':'arena8-coop-shared-rng-v1.candidate.json',
  '--shared-ultimate-capture':'arena8-coop-shared-rng-v1.candidate.json',
  '--shared-frost-astral-capture':'arena8-coop-shared-rng-v1.candidate.json',
  '--shared-frost-astral-extended-capture':'arena8-coop-shared-rng-v1.candidate.json',
 };
 if(process.platform!=='linux'||process.argv.length>3||!Object.hasOwn(candidates,mode))
  throw Error('Use a supported functional, timed or shared Linux play mode');
 if(!/^aetheria-soulbound-test-[a-f0-9]{8}$/.test(process.env.AETHERIA_TEST_DB_PROJECT??''))
  throw Error('The launcher needs a fresh wrapper-owned Docker database');
 const playerBinary=resolve('apps/unity-client/Builds/Linux/Aetheria');
 const binary=resolve('artifacts/rust/target/debug/aetheria-game-runtime');
 await Promise.all([access(playerBinary,constants.X_OK),access(playerBinary+'.config'),access(binary,constants.X_OK)]);
 const directoryRoot=resolve('artifacts/functional-linux-play');
 await mkdir(directoryRoot,{recursive:true,mode:0o700});
 const directory=await mkdtemp(directoryRoot+'/run-');
 privateDirectory=await mkdtemp(directory+'/private-');
 const profile=resolve(privateDirectory,'profile');
 await mkdir(profile,{mode:0o700});

 phase='disposable database';
 const database=validateTestDatabaseURL(process.env.TEST_DATABASE_URL);
 // The wrapper owns this empty database and removes its volume on exit.
 pool=new Pool({connectionString:database});
 await migrate(pool);
 const role='functional_play_'+randomUUID().replaceAll('-','');
 const password=randomBytes(32).toString('hex');
 await pool.query(`CREATE ROLE ${identifier(role)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8`);
 await grantRuntimeAccess(pool,role);
 const tls=await prepareAdmissionTestTls(privateDirectory,pool);
 await tls.enable();
 const runtimeDatabase=new URL(database);
 runtimeDatabase.username=role;
 runtimeDatabase.password=password;

 phase='functional gameplay publication';
 const ruleset='arena8-coop-pve';
 const candidate=candidates[mode];
 const bundle=JSON.parse(await readFile('config/gameplay/'+candidate,'utf8'));
 let encounterDurationFixture=null;
 if(captureExtended){
  const ghost=bundle.bosses.find(boss=>boss.mapId==='lantern-necropolis')?.regular;
  assert.equal(bundle.schemaVersion,6);
  assert.equal(ghost?.id,'lantern-necropolis-regular');
  assert.ok(Number.isSafeInteger(ghost.maxHp)&&ghost.maxHp>0&&Number.isSafeInteger(ghost.maxHp*8));
  // A level 60 starter can defeat the authored regular before three Frost
  // jewels spawn. Keep the same combat and RNG inputs with a larger HP pool.
  encounterDurationFixture={authoredMaxHp:ghost.maxHp,fixtureMaxHp:ghost.maxHp*8};
  ghost.maxHp=encounterDurationFixture.fixtureMaxHp;
 }
 const validator=new EngineGameplayBundleValidator(binary);
 const published=await installGameplayConfig(pool,ruleset,bundle,validator,'system:local-functional-play');
 if(!published.created)throw Error('Expected an empty local gameplay configuration store');
 console.log('Published local functional gameplay version '+published.version+' ('+published.digest+')');

 phase='loopback Arena8 API';
 const httpsOrigin='https://127.0.0.1:'+(await loopbackPort());
 const runtime={
  enabled:true,binary,databaseUrl:runtimeDatabase.toString(),role,caFile:tls.caFile,
  storageKey:randomBytes(32).toString('hex'),storageKeyId:'local-v1',httpsOrigin,
  certFile:resolve(privateDirectory,'tls/server.pem'),keyFile:resolve(privateDirectory,'tls/server.key'),
 };
 const config=readConfig({
  NODE_ENV:'test',HOST:'127.0.0.1',DATABASE_URL:database,SESSION_SECRET:randomBytes(48).toString('base64url'),
  LOCAL_ARENA8_NATIVE:'1',GAMEPLAY_CONFIG_VALIDATOR_BINARY:binary,
  LOCAL_ARENA8_NATIVE_BINARY:binary,LOCAL_ARENA8_NATIVE_DATABASE_URL:runtime.databaseUrl,
  LOCAL_ARENA8_NATIVE_DB_ROLE:role,LOCAL_ARENA8_NATIVE_CA_FILE:runtime.caFile,
  LOCAL_ARENA8_NATIVE_STORAGE_KEY:runtime.storageKey,LOCAL_ARENA8_NATIVE_STORAGE_KEY_ID:runtime.storageKeyId,
  LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN:httpsOrigin,
  LOCAL_ARENA8_NATIVE_TLS_CERT_FILE:runtime.certFile,LOCAL_ARENA8_NATIVE_TLS_KEY_FILE:runtime.keyFile,
 });
 app=await createApp(config,pool,false,{
  petArenaWave1:{enabled:true},petArtifacts:{enabled:true},petArena8Native:runtime,
 });
 const endpoint=await app.http.listen({host:'127.0.0.1',port:0});
 if(!stopping){
  phase='Unity development player';
  console.log((captureUltimate?'Recording a packaged committed Ultimate.':captureExtended?'Recording natural packaged Frost and Astral feedback with extended local encounter HP.':captureAdvanced?'Recording natural packaged Frost and Astral feedback on the authored encounter.':captureNature?'Recording a packaged natural Ghost Nature cleanse.':capture?'Recording a packaged guest turn.':'Create a guest with Enter local arena.')+' Player log: '+resolve(directory,'player.log'));
  player=spawn(playerBinary,[
   '-force-glcore','-screen-width','1280','-screen-height','720','-screen-fullscreen','0',
   '-logFile',resolve(directory,'player.log'),
   ...(captureUltimate?['-aetheria-arena8-native-capture',directory,'-aetheria-arena8-shared-ultimate']:
    captureAdvanced?['-aetheria-arena8-native-capture',directory,'-aetheria-arena8-shared-frost-astral']:
    captureNature?['-aetheria-arena8-native-capture',directory,'-aetheria-arena8-shared-nature']:
    capture?['-aetheria-arena8-native-capture',directory,'-aetheria-arena8-functional-turn','-aetheria-arena8-functional-regular']:[]),
  ],{env:{
   ...toolEnvironment(process.env),XDG_CONFIG_HOME:profile,
   AETHERIA_ARENA8_NATIVE:endpoint,AETHERIA_ARENA8_NATIVE_CA:tls.caFile,AETHERIA_ARENA8_FUNCTIONAL:'1',
  },stdio:'ignore'});
  const exited=new Promise((done,fail)=>{player.once('error',fail);player.once('close',done);});
  let mapAccess;
  if(captureNature||captureAdvanced||captureUltimate){
   phase='disposable Ghost map access fixture';
   try{
    mapAccess=await Promise.race([
     prepareGhostNatureMap(pool,directory,()=>stopping||player.exitCode!==null,captureNature?1:60),
     exited.then(()=>{throw Error('The player exited before starting the Ghost fixture');}),
    ]);
   }catch(error){stop();await exited.catch(()=>{});throw error;}
  }
  phase='Unity development player';
  const code=await exited;
  if(!stopping&&code!==0)throw Error('Check the local player log');
  if(captureUltimate&&!stopping){
   phase='verify packaged committed Ultimate';
   await verifyGhostUltimateReceipt(pool,directory,published,mapAccess,bundle,candidate);
  }
  if(captureAdvanced&&!stopping){
   phase='verify packaged natural Frost and Astral';
  await verifyGhostAdvancedReceipts(pool,directory,published,mapAccess,bundle,candidate,encounterDurationFixture);
  }
  if(captureNature&&!stopping){
   phase='verify packaged natural Ghost cleanse';
   await verifyGhostNatureReceipt(pool,directory,published,mapAccess,bundle,candidate);
  }
  if(capture&&!stopping){
   phase='verify packaged solo turn';
   const facts=JSON.parse(await readFile(resolve(directory,'native-facts.json'),'utf8'));
   assert.equal(facts.status,'ok');
   assert.equal(facts.ruleset,'arena8-functional-pve');
   assert.equal(facts.version,2);
   assert.equal(facts.participantCount,1);
   assert.equal(facts.boardTiles,64);
   const {rows:[match]}=await pool.query(
    `SELECT functional_config_version::int AS version,functional_config_digest AS digest,
      functional_allocation->>'bossId' AS encounter FROM platform_native_arena8_matches WHERE match_id=$1`,[facts.matchId]);
   assert.equal(match.version,published.version);
   assert.equal(match.digest,published.digest);
   assert.equal(match.encounter,'cinder-terraces-regular');
   const {rows:receipts}=await pool.query(
    `SELECT committed_version::int AS version,encode(receipt_hash,'hex') AS hash FROM game_native_receipts
     WHERE match_id=$1 ORDER BY committed_version`,[facts.matchId]);
   assert.deepEqual(receipts.map(receipt=>receipt.version),[1,2]);
   const frames=[];
   for(const name of ['functional-solo-01-admitted.png','functional-solo-02-playing.png','functional-solo-03-committed-swap.png']){
    const image=await readFile(resolve(directory,name));
    assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16),1280);
    assert.equal(image.readUInt32BE(20),720);
    frames.push({name,sha256:createHash('sha256').update(image).digest('hex')});
   }
   assert.equal(new Set(frames.map(frame=>frame.sha256)).size,3);
   await writeFile(resolve(directory,'solo-shared-capture.json'),JSON.stringify({candidate,match,receipts,frames},null,2)+'\n');
  }
 }
}catch(error){
 // Configuration and PostgreSQL errors may contain credentials. Phase names and
 // operating-system error codes are sufficient to locate failures here.
 const detail=phase==='preflight'?(error.code==='ENOENT'?'Build the Linux player and Rust runtime first':error.message):'Check the local prerequisites and player log';
 console.error('Functional Linux play failed during '+phase+'. '+detail+'.');
 process.exitCode=1;
}finally{
 clearTimeout(killTimer);
 process.removeListener('SIGINT',stop);
 process.removeListener('SIGTERM',stop);
 const cleanup=[
  ()=>app?.app.close(),
  ()=>pool?.end(),
  ()=>privateDirectory&&rm(privateDirectory,{recursive:true,force:true}),
 ];
 for(const close of cleanup){
  try{await close();}catch{
   console.error('Functional Linux play could not complete local cleanup.');
   process.exitCode=1;
  }
 }
}
