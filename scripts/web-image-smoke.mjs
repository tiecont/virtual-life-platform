import assert from 'node:assert/strict';
import {randomBytes, randomUUID, createHash, X509Certificate} from 'node:crypto';
import {readFile, rm, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import https from 'node:https';
import net from 'node:net';
import {chromium, expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {imageTestTools, sha256} from './image-test-tools.mjs';

const args = process.argv.slice(2);
assert(args.length === 8 && args[0] === '--web' && args[2] === '--api' && args[4] === '--context' && args[6] === '--output');
const web = args[1], api = args[3], contextRoot = resolve(args[5]), directory = resolve(args[7]);
assert([web, api].every(value => /^sha256:[a-f0-9]{64}$/.test(value)));
assert(directory.startsWith(resolve('artifacts') + sep + 'image-web-') && directory.endsWith('/smoke'));
const {run: execute, save, commands, signal, dispose} = await imageTestTools(directory);
const project = 'virtual-city-web-image-' + randomUUID().slice(0, 8), sockets = new Set();
let stage = 'prepare', browser, started = false, cert, probe;
const facts = {taskId: 'N03-03', apiImage: api, webImage: web, publicRelease: false, scenarios: []};
const run = (command, values, options = {}) => execute(stage, command, values, options);
const cancelled = () => {for (const socket of sockets) socket.close(); void browser?.close().catch(() => {});};
signal.addEventListener('abort', cancelled, {once: true});
const portServer = net.createServer();
await new Promise((ok, no) => {portServer.once('error', no); portServer.listen(0, '127.0.0.1', ok);});
const port = portServer.address().port; await new Promise(ok => portServer.close(ok));
const origin = 'https://localhost:' + port, values = {IMAGE_API: api, IMAGE_WEB: web, IMAGE_ORIGIN: origin, IMAGE_TLS_PORT: String(port),
  IMAGE_CADDYFILE: resolve(contextRoot, 'infra/caddy/Caddyfile'), IMAGE_TLS_CERT: resolve(directory, 'cert.pem'), IMAGE_TLS_KEY: resolve(directory, 'key.pem'),
  IMAGE_DB_PASSWORD: randomBytes(24).toString('base64url'), IMAGE_SESSION_SECRET: randomBytes(48).toString('base64url'),
  IMAGE_WEB_API_ORIGIN: 'http://api:4300', IMAGE_WEB_SOCKET_ORIGIN: origin};
const envFile = resolve(directory, '.env.image'), composeFile = resolve(contextRoot, 'infra/compose/image-check.yml');
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
  for (const service of ['api', 'web', 'db']) {
    const container = (await compose(['ps', '-q', service])).stdout.trim(); assert(container);
    const fields = '{"ports":{{json .NetworkSettings.Ports}},"user":{{json .Config.User}},"readonly":{{json .HostConfig.ReadonlyRootfs}}}';
    const metadata = JSON.parse((await run('docker', ['inspect', '--format', fields, container])).stdout); assert(Object.values(metadata.ports ?? {}).every(value => value === null));
    if (service !== 'db') assert(metadata.user === 'node' && metadata.readonly);
  }
  assert.equal((await request('/health/ready')).status, 200);
  facts.scenarios.push({id: 'WEB-01', privateApiWebDatabase: true, nonrootReadonlyApps: true, localCertificateVerified: true});
  stage = 'runtime-http-proxy';
  const proxyScript = "const denied=['DATABASE_URL','SESSION_SECRET','SAFETY_EVIDENCE_KEY','OPERATOR_TELEMETRY_TOKEN'];if(denied.some(k=>process.env[k]!==undefined))throw Error('Backend environment leaked');const origin=process.env.PUBLIC_SOCKET_ORIGIN;const response=await fetch('http://127.0.0.1:3300/v1/session/guest',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),displayName:'Internal proxy visitor',avatarKey:'mint'})});if(response.status!==201)throw Error('Runtime HTTP proxy failed');const cookie=response.headers.get('set-cookie').split(';')[0],created=await response.json();const me=await fetch('http://127.0.0.1:3300/v1/me',{headers:{cookie}});if(me.status!==200||(await me.json()).profile.id!==created.profile.id)throw Error('Proxy identity changed');console.log(JSON.stringify({runtimeOriginProxy:true,methodBodyCookiePreserved:true,backendSecretsAbsent:true}));";
  facts.httpProxy = JSON.parse((await compose(['exec', '-T', 'web', 'node', '--input-type=module', '-e', proxyScript])).stdout);
  facts.scenarios.push({id: 'WEB-02', ...facts.httpProxy});
  stage = 'browser';
  const spki = createHash('sha256').update(new X509Certificate(cert).publicKey.export({type: 'spki', format: 'der'})).digest('base64');
  browser = await chromium.launch({args: ['--ignore-certificate-errors-spki-list=' + spki]});
  let cookies, identity, csrf;
  const browserOutcomes = [];
  for (const profile of [{name: 'desktop', viewport: {width: 1280, height: 800}}, {name: 'mobile', viewport: {width: 390, height: 844}, isMobile: true}]) {
    const context = await browser.newContext({baseURL: origin, viewport: profile.viewport, isMobile: profile.isMobile ?? false});
    context.setDefaultTimeout(10000); if (cookies) await context.addCookies(cookies);
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.name));
    await page.goto('/'); await expect(page.getByRole('heading', {level: 1})).toHaveText('A city beginswith a connection.'); await expect(page.getByRole('status')).toHaveText('Database connected · schema v1');
    const styles = await page.locator('link[rel=stylesheet]').count(); assert(styles > 0);
    await page.goto('/identity');
    if (!cookies) {
      await page.getByLabel('Display name').fill('Web image visitor');
      const created = page.waitForResponse(response => response.url().endsWith('/v1/session/guest') && response.request().method() === 'POST');
      await page.getByRole('button', {name: 'Create guest identity', exact: true}).click(); assert.equal((await created).status(), 201);
      await expect(page.getByRole('status')).toContainText('Guest identity created');
    }
    await page.reload(); await expect(page.getByRole('status')).toHaveText('Welcome, Web image visitor.');
    cookies = await context.cookies(origin); const session = cookies.find(cookie => cookie.name === '__Host-city_session'); assert(session?.secure && session.httpOnly && session.sameSite === 'Lax' && session.path === '/');
    assert(!(await page.evaluate(() => document.cookie)).includes('__Host-city_session'));
    const me = await page.evaluate(async () => (await fetch('/v1/me', {cache: 'no-store'})).json()); if (identity) assert.equal(me.profile.id, identity); identity = me.profile.id; csrf = me.csrfToken;
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)); assert.deepEqual(errors, []);
    await page.screenshot({path: resolve(directory, 'identity-' + profile.name + '.png'), fullPage: true});
    browserOutcomes.push({profile: profile.name, hydrated: true, secureHttpOnlyCookie: true, sameIdentity: true, noHorizontalOverflow: true, stylesLoaded: styles}); await context.close();
  }
  facts.scenarios.push({id: 'WEB-03', browserProfiles: browserOutcomes, physicalDevice: false});
  stage = 'assets'; const avatarPath = '/assets/avatars/7dee4545ce16/starter-v1.svg', avatar = await request(avatarPath); assert.equal(avatar.status, 200);
  assert(String(avatar.headers['cache-control']).includes('immutable')); assert.equal(sha256(avatar.body), sha256(await readFile(resolve(contextRoot, 'apps/portal-web/public' + avatarPath))));
  const html = (await request('/identity')).body.toString(), scriptPath = html.match(/src="([^"]*\/_next\/static\/[^"]+\.js)"/)?.[1]; assert(scriptPath);
  const script = await request(scriptPath.replaceAll('&amp;', '&')); assert.equal(script.status, 200); assert(String(script.headers['cache-control']).includes('immutable'));
  const privatePage = await request('/private/withdraw'); assert(String(privatePage.headers['cache-control']).includes('no-store')); assert.equal(privatePage.headers['referrer-policy'], 'no-referrer');
  assert(String(avatar.headers['content-security-policy']).includes("media-src 'none'"));
  facts.scenarios.push({id: 'WEB-04', publicAssetExactHash: true, avatarAndHashedJsImmutable: true, privateNoStoreNoReferrer: true, mediaCspRetained: true});
  stage = 'websocket'; const cookie = cookies.find(cookie => cookie.name === '__Host-city_session');
  async function socketConnection(allowed) {
    if (signal.aborted) throw Error('Web image check cancelled');
    const socket = io('https://127.0.0.1:' + port, {autoConnect: false, forceNew: true, reconnection: false, timeout: 5000, transports: ['websocket'], ca: cert, rejectUnauthorized: true,
      extraHeaders: {host: 'localhost:' + port, origin: allowed ? origin : 'https://attacker.invalid', cookie: '__Host-city_session=' + cookie.value}, auth: {schemaVersion: 1, csrfToken: csrf}}); sockets.add(socket);
    let cancel;
    const connected = await new Promise(ok => {cancel = () => {socket.close(); ok(false);}; signal.addEventListener('abort', cancel, {once: true}); socket.once('connect', () => ok(true)); socket.once('connect_error', () => ok(false)); socket.connect();});
    signal.removeEventListener('abort', cancel); if (signal.aborted) throw Error('Web image check cancelled'); return {socket, connected};
  }
  const denied = await socketConnection(false); assert.equal(denied.connected, false); denied.socket.close();
  const live = await socketConnection(true); assert.equal(live.connected, true); assert.equal((await live.socket.timeout(5000).emitWithAck('session.check', {schemaVersion: 1, requestId: randomUUID()})).ok, true); live.socket.close();
  const spoofed = await request('/v1/session/guest', 'POST', {origin: 'https://attacker.invalid', 'x-forwarded-for': '198.51.100.1', 'content-type': 'application/json'}, JSON.stringify({requestId: randomUUID(), displayName: 'Denied origin', avatarKey: 'mint'})); assert.equal(spoofed.status, 403);
  facts.scenarios.push({id: 'WEB-05', certificateVerifiedWss: true, actualSessionAck: true, wrongSocketAndHttpOriginsDenied: true});
  stage = 'origin-switch'; await browser.close(); browser = undefined;
  const probeName = project + '-origin-probe'; probe = probeName;
  await run('docker', ['run', '--detach', '--name', probeName, '--network', project + '_image', '--network-alias', 'origin-probe', '--read-only', '--cap-drop=ALL', '--user', 'node', '--entrypoint', 'node', 'node@sha256:582460f614631b59b824ac6020533b9bf339c7fdf3a6d7db31abb6b4065f0212', '-e', "require('node:http').createServer((q,s)=>{s.setHeader('content-type','application/json');s.end(JSON.stringify({probe:'runtime-switch',path:q.url}));}).listen(4800,'0.0.0.0');"]);
  values.IMAGE_WEB_API_ORIGIN = 'http://origin-probe:4800'; values.IMAGE_WEB_SOCKET_ORIGIN = 'https://socket-runtime.invalid';
  await compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '60', 'web']);
  const switched = JSON.parse((await compose(['exec', '-T', 'web', 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:3300/v1/runtime-origin-check?view=own');console.log(await r.text());"])).stdout);
  assert.deepEqual(switched, {probe: 'runtime-switch', path: '/v1/runtime-origin-check?view=own'});
  assert((await request('/worlds/park')).body.toString().includes('socket-runtime.invalid'));
  const currentWeb = (await compose(['ps', '-q', 'web'])).stdout.trim(); assert.equal((await run('docker', ['inspect', '--format', '{{.Image}}', currentWeb])).stdout.trim(), web);
  facts.scenarios.push({id: 'WEB-06', sameImageAfterRuntimeRestart: true, newApiOriginAndQueryUsed: true, newPublicSocketOriginRendered: true});
  assert(!signal.aborted); facts.result = 'PASS';
} catch (error) {facts.result = 'FAIL'; facts.failedStage = stage; facts.error = error.message; process.exitCode = 1;}
finally {
  stage = 'cleanup'; for (const socket of sockets) socket.close(); await browser?.close().catch(() => {});
  let cleaned = true;
  if (probe) {const removed = await run('docker', ['rm', '--force', probe], {allowFailure: true, ignoreCancellation: true, timeout: 10000}); if (removed.code !== 0 && !/No such container/.test(removed.stderr)) cleaned = false;}
  if (started) {assert(project.startsWith('virtual-city-web-image-')); const removed = await compose(['down', '--volumes', '--remove-orphans', '--timeout', '5'], {allowFailure: true, ignoreCancellation: true, timeout: 60000}); cleaned &&= removed.code === 0;}
  await Promise.all([envFile, values.IMAGE_TLS_CERT, values.IMAGE_TLS_KEY].map(path => rm(path, {force: true})));
  facts.cleanupComplete = cleaned; facts.generatedSecretsRemoved = true;
  if (!cleaned) {facts.result = 'FAIL'; process.exitCode = 1;}
  await save('commands.json', commands); await save('result.json', facts); signal.removeEventListener('abort', cancelled); dispose(); console.log(JSON.stringify(facts, null, 2));
}
