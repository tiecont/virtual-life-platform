import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID, X509Certificate} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import https from 'node:https';
import net from 'node:net';
import {resolve} from 'node:path';
import {chromium, expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {command, compose, prepareLocal} from './local-compose.mjs';
import {sourceSchemaPolicy} from './source-schema-policy.mjs';

const [kind, file] = process.argv.slice(2);
assert(process.argv.length === 4 && ['--facts', '--bundle'].includes(kind));
const input = JSON.parse(await readFile(file, 'utf8'));
if (kind === '--facts') assert(input.result === 'PASS' && input.api.actualArtifactAndSixScenarioChecks === 'PASS');
else assert.equal(input.schemaVersion, 2);
const api = kind === '--facts' ? input.api.image.id : input.images.api.id, web = kind === '--facts' ? input.image.id : input.images.web.id;
const id = randomUUID().slice(0, 8), root = resolve('artifacts/compose-smoke-' + id), name = 'vct-' + id;
const server = net.createServer(); await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const port = server.address().port; await new Promise(ok => server.close(ok));
let stage = 'prepare', prepared = false, browser, socket;
const facts = {taskIds: ['N03-02', 'N03-03', 'N03-04'], publicRelease: false, scenarios: []};
try {
  const selection = await prepareLocal({root, api, web, name, port}); prepared = true;
  Object.assign(facts, selection);
  const cert = await readFile(resolve(root, 'tls/cert.pem'));
  function request(path, options = {}) {
    return new Promise((ok, no) => {
      // Each probe owns a fresh transport: down/up intentionally destroys the
      // previous edge process, so do not reuse Node's pooled TLS connection.
      const req = https.request({hostname: '127.0.0.1', servername: 'localhost', port, path, ca: cert, agent: false, method: options.method ?? 'GET', headers: {host: 'localhost:' + port, ...options.headers}}, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => ok({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString()}));
      });
      req.on('error', no); req.setTimeout(10000, () => req.destroy(Error('HTTPS deadline'))); if (options.body) req.write(options.body); req.end();
    });
  }
  stage = 'up'; compose(root, ['up', '-d', '--wait', '--wait-timeout', '180']);
  for (const service of ['db', 'api', 'web', 'edge']) {
    const metadata = JSON.parse(command('docker', ['inspect', '--format', '{"ports":{{json .NetworkSettings.Ports}},"readonly":{{json .HostConfig.ReadonlyRootfs}},"user":{{json .Config.User}},"health":{{json .State.Health.Status}}}', name + '-' + service]));
    assert.equal(metadata.health, 'healthy');
    if (service !== 'edge') assert(Object.values(metadata.ports ?? {}).every(value => value === null));
    else {
      const published = Object.values(metadata.ports).flat().filter(Boolean);
      assert(published.length === 1 && published.every(binding => binding.HostIp === '127.0.0.1' && Number(binding.HostPort) === port));
    }
    if (['api', 'web'].includes(service)) assert(metadata.readonly && metadata.user === 'node');
  }
  assert.equal((await request('/health/ready')).status, 200);
  facts.scenarios.push('Healthy short-named services; only loopback TLS published; nonroot read-only apps');
  stage = 'migrations'; const expected = sourceSchemaPolicy(selection.sourceRevision);
  const count = Number(compose(root, ['exec', '-T', 'db', 'psql', '-U', 'vc', '-d', 'vc', '-tAc', 'SELECT count(*) FROM city_schema_migrations']));
  assert.equal(count, expected.minimumDatabaseMigrations);
  compose(root, ['run', '--rm', '--no-deps', 'migrate']);
  facts.migrations = count; facts.scenarios.push('Same API image migrator; exact source SQL count; idempotent rerun');
  stage = 'identity'; const origin = selection.origin;
  const guest = await request('/v1/session/guest', {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({requestId: randomUUID(), displayName: 'Compose visitor', avatarKey: 'mint'})});
  assert.equal(guest.status, 201);
  const created = JSON.parse(guest.body), cookieHeader = guest.headers['set-cookie'][0], cookie = cookieHeader.split(';')[0];
  assert(cookie.startsWith('__Host-city_session=')); assert(/; Secure/i.test(cookieHeader) && /; HttpOnly/i.test(cookieHeader));
  const me = await request('/v1/me', {headers: {cookie}}); assert.equal(me.status, 200);
  const identity = JSON.parse(me.body); assert.equal(identity.profile.id, created.profile.id);
  const denied = await request('/v1/session/guest', {method: 'POST', headers: {origin: 'https://attacker.invalid', 'content-type': 'application/json'}, body: JSON.stringify({requestId: randomUUID(), displayName: 'Denied', avatarKey: 'mint'})}); assert.equal(denied.status, 403);
  facts.scenarios.push('Real HTTPS guest/me; Secure HttpOnly session; wrong origin denied');
  stage = 'wss'; socket = io('https://127.0.0.1:' + port, {autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], timeout: 5000, ca: cert, rejectUnauthorized: true,
    extraHeaders: {host: 'localhost:' + port, origin, cookie}, auth: {schemaVersion: 1, csrfToken: identity.csrfToken}});
  await new Promise((ok, no) => {socket.once('connect', ok); socket.once('connect_error', no); socket.connect();});
  assert.equal((await socket.timeout(5000).emitWithAck('session.check', {schemaVersion: 1, requestId: randomUUID()})).ok, true); socket.close(); socket = undefined;
  facts.scenarios.push('Certificate-verified WSS and actual session acknowledgement');
  stage = 'browser'; const spki = createHash('sha256').update(new X509Certificate(cert).publicKey.export({type: 'spki', format: 'der'})).digest('base64');
  browser = await chromium.launch({args: ['--ignore-certificate-errors-spki-list=' + spki]});
  for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
    const page = await browser.newPage({viewport}); const errors = []; page.on('pageerror', error => errors.push(error.name));
    await page.goto(origin); await expect(page.getByRole('status')).toHaveText('Database connected · schema v1');
    assert(await page.locator('link[rel=stylesheet]').count() > 0); assert.deepEqual(errors, []);
    await page.screenshot({path: resolve(root, 'portal-' + viewport.width + '.png'), fullPage: true}); await page.close();
  }
  await browser.close(); browser = undefined; facts.scenarios.push('Real portal desktop/mobile browser render with CSS and readiness');
  stage = 'persistence'; compose(root, ['down']); compose(root, ['up', '-d', '--wait', '--wait-timeout', '180']);
  const recovered = await request('/v1/me', {headers: {cookie}}); assert.equal(recovered.status, 200); assert.equal(JSON.parse(recovered.body).profile.id, created.profile.id);
  facts.scenarios.push('Down/up preserves database and session identity; one room owner restarts');
  facts.result = 'PASS';
} catch (error) {facts.result = 'FAIL'; facts.failedStage = stage; facts.error = error.message; process.exitCode = 1;}
finally {
  socket?.close(); await browser?.close();
  if (prepared) {
    if (facts.result === 'FAIL') {
      try {
        const logs = spawnSync('docker', ['logs', '--tail', '40', name + '-edge'], {encoding: 'utf8', timeout: 5000});
        await writeFile(resolve(root, 'edge-failure.log'), logs.stdout + logs.stderr, {mode: 0o600, flag: 'wx'});
      } catch { /* Preserve other failure evidence if no edge exists. */ }
      try {facts.edgeHealth = JSON.parse(command('docker', ['inspect', '--format', '{{json .State.Health}}', name + '-edge']));} catch { /* The startup failure may precede edge creation. */ }
    }
    try {compose(root, ['down', '--volumes']); facts.cleanupComplete = true;} catch {facts.cleanupComplete = false; process.exitCode = 1;}
  }
  await mkdir(root, {recursive: true, mode: 0o700});
  await rm(resolve(root, 'runtime.env'), {force: true}); await rm(resolve(root, 'tls/key.pem'), {force: true});
  facts.generatedSecretsRemoved = true;
  await writeFile(resolve(root, 'result.json'), JSON.stringify(facts, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  console.log(JSON.stringify({...facts, artifacts: root}, null, 2));
}
