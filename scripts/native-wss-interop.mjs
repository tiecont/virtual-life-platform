import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {connect} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {chromium} from '@playwright/test';
import {validateTestDatabaseURL} from './test-environment.mjs';
import {prepareAdmissionTestTls} from './runtime-admission-test-tls.mjs';

const options=process.argv.slice(2);
const loss=options.includes('--pet-arena-loss'),pet=options.includes('--pet-arena')||loss,playable=options.includes('--runtime-gameplay')||pet,csharp=options.includes('--csharp-client');
const petContent=pet?spawnSync(resolve('artifacts/rust/target/debug/vl-game-runtime'),['--ruleset-content-hash','pet-arena-pve'],{encoding:'utf8'}).stdout.trim():undefined;
if(pet)assert.match(petContent,/^[a-f0-9]{64}$/);
if(options.some(value=>!['--runtime-gameplay','--csharp-client','--pet-arena','--pet-arena-loss'].includes(value))||new Set(options).size!==options.length||csharp&&(!playable||pet))throw Error('Unknown native interoperability mode');
const require=createRequire(import.meta.url),apiRequire=createRequire(resolve('apps/platform-api/package.json'));
apiRequire('reflect-metadata');
const {NestFactory}=apiRequire('@nestjs/core'),{Module}=apiRequire('@nestjs/common'),{FastifyAdapter}=apiRequire('@nestjs/platform-fastify');
const {build}=createRequire(require.resolve('tsx'))('esbuild');
const {migrate}=require('../apps/platform-api/src/shared/database/migrations.ts');
const {readConfig}=require('../apps/platform-api/src/shared/config/environment.ts');
const {IdentityService}=require('../apps/platform-api/src/features/identity/modules/accounts/application/service.ts');
const {registerIdentity}=require('../apps/platform-api/src/features/identity/modules/accounts/presentation/http.ts');
const {readSessionToken}=require('../apps/platform-api/src/features/identity/modules/accounts/presentation/http.ts');
const {RuntimeAdmissionStore}=require('../apps/platform-api/src/features/identity/modules/runtime-access/application/runtime-admission.ts');
const {RuntimeTicketIssuer}=require('../apps/platform-api/src/features/identity/modules/runtime-access/application/runtime-tickets.ts');
const {registerRuntimeGateway}=require('../apps/platform-api/src/features/runtime-gateway/modules/tickets/presentation/http.ts');
const address=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL));
const directory=resolve('artifacts/desktop-first/vl022/interop-'+randomUUID().slice(0,8));
await mkdir(directory,{recursive:true,mode:0o700});
const facts={taskId:pet?'VL-112':playable?'VL-111':'VL-022',result:'FAIL',startedAt:new Date().toISOString(),scenarios:[],scope:pet?'Actual Pet Arena PvE reducer through native runtime WSS, restricted PostgreSQL, restart and platform worker settlement':playable?'Actual default-off runtime binary with synthetic ruleset, trusted WSS admission, private receipts, PostgreSQL persistence and process restart':'Loopback Nest identity -> HTTPS ticket -> Chromium WSS -> Rust -> explicit-CA restricted PostgreSQL -> own-only zone snapshot; not production composition or game effects'};
const schema='gateway_'+randomUUID().replaceAll('-',''),role='gateway_'+randomUUID().replaceAll('-',''),password=randomBytes(32).toString('hex');
const rewardRole='runtime_rewards_'+randomUUID().replaceAll('-',''),rewardPassword=randomBytes(32).toString('hex');
let rewardRoleCreated=false,settlementWorker;
const admin=new Pool({connectionString:address.toString()});let pool,app,browser,child,heartbeat,heartbeatWork=Promise.resolve(),heartbeatError,created=false,roleCreated=false;
let childClosed=Promise.resolve(),upstream=0,origin,output='',errors='';
const tunnels=new Set();
try{
 await admin.query(`CREATE SCHEMA "${schema}"`);created=true;
 address.searchParams.set('options','-csearch_path='+schema);pool=new Pool({connectionString:address.toString()});await migrate(pool);
 await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8`);roleCreated=true;
 await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
 const profile=JSON.parse(await readFile('config/native-runtime-db-privileges.json'));
 const identifier=value=>{assert.match(value,/^[a-z][a-z0-9_]*$/);return '"'+value+'"';};
 // Only the admission reads and one-use nonce INSERT are granted. No game DML.
 for(const [table,columns] of Object.entries(profile.select).filter(([table])=>!table.startsWith('game_'))){await pool.query(`GRANT SELECT (${columns.map(identifier).join(',')}) ON ${identifier(schema)}.${identifier(table)} TO ${identifier(role)}`);}
 await pool.query(`GRANT INSERT ON platform_native_ticket_uses TO "${role}"`);
 if(playable){
  const gameProfile=JSON.parse(await readFile('config/native-game-db-privileges.json'));
  for(const [table,columns]of Object.entries(gameProfile.rewardStatusSelect))await pool.query(`GRANT SELECT (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(role)}`);
  for(const op of ['select','insert'])for(const table of gameProfile[op])await pool.query(`GRANT ${op.toUpperCase()} ON ${identifier(table)} TO ${identifier(role)}`);
  for(const [table,columns]of Object.entries(gameProfile.update))await pool.query(`GRANT UPDATE (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(role)}`);
 }

 const tls=await prepareAdmissionTestTls(directory,pool);await tls.enable();facts.postgresTls=tls.publicFacts;
 const config=readConfig({NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:randomBytes(48).toString('hex')});
 const identity=new IdentityService(pool,config),store=new RuntimeAdmissionStore(pool,identity),keys=generateKeyPairSync('ed25519');
 const scope={worldId:'native:wss-'+randomUUID(),runtimeBootId:randomUUID(),contentHash:pet?petContent:(playable?'53':'22').repeat(32),protocolVersion:1};
 const issuer=new RuntimeTicketIssuer(identity,'fixture',keys.privateKey,store.admission);
 const cert=await readFile(resolve(directory,'tls/server.pem')),key=await readFile(resolve(directory,'tls/server.key'));
 class FixtureModule{} Module({})(FixtureModule);
 app=await NestFactory.create(FixtureModule,new FastifyAdapter({https:{cert,key},logger:false}),{logger:false});
 const http=app.getHttpAdapter().getInstance();registerIdentity(http,config,identity);
 let allocateForCsharp=false;
 // The isolated client fixture allocates only authenticated, CSRF-checked sessions
 // to the harness-owned scope. This hook is never part of the production API.
 http.addHook('preHandler',async req=>{
  if(allocateForCsharp&&req.url==='/v1/runtime-ticket'){
   const token=readSessionToken(req,config);identity.verifyCsrf(token,req.headers['x-csrf-token']);
   await store.allocate(token,scope);
  }
 });
 const bundle=await build({entryPoints:['tests/native-wss/browser.ts'],nodePaths:[resolve('packages/native-protocol/node_modules')],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022'});
 http.get('/',(_req,reply)=>reply.type('text/html').send('<!doctype html><title>Native transport fixture</title><script src="/fixture.js"></script>'));
 http.get('/fixture.js',(_req,reply)=>reply.type('application/javascript').send(bundle.outputFiles[0].text));
 // Determine the bound origin before registering the opt-in route, then let the
 // closure supply its exact value. No caller controls the fixed world scope.
 const routeOptions={enabled:true,origin:'https://127.0.0.1',scope};
 // Reserve an ephemeral loopback port without using a fixed developer port.
 const {createServer}=await import('node:net');const reservation=createServer();await new Promise(ok=>reservation.listen(0,'127.0.0.1',ok));
 const port=reservation.address().port;await new Promise(ok=>reservation.close(ok));origin='https://127.0.0.1:'+port;routeOptions.origin=origin;
 registerRuntimeGateway(http,config,identity,issuer,routeOptions);
 http.server.on('upgrade',(req,socket,head)=>{
  if(!upstream||req.url!=='/rt/v1'){socket.destroy();return;}
  const target=connect(upstream,'127.0.0.1');tunnels.add(socket);tunnels.add(target);
  const destroy=()=>{socket.destroy();target.destroy();tunnels.delete(socket);tunnels.delete(target);};
  socket.on('error',destroy);target.on('error',destroy);socket.on('close',destroy);target.on('close',destroy);
  target.on('connect',()=>{target.write('GET '+req.url+' HTTP/1.1\r\n'+Array.from({length:req.rawHeaders.length/2},(_,i)=>req.rawHeaders[2*i]+': '+req.rawHeaders[2*i+1]).join('\r\n')+'\r\n\r\n');if(head.length)target.write(head);socket.pipe(target);target.pipe(socket);});
 });
 await app.listen(port,'127.0.0.1');
 await store.configure(scope,0,true,8);
 heartbeat=setInterval(()=>{heartbeatWork=heartbeatWork.then(()=>store.heartbeat(scope,1)).catch(error=>{heartbeatError=error;});},500);
 const runtime=new URL(address);runtime.username=role;runtime.password=password;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true});facts.browser=browser.version();facts.browserTls='Ephemeral CA; browser ignoreHTTPSErrors for isolated fixture only. PostgreSQL verifies explicit CA/hostname/channel binding.';
 const page=await context.newPage();await page.goto(origin);await page.waitForFunction(()=>!!window.transport);
 const guest=await page.evaluate(async()=>{const r=await fetch('/v1/session/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),displayName:'WSS fixture',avatarKey:'mint'})});return {status:r.status,me:await r.json()};});assert.equal(guest.status,201);
 const loginName='fixture_'+randomBytes(8).toString('hex'),loginPassword=randomBytes(24).toString('hex');
 if(csharp){
  const upgrade=await page.evaluate(async({csrf,loginName,password})=>{
   const r=await fetch('/v1/session/upgrade',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({loginName,password})});
   return {status:r.status,me:await r.json()};
  },{csrf:guest.me.csrfToken,loginName,password:loginPassword});
  assert.equal(upgrade.status,200);guest.me=upgrade.me;
 }
 const cookie=(await context.cookies()).find(c=>c.name==='city_session');assert(cookie?.httpOnly);const credential=http.unsignCookie(decodeURIComponent(cookie.value)).value;assert(credential);

 const matchId=randomUUID(),privateFile=directory+'/host.private.json';
 const storageKeys={current:Array.from(randomBytes(32))};
 async function startHost(){
  const common={publicKeys:{fixture:keys.publicKey.export({format:'jwk'}).x},world:scope.worldId,boot:scope.runtimeBootId,caFile:tls.caFile,origin};
  await writeFile(privateFile,JSON.stringify(playable?{
   ...common,schemaVersion:1,ruleset:pet?'pet-arena-pve':'headless-counter',...(pet?{pet:0,stage:0}:{}),matchId,player:guest.me.profile.id,
   role,activeStorageKey:'current',storageKeys,engineHash:Array(32).fill(0x64),
  }:{...common,content:scope.contentHash,expectedRole:role}),{mode:0o600});
  const binary=resolve(playable?'artifacts/rust/target/debug/vl-game-runtime':'artifacts/rust/target/debug/examples/interop');
  const env=playable?{PATH:process.env.PATH,VL_RUNTIME_BIND:'127.0.0.1:0',VL_GAMEPLAY_ENABLED:'1',VL_GAMEPLAY_CONFIG:privateFile,VL_GAME_DATABASE_URL:runtime.toString()}:{PATH:process.env.PATH,TEST_DATABASE_URL:runtime.toString()};
  child=spawn(binary,playable?[]:[privateFile],{env,stdio:['ignore','pipe','pipe']});
  let startup='';child.stderr.on('data',chunk=>{errors+=chunk;});
  childClosed=new Promise(ok=>child.once('close',code=>ok(code)));
  await new Promise((ok,no)=>{
   const timer=setTimeout(()=>no(Error('Rust host startup timeout')),10000);
   child.once('error',no);child.once('exit',()=>{clearTimeout(timer);no(Error('Rust host exited before listening'));});
   child.stdout.on('data',chunk=>{
    output+=chunk;startup+=chunk;const match=startup.match(/LISTEN (\d+)/);
    if(match){upstream=Number(match[1]);clearTimeout(timer);ok();}
   });
  });
 }

 // Probe recovery with the same restricted role and real runtime executable.
 // Diagnostics are checked for the fixed redacted error, never archived raw.
 async function rejectHost(overrides={}){
  const original=await readFile(privateFile);
  let probe;
  try{
   await writeFile(privateFile,JSON.stringify({...JSON.parse(original),...overrides}),{mode:0o600});
   probe=spawn(resolve('artifacts/rust/target/debug/vl-game-runtime'),[],{env:{PATH:process.env.PATH,VL_RUNTIME_BIND:'127.0.0.1:0',VL_GAMEPLAY_ENABLED:'1',VL_GAMEPLAY_CONFIG:privateFile,VL_GAME_DATABASE_URL:runtime.toString()},stdio:['ignore','pipe','pipe']});
   let stdout='',stderr='';probe.stdout.on('data',b=>{stdout+=b;});probe.stderr.on('data',b=>{stderr+=b;});
   const timer=setTimeout(()=>probe.kill('SIGKILL'),10000);
   let code;
   try{code=await new Promise((ok,no)=>{probe.once('error',no);probe.once('close',ok);});}finally{clearTimeout(timer);}
   assert.equal(code,1,'Invalid recovery must exit with failure');
   assert.equal(stdout.length,0,'Invalid recovery must not open a listener or publish state');
   assert.equal(stderr.trim(),'Error: "Native checkpoint unavailable or incompatible"','Recovery diagnostics must be redacted');
  }finally{
   if(probe&&probe.exitCode===null&&probe.signalCode===null){probe.kill('SIGKILL');await new Promise(ok=>probe.once('close',ok));}
   await writeFile(privateFile,original,{mode:0o600});
  }
 }

 if(playable){
  const missing=spawnSync(resolve('artifacts/rust/target/debug/vl-game-runtime'),[],{env:{PATH:process.env.PATH,VL_RUNTIME_BIND:'127.0.0.1:0',VL_GAMEPLAY_ENABLED:'1'},encoding:'utf8',timeout:5000});
  assert.equal(missing.status,1);
  assert(!missing.stdout.includes('LISTEN'));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_native_matches')).rows[0].n,0);
  facts.scenarios.push({name:'unconfigured-runtime-fails-closed-before-match-or-listener',result:'PASS'});
 }
 await startHost();
 const call=(method,...args)=>page.evaluate(({method,args})=>window.transport[method](...args),{method,args});
 const record=name=>facts.scenarios.push({name,result:'PASS'});
 await store.allocate(credential,scope);
 assert.equal((await call('ticket','incorrect')).status,403);record('csrf-denied');
 const injected=await page.evaluate(async csrf=>{const r=await fetch('/v1/runtime-ticket',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({worldId:'native:attacker'})});return r.status;},guest.me.csrfToken);
 assert.equal(injected,422);record('client-selected-world-denied');
 let ticket=await call('ticket',guest.me.csrfToken);assert.equal(ticket.status,200);assert.equal(ticket.cache,'no-store');
 const hello=ticket=>({ticket,clientBuild:'browser-fixture-v1',contentHash:Array.from(Buffer.from(scope.contentHash,'hex'))});
 const link=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('send',link,1,1,'hello',hello(ticket.body.ticket));
 const welcome=await call('next',link);assert.equal(welcome.kind,'hello');assert.equal(welcome.snapshot.epoch,'1');assert.deepEqual(welcome.snapshot.keys.sort(),['$typeName','authorityEpoch','ownActor','tick']);record('identity-issued-ticket-browser-wss-own-snapshot');
 await call('send',link,2,2,'resync',{});const answer=await call('next',link);assert.equal(answer.kind,'snapshot');assert.equal(answer.snapshot.own.xMm,0);
 await call('send',link,2,2,'resync',{});assert.equal((await call('next',link)).hex,answer.hex);record('duplicate-resync-is-byte-identical');
 await call('send',link,2,3,'resync',{});assert.equal((await call('next',link)).code,11);
 await call('send',link,4,4,'resync',{});assert.equal((await call('next',link)).code,4);record('command-collision-and-sequence-gap-denied');
 const replay=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('send',replay,1,1,'hello',hello(ticket.body.ticket));assert(await call('closed',replay));record('durable-ticket-replay-denied');
 await store.release(credential);await call('send',link,2,2,'resync',{});assert(await call('closed',link));record('revocation-denies-cached-private-reply');
 await store.allocate(credential,scope);ticket=await call('ticket',guest.me.csrfToken);assert.equal(ticket.status,200);
 const expired=ticket.body.ticket.split('.'),claims=JSON.parse(Buffer.from(expired[1],'base64url'));claims.iat-=60;claims.nbf=claims.iat;claims.exp=claims.iat+1;
 expired[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');expired[2]=sign(null,Buffer.from(expired[0]+'.'+expired[1]),keys.privateKey).toString('base64url');
 const bad=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('send',bad,1,1,'hello',hello(expired.join('.')));assert(await call('closed',bad));record('valid-signature-expired-ticket-denied');
 const forged=ticket.body.ticket.split('.'),signature=Buffer.from(forged[2],'base64url');signature[0]^=1;forged[2]=signature.toString('base64url');
 const forgedLink=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('send',forgedLink,1,1,'hello',hello(forged.join('.')));assert(await call('closed',forgedLink));record('forged-signature-denied');
 const contentLink=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('send',contentLink,1,1,'hello',{...hello(ticket.body.ticket),contentHash:Array(32).fill(0x55)});assert(await call('closed',contentLink));record('wrong-content-denied-before-nonce-consumption');
 const fresh=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('send',fresh,1,1,'hello',hello(ticket.body.ticket));assert.equal((await call('next',fresh)).kind,'hello');record('fresh-ticket-reconnect-gets-authoritative-snapshot');

 let petEffects;
 if(pet){
  const {petArenaScenarios}=await import('./pet-arena-runtime-scenarios.mjs');
  petEffects=await petArenaScenarios({loss,pool,admin,schema,role,rewardRole,rewardPassword,markRewardRoleCreated:()=>{rewardRoleCreated=true;},address,directory,scope,identity,store,issuer,credential,csrf:guest.me.csrfToken,call,fresh,origin,hello,startHost,rejectHost,stopHost:async()=>{child.kill('SIGKILL');await childClosed;child=undefined;},upstream:()=>upstream,matchId,player:guest.me.profile.id,record});
 }
 if(playable&&!pet){
  assert.equal((await fetch('http://127.0.0.1:'+upstream+'/health/ready')).status,200);
  const intent=(version,kind='fixture.advance.v1')=>({
   gameSessionId:Array.from(Buffer.from(matchId.replaceAll('-',''),'hex')),
   expectedStateVersion:String(version),kind,
   actionPayload:kind==='fixture.view.v1'?[]:Array.from(Buffer.from(JSON.stringify({epoch:1}))),
  });
  await call('send',fresh,3,2,'gameIntent',intent(0));
  const first=await call('next',fresh);assert.equal(first.kind,'receipt');assert.equal(first.receipt.committed,true);assert.equal(first.version,'1');
  await call('send',fresh,3,2,'gameIntent',intent(0));assert.equal((await call('next',fresh)).hex,first.hex);
  await call('send',fresh,4,3,'gameIntent',intent(0));assert.equal((await call('next',fresh)).code,4);
  await call('send',fresh,5,4,'gameIntent',intent(1));const second=await call('next',fresh);assert.equal(second.version,'2');
  await call('send',fresh,6,5,'gameIntent',intent(0,'fixture.view.v1'));const view=await call('next',fresh);
  assert.equal(view.receipt.committed,false);assert.deepEqual(view.receipt.projection,second.receipt.projection);
  record('actual-runtime-durable-command-receipt-duplicate-version-fence-and-private-view');
  async function csharpProbe(){
   allocateForCsharp=true;
   try{
    const probe=spawn(process.env.DOTNET??'dotnet',[resolve('artifacts/csharp/bin/Release/net8.0/NativeClient.dll'),'--probe'],{stdio:['pipe','pipe','pipe']});
    let log='';probe.stdout.on('data',b=>{log+=b;});probe.stderr.on('data',b=>{log+=b;});
    const timer=setTimeout(()=>probe.kill('SIGKILL'),30000);
    const finished=new Promise((ok,no)=>{probe.once('error',no);probe.once('close',ok);});
    probe.stdin.end(JSON.stringify({origin,certificate:resolve(directory,'tls/server.pem'),boot:scope.runtimeBootId,match:matchId,loginName,password:loginPassword}));
    let code;try{code=await finished;}finally{clearTimeout(timer);}
    assert.equal(code,0,'C# real-process probe failed: '+log);assert.deepEqual(JSON.parse(log),{result:'PASS',checks:5});
    assert(!log.includes(loginPassword));
   }finally{allocateForCsharp=false;}
  }
  if(csharp){await csharpProbe();record('csharp-https-login-ticket-wss-receipt-duplicate-and-reconnect');}
  const checkpoint=(await pool.query('SELECT state_version,rng_cursor,audit_hash,sealed_snapshot FROM game_native_matches WHERE id=$1',[matchId])).rows[0];
  child.kill('SIGKILL');await childClosed;child=undefined;
  await startHost();
  assert.deepEqual((await pool.query('SELECT state_version,rng_cursor,audit_hash,sealed_snapshot FROM game_native_matches WHERE id=$1',[matchId])).rows[0],checkpoint);
  if(csharp){
   await csharpProbe();record('csharp-after-sigkill-replays-durable-receipt-without-extra-effects');
   // Admission is session-scoped: return the harness allocation to the browser
   // only after the independent C# session has completed its restart proof.
   await store.allocate(credential,scope);
  }
  ticket=await call('ticket',guest.me.csrfToken);assert.equal(ticket.status,200);
  const restarted=await call('open',origin.replace('https:','wss:')+'/rt/v1');
  await call('send',restarted,1,1,'hello',hello(ticket.body.ticket));assert.equal((await call('next',restarted)).kind,'hello');
  await call('send',restarted,3,2,'gameIntent',intent(0));assert.equal((await call('next',restarted)).hex,first.hex);
  await call('send',restarted,7,3,'gameIntent',intent(2));const final=await call('next',restarted);
  assert.equal(final.version,'3',JSON.stringify({kind:final.kind,code:final.code,closed:final.closed}));assert.equal(final.receipt.projection.reward,'REWARD_PENDING');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_native_outbox')).rows[0].n,1);
  record('actual-runtime-sigkill-restart-restores-checkpoint-replays-receipt-and-settles-once');

  await admin.query(`CREATE ROLE "${rewardRole}" LOGIN PASSWORD '${rewardPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4`);
  rewardRoleCreated=true;
  await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${rewardRole}"`);
  const workerProfile=JSON.parse(await readFile('config/native-reward-worker-db-privileges.json'));
  const identifier=value=>{assert.match(value,/^[a-z][a-z0-9_]*$/);return '"'+value+'"';};
  for(const op of ['select','insert'])for(const table of workerProfile[op])await pool.query(`GRANT ${op.toUpperCase()} ON ${identifier(table)} TO ${identifier(rewardRole)}`);
  for(const [table,columns]of Object.entries(workerProfile.update))await pool.query(`GRANT UPDATE (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(rewardRole)}`);
  const rewardPolicy=directory+'/native-reward-policy.private.json';
  await writeFile(rewardPolicy,JSON.stringify({schemaVersion:1,world:scope.worldId,ruleset:'headless-counter',rulesetVersion:1,contentHash:scope.contentHash,rewardKey:'fixture-completion'}),{mode:0o600});
  const workerAddress=new URL(address);workerAddress.username=rewardRole;workerAddress.password=rewardPassword;
  settlementWorker=spawn(process.execPath,['apps/platform-api/dist/worker.js','--once'],{env:{PATH:process.env.PATH,NODE_ENV:'test',DATABASE_URL:workerAddress.toString(),DURABLE_JOB_ROLE:'worker',NATIVE_REWARD_POLICY_FILE:rewardPolicy},stdio:['ignore','pipe','pipe']});
  let workerLog='';
  settlementWorker.stdout.on('data',b=>{workerLog+=b;});settlementWorker.stderr.on('data',b=>{workerLog+=b;});
  const workerCode=await new Promise((ok,no)=>{settlementWorker.once('error',no);settlementWorker.once('close',ok);});
  assert.equal(workerCode,0,workerLog);
  assert(workerLog.includes('native-completion-v1'));
  assert(!workerLog.includes(rewardPassword));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM platform_native_reward_ledger')).rows[0].n,1);
  await call('send',restarted,7,3,'gameIntent',intent(2));
  assert.equal((await call('next',restarted)).receipt.projection.reward,'GRANTED');
  await call('send',restarted,7,3,'gameIntent',intent(2));
  assert.equal((await call('next',restarted)).receipt.projection.reward,'GRANTED');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM platform_native_reward_ledger')).rows[0].n,1);
  record('actual-native-only-platform-worker-grants-once-and-wss-replay-reconciles');
  const metrics=await (await fetch('http://127.0.0.1:'+upstream+'/metrics')).text();
  assert(metrics.includes('vl_native_command_receipts_total'));
  assert(!metrics.includes(guest.me.profile.id));assert(!metrics.includes('ownRoll'));record('runtime-metrics-contain-aggregate-counters');

  clearInterval(heartbeat);heartbeat=undefined;await heartbeatWork;
  await store.configure(scope,1,false,0);
  assert.equal((await fetch('http://127.0.0.1:'+upstream+'/health/ready')).status,503);
  await call('send',restarted,7,3,'gameIntent',intent(2));
  assert(await call('closed',restarted));
  record('disabled-allocator-scope-removes-readiness-and-denies-private-replay');
  await call('close',restarted);
 }
 const oversized=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('oversize',oversized);assert(await call('closed',oversized));record('oversized-binary-denied');
 const text=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('text',text);assert(await call('closed',text));record('text-frame-denied');
 await call('close',fresh);await context.close();await browser.close();browser=undefined;
 const effects=(await pool.query('SELECT (SELECT count(*)::int FROM game_native_matches) AS matches,(SELECT count(*)::int FROM game_native_receipts) AS receipts,(SELECT count(*)::int FROM platform_native_ticket_uses) AS nonces')).rows[0];
 assert.equal(effects.matches,playable?1:0);assert.equal(effects.receipts,pet?petEffects.receipts:playable?3:0);assert.equal(effects.nonces,pet?petEffects.nonces:playable?(csharp?7:3):2);facts.effects=effects;record(pet?'full-pet-match-commits-one-native-match':playable?'three-game-commits-one-native-match':'zero-game-writes');
 assert.equal(heartbeatError,undefined);facts.result='PASS';
 assert(!/ownRoll|storageKeys/.test(output+errors));
 await writeFile(directory+'/rust-host.log',output+errors,{mode:0o600});
}catch(error){await writeFile(directory+'/rust-host.log',output+errors,{mode:0o600});await writeFile(directory+'/failure-stack.log',String(error.stack),{mode:0o600});facts.failure={name:error.name,message:String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted-test-address]')};process.exitCode=1;}
finally{
 if(settlementWorker&&settlementWorker.exitCode===null){settlementWorker.kill('SIGKILL');await new Promise(ok=>settlementWorker.once('close',ok));}
 if(heartbeat)clearInterval(heartbeat);await heartbeatWork;
 await browser?.close();for(const socket of tunnels)socket.destroy();
 if(child){child.kill('SIGINT');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await childClosed;clearTimeout(timer);}
 await app?.close();await pool?.end();
 if(created)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);if(rewardRoleCreated)await admin.query(`DROP ROLE "${rewardRole}"`);if(roleCreated)await admin.query(`DROP ROLE "${role}"`);await admin.end();
 facts.cleanupComplete=true;facts.completedAt=new Date().toISOString();
 await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({result:facts.result,scenarios:facts.scenarios.length,artifactDirectory:directory,failure:facts.failure}));
}
