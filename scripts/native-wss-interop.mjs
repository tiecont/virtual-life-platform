import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto';
import {spawn} from 'node:child_process';
import {connect} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {chromium} from '@playwright/test';
import {validateTestDatabaseURL} from './test-environment.mjs';
import {prepareAdmissionTestTls} from './runtime-admission-test-tls.mjs';

const require=createRequire(import.meta.url),apiRequire=createRequire(resolve('apps/platform-api/package.json'));
apiRequire('reflect-metadata');
const {NestFactory}=apiRequire('@nestjs/core'),{Module}=apiRequire('@nestjs/common'),{FastifyAdapter}=apiRequire('@nestjs/platform-fastify');
const {build}=createRequire(require.resolve('tsx'))('esbuild');
const {migrate}=require('../apps/platform-api/src/db/migrations.ts');
const {readConfig}=require('../apps/platform-api/src/config.ts');
const {IdentityService}=require('../apps/platform-api/src/identity/service.ts');
const {registerIdentity}=require('../apps/platform-api/src/identity/http.ts');
const {RuntimeAdmissionStore}=require('../apps/platform-api/src/identity/runtime-admission.ts');
const {RuntimeTicketIssuer}=require('../apps/platform-api/src/identity/runtime-tickets.ts');
const {registerRuntimeGateway}=require('../apps/platform-api/src/runtime-gateway/http.ts');
const address=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL));
const directory=resolve('artifacts/desktop-first/vl022/interop-'+randomUUID().slice(0,8));
await mkdir(directory,{recursive:true,mode:0o700});
const facts={taskId:'VL-022',result:'FAIL',startedAt:new Date().toISOString(),scenarios:[],scope:'Loopback Nest identity -> HTTPS ticket -> Chromium WSS -> Rust -> explicit-CA restricted PostgreSQL -> own-only zone snapshot; not production composition or game effects'};
const schema='gateway_'+randomUUID().replaceAll('-',''),role='gateway_'+randomUUID().replaceAll('-',''),password=randomBytes(32).toString('hex');
const admin=new Pool({connectionString:address.toString()});let pool,app,browser,child,heartbeat,heartbeatWork=Promise.resolve(),heartbeatError,created=false,roleCreated=false;
let childClosed=Promise.resolve(),upstream=0,origin;
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
 const tls=await prepareAdmissionTestTls(directory,pool);await tls.enable();facts.postgresTls=tls.publicFacts;
 const config=readConfig({NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:randomBytes(48).toString('hex')});
 const identity=new IdentityService(pool,config),store=new RuntimeAdmissionStore(pool,identity),keys=generateKeyPairSync('ed25519');
 const scope={worldId:'native:wss-'+randomUUID(),runtimeBootId:randomUUID(),contentHash:'22'.repeat(32),protocolVersion:1};
 const issuer=new RuntimeTicketIssuer(identity,'fixture',keys.privateKey,store.admission);
 const cert=await readFile(resolve(directory,'tls/server.pem')),key=await readFile(resolve(directory,'tls/server.key'));
 class FixtureModule{} Module({})(FixtureModule);
 app=await NestFactory.create(FixtureModule,new FastifyAdapter({https:{cert,key},logger:false}),{logger:false});
 const http=app.getHttpAdapter().getInstance();registerIdentity(http,config,identity);
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
 const privateFile=directory+'/host.private.json';await writeFile(privateFile,JSON.stringify({publicKeys:{fixture:keys.publicKey.export({format:'jwk'}).x},world:scope.worldId,boot:scope.runtimeBootId,content:scope.contentHash,caFile:tls.caFile,expectedRole:role,origin}),{mode:0o600});
 child=spawn(resolve('artifacts/rust/target/debug/examples/interop'),[privateFile],{env:{PATH:process.env.PATH,TEST_DATABASE_URL:runtime.toString()},stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stderr.on('data',chunk=>{errors+=chunk;});childClosed=new Promise(ok=>child.once('close',code=>ok(code)));
 await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('Rust host startup timeout')),10000);child.once('error',no);child.once('exit',()=>no(Error('Rust host exited before listening')));child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/LISTEN (\d+)/);if(match){upstream=Number(match[1]);clearTimeout(timer);ok();}});});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true});facts.browser=browser.version();facts.browserTls='Ephemeral CA; browser ignoreHTTPSErrors for isolated fixture only. PostgreSQL verifies explicit CA/hostname/channel binding.';
 const page=await context.newPage();await page.goto(origin);await page.waitForFunction(()=>!!window.transport);
 const guest=await page.evaluate(async()=>{const r=await fetch('/v1/session/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),displayName:'WSS fixture',avatarKey:'mint'})});return {status:r.status,me:await r.json()};});assert.equal(guest.status,201);
 const cookie=(await context.cookies()).find(c=>c.name==='city_session');assert(cookie?.httpOnly);const credential=http.unsignCookie(decodeURIComponent(cookie.value)).value;assert(credential);
 const call=(method,...args)=>page.evaluate(({method,args})=>window.transport[method](...args),{method,args});
 const record=name=>facts.scenarios.push({name,result:'PASS'});
 await store.allocate(credential,scope);
 assert.equal((await call('ticket','incorrect')).status,403);record('csrf-denied');
 const injected=await page.evaluate(async csrf=>{const r=await fetch('/v1/runtime-ticket',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({worldId:'native:attacker'})});return r.status;},guest.me.csrfToken);
 assert.equal(injected,422);record('client-selected-world-denied');
 let ticket=await call('ticket',guest.me.csrfToken);assert.equal(ticket.status,200);assert.equal(ticket.cache,'no-store');
 const hello=ticket=>({ticket,clientBuild:'browser-fixture-v1',contentHash:Array(32).fill(0x22)});
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
 const oversized=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('oversize',oversized);assert(await call('closed',oversized));record('oversized-binary-denied');
 const text=await call('open',origin.replace('https:','wss:')+'/rt/v1');await call('text',text);assert(await call('closed',text));record('text-frame-denied');
 await call('close',fresh);await context.close();await browser.close();browser=undefined;
 const effects=(await pool.query('SELECT (SELECT count(*)::int FROM game_native_matches) AS matches,(SELECT count(*)::int FROM game_native_receipts) AS receipts,(SELECT count(*)::int FROM platform_native_ticket_uses) AS nonces')).rows[0];
 assert.equal(effects.matches,0);assert.equal(effects.receipts,0);assert.equal(effects.nonces,2);facts.effects=effects;record('zero-game-writes');
 assert.equal(heartbeatError,undefined);facts.result='PASS';
 await writeFile(directory+'/rust-host.log',output+errors,{mode:0o600});
}catch(error){facts.failure={name:error.name,message:String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted-test-address]')};process.exitCode=1;}
finally{
 if(heartbeat)clearInterval(heartbeat);await heartbeatWork;
 await browser?.close();for(const socket of tunnels)socket.destroy();
 if(child){child.kill('SIGINT');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await childClosed;clearTimeout(timer);}
 await app?.close();await pool?.end();
 if(created)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);if(roleCreated)await admin.query(`DROP ROLE "${role}"`);await admin.end();
 facts.cleanupComplete=true;facts.completedAt=new Date().toISOString();
 await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({result:facts.result,scenarios:facts.scenarios.length,artifactDirectory:directory,failure:facts.failure}));
}
