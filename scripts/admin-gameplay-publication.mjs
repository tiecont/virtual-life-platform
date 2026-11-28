import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tracingChannel} from 'node:diagnostics_channel';
import {execFileSync,spawn} from 'node:child_process';
import {open} from 'node:fs/promises';
import {once} from 'node:events';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,expect as playwrightExpect} from '@playwright/test';
const expect=playwrightExpect.configure({timeout:60000});
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createRequire} from 'node:module';
import {prepareAdmissionTestTls} from './runtime-admission-test-tls.mjs';
const require=createRequire(import.meta.url);
const {migrate}=require('../apps/platform-api/src/shared/database/migrations.ts');
const {createApp}=require('../apps/platform-api/src/app.ts');
const {readConfig}=require('../apps/platform-api/src/shared/config/environment.ts');
const {installGameplayConfig}=require('../apps/platform-api/src/features/gameplay/modules/config/application/seed-gameplay-config.ts');
const {EngineGameplayBundleValidator}=require('../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-validator.ts');
const {CoopSettlement}=require('../apps/platform-api/src/features/coop/modules/settlement/application/service.ts');
const {OperatorService}=require('../apps/platform-api/src/features/identity/modules/operators/application/operator-service.ts');
const {totp}=require('../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto.ts');
const {decodeServer}=require('../packages/native-protocol/dist/index.js');
const socketRequire=createRequire(require.resolve('socket.io-client/package.json'));
const WebSocket=createRequire(socketRequire.resolve('engine.io-client/package.json'))('ws');
const varint=value=>{let n=BigInt(value);const out=[];do{let byte=Number(n&0x7fn);n>>=7n;if(n)byte|=0x80;out.push(byte);}while(n);return Buffer.from(out);};
const tag=(field,wire)=>varint((field<<3)|wire);
const uintField=(field,value)=>Buffer.concat([tag(field,0),varint(value)]);
const bytesField=(field,bytes)=>Buffer.concat([tag(field,2),varint(bytes.length),Buffer.from(bytes)]);
const stringField=(field,text)=>bytesField(field,Buffer.from(text,'utf8'));
const messageField=(field,bytes)=>bytesField(field,bytes);
function envelope(bodyField,body,commandId,sequence){return Buffer.concat([uintField(1,1),bytesField(2,commandId),uintField(3,BigInt(sequence)),messageField(bodyField,body)]);}
function helloMessage(ticket,contentHash){return Buffer.concat([stringField(1,ticket),stringField(2,functional?'unity-native-v2':'coop-process-v1'),bytesField(3,contentHash)]);}
function intentMessage(sessionId,expectedVersion,action,kind='arena8-coop.intent.v1'){return Buffer.concat([bytesField(1,sessionId),uintField(2,BigInt(expectedVersion)),stringField(3,kind),bytesField(4,Buffer.from(action,'utf8'))]);}

// Search only the committed board. A stable board has no existing matches, so
// any three aligned elements after the trial swap constitute a legal move.
function legalSwap(board){
 const elements=board.map(tile=>tile.kind??tile.element);
 const matches=()=>elements.some((value,index)=>
  (index%8<6&&value===elements[index+1]&&value===elements[index+2])||
  (index<48&&value===elements[index+8]&&value===elements[index+16]));
 for(let a=0;a<elements.length;a++){
  for(const b of [a%8<7?a+1:-1,a<56?a+8:-1]){
   if(b<0||elements[a]===elements[b])continue;
   [elements[a],elements[b]]=[elements[b],elements[a]];
   if(matches())return {kind:'swap',first:a,second:b};
   [elements[a],elements[b]]=[elements[b],elements[a]];
  }
 }
 throw Error('Committed board has no legal swap');
}

// Use the committed tile kinds to find an opening swap whose first batch is
// all Mana. Subsequent authoritative cascade gains can only increase Mana.
function pureSwap(board,requiredKind){
 const kinds=board.map(tile=>tile.kind);
 function firstBatch(){
  const matched=new Set();
  for(let index=0;index<kinds.length;index++){
   const kind=kinds[index];
   for(const step of [1,8]){
    if(step===1?index%8>=6:index>=48)continue;
    if(kind===kinds[index+step]&&kind===kinds[index+step*2]){
     matched.add(index);matched.add(index+step);matched.add(index+step*2);
    }
   }
  }
  return matched.size>0&&[...matched].every(index=>kinds[index]===requiredKind)?matched.size:0;
 }
 for(let first=0;first<kinds.length;first++){
  for(const second of [first%8<7?first+1:-1,first<56?first+8:-1]){
   if(second<0||kinds[first]===kinds[second])continue;
   [kinds[first],kinds[second]]=[kinds[second],kinds[first]];
   const matched=firstBatch();
   [kinds[first],kinds[second]]=[kinds[second],kinds[first]];
   if(matched>0)return {action:{kind:'swap',first,second},matched};
  }
 }
}
const solo=process.argv.includes('--solo');
const direct=solo||process.argv.includes('--direct');
const functional=solo||process.argv.includes('--functional');
const historicalArg=process.argv.find(arg=>arg.startsWith('--historical-binary='));
const historicalBinary=historicalArg?.slice('--historical-binary='.length);
assert.ok(historicalArg===undefined||(!functional&&historicalBinary?.startsWith('/')),
 'Historical recovery proof requires an absolute prior binary and the elemental fixture');
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const evidence=resolve(root,'artifacts/admin-publication');
await mkdir(evidence,{recursive:true});
const artifact=await mkdtemp(join(evidence,solo?'solo-':functional?'functional-':'run-'));
const facts={result:'FAIL',board:solo?'functional-solo':functional?'functional':'elemental',operatorTransport:direct?'nest-http':'chromium',upgradedRuntime:historicalBinary!==undefined,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scenarios:[],browserRequests:[],allocations:[]};
function mark(scenario,details){
 facts.scenarios.push({scenario,details});
 console.log(JSON.stringify({scenario,details}));
}
async function freePort(){
 const listener=createServer();
 listener.listen(0,'127.0.0.1');
 await once(listener,'listening');
 const {port}=listener.address();
 await new Promise((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
 return port;
}
const origin='http://127.0.0.1:3300',adminPort=await freePort(),apiPort=await freePort(),nativePort=await freePort();
const adminOrigin='http://127.0.0.1:'+adminPort,apiOrigin='http://127.0.0.1:'+apiPort,nativeOrigin='https://127.0.0.1:'+nativePort;
const bindErrors=[];
tracingChannel('net.server.listen').error.subscribe(({error})=>{
 if(error?.port===nativePort)bindErrors.push({code:error.code,syscall:error.syscall,port:error.port});
});
const binary=resolve('artifacts/rust/target/debug/aetheria-game-runtime'),ruleset='arena8-coop-pve';
const directory=await mkdtemp(join(artifact,'tls-disposable-'));
let browser,page,nextProcess,logFile,connections=[];
const schema='coop_process_'+randomUUID().replaceAll('-',''),role='coop_runtime_'+randomUUID().replaceAll('-',''),password=randomBytes(32).toString('hex');
const address=new URL(process.env.TEST_DATABASE_URL??'');
assert.ok(['localhost','127.0.0.1'].includes(address.hostname) && /^aetheria_soulbound_test(?:_|$)/.test(address.pathname.slice(1)) && !address.search,'Local disposable PostgreSQL required');
const admin=new Pool({connectionString:address.toString()});let pool,app,roleCreated=false;
const identifier=value=>{assert.match(value,/^[a-z][a-z0-9_]*$/);return '"'+value+'"';};
try{
 await admin.query('CREATE SCHEMA '+identifier(schema));address.searchParams.set('options','-csearch_path='+schema);
 pool=new Pool({connectionString:address.toString()});await migrate(pool);
 await admin.query('CREATE ROLE '+identifier(role)+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8");roleCreated=true;
 await pool.query('GRANT USAGE ON SCHEMA '+identifier(schema)+' TO '+identifier(role));
 const runtimeProfile=JSON.parse(await readFile('config/native-runtime-db-privileges.json'));
 const gameProfile=JSON.parse(await readFile('config/native-game-db-privileges.json'));
 for(const [table,columns] of Object.entries(runtimeProfile.select))await pool.query('GRANT SELECT ('+columns.map(identifier).join(',')+') ON '+identifier(table)+' TO '+identifier(role));
 await pool.query('GRANT INSERT ON platform_native_ticket_uses TO '+identifier(role));
 for(const [table,columns] of Object.entries(gameProfile.rewardStatusSelect))await pool.query('GRANT SELECT ('+columns.map(identifier).join(',')+') ON '+identifier(table)+' TO '+identifier(role));
 for(const op of ['select','insert'])for(const table of gameProfile[op])await pool.query('GRANT '+op.toUpperCase()+' ON '+identifier(table)+' TO '+identifier(role));
 for(const [table,columns] of Object.entries(gameProfile.update))await pool.query('GRANT UPDATE ('+columns.map(identifier).join(',')+') ON '+identifier(table)+' TO '+identifier(role));
 const database=decodeURIComponent(address.pathname.slice(1));
 await admin.query('ALTER ROLE '+identifier(role)+' IN DATABASE '+identifier(database)+' SET search_path TO '+identifier(schema));
 const tls=await prepareAdmissionTestTls(directory,pool);await tls.enable();
 const runtime=new URL(process.env.TEST_DATABASE_URL);runtime.username=role;runtime.password=password;
 const seedPath=functional?'config/gameplay/arena8-coop-functional-v1.candidate.json':'config/gameplay/arena8-coop-v2.seed.json';
 const seed=JSON.parse(await readFile(seedPath,'utf8'));
 // Shorten the fixture so retrying a room never hides a failed concurrent allocation.
 seed.party.maxRounds=2;
 const boss=seed.bosses.find(value=>value.mapId==='cinder-terraces');
 boss.telegraphTurns=1;
 boss.attackModel.baseDamage=1;
 boss.attackModel.perRoundDamage=0;
 boss.attackModel.minimumDamage=1;
 if(solo){
  assert.ok(boss.solo);
  boss.solo.maxRounds=2;
  assert.ok(boss.regular);
  boss.regular.maxHp=1;
  boss.regular.defense=1;
  boss.regular.maxRounds=20;
 }
 if(functional){
  // Keep the test segment on a known ×1 utility factor and make an eligible
  // committed Mana match common even though the host chooses a fresh seed.
  seed.multiplier.schedule=seed.multiplier.schedule.slice(0,1);
  seed.multiplier.schedule[0].tiers=[{multiplier:1,weight:1,damageWeightPm:1000,resourceWeightPm:1000}];
  for(const row of seed.board.functionalTiles.spawnWeights)row.weight=row.kind==='mana'||(solo&&row.kind==='sword')?5:1;
 }else seed.multiplier.schedule[0].tiers.push({...seed.multiplier.schedule[1].tiers[1],weight:20});
 const validator=new EngineGameplayBundleValidator(binary);
 const installed=await installGameplayConfig(pool,ruleset,seed,validator,'system:disposable-admin-ab-fixture');
 assert.equal(installed.version,1);
 const operatorPassword='synthetic-local-ab-operator-only',operatorSecret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',operatorKey=randomBytes(32).toString('hex');
 const bootstrapTime=Date.now()-60000;
 await new OperatorService(pool,operatorKey,()=>bootstrapTime).bootstrap({password:operatorPassword,totpSecret:operatorSecret,code:totp(operatorSecret,bootstrapTime)});
 const engineHashFor=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
 const currentEngineHash=await engineHashFor(binary);
 const historicalEngineHash=historicalBinary?await engineHashFor(historicalBinary):undefined;
 if(historicalEngineHash)assert.notEqual(historicalEngineHash,currentEngineHash,'Recovery proof requires two distinct verified executables');
 let runtimeBinary=historicalBinary??binary;
 const sessionSecret=randomBytes(48).toString('base64url'),storageKey=randomBytes(32).toString('hex');
 const configForRuntime=()=>readConfig({
  NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:sessionSecret,
  ADMIN_ORIGIN:adminOrigin,OPERATOR_AUTH_KEY:operatorKey,
  LOCAL_COOP_ROOMS:'1',LOCAL_COOP_NATIVE:'1',GAMEPLAY_CONFIG_VALIDATOR_BINARY:binary,
  LOCAL_ARENA8_NATIVE_BINARY:runtimeBinary,LOCAL_ARENA8_NATIVE_DATABASE_URL:runtime.toString(),
  ...(historicalBinary?{LOCAL_COOP_HISTORICAL_RUNTIME_BINARY:historicalBinary}:{}),
  LOCAL_ARENA8_NATIVE_DB_ROLE:role,LOCAL_ARENA8_NATIVE_CA_FILE:tls.caFile,
  LOCAL_ARENA8_NATIVE_STORAGE_KEY:storageKey,LOCAL_ARENA8_NATIVE_STORAGE_KEY_ID:'local-v1',
  LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN:nativeOrigin,
  LOCAL_ARENA8_NATIVE_TLS_CERT_FILE:resolve(directory,'tls/server.pem'),
  LOCAL_ARENA8_NATIVE_TLS_KEY_FILE:resolve(directory,'tls/server.key'),
 });
 async function startApi(){
  const config=configForRuntime();
  app=await createApp(config,pool,false,solo?{petArena8Native:{
   enabled:true,binary:runtimeBinary,databaseUrl:runtime.toString(),role,caFile:tls.caFile,
   storageKey:config.LOCAL_ARENA8_NATIVE_STORAGE_KEY,storageKeyId:config.LOCAL_ARENA8_NATIVE_STORAGE_KEY_ID,
   httpsOrigin:nativeOrigin,certFile:config.LOCAL_ARENA8_NATIVE_TLS_CERT_FILE,keyFile:config.LOCAL_ARENA8_NATIVE_TLS_KEY_FILE,
  }}:{});
  await app.app.listen(apiPort,'127.0.0.1');
 }
 await startApi();
 let operator;
 if(direct){
  const response=await app.http.inject({method:'POST',url:'/v1/operator/login',headers:{origin:adminOrigin},
   payload:{password:operatorPassword,code:totp(operatorSecret,Date.now())}});
  assert.equal(response.statusCode,200,JSON.stringify(response.json()));
  operator={cookie:String(response.headers['set-cookie']).split(';')[0],csrf:response.json().csrfToken};
 }else{
 logFile=await open(join(artifact,'next.log'),'w',0o600);
 nextProcess=spawn(process.execPath,[require.resolve('../apps/admin-web/node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(adminPort)],{
  cwd:join(root,'apps/admin-web'),env:{...process.env,NODE_ENV:'development',ADMIN_ORIGIN:adminOrigin,ADMIN_API_ORIGIN:apiOrigin},
  stdio:['ignore',logFile.fd,logFile.fd],
 });
 const deadline=Date.now()+120000;
 for(;;){
  assert.equal(nextProcess.exitCode,null,'Next exited early; see next.log');
  const response=await fetch(adminOrigin+'/admin',{signal:globalThis.AbortSignal.timeout(20000)}).catch(()=>null);
  if(response?.ok){await response.body.cancel();break;}
  await response?.body?.cancel();
  assert.ok(Date.now()<deadline,'Next did not become ready; see next.log');
  await pause(500);
 }
 browser=await chromium.launch();
 page=await browser.newPage({viewport:{width:1366,height:900}});
 page.setDefaultTimeout(75_000);
 page.on('pageerror',error=>{(facts.pageErrors??=[]).push(error.message);});
 page.on('response',response=>{
  const path=new URL(response.url()).pathname;
  if(path.startsWith('/api/admin/'))facts.browserRequests.push({path,method:response.request().method(),status:response.status()});
 });
 const unauthorized=await page.request.get(adminOrigin+'/api/admin/gameplay-config?ruleset='+ruleset);
 assert.equal(unauthorized.status(),401);
 await page.goto(adminOrigin+'/admin');
 await page.getByLabel('Password',{exact:true}).fill(operatorPassword);
 await page.getByLabel('Authenticator code',{exact:true}).fill(totp(operatorSecret,Date.now()));
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'City at a glance',exact:true})).toBeVisible({timeout:60000});
 await page.getByRole('button',{name:'Gameplay configuration',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Version 1 · PUBLISHED',exact:true})).toBeVisible({timeout:60000});
 mark('actual Chromium signed in with operator password and TOTP through Next and Nest; unauthenticated overview denied',{unauthenticatedStatus:unauthorized.status()});
 }
 const variants={
  A:{hp:boss.maxHp,attack:seed.pets.find(pet=>pet.id==='fire-coalwhisk').attack,points:5000,materials:1,priority:''},
  B:{hp:boss.maxHp,attack:seed.pets.find(pet=>pet.id==='fire-coalwhisk').attack,points:5500,materials:3,priority:'highest-mana'},
 };
 if(functional){
  variants.A.manaYield=1;
  variants.B.manaYield=seed.resources.manaCap;
 }
 const configurations={};
 const activeSection=()=>page.locator('section').filter({has:page.getByRole('heading',{name:'Active configuration',exact:true})}).last();
 const auditSection=()=>page.locator('section').filter({has:page.getByRole('heading',{name:'Publication audit',exact:true})}).last();
 const button=(name,parent=page)=>parent.getByRole('button',{name,exact:true});
 const activeEntry=label=>activeSection().locator('dl>div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
 async function control(label,value){
  const input=page.getByLabel(label,{exact:true});
  await input.fill(String(value));
  await expect(input).toHaveValue(String(value));
 }
 async function clickMutation(name,action,parent=page){
  const response=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/admin/gameplay-config-'+action&&value.request().method()==='POST',{timeout:60000});
  await button(name,parent).click();
  const actual=await response;
  const value=await actual.json();
  assert.equal(actual.status(),200,action+': '+JSON.stringify(value).slice(0,300));
  return value;
 }
 const dbConfig=async version=>(await pool.query('SELECT bundle,content_digest,state FROM gameplay_config_versions WHERE ruleset=$1 AND version=$2',[ruleset,version])).rows[0];
 const dbActive=async()=>(await pool.query('SELECT version::int,revision::int FROM gameplay_config_active WHERE ruleset=$1',[ruleset])).rows[0];
 const priority=()=>page.locator('select:has(option[value="highest-mana"])');
 const versionRow=version=>page.getByRole('table',{name:'Draft and published gameplay configurations'}).getByRole('row').filter({has:page.getByRole('cell',{name:String(version),exact:true})});
 async function readVersion(version,expected){
  const response=page.waitForResponse(result=>{
   const url=new URL(result.url());
   return url.pathname==='/api/admin/gameplay-config-version'&&url.searchParams.get('version')===String(version);
  });
  await button('Open',versionRow(version)).click();
  const result=await response;
  assert.equal(result.status(),200);
  const read=await result.json();
  assert.equal(read.bundle.bosses[0].attackModel.targetPriority,expected||undefined);
  await expect(priority()).toHaveValue(expected);
  await expect(priority()).toBeDisabled();
  return read;
 }
 const values=bundle=>({
  hp:bundle.bosses[0].maxHp,
  attack:bundle.pets.find(pet=>pet.id==='fire-coalwhisk').attack,
  points:bundle.bosses[0].requiredRoomPoints,
  materials:bundle.bosses[0].rewardPolicy.defeat.materials,
  priority:bundle.bosses[0].attackModel.targetPriority??'',
  ...(functional?{manaYield:bundle.board.functionalTiles.manaPerTile}:{}),
 });
 async function operatorPost(action,input){
  const response=await app.http.inject({method:'POST',url:'/v1/operator/gameplay-config-'+action,
   headers:{origin:adminOrigin,cookie:operator.cookie,'x-csrf-token':operator.csrf},payload:{requestId:randomUUID(),ruleset,...input}});
  assert.equal(response.statusCode,200,JSON.stringify(response.json()));
  return response.json();
 }
 async function directPublish(label){
  const fields=variants[label],active=await dbActive();
  const bundle=globalThis.structuredClone((await dbConfig(active.version)).bundle),boss=bundle.bosses[0];
  boss.requiredRoomPoints=fields.points;
  boss.rewardPolicy.defeat.materials=fields.materials;
  if(fields.priority)boss.attackModel.targetPriority=fields.priority;
  if(solo&&label==='B'){
   // The progression fixture needs a reachable win with two real Boss phases.
   Object.assign(boss.solo,{maxHp:16,maxRounds:30,baseDamage:1,perRoundDamage:0,minimumDamage:1});
  }
  if(functional)bundle.board.functionalTiles.manaPerTile=fields.manaYield;
  const {version,revision}=await operatorPost('draft',{parentVersion:active.version,bundle});
  const validated=await operatorPost('validate',{version,expectedRevision:revision});
  const published=await operatorPost('publish',{version,expectedRevision:validated.revision,expectedActiveRevision:active.revision});
  const stored=await dbConfig(version),verdict=await validator.validate(ruleset,stored.bundle);
  assert.equal(verdict.digest,published.contentDigest);
  assert.deepEqual(stored.bundle,bundle);
  assert.deepEqual(await dbActive(),{version,revision:published.activeRevision});
  mark('published '+label+' through authenticated Nest operator HTTP with actual engine validation and PostgreSQL selection',
   {version,digest:verdict.digest,fields});
  return configurations[label]={version,digest:verdict.digest,hash:verdict.contentHash,fields,bundle:stored.bundle};
 }
 async function publish(label){
  if(direct)return directPublish(label);
  const fields=variants[label];
  const created=await clickMutation('New draft from active','draft');
  await expect(page.locator('h2').filter({hasText:new RegExp('^Version '+created.version+'\\s*·\\s*DRAFT$')})).toBeVisible();
  await expect(button('Save and validate')).toBeEnabled();
  await expect(button('Publish validated version')).toBeDisabled();
  const bossOption='Cinder Terraces Warden · cinder-terraces';
  await page.getByRole('combobox',{name:'Boss',exact:true}).selectOption({label:bossOption});
  await expect(priority()).toHaveValue('');
  await priority().selectOption('highest-mana');
  await priority().selectOption(fields.priority);
  await expect(priority()).toHaveValue(fields.priority);
  await control('Achievement Points to host',fields.points);
  if(functional){
   await expect(page.getByRole('heading',{name:'Functional board tiles',exact:true})).toBeVisible();
   await expect(page.getByLabel('Matching-element mana bonus',{exact:true})).toHaveCount(0);
   await control('Mana from Mana',fields.manaYield);
  }
  const materialInput=page.getByRole('group',{name:'Defeat',exact:true}).getByLabel('Artifact materials',{exact:true});
  await materialInput.fill(String(fields.materials));
  await expect(materialInput).toHaveValue(String(fields.materials));
  console.log('priority and host threshold edited for '+label);
  const trainingSkill='water-dewskip-tide-lance';
  const trainingLevels=[{materials:17,powerPm:1150}];
  if(label==='B'){
   await page.getByText('Skill training costs and levels',{exact:true}).click();
   await page.getByLabel('Training Pet',{exact:true}).selectOption('water-dewskip');
   await page.getByLabel('Training skill',{exact:true}).selectOption(trainingSkill);
   await control('New level material cost',trainingLevels[0].materials);
   await control('New level power (‰)',trainingLevels[0].powerPm);
   await button('Add level 2').click();
   await expect(page.getByText('Maximum skill level 2',{exact:false})).toBeVisible();
   await button('Compare with active').click();
   await expect(page.getByRole('heading',{name:'Differences from active',exact:true})).toBeVisible();
   await expect(page.getByText('bosses[0: cinder-terraces-warden].attackModel.targetPriority',{exact:true})).toBeVisible();
   await page.getByRole('heading',{name:'Differences from active',exact:true}).locator('..').screenshot({path:join(artifact,'browser-b-difference.png')});
  }
  await priority().scrollIntoViewIfNeeded();
  await page.screenshot({path:join(artifact,'browser-'+label.toLowerCase()+'-priority.png'),timeout:10000});
  const verdict=await clickMutation('Save and validate','validate');
  await expect(priority()).toHaveValue(fields.priority);
  await expect(page.locator('h2').filter({hasText:new RegExp('^Version '+created.version+'\\s*·\\s*VALIDATED$')})).toBeVisible();
  await expect(page.getByText('Engine validated:',{exact:false})).toBeVisible();
  if(label==='B'){
   const requests=[];
   const collect=request=>{
    if(new URL(request.url()).pathname==='/api/admin/gameplay-config-simulate')requests.push(request.postDataJSON());
   };
   page.on('request',collect);
   try{
    await page.getByLabel(/^Seeds /).fill('2');
    await button('Simulate active and selected versions').click();
    await expect(page.getByRole('heading',{name:'Selected version at comparison'})).toBeVisible();
    assert.deepEqual(requests.map(input=>input.version),[configurations.A.version,created.version]);
    assert.deepEqual(requests[0].party,requests[1].party);
    assert.equal(requests[0].party.length,4);
    assert.equal(requests[0].bossId,requests[1].bossId);
    assert.equal(requests[0].policy,requests[1].policy);
    assert.ok(requests.every(input=>input.seeds===2));
    mark('active and selected simulations used matching parties, policies and seed sets',{versions:requests.map(input=>input.version),seeds:2});
   }finally{page.off('request',collect);}
  }
  const publishResult=await clickMutation('Publish validated version','publish');
  await expect(page.getByText('Version '+created.version+' published at active revision '+publishResult.activeRevision+'.',{exact:false})).toBeVisible();
  await expect(activeEntry('Digest')).toHaveAttribute('title',verdict.contentDigest);
  await expect(activeEntry('Version')).toHaveText(String(created.version));
  const row=await dbConfig(created.version);
  assert.deepEqual(values(row.bundle),fields);
  const checked=await validator.validate(ruleset,row.bundle);
  assert.equal(checked.digest,verdict.contentDigest);
  assert.equal(row.content_digest,checked.digest);
  assert.equal(row.state,'PUBLISHED');
  const read=await readVersion(created.version,fields.priority);
  assert.deepEqual(read.bundle,row.bundle);
  const persistedSkill=read.bundle.skills.find(skill=>skill.id===trainingSkill);
  assert.ok(persistedSkill);
  if(label==='B'){
   assert.deepEqual(persistedSkill.upgradeLevels,trainingLevels);
   mark('operator authored and published a per-skill upgrade through the training editor',
    {version:created.version,digest:verdict.contentDigest,skill:trainingSkill,levels:persistedSkill.upgradeLevels});
  }else assert.equal(persistedSkill.upgradeLevels??null,null);
  assert.equal(read.contentDigest,verdict.contentDigest);
  if(fields.priority){
   const historical=globalThis.structuredClone(row.bundle);
   delete historical.bosses[0].attackModel.targetPriority;
   const historicalDigest=(await validator.validate(ruleset,historical)).digest;
   assert.notEqual(checked.digest,historicalDigest);
   mark('engine digest changed with only the Boss priority changed',{configured:checked.digest,historical:historicalDigest});
  }
  assert.deepEqual(await dbActive(),{version:created.version,revision:publishResult.activeRevision});
  await activeSection().screenshot({path:join(artifact,'browser-'+label.toLowerCase()+'-published.png')});
  configurations[label]={version:created.version,digest:checked.digest,hash:checked.contentHash,fields,bundle:row.bundle};
  mark('published '+label+' through typed browser controls, engine validation and PostgreSQL selection',{version:created.version,digest:checked.digest,activeRevision:publishResult.activeRevision,fields});
  return configurations[label];
 }
 const A=await publish('A');
 let addressIndex=1;
 async function guest(name,petId){
  const response=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.214.1.'+addressIndex++,headers:{origin},payload:{requestId:randomUUID(),displayName:name,avatarKey:'mint'}});
  assert.equal(response.statusCode,201,JSON.stringify(response.json()));
  const body=response.json(),accountId=body.profile.id;
  await pool.query('INSERT INTO pet_wave_one_players(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
  const owned=await pool.query('INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,$2,1,0,$3) RETURNING owned_pet_instance_id',[accountId,petId,'starter']);
  return {cookie:String(response.headers['set-cookie']).split(';')[0],csrf:body.csrfToken,accountId,petId,instanceId:owned.rows[0].owned_pet_instance_id};
 }
 const post=(auth,url,payload)=>app.http.inject({method:'POST',url,remoteAddress:'127.214.2.1',headers:{origin,cookie:auth.cookie,'x-csrf-token':auth.csrf},payload});
 const get=(auth,url)=>app.http.inject({url,headers:{cookie:auth.cookie}});
 const pets=['fire-coalwhisk','water-dewskip','fire-coalwhisk','ground-clodkin'],members=[];
 for(const [index,pet] of pets.entries())members.push(await guest('QA seat '+(index+1),pet));
 const host=members[0];
 const grant=(account,points)=>pool.query('INSERT INTO coop_achievement_ledger(account_id,points,source,source_ref) VALUES($1,$2,$3,$4)',[account.accountId,points,'admin_grant',randomUUID()]);
 const createRoom=member=>post(member,'/v1/coop/rooms',{requestId:randomUUID(),bossId:boss.id,petId:member.petId,ownedPetInstanceId:member.instanceId});
 async function checkGate(member,points,version,allowed,create=true){
  const response=await get(member,'/v1/coop/eligibility?bossId='+boss.id);
  assert.equal(response.statusCode,200,JSON.stringify(response.json()));
  const eligibility=response.json();
  assert.equal(eligibility.requiredPoints,version.fields.points);
  assert.equal(eligibility.points,points);
  assert.equal(eligibility.eligible,allowed);
  const result=create?await createRoom(member):undefined;
  if(result){
   assert.equal(result.statusCode,allowed?200:403,JSON.stringify(result.json()));
   if(allowed)assert.equal(result.json().requiredPoints,version.fields.points);
  }
  mark('Achievement Points gate used the active Admin version',{version:version.version,points,requiredPoints:eligibility.requiredPoints,eligible:allowed,createStatus:result?.statusCode});
  return result?.json();
 }
 await grant(host,5250);
 const caPem=await readFile(tls.caFile,'utf8');
 async function prepareRoom(version,room){
  if(!room){
   const created=await createRoom(host);
   assert.equal(created.statusCode,200,JSON.stringify(created.json()));
   room=created.json();
  }
  assert.equal(room.configVersion,version.version);
  for(const [index,member] of members.entries()){
   if(index>0){
    const joined=await post(member,'/v1/coop/rooms/'+room.roomId+'/join',{requestId:randomUUID()});
    assert.equal(joined.statusCode,200,JSON.stringify(joined.json()));
    const pet=await post(member,'/v1/coop/rooms/'+room.roomId+'/pet',{requestId:randomUUID(),petId:member.petId,ownedPetInstanceId:member.instanceId});
    assert.equal(pet.statusCode,200,JSON.stringify(pet.json()));
   }
   const ready=await post(member,'/v1/coop/rooms/'+room.roomId+'/ready',{requestId:randomUUID(),ready:true});
   assert.equal(ready.statusCode,200,JSON.stringify(ready.json()));
  }
  return room;
 }
 async function soloAdmission(input){
  const result=await post(host,'/v1/pets/wave-a/arena8/native/allocate',input);
  assert.equal(result.statusCode,200,JSON.stringify(result.json()));
  const value=result.json();
  assert.equal(value.ruleset,'arena8-functional-pve');
  assert.equal(value.principal,host.accountId);
  return value;
 }
 const startRoom=(room,requestId)=>post(host,'/v1/coop/rooms/'+room.roomId+'/start',{requestId});
 const allocationRow=async room=>(await pool.query('SELECT match_id,world_id,boot_id,status,generation,content_hash,config_version::int,config_digest,jsonb_array_length(seats) AS seats FROM coop_allocations WHERE room_id=$1',[room.roomId])).rows[0];
 async function allocate(version,room,requestId=randomUUID()){
  room??=await prepareRoom(version);
  const started=await startRoom(room,requestId);
  const row=await allocationRow(room);
  assert.equal(started.statusCode,200,JSON.stringify(started.json()));
  assert.equal(started.json().roomId,room.roomId);
  assert.equal(started.json().status,'STARTED');
  assert.equal(row.status,'ACTIVE');
  assert.equal(row.seats,4);
  assert.equal(row.config_version,version.version);
  assert.equal(row.config_digest,version.digest);
  assert.equal(row.content_hash,version.hash);
  facts.allocations.push({matchId:row.match_id,roomId:room.roomId,version:version.version,digest:version.digest,hash:version.hash});
  mark('four-seat room allocated actual Rust process with the expected version, digest and content hash',facts.allocations.at(-1));
  return {row,room,version};
 }
  async function freshTicket(match,seat){
  if(solo){
   const ticket=await soloAdmission(match.input);
   assert.equal(ticket.matchId,match.row.match_id);
   return {value:ticket.ticket,expiresAt:Date.parse(ticket.expiresAt),url:ticket.wssUrl};
  }
  const member=members[seat];
  const response=await post(member,'/v1/coop/rooms/'+match.room.roomId+'/admission',{});
  assert.equal(response.statusCode,200,JSON.stringify(response.json()));
  const view=response.json();
  assert.equal(view.bossId,boss.id);
  assert.equal(view.matchId,match.row.match_id);
  assert.equal(view.bootId,match.row.boot_id);
  assert.equal(view.accountId,member.accountId);
  assert.equal(view.seat,seat);
  assert.equal(view.contentHash,match.row.content_hash);
  assert.equal(view.wssUrl,nativeOrigin.replace('https:','wss:')+'/rt/v1');
  return {value:view.ticket,expiresAt:Date.parse(view.expiresAt),url:view.wssUrl};
 }
 async function openConnection(match,seat){
  const ticket=await freshTicket(match,seat);
  const ws=new WebSocket(ticket.url,'vl.native.v1',{ca:caPem,headers:{origin:nativeOrigin}});
  const queue=[];
  let waiting;
  ws.on('message',data=>{
   try{queue.push(decodeServer(new Uint8Array(data)));}
   catch{waiting?.(new Error('Invalid native message'));return;}
   if(waiting)waiting(null,queue.shift());
  });
  ws.on('close',(code,reason)=>waiting?.(new Error('Native socket closed '+code+' '+String(reason))));
  ws.on('error',()=>waiting?.(new Error('Native socket transport failed')));
  const next=()=>new Promise((resolve,reject)=>{
   if(queue.length){resolve(queue.shift());return;}
   if(ws.readyState!==WebSocket.OPEN){reject(new Error('Native socket closed'));return;}
   const timer=setTimeout(()=>waiting?.(new Error('Native message timeout')),8000);
   waiting=(error,message)=>{
    waiting=undefined;clearTimeout(timer);
    if(error)reject(error);else resolve(message);
   };
  });
  try{
   await once(ws,'open');
   const id=randomBytes(16),content=Buffer.from(match.row.content_hash,'hex');
   ws.send(envelope(10,helloMessage(ticket.value,content),id,1));
   const hello=await next();
   assert.equal(hello.body.case,'hello');
   return {ws,next,sequence:2,expiresAt:ticket.expiresAt};
  }catch(error){ws.terminate();throw error;}
 }
 async function native(match,seat,expectedVersion,action){
  const errors=[],commandId=randomBytes(16);
  for(let attempt=0;attempt<3;attempt++){
   try{
    const reply=await sendNative(match,seat,expectedVersion,action,commandId);
    if(![12,13].includes(reply.code))return reply;
    throw Error('Retryable native rejection '+reply.code);
   }
   catch(error){
    errors.push(error.message);
    (facts.nativeRetries??=[]).push({configVersion:match.version.version,seat,expectedVersion,kind:action?.kind??'view',attempt:attempt+1,message:error.message});
    const connection=match.connections?.get(seat);
    connection?.ws.terminate();
    match.connections?.delete(seat);
    if(attempt<2)await pause(400);
   }
  }
  throw Error('Native command failed ('+match.row.match_id+' seat '+seat+' '+(action?.kind??'view')+'): '+errors.join(' | '));
 }
 async function sendNative(match,seat,expectedVersion,action,id){
  const connections=match.connections??=new Map();
  let connection=connections.get(seat);
  if(!connection||connection.ws.readyState!==WebSocket.OPEN||connection.expiresAt-Date.now()<1200){
   connection?.ws.terminate();
   connection=await openConnection(match,seat);
   connections.set(seat,connection);
  }
  const session=Buffer.from(match.row.match_id.replaceAll('-',''),'hex');
  const intent=action?JSON.stringify({epoch:1,action}):'';
  const kind=action?'arena8-coop.intent.v1':'arena8-coop.view.v1';
  connection.ws.send(envelope(11,intentMessage(session,expectedVersion,intent,kind),id,connection.sequence++));
  for(let i=0;i<16;i++){
   const response=await connection.next();
   if(Buffer.compare(Buffer.from(response.commandId),id)!==0)continue;
   if(response.body.case==='rejection')return {code:response.body.value.code};
   if(response.body.case==='receipt')return {
    state:JSON.parse(Buffer.from(response.body.value.authorizedProjection).toString('utf8')).state,
    version:Number(response.canonicalVersion),committed:response.body.value.committed,
   };
  }
  throw Error('Native command did not return a matching result');
 }
 function closeMatch(match){
  for(const connection of match?.connections?.values()??[])connection.ws.terminate();
  match?.connections?.clear();
 }
 async function launch(match){
  connections.push(match);
  const ready=await native(match,0,0);
  assert.equal(ready.state?.phase,'ready',JSON.stringify(ready));
  const response=await native(match,0,ready.version,{kind:'start'});
  assert.equal(response.committed,true,JSON.stringify(response));
  assert.equal(response.state.phase,'playing');
  assert.equal(response.state.board.length,64);
  assert.equal(response.state.ruleset.version,functional?2:1);
  if(functional){
   const kinds=new Set(seed.board.functionalTiles.spawnWeights.map(row=>row.kind));
   assert.ok(response.state.board.every(tile=>kinds.has(tile.kind)&&!Object.hasOwn(tile,'element')));
  }
  assert.equal(response.state.participants.length,4);
  assert.equal(response.state.boss.maxHp,match.version.fields.hp);
  assert.equal(response.state.participants[0].attack,match.version.fields.attack);
  assert.equal(response.state.ruleset.configDigest,match.version.digest);
  assert.equal(response.state.ruleset.contentHash,match.version.hash);
  const room=await get(host,'/v1/coop/rooms/'+match.room.roomId);
  assert.equal(room.statusCode,200);
  assert.equal(room.json().requiredPoints,match.version.fields.points);
  const persisted=(await pool.query("SELECT encode(engine_hash,'hex') AS engine_hash FROM game_native_matches WHERE id=$1",[match.row.match_id])).rows[0];
  match.engineHash=persisted?.engine_hash;
  assert.equal(match.engineHash,runtimeBinary===historicalBinary?historicalEngineHash:currentEngineHash);
  mark('live native projection executed the Admin boss HP and Pet ATK',{matchId:match.row.match_id,version:response.version,bossHp:response.state.boss.maxHp,petAttack:response.state.participants[0].attack,roomRequiredPoints:room.json().requiredPoints});
  return response;
 }
 async function stillPinned(match,before,stage){
  const result=await native(match,0,0);
  assert.equal(result.version,before.version,JSON.stringify(result));
  assert.deepEqual(result.state,before.state);
  const allocation=(await pool.query('SELECT status,generation,config_version::int,config_digest,content_hash FROM coop_allocations WHERE match_id=$1',[match.row.match_id])).rows[0];
  assert.equal(allocation.status,'ACTIVE');
  assert.equal(allocation.config_version,match.version.version);
  assert.equal(allocation.config_digest,match.version.digest);
  assert.equal(allocation.content_hash,match.version.hash);
  const persisted=(await pool.query("SELECT encode(engine_hash,'hex') AS engine_hash FROM game_native_matches WHERE id=$1",[match.row.match_id])).rows[0];
  assert.equal(persisted?.engine_hash,match.engineHash);
  mark(stage,{matchId:match.row.match_id,version:match.version.version,digest:allocation.config_digest,generation:allocation.generation,
   canonicalVersion:result.version,engineHash:match.engineHash});

  return result;
 }
 async function restart(){
  for(const match of connections)closeMatch(match);
  await app.app.close();
  if(runtimeBinary===historicalBinary){
   runtimeBinary=binary;
   mark('the next API process is configured with a different current executable and the trusted historical candidate',{
    historicalEngineHash,currentEngineHash,
   });
  }
  await startApi();
  const recovered=(await pool.query('SELECT match_id,status,generation FROM coop_allocations ORDER BY created_at')).rows;
  mark('Nest restarted and reconciled durable allocation rows',recovered);
 }
 async function functionalBehavior(match,response){
  for(let attempt=0;attempt<4;attempt++){
   const seat=response.state.activeSeat,before=response.state.participants[seat].mana;
   const found=pureSwap(response.state.board,'mana');
   if(found&&before===0){
    const after=await native(match,seat,response.version,found.action);
    if(after.committed){
     const observed=after.state.participants[seat].mana;
     const yieldPerTile=match.version.fields.manaYield,cap=match.version.bundle.resources.manaCap;
     assert.ok(observed>=Math.min(cap,found.matched*yieldPerTile));
     if(yieldPerTile===cap)assert.equal(observed,cap);
     else assert.ok(observed<cap,'A must remain below the cap to distinguish it from B');
     mark('committed Mana swap executed the published functional yield in the live Rust process',{
      configVersion:match.version.version,digest:match.version.digest,canonicalVersion:after.version,
      matchedInitially:found.matched,manaPerTile:yieldPerTile,manaBefore:before,manaAfter:observed,manaCap:cap,
     });
     return after;
    }
   }
   response=await native(match,seat,response.version,solo?{kind:'guard'}:legalSwap(response.state.board));
   assert.equal(response.committed,true,JSON.stringify(response));
  }
  throw Error('No pure Mana swap was observed on a fresh seat');
 }
 async function behavior(match,response){
  if(functional)return functionalBehavior(match,response);
  async function guard(value){
   const result=await native(match,value.state.activeSeat,value.version,{kind:'guard'});
   assert.equal(result.committed,true,JSON.stringify(result));
   return result;
  }
  response=await guard(response);
  for(let seat=1;seat<=3;seat++){
   assert.equal(response.state.activeSeat,seat);
   response=await guard(response);
  }
  assert.equal(response.state.round,2);
  assert.deepEqual(response.state.participants.map(pet=>pet.mana),[0,0,0,0]);
  assert.deepEqual(response.state.participants.map(pet=>pet.maxHp-pet.hp),[1,0,0,0]);
  assert.equal(response.state.activeSeat,0);
  response=await guard(response);
  assert.equal(response.state.activeSeat,1);
  const swap=await native(match,response.state.activeSeat,response.version,legalSwap(response.state.board));
  assert.equal(swap.committed,true,JSON.stringify(swap));
  const preImpact=await guard(swap);
  assert.equal(preImpact.state.activeSeat,3);
  assert.equal(preImpact.state.boss.phase,1);
  const before=preImpact.state.participants.map(({hp,maxHp,mana})=>({hp,maxHp,mana}));
  assert.ok(before[0].hp<before[0].maxHp);
  assert.ok(before.slice(1).every(pet=>pet.hp===pet.maxHp));
  assert.ok(before[1].mana>0);
  assert.ok(before.every((pet,index)=>index===1||pet.mana===0));
  const after=await guard(preImpact);
  assert.equal(after.state.phase,'lost');
  const damage=before.map((pet,index)=>pet.hp-after.state.participants[index].hp);
  assert.deepEqual(damage,match.version.fields.priority==='highest-mana'?[0,1,0,0]:[1,0,0,0]);
  mark('native Boss impact picked the authored target from divergent HP and mana rankings',{
   configVersion:match.version.version,digest:match.version.digest,priority:match.version.fields.priority||'historical-lowest-hp',
   canonicalVersion:after.version,before,damage,selectedSeat:damage.indexOf(1),
  });
  return after;
 }
 async function settle(match,response){
  while(response.state.phase==='playing'){
   assert.ok(response.version<12,'Short fixture did not reach a terminal state');
   response=await native(match,response.state.activeSeat,response.version,{kind:'guard'});
   assert.equal(response.committed,true,JSON.stringify(response));
  }
  assert.equal(response.state.phase,'lost');
  closeMatch(match);
  await new CoopSettlement(pool).drain();
  const state=(await pool.query('SELECT status FROM coop_allocations WHERE match_id=$1',[match.row.match_id])).rows[0];
  assert.equal(state.status,'SETTLED');
  const rewards=await pool.query(
   'SELECT r.account_id,r.materials FROM coop_settlement_rewards r JOIN coop_settlement_inbox i USING(settlement_id) WHERE i.match_id=$1',
   [match.row.match_id]);
  assert.deepEqual(rewards.rows.map(row=>row.account_id).sort(),members.map(member=>member.accountId).sort());
  assert.ok(rewards.rows.every(row=>row.materials===match.version.fields.materials));
  mark('all four receipts used the material award pinned at allocation',{version:match.version.version,materials:match.version.fields.materials});
  mark('disposable match settled to free the local runtime listener',{matchId:match.row.match_id,canonicalVersion:response.version});
 }
 if(solo){
  const input={requestId:randomUUID(),boardRuleset:'functional',petId:host.petId,mapId:'cinder-terraces',encounterId:'cinder-terraces-boss'};
  const admission=await soloAdmission(input);
  const match={input,row:{match_id:admission.matchId,content_hash:admission.contentHash},version:A};
  connections.push(match);
  const started=await native(match,0,0,{kind:'start'});
  assert.equal(started.committed,true,JSON.stringify(started));
  assert.equal(started.state.ruleset.id,'arena8-functional-pve');
  assert.equal(started.state.ruleset.version,1);
  assert.equal(started.state.ruleset.configDigest,A.digest);
  assert.equal(started.state.participants.length,1);
  assert.equal(started.state.board.length,64);
  assert.ok(started.state.board.every(tile=>typeof tile.kind==='string'&&!Object.hasOwn(tile,'element')));
  const pinned=(await pool.query('SELECT functional_config_version::int, functional_config_digest, functional_allocation FROM platform_native_arena8_matches WHERE match_id=$1',[match.row.match_id])).rows[0];
  assert.equal(pinned.functional_config_version,A.version);
  assert.equal(pinned.functional_config_digest,A.digest);
  assert.equal(pinned.functional_allocation.seat.ownedPetInstanceId,host.instanceId);
  const B=await publish('B');
  await restart();
  const restored=await native(match,0,0);
  assert.equal(restored.version,started.version);
  assert.deepEqual(restored.state,started.state);
  mark('authenticated functional solo resumed with the original DB publication and owned Pet after B publication and restart',
   {version:A.version,digest:A.digest,newActiveVersion:B.version,canonicalVersion:restored.version});
  const terminal=await functionalBehavior(match,restored);
  let current=terminal;
  while(current.state.phase==='playing'){
   assert.ok(current.version<8);
   current=await native(match,0,current.version,{kind:'guard'});
   assert.equal(current.committed,true,JSON.stringify(current));
  }
  const settlementUrl='/v1/pets/wave-a/arena8/native/matches/'+match.row.match_id+'/settle',request={requestId:randomUUID()};
  const another=await post(members[1],settlementUrl,request);
  assert.equal(another.statusCode,403);
  const first=await post(host,settlementUrl,request);
  assert.equal(first.statusCode,200,JSON.stringify(first.json()));
  assert.equal(first.json().materials,A.fields.materials);
  const replay=await post(host,settlementUrl,{requestId:randomUUID()});
  assert.equal(replay.statusCode,200,JSON.stringify(replay.json()));
  assert.deepEqual(replay.json(),first.json());
  const finished=(await pool.query('SELECT status FROM game_native_matches WHERE id=$1',[match.row.match_id])).rows[0];
  assert.equal(finished.status,'FINISHED');
  const row=(await pool.query('SELECT delivery_outcome FROM game_native_outbox WHERE match_id=$1',[match.row.match_id])).rows[0];
  assert.equal(row.delivery_outcome,'granted');
  mark('functional solo terminal settlement used pinned rewards once and rejected a different account',
   {version:A.version,digest:A.digest,materials:first.json().materials,deniedStatus:another.statusCode,outbox:row.delivery_outcome});
  const waterInput={...input,requestId:randomUUID(),mapId:'tideglass-lagoon',encounterId:'tideglass-lagoon-regular'};
  const locked=await post(host,'/v1/pets/wave-a/arena8/native/allocate',waterInput);
  assert.equal(locked.statusCode,403);
  async function winFireEncounter(encounterId){
   const request={...input,requestId:randomUUID(),encounterId};
   const admitted=await soloAdmission(request);
   const match={input:request,row:{match_id:admitted.matchId,content_hash:admitted.contentHash},version:B};
   connections.push(match);
   let view=await native(match,0,0,{kind:'start'});
   assert.equal(view.committed,true,JSON.stringify(view));
   assert.equal(view.state.ruleset.configDigest,B.digest);
   while(view.state.phase==='playing'){
    assert.ok(view.version<32,'Fire fixture did not finish within its published turn budget');
    const action=pureSwap(view.state.board,'sword')?.action??legalSwap(view.state.board);
    view=await native(match,0,view.version,action);
    assert.equal(view.committed,true,JSON.stringify(view));
   }
   assert.equal(view.state.phase,'won');
   return {admitted,view};
  }
  for(const firstClear of [true,false]){
   const regularId='cinder-terraces-regular';
   const {admitted,view}=await winFireEncounter(regularId);
   assert.equal(view.state.bossId,regularId);
   const expected=B.bundle.bosses[0].regular.rewardPolicy[firstClear?'firstClear':'repeatClear'];
   const settlementUrl='/v1/pets/wave-a/arena8/native/matches/'+admitted.matchId+'/settle';
   const previousCoins=Number((await pool.query('SELECT coins FROM pet_wave_one_players WHERE account_id=$1',[host.accountId])).rows[0].coins);
   const settled=await post(host,settlementUrl,{requestId:randomUUID()});
   assert.equal(settled.statusCode,200,JSON.stringify(settled.json()));
   const value=settled.json();
   assert.deepEqual({firstClear:value.firstClear,coins:value.coins,exp:value.exp,materials:value.materials},
    {firstClear,coins:expected.coins,exp:expected.exp,materials:expected.materials});
   const retry=await post(host,settlementUrl,{requestId:randomUUID()});
   assert.equal(retry.statusCode,200);
   assert.deepEqual(retry.json(),value);
   const coins=Number((await pool.query('SELECT coins FROM pet_wave_one_players WHERE account_id=$1',[host.accountId])).rows[0].coins);
   assert.equal(coins,previousCoins+expected.coins);
   const proposal=(await pool.query('SELECT proposal FROM game_native_settlements WHERE match_id=$1',[admitted.matchId])).rows[0].proposal;
   assert.equal(proposal.encounterId,regularId);
   assert.equal(proposal.configDigest,B.digest);
   const stillLocked=await post(host,'/v1/pets/wave-a/arena8/native/allocate',{...waterInput,requestId:randomUUID()});
   assert.equal(stillLocked.statusCode,403,JSON.stringify(stillLocked.json()));
   mark('functional solo regular win settled the exact encounter once',
    {encounterId:proposal.encounterId,configDigest:proposal.configDigest,canonicalVersion:view.version,
     firstClear,coins:value.coins,exp:value.exp,nextMapLockedStatus:stillLocked.statusCode});
  }
  const {admitted:bossAdmission,view:won}=await winFireEncounter(input.encounterId);
  const bossWin=await post(host,'/v1/pets/wave-a/arena8/native/matches/'+bossAdmission.matchId+'/settle',{requestId:randomUUID()});
  assert.equal(bossWin.statusCode,200,JSON.stringify(bossWin.json()));
  assert.equal(bossWin.json().won,true);
  assert.equal(bossWin.json().firstClear,true);
  const waterRequest={...waterInput,requestId:randomUUID()};
  const water=await soloAdmission(waterRequest);
  const waterMatch={input:waterRequest,row:{match_id:water.matchId,content_hash:water.contentHash},version:B};
  connections.push(waterMatch);
  const waterStart=await native(waterMatch,0,0,{kind:'start'});
  assert.equal(waterStart.committed,true,JSON.stringify(waterStart));
  assert.equal(waterStart.state.bossId,waterRequest.encounterId);
  assert.equal(waterStart.state.ruleset.configDigest,B.digest);
  mark('Fire regular and Boss victories unlocked an authenticated Water start through settlement',
   {fireBossVersion:won.version,waterEncounter:waterStart.state.bossId,waterVersion:waterStart.version,configDigest:B.digest});
 }else{
 const first=await allocate(A,await prepareRoom(A,await checkGate(host,5250,A,true)));
 let firstStarted=await launch(first);
 const B=await publish('B');
 await stillPinned(first,firstStarted,'A matched the original committed projection after B publication');
 await checkGate(host,5250,B,false);
 await grant(host,1000);
 const roomB=await prepareRoom(B);
 const requestB=randomUUID();
 const busy=await startRoom(roomB,requestB);
 assert.equal(busy.statusCode,409,JSON.stringify(busy.json()));
 assert.equal(busy.json().error?.code,'REQUEST_CONFLICT');
 assert.equal(busy.json().error?.message,'Cooperative runtime is busy. Retry after the current battle settles.');
 assert.equal(await allocationRow(roomB),undefined);
 assert.equal((await allocationRow(first.room)).status,'ACTIVE');
 const locked=await get(host,'/v1/coop/rooms/'+roomB.roomId);
 assert.equal(locked.statusCode,200);
 assert.equal(locked.json().status,'LOCKED');
 assert.equal(locked.json().configVersion,B.version);
 assert.equal((await pool.query('SELECT config_digest FROM coop_rooms WHERE id=$1',[roomB.roomId])).rows[0].config_digest,B.digest);
 assert.deepEqual(bindErrors,[]);
 facts.overlap={httpStatus:busy.statusCode,code:busy.json().error.code,message:busy.json().error.message,roomId:roomB.roomId,requestId:requestB,roomStatus:locked.json().status,allocationCreated:false,aStatus:'ACTIVE',bindErrors:[...bindErrors]};
 mark('while A was active, B returned a retryable conflict and remained locked without an allocation',facts.overlap);
 await restart();
 const restoredA=await stillPinned(first,firstStarted,'A restored its original projection, config and content hash after API and Rust restart with B active in Admin');
 await settle(first,await behavior(first,restoredA));
 const second=await allocate(B,roomB,requestB);
 const replay=await startRoom(roomB,requestB);
 assert.equal(replay.statusCode,200,JSON.stringify(replay.json()));
 assert.equal(replay.json().roomId,roomB.roomId);
 assert.equal(replay.json().status,'STARTED');
 assert.equal((await allocationRow(roomB)).match_id,second.row.match_id);
 assert.deepEqual(bindErrors,[]);
 facts.retry={httpStatus:200,roomId:roomB.roomId,requestId:requestB,matchId:second.row.match_id,configVersion:B.version,configDigest:B.digest,replayStatus:replay.statusCode,bindErrors:[...bindErrors]};
 mark('after A settled, the same B room and start request became active and replayed the same allocation',facts.retry);
 const secondStarted=await launch(second);
 if(direct){
  const active=await dbActive();
  const rolled=await operatorPost('rollback',{version:A.version,expectedActiveRevision:active.revision});
  assert.deepEqual(await dbActive(),{version:A.version,revision:rolled.activeRevision});
  assert.deepEqual((await dbConfig(A.version)).bundle,A.bundle);
  assert.deepEqual((await dbConfig(B.version)).bundle,B.bundle);
  mark('authenticated Nest rollback restored A and both historical publications',{version:A.version,digest:A.digest});
 }else{
 const table=page.getByRole('table',{name:'Draft and published gameplay configurations'});
 const rollbackRow=table.getByRole('row').filter({has:page.getByRole('cell',{name:String(A.version),exact:true})});
 const rollBack=await clickMutation('Roll back','rollback',rollbackRow);
 assert.equal(rollBack.version,A.version);
 await expect(page.getByText('Active configuration restored to version '+A.version+' at active revision '+rollBack.activeRevision+'.',{exact:true})).toBeVisible();
 await expect(activeEntry('Digest')).toHaveAttribute('title',A.digest);
 assert.deepEqual(await dbActive(),{version:A.version,revision:rollBack.activeRevision});
 assert.deepEqual((await dbConfig(A.version)).bundle,A.bundle);
 assert.deepEqual((await dbConfig(B.version)).bundle,B.bundle);
 await expect(priority()).toHaveValue('');
 await readVersion(B.version,'highest-mana');
 await readVersion(A.version,'');
 await activeSection().screenshot({path:join(artifact,'browser-rollback.png')});
 mark('browser rollback reselected A and PostgreSQL preserved both historical bundles',{version:A.version,activeRevision:rollBack.activeRevision,digest:A.digest});
 const auditResponse=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/admin/gameplay-config-audit',{timeout:60000});
 await button('Load audit',auditSection()).click();
 assert.equal((await auditResponse).status(),200);
 const auditRow=(action,version)=>auditSection().locator('tbody tr')
  .filter({has:page.locator('td:nth-child(2)').filter({hasText:new RegExp('^'+action+'$')})})
  .filter({has:page.locator('td:nth-child(3)').filter({hasText:new RegExp('^'+version+'$')})});
 for(const version of [A.version,B.version]){
  for(const action of ['create','update','validate','publish'])await expect(auditRow(action,version)).toHaveCount(1);
 }
 await expect(auditRow('rollback',A.version)).toHaveCount(1);
 await auditSection().screenshot({path:join(artifact,'browser-audit.png')});
 mark('browser rollback reselected A and audit showed both publications and the rollback',{version:A.version,activeRevision:rollBack.activeRevision,digest:A.digest});
 }
 await stillPinned(second,secondStarted,'B matched the original committed projection after rollback');
 await restart();
 const restoredB=await stillPinned(second,secondStarted,'B restored its original projection, config and content hash after API and Rust restart with A active in Admin');
 await settle(second,await behavior(second,restoredB));
 const third=await allocate(A);
 await settle(third,await behavior(third,await launch(third)));
 mark('a new post-rollback native match selected A again',{matchId:third.row.match_id,version:A.version,digest:A.digest});
 }
 assert.deepEqual(facts.pageErrors??[],[]);
 assert.deepEqual(bindErrors,[]);
 facts.result='PASS';
}catch(error){
 facts.failure={name:error.name,message:String(error.message).slice(0,1200)};
 facts.frames=String(error.stack??'').split('\n').filter(line=>line.trim().startsWith('at ')).slice(0,5);
 process.exitCode=1;
 if(page)facts.headings=await page.locator('h1,h2,h3').allTextContents().catch(()=>[]);
 if(page)await page.screenshot({path:join(artifact,'browser-failure.png')}).catch(()=>{});
}finally{
 for(const match of connections)for(const connection of match.connections?.values()??[])connection.ws.terminate();
 try{await browser?.close();}catch{/* Best-effort cleanup on failed browser launch. */}
 if(nextProcess?.exitCode===null){
  const ended=once(nextProcess,'exit');
  nextProcess.kill('SIGTERM');
  await Promise.race([ended,pause(3000,{},{ref:false})]);
  if(nextProcess.exitCode===null&&nextProcess.signalCode===null)nextProcess.kill('SIGKILL');
 }
 await logFile?.close();
 try{await app?.app.close();}catch{/* Best-effort teardown after a failed assertion. */}
 try{await pool?.end();}catch{/* The pool may already be closed. */}
 if(roleCreated)await admin.query('DROP OWNED BY '+identifier(role)).catch(()=>{});
 if(roleCreated)await admin.query('DROP ROLE '+identifier(role)).catch(()=>{});
 await admin.query('DROP SCHEMA IF EXISTS '+identifier(schema)+' CASCADE').catch(()=>{});
 await admin.end();await rm(directory,{recursive:true,force:true});
 await writeFile(join(artifact,'facts.json'),JSON.stringify(facts,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(facts));
}
