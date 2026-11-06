import assert from 'node:assert/strict';
import {randomBytes, randomUUID, createHash, createHmac, X509Certificate} from 'node:crypto';
import {readFile, rm, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import https from 'node:https';
import net from 'node:net';
import {chromium, expect} from '@playwright/test';
import {imageTestTools} from './image-test-tools.mjs';

const args = process.argv.slice(2);
assert(args.length === 8 && args[0] === '--admin' && args[2] === '--api' && args[4] === '--context' && args[6] === '--output');
const admin = args[1], api = args[3], contextRoot = resolve(args[5]), directory = resolve(args[7]);
assert([admin, api].every(value => /^sha256:[a-f0-9]{64}$/.test(value)));
assert(directory.startsWith(resolve('artifacts') + sep + 'image-admin-') && directory.endsWith('/smoke'));
const {run: execute, save, commands, signal, dispose} = await imageTestTools(directory);
const project = 'virtual-city-admin-image-' + randomUUID().slice(0, 8), sockets = new Set();
let stage = 'prepare', browser, started = false, cert, probe;
const facts = {taskId: 'N03-05', apiImage: api, adminImage: admin, publicRelease: false, scenarios: []};
const run = (command, values, options = {}) => execute(stage, command, values, options);
const cancelled = () => {for (const socket of sockets) socket.close(); void browser?.close().catch(() => {});};
signal.addEventListener('abort', cancelled, {once: true});
const portServer = net.createServer();
await new Promise((ok, no) => {portServer.once('error', no); portServer.listen(0, '127.0.0.1', ok);});
const port = portServer.address().port; await new Promise(ok => portServer.close(ok));
const origin = 'https://localhost:' + port, values = {IMAGE_API: api, IMAGE_ADMIN: admin, IMAGE_ORIGIN: origin, IMAGE_TLS_PORT: String(port),
  IMAGE_CADDYFILE: resolve(contextRoot, 'infra/caddy/AdminImage.Caddyfile'), IMAGE_TLS_CERT: resolve(directory, 'cert.pem'), IMAGE_TLS_KEY: resolve(directory, 'key.pem'),
  IMAGE_DB_PASSWORD: randomBytes(24).toString('base64url'), IMAGE_SESSION_SECRET: randomBytes(48).toString('base64url'),
  IMAGE_ADMIN_API_ORIGIN: 'http://api:4300', IMAGE_ADMIN_ORIGIN: origin, IMAGE_OPERATOR_KEY: randomBytes(32).toString('hex'), IMAGE_METRICS_TOKEN: randomBytes(32).toString('hex')};
values.IMAGE_ADMIN_METRICS_TOKEN = values.IMAGE_METRICS_TOKEN;
const envFile = resolve(directory, '.env.image'), composeFile = resolve(contextRoot, 'infra/compose/admin-image-check.yml');
const compose = (command, options = {}) => run('docker', ['compose', '--project-name', project, '--env-file', envFile, '-f', composeFile, ...command], {env: values, ...options});
function request(path, method = 'GET', headers = {}, body) {
  return new Promise((ok, no) => {
    const req = https.request({hostname: '127.0.0.1', servername: 'localhost', port, path, method, ca: cert, signal, headers: {host: 'localhost:' + port, ...headers}}, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => ok({status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks)}));
    });
    req.on('error', no); req.setTimeout(8000, () => req.destroy(Error('TLS request deadline'))); if (body) req.write(body); req.end();
  });
}
function range(cidr) {const [ip, prefix] = cidr.split('/'); if (ip.includes(':') || !/^\d+$/.test(prefix)) return null; const number = ip.split('.').reduce((value, part) => value * 256 + Number(part), 0), size = 2 ** (32 - Number(prefix)); return [Math.floor(number / size) * size, Math.floor(number / size) * size + size - 1];}
try {
  stage = 'network'; const networkIds = (await run('docker', ['network', 'ls', '-q'])).stdout.trim().split(/\s+/).filter(Boolean), existing = [];
  if (networkIds.length) for (const line of (await run('docker', ['network', 'inspect', '--format', '{{json .IPAM.Config}}', ...networkIds])).stdout.trim().split('\n')) for (const config of JSON.parse(line) ?? []) if (config.Subnet) {const value = range(config.Subnet); if (value) existing.push(value);}
  const routes = await run('ip', ['-j', '-4', 'route'], {allowFailure: true});
  if (routes.code === 0) for (const route of JSON.parse(routes.stdout)) if (route.dst?.includes('/')) {const value = range(route.dst); if (value) existing.push(value);}
  const start = randomBytes(1)[0];
  for (const family of ['172.29', '172.30', '172.31', '10.243']) {
    for (let n = 0; n < 256; n++) {const byte = (start + n) % 256, subnet = family + '.' + byte + '.0/24', candidate = range(subnet); if (existing.every(value => candidate[1] < value[0] || candidate[0] > value[1])) {values.IMAGE_SUBNET = subnet; values.IMAGE_DYNAMIC_RANGE = family + '.' + byte + '.128/25'; values.IMAGE_PROXY_IP = family + '.' + byte + '.2'; break;}}
    if (values.IMAGE_SUBNET) break;
  }
  assert(values.IMAGE_SUBNET, 'No isolated fixture subnet available');
  await writeFile(envFile, Object.entries(values).map(([key, value]) => key + '=' + value).join('\n') + '\n', {mode: 0o600, flag: 'wx'});
  stage = 'certificate'; await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', values.IMAGE_TLS_KEY, '-out', values.IMAGE_TLS_CERT, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1']);
  cert = await readFile(values.IMAGE_TLS_CERT);
  stage = 'compose'; await compose(['config', '--quiet']); started = true; await compose(['up', '-d', '--wait', '--wait-timeout', '180']);
  for (const service of ['api', 'admin', 'db']) {
    const container = (await compose(['ps', '-q', service])).stdout.trim(); assert(container);
    const fields = '{"ports":{{json .NetworkSettings.Ports}},"user":{{json .Config.User}},"readonly":{{json .HostConfig.ReadonlyRootfs}}}';
    const metadata = JSON.parse((await run('docker', ['inspect', '--format', fields, container])).stdout);
    assert(Object.values(metadata.ports ?? {}).every(value => value === null));
    if (service !== 'db') assert(metadata.user === 'node' && metadata.readonly);
  }
  const privateEnv = "for(const key of ['DATABASE_URL','SESSION_SECRET','OPERATOR_AUTH_KEY','SAFETY_EVIDENCE_KEY','OPERATOR_TELEMETRY_TOKEN'])if(process.env[key]!==undefined)throw Error('Backend credential leaked');console.log('Backend credentials absent');";
  await compose(['exec','-T','admin','node','-e',privateEnv]);
  facts.scenarios.push({id:'ADMIN-01',privateApiAdminDatabase:true,nonrootReadonlyApps:true,backendCredentialsAbsent:true});
  stage='tls-and-denials';
  const first=await request('/'),second=await request('/');assert.equal(first.status,200);
  for(const response of [first,second]){
    assert(String(response.headers['cache-control']).includes('no-store'));assert.equal(response.headers['x-frame-options'],'DENY');assert.equal(response.headers['referrer-policy'],'no-referrer');
    const csp=String(response.headers['content-security-policy']);assert(csp.includes("'strict-dynamic'"));assert(!csp.includes("'unsafe-inline'")&&!csp.includes("'unsafe-eval'"));
    const nonce=csp.match(/'nonce-([^']+)'/)?.[1];assert(nonce);
    const scripts=[...response.body.toString().matchAll(/<script\b([^>]*)>/g)];assert(scripts.length>0&&scripts.every(match=>match[1].includes('nonce="'+nonce+'"')));
  }
  assert.notEqual(first.headers['content-security-policy'],second.headers['content-security-policy']);
  assert.equal((await request('/api/admin/session')).status,401);assert.equal((await request('/api/admin/audit')).status,401);assert.equal((await request('/api/admin/metrics?view=summary&range=current')).status,401);
  for(const path of ['/v1/operator/session','/v1/session/guest','/internal/telemetry','/socket.io/','/health/ready'])assert.equal((await request(path)).status,404);
  facts.scenarios.push({id:'ADMIN-02',localCertificateVerified:true,freshNoncesAndAllScriptsNonced:true,noUnsafeInlineOrEval:true,privateHeaders:true,unauthenticatedDenied:true,backendRoutesNotExposed:true});
  stage='operator-bootstrap';
  // Fixed, synthetic test credentials only. Bootstrap uses the actual image CLI,
  // owner-only files on tmpfs, and never returns recovery material to this runner.
  const password='synthetic-admin-image-password-only',factor='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const bootstrap="const {writeFile,rm}=await import('node:fs/promises');const {execFileSync}=await import('node:child_process');const {totp}=await import('./dist/identity/operator-crypto.js');const at=Date.now();await writeFile('/tmp/operator-input.json',JSON.stringify({password:'synthetic-admin-image-password-only',totpSecret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',code:totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',at)}),{mode:0o600,flag:'wx'});try{execFileSync('node',['dist/operator-bootstrap.js','/tmp/operator-input.json','/tmp/operator-output.json'],{stdio:'pipe'});console.log(JSON.stringify({counter:Math.floor(at/30000),cli:true}));}finally{await rm('/tmp/operator-input.json',{force:true});await rm('/tmp/operator-output.json',{force:true});}";
  let counter=JSON.parse((await compose(['exec','-T','api','node','--input-type=module','-e',bootstrap])).stdout).counter;
  async function nextCode(){while(Math.floor(Date.now()/30000)<=counter){if(signal.aborted)throw Error('Cancelled');await new Promise(ok=>setTimeout(ok,250));}counter=Math.floor(Date.now()/30000);const bytes=Buffer.alloc(8);bytes.writeBigUInt64BE(BigInt(counter));const hmac=createHmac('sha1',Buffer.from('12345678901234567890')).update(bytes).digest(),offset=hmac[hmac.length-1]&15;return String((hmac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
  assert.equal(factor,'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  const code=await nextCode(),spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
  browser=await chromium.launch({args:['--ignore-certificate-errors-spki-list='+spki]});
  let cookies,session;
  const outcomes=[];
  for(const profile of [{name:'desktop',viewport:{width:1280,height:800}},{name:'mobile',viewport:{width:360,height:800},isMobile:true}]){
    const context=await browser.newContext({baseURL:origin,viewport:profile.viewport,isMobile:profile.isMobile??false});context.setDefaultTimeout(15000);if(cookies)await context.addCookies(cookies);
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.name));await page.goto('/');
    if(!cookies){await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Authenticator code').fill(code);await page.getByRole('button',{name:'Sign in',exact:true}).click();}
    await expect(page.getByRole('heading',{name:'City at a glance'})).toBeVisible();
    await page.getByRole('button',{name:'Refresh snapshot'}).click();await expect(page.getByText('Fresh observation',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Audit trail',exact:true}).click();await page.getByRole('button',{name:'Load audit'}).click();await expect(page.getByRole('cell',{name:'bootstrap',exact:true})).toBeVisible();
    cookies=await context.cookies(origin);const cookie=cookies.find(value=>value.name==='__Host-city_operator');assert(cookie?.secure&&cookie.httpOnly&&cookie.sameSite==='Strict'&&cookie.path==='/');assert(!(await page.evaluate(()=>document.cookie)).includes('__Host-city_operator'));
    session=await page.evaluate(async()=>(await fetch('/api/admin/session')).json());assert(/^[a-f0-9]{64}$/.test(session.csrfToken));
    assert(await page.locator('link[rel=stylesheet]').count()>0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));assert.deepEqual(errors,[]);
    await page.screenshot({path:resolve(directory,'admin-'+profile.name+'.png'),fullPage:true});outcomes.push({profile:profile.name,hydrated:true,actualMfaSession:true,freshMetrics:true,audit:true,secureHttpOnlyCookie:true,noHorizontalOverflow:true});await context.close();
  }
  facts.scenarios.push({id:'ADMIN-03',outOfBandImageCliBootstrap:true,otpReplayWindowUnmodified:true,browserProfiles:outcomes,physicalDevice:false});
  stage='operator-boundary';
  const cookie=()=> '__Host-city_operator='+cookies.find(value=>value.name==='__Host-city_operator').value;
  const jsonHeaders=()=>({origin,cookie:cookie(),'content-type':'application/json','x-csrf-token':session.csrfToken});
  assert.equal((await request('/api/admin/logout','POST',{...jsonHeaders(),origin:'https://attacker.invalid'},'{}')).status,403);
  assert.equal((await request('/api/admin/logout','POST',{...jsonHeaders(),'x-csrf-token':'0'.repeat(64)},'{}')).status,403);
  assert.equal((await request('/api/admin/session','GET',{cookie:'__Host-city_session='+'a'.repeat(64),authorization:'Bearer '+values.IMAGE_METRICS_TOKEN})).status,401);
  assert.equal((await request('/api/admin/metrics?query=up','GET',{cookie:cookie()})).status,400);
  assert.equal((await request('/api/admin/unknown','POST',jsonHeaders(),'{}')).status,400);
  assert.equal((await request('/api/admin/session','GET',{cookie:cookie()})).status,200);
  facts.scenarios.push({id:'ADMIN-04',wrongOriginAndCsrfDenied:true,playerAndServiceCredentialsDenied:true,arbitraryQueriesAndActionsDenied:true,operatorStillUsable:true});
  stage='step-up';
  const oldCookie=cookie(),stepped=await request('/api/admin/step-up','POST',jsonHeaders(),JSON.stringify({password,code:await nextCode()}));assert.equal(stepped.status,200);session=JSON.parse(stepped.body);
  const rotated=stepped.headers['set-cookie'];assert.equal(rotated.length,1);const value=rotated[0].split(';')[0].split('=')[1];assert.notEqual('__Host-city_operator='+value,oldCookie);cookies.find(value=>value.name==='__Host-city_operator').value=value;
  assert.equal((await request('/api/admin/session','GET',{cookie:oldCookie})).status,401);assert.equal((await request('/api/admin/audit','GET',{cookie:cookie()})).status,200);
  facts.scenarios.push({id:'ADMIN-05',actualPasswordTotpStepUp:true,cookieRotated:true,previousSessionDenied:true,auditUsable:true});
  stage='runtime-switch';await browser.close();browser=undefined;
  values.IMAGE_ADMIN_API_ORIGIN='http://operator-api:4300';values.IMAGE_ADMIN_ORIGIN='https://runtime-admin.invalid';values.IMAGE_ADMIN_METRICS_TOKEN='0'.repeat(64);
  await compose(['up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','60','admin']);
  const current=(await compose(['ps','-q','admin'])).stdout.trim();assert.equal((await run('docker',['inspect','--format','{{.Image}}',current])).stdout.trim(),admin);
  const unknown=await request('/api/admin/metrics?view=summary&range=current','GET',{cookie:cookie()});assert.equal(unknown.status,200);const observation=JSON.parse(unknown.body);assert.equal(observation.status,'UNKNOWN');assert(Object.values(observation.values).every(value=>value===null));
  assert.equal((await request('/api/admin/logout','POST',jsonHeaders(),'{}')).status,403);
  // The frontend origin changed, while the API still trusts the original one.
  // A matching new Origin reaches typed-body validation; neither side's guard is relaxed.
  assert.equal((await request('/api/admin/login','POST',{'content-type':'application/json',origin:values.IMAGE_ADMIN_ORIGIN},'{}')).status,400);
  assert.equal((await request('/api/admin/revoke-all','POST',{...jsonHeaders(),origin:values.IMAGE_ADMIN_ORIGIN},'{}')).status,403);
  values.IMAGE_ADMIN_ORIGIN=origin;
  await compose(['up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','60','admin']);
  assert.equal((await request('/api/admin/revoke-all','POST',jsonHeaders(),'{}')).status,200);assert.equal((await request('/api/admin/session','GET',{cookie:cookie()})).status,401);
  await compose(['exec','-T','api','node','-e',"fetch('http://127.0.0.1:4300/health/ready').then(r=>{if(!r.ok)throw Error('API affected');console.log('API remains ready');})"]);
  facts.scenarios.push({id:'ADMIN-06',sameImageAfterRuntimeRestart:true,newApiAliasAndOriginEffective:true,uncoordinatedApiOriginDenied:true,wrongMetricsCredentialUnknownNotZero:true,revocationAfterOriginalOriginRestored:true,oldSessionDenied:true,apiRemainsReady:true});
  assert(!signal.aborted);facts.result='PASS';
} catch (error) {facts.result = 'FAIL'; facts.failedStage = stage; facts.error = error.message; process.exitCode = 1;}
finally {
  stage = 'cleanup'; for (const socket of sockets) socket.close(); await browser?.close().catch(() => {});
  let cleaned = true;
  if (probe) {const removed = await run('docker', ['rm', '--force', probe], {allowFailure: true, ignoreCancellation: true, timeout: 10000}); if (removed.code !== 0 && !/No such container/.test(removed.stderr)) cleaned = false;}
  if (started) {assert(project.startsWith('virtual-city-admin-image-')); const removed = await compose(['down', '--volumes', '--remove-orphans', '--timeout', '5'], {allowFailure: true, ignoreCancellation: true, timeout: 60000}); cleaned &&= removed.code === 0;}
  await Promise.all([envFile, values.IMAGE_TLS_CERT, values.IMAGE_TLS_KEY].map(path => rm(path, {force: true})));
  facts.cleanupComplete = cleaned; facts.generatedSecretsRemoved = true;
  if (!cleaned) {facts.result = 'FAIL'; process.exitCode = 1;}
  await save('commands.json', commands); await save('result.json', facts); signal.removeEventListener('abort', cancelled); dispose(); console.log(JSON.stringify(facts, null, 2));
}
