import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash,randomBytes,randomUUID,X509Certificate } from 'node:crypto';
import { mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import https from 'node:https';
import net from 'node:net';
import { resolve } from 'node:path';
import { chromium,expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { verifyStackEnv } from './verify-infra.mjs';

const id=randomUUID().slice(0,8),project='virtual-city-stage-test-'+id,dir=resolve('artifacts',project);
let stage='prepare',browser,started=false,commandSequence=0;
const sockets=new Set();
await mkdir(dir,{recursive:true,mode:0o700});
async function run(command,args,env=process.env,allowFailure=false){
 return new Promise((resolveRun,reject)=>{
  const child=spawn(command,args,{env,stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  child.once('error',reject);child.once('exit',code=>{
   void writeFile(resolve(dir,'command-'+(++commandSequence)+'.log'),output,{mode:0o600}).then(()=>code===0||allowFailure?resolveRun({code,output}):reject(Error(command+' failed during '+stage+' (exit '+code+')')),reject);
  });
 });
}
async function unusedPort(){const server=net.createServer();await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});const port=server.address().port;await new Promise(ok=>server.close(ok));return port;}
const port=await unusedPort(),subnet=100+randomBytes(1)[0]%140,origin='https://localhost:'+port;
const values={CITY_STACK_NAME:project,CITY_APP_IMAGE:process.env.CITY_SMOKE_IMAGE??'virtual-life-platform:m21-local',CITY_NETWORK_SUBNET:`172.30.${subnet}.0/24`,CITY_DYNAMIC_RANGE:`172.30.${subnet}.128/25`,CITY_PROXY_IP:`172.30.${subnet}.2`,CITY_TLS_PORT:String(port),WEB_ORIGIN:origin,CITY_TLS_CERT_FILE:resolve(dir,'cert.pem'),CITY_TLS_KEY_FILE:resolve(dir,'key.pem'),POSTGRES_USER:'city_stage_test',POSTGRES_DB:'city_stage_test',POSTGRES_PASSWORD:randomBytes(24).toString('base64url'),SESSION_SECRET:randomBytes(48).toString('base64url'),OPERATOR_TELEMETRY_TOKEN:randomBytes(32).toString('hex')};
const env={...process.env,...values},envPath=resolve(dir,'.env.staging'),composeArgs=['compose','--project-name',project,'--env-file',envPath,'-f','infra/compose/stack.yml'];
const compose=(args,allowFailure=false)=>run('docker',[...composeArgs,...args],env,allowFailure);
let cert;
function request(path,method='GET',headers={},body){
 return new Promise((ok,no)=>{
  const req=https.request({hostname:'127.0.0.1',servername:'localhost',port,path,method,ca:cert,headers:{host:'localhost:'+port,...headers}},res=>{let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>ok({status:res.statusCode,headers:res.headers,body:raw}));});
  req.once('error',no);req.setTimeout(8000,()=>req.destroy(Error('TLS request timeout')));if(body)req.write(body);req.end();
 });
}
const facts={taskID:'M21-01',scope:'Disposable local production-mode Compose/Caddy staging equivalent;not external staging/public deployment',publicRelease:false};
try{
 verifyStackEnv(values);
 await writeFile(envPath,Object.entries(values).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
 await run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',values.CITY_TLS_KEY_FILE,'-out',values.CITY_TLS_CERT_FILE,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1']);
 cert=await readFile(values.CITY_TLS_CERT_FILE);
 stage='compose-validation';await compose(['config','--quiet']);
 stage='compose-start';started=true;await compose(['up','-d','--wait','--wait-timeout','180']);
 facts.composeHealthy=true;
 for(const service of ['api','web','db']){const cid=(await compose(['ps','-q',service])).output.trim();assert(cid);const ports=JSON.parse((await run('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',cid])).output);assert(Object.values(ports??{}).every(value=>value===null));}
 facts.apiWebDatabaseUnpublished=true;
 stage='trusted-tls';const health=await request('/health/ready');assert.equal(health.status,200);assert.equal(JSON.parse(health.body).status,'ready');facts.tlsVerifiedWithGeneratedLocalCertificate=true;
 stage='origin-spoof';const denied=await request('/v1/session/guest','POST',{origin:'https://attacker.invalid','x-forwarded-host':'localhost:'+port,'x-forwarded-proto':'https','x-forwarded-for':'198.51.100.1','content-type':'application/json'},JSON.stringify({requestId:randomUUID(),displayName:'Denied fixture',avatarKey:'mint'}));assert.equal(denied.status,403);facts.forgedOriginDenied=true;
 stage='browser-secure-cookie';
 const spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
 browser=await chromium.launch({args:['--ignore-certificate-errors-spki-list='+spki]});
 const context=await browser.newContext({baseURL:origin}),page=await context.newPage();
 await page.goto('/identity');await page.getByLabel('Display name').fill('Local TLS fixture');
 const createdPromise=page.waitForResponse(response=>response.url().endsWith('/v1/session/guest')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Create guest identity',exact:true}).click();const created=await createdPromise;assert.equal(created.status(),201);
 await expect(page.getByRole('status')).toContainText('Guest identity created');
 const header=await created.headerValue('set-cookie');assert(!!header&&header.startsWith('__Host-city_session=')&&!/Domain=/i.test(header));
 const cookies=await context.cookies(origin),cookie=cookies.find(value=>value.name==='__Host-city_session');assert(cookie);assert(cookie.secure&&cookie.httpOnly&&cookie.path==='/'&&cookie.sameSite==='Lax'&&cookie.domain==='localhost');
 assert(!cookies.some(value=>value.name==='city_session'));assert(!(await page.evaluate(()=>document.cookie)).includes('__Host-city_session'));
 const me=await page.evaluate(async()=>{const response=await fetch('/v1/me',{cache:'no-store'});return response.json();});
 await page.reload();await expect(page.getByRole('status')).toHaveText('Welcome, Local TLS fixture.');
 facts.browserHostSecureHttpOnlyLaxCookie=true;facts.reloadIdentityPreserved=true;
 stage='cookie-rotation';await page.getByRole('button',{name:'Renew session',exact:true}).click();await expect(page.getByRole('status')).toContainText('Session renewed');
 const rotated=(await context.cookies(origin)).find(value=>value.name==='__Host-city_session');assert(rotated&&rotated.value!==cookie.value);
 assert.equal((await request('/v1/me','GET',{cookie:'__Host-city_session='+cookie.value})).status,401);
 const current=await request('/v1/me','GET',{cookie:'__Host-city_session='+rotated.value});assert.equal(current.status,200);const currentMe=JSON.parse(current.body);assert.equal(currentMe.profile.id,me.profile.id);facts.rotationInvalidatesOriginalCookie=true;
 await page.screenshot({path:resolve(dir,'identity-https.png'),fullPage:true});
 // Close UI connections before a deterministic fresh shared-IP handshake test.
 await context.close();
 stage='websocket-origin-and-forwarding';
 async function connect(headers){
  const socket=io('https://127.0.0.1:'+port,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],ca:cert,rejectUnauthorized:true,extraHeaders:{host:'localhost:'+port,cookie:'__Host-city_session='+rotated.value,...headers},auth:{schemaVersion:1,csrfToken:currentMe.csrfToken}});sockets.add(socket);
  const outcome=await new Promise(resolveConnect=>{socket.once('connect',()=>resolveConnect({ok:true,reason:null}));socket.once('connect_error',error=>resolveConnect({ok:false,reason:error.message}));socket.connect();});return {socket,...outcome};
 }
 const wrong=await connect({origin:'https://attacker.invalid','x-forwarded-for':'198.51.100.2'});assert.equal(wrong.ok,false);wrong.socket.close();
 const live=await connect({origin});assert.equal(live.ok,true);
 const ack=await live.socket.timeout(5000).emitWithAck('session.check',{schemaVersion:1,requestId:randomUUID()});assert.equal(ack.ok,true);live.socket.close();facts.verifiedTLSWebsocketAndOriginGuard=true;
 // Each rejected handshake spends a trusted edge-derived IP budget before
 // cookie/schema checks. Forging a new forwarded IP must not buy31attempts.
 let accepted=0,rejected=0,transportDenied=0;
 for(let i=0;i<31;i++){const result=await connect({origin,'x-forwarded-for':'198.51.100.'+(i+10)});if(result.ok)accepted++;else{rejected++;if(result.reason==='websocket error')transportDenied++;assert.notEqual(result.reason,'RATE_LIMITED');}result.socket.close();}
 assert(accepted>=20&&accepted<31&&transportDenied>0);facts.forwardedIPCannotResetHandshakeBudget={attempts:31,accepted,rejected,transportDenied};
 stage='private-operator-telemetry';
 const publicOps=await request('/internal/telemetry','GET',{authorization:'Bearer '+values.OPERATOR_TELEMETRY_TOKEN});assert.equal(publicOps.status,404);
 const privateOps=await compose(['exec','-T','api','node','--input-type=module','-e',"const headers={authorization:'Bearer '+process.env.OPERATOR_TELEMETRY_TOKEN};const response=await fetch('http://127.0.0.1:4300/internal/telemetry',{headers});if(response.status!==200)throw Error('Internal telemetry failed');const data=await response.json();if(!data.traces.length||data.gauges.online.memberships!==0)throw Error('Internal telemetry is not actual/isolated');const text=await fetch('http://127.0.0.1:4300/internal/metrics',{headers});if(!text.ok||!(await text.text()).includes('virtual_life_http_duration_ms_bucket'))throw Error('Internal metrics failed');console.log(JSON.stringify({actualSpans:data.traces.length,online:data.gauges.online.memberships,metrics:true}));"]);
 facts.privateOperatorTelemetry={publicEdgeDenied:true,...JSON.parse(privateOps.output.trim())};
 stage='proxy-error-redaction';await compose(['stop','api']);
 const marker='private-path-'+randomUUID(),secret='private-cookie-'+randomUUID(),failed=await request('/v1/dating/continuations/'+marker,'GET',{cookie:secret});assert.equal(failed.status,502);
 const edgeLog=(await compose(['logs','--no-color','edge'])).output;assert(!edgeLog.includes(marker)&&!edgeLog.includes(secret));facts.upstreamErrorOmitsPrivateURIAndCookie=true;
 facts.appImage=(await run('docker',['image','inspect','--format','{{.Id}}',values.CITY_APP_IMAGE])).output.trim();
 facts.result='PASS';await writeFile(resolve(dir,'facts.json'),JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({...facts,artifactDirectory:dir},null,2));
}catch(error){
 if(started)await compose(['logs','--no-color'],true).catch(()=>{});
 await writeFile(resolve(dir,'failure.json'),JSON.stringify({stage,message:error instanceof Error?error.message:'Unknown failure'},null,2));
 console.error('Local staging smoke failed during '+stage+';see ignored artifact '+dir);process.exitCode=1;
}finally{
 for(const socket of sockets)socket.close();await browser?.close();
 if(started){try{assert(project.startsWith('virtual-city-stage-test-'));await compose(['down','--volumes','--remove-orphans']);}catch{console.error('Disposable staging cleanup failed: '+project);process.exitCode=1;}}
 await Promise.all([envPath,values.CITY_TLS_CERT_FILE,values.CITY_TLS_KEY_FILE].map(path=>rm(path,{force:true})));
}
