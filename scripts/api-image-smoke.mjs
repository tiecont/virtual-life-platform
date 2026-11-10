import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {resolve, sep} from 'node:path';
import net from 'node:net';
import {Pool} from 'pg';
import {io} from 'socket.io-client';
import {OperationalObservationSchema,SystemObservationSchema} from '@virtual-city/contracts';
import {validateTestDatabaseURL} from './test-environment.mjs';
import {imageTestTools} from './image-test-tools.mjs';

const args = process.argv.slice(2);
assert(args.length === 4 && args[0] === '--image' && /^sha256:[a-f0-9]{64}$/.test(args[1]) && args[2] === '--output');
const image = args[1], directory = resolve(args[3]);
const expectedMigrations = JSON.parse((await import('node:child_process')).execFileSync('docker', ['run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', image, '-e', "console.log(require('node:fs').readdirSync('dist/shared/database/migrations').filter(n=>n.endsWith('.sql')).length)"], {encoding: 'utf8'}));
assert(Number.isSafeInteger(expectedMigrations) && expectedMigrations > 0);
assert(directory.startsWith(resolve('artifacts') + sep + 'image-api-') && directory.endsWith(sep + 'smoke'));
const {run: execute, save, commands, signal, dispose} = await imageTestTools(directory);
const id = randomUUID().slice(0, 8), owned = new Set(), origin = 'https://api-image.example.invalid';
const common = {NODE_ENV: 'production', HOST: '127.0.0.1', WEB_ORIGIN: origin, DATABASE_URL: validateTestDatabaseURL(process.env.TEST_DATABASE_URL), SESSION_SECRET: randomBytes(48).toString('base64url'), OPERATOR_TELEMETRY_TOKEN: randomBytes(32).toString('hex')};
const pool = new Pool({connectionString: common.DATABASE_URL, connectionTimeoutMillis: 2000, query_timeout: 2000});
const result = {image, migrationImage: image, publicRelease: false, scenarios: []};
let stage = 'prepare', socket;
const run = (command, values, options = {}) => execute(stage, command, values, {timeout: 30000, ...options});
const http = (url, options = {}) => fetch(url, {...options, signal: globalThis.AbortSignal.any([signal, globalThis.AbortSignal.timeout(5000)])});
const environment = values => Object.keys(values).flatMap(key => ['--env', key]);
const flags = ['--network', 'host', '--read-only', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--memory', '512m'];

async function port() {
  const server = net.createServer();
  await new Promise((ok, no) => {server.once('error', no); server.listen(0, '127.0.0.1', ok);});
  const value = server.address().port; await new Promise(ok => server.close(ok)); return value;
}
async function stop(name) {
  await run('docker', ['stop', '--time', '15', name]);
  const state = JSON.parse((await run('docker', ['inspect', '--format', '{{json .State}}', name])).stdout);
  assert.equal(state.ExitCode, 0, 'SIGTERM did not drain cleanly');
  await run('docker', ['rm', name]); owned.delete(name);
}
async function start() {
  const name = 'vlp-api-check-' + id + '-' + randomUUID().slice(0, 8), values = {...common, PORT: String(await port())};
  owned.add(name);
  await run('docker', ['run', '--detach', '--name', name, ...flags, ...environment(values), image], {env: values});
  const fields = '{"user":{{json .Config.User}},"readonly":{{json .HostConfig.ReadonlyRootfs}},"security":{{json .HostConfig.SecurityOpt}}}';
  const metadata = JSON.parse((await run('docker', ['inspect', '--format', fields, name])).stdout);
  assert(metadata.readonly && metadata.security.includes('no-new-privileges'));
  assert.equal(metadata.user, 'node');
  const url = 'http://127.0.0.1:' + values.PORT;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await http(url + '/health/live')).status === 200) return {name, url, ready: async () => (await http(url + '/health/ready')).status}; }
    catch { /* The owned API may still be starting. */ }
    if (signal.aborted) throw Error('Image check cancelled');
    await new Promise(ok => setTimeout(ok, 100));
  }
  await run('docker', ['logs', name], {allowFailure: true}); throw Error('API did not become live');
}
async function migrate(allowFailure = false) {
  const name = 'vlp-api-check-' + id + '-migration-' + randomUUID().slice(0, 8); owned.add(name);
  const value = await run('docker', ['run', '--rm', '--name', name, ...flags, ...environment(common), '--entrypoint', 'node', image, 'dist/shared/database/migrate.js'], {env: common, allowFailure});
  if (!signal.aborted) owned.delete(name); return value;
}
async function connect(runtime, cookie, identity) {
  const response = await http(runtime.url + '/v1/me', {headers: {cookie}}); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.profile.id, identity);
  const client = io(runtime.url, {autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], extraHeaders: {origin, cookie}, auth: {schemaVersion: 1, csrfToken: body.csrfToken}});
  let deadline, rejectPending;
  const abort = () => {clearTimeout(deadline); client.close(); rejectPending?.(Error('Image check cancelled'));};
  const cancellable = work => Promise.race([work, new Promise((_, reject) => {rejectPending = reject; if (signal.aborted) abort();})]);
  signal.addEventListener('abort', abort, {once: true});
  try {
    await cancellable(new Promise((ok, no) => {deadline = setTimeout(() => no(Error('Socket connect deadline')), 7000); client.once('connect', () => {clearTimeout(deadline); ok();}); client.once('connect_error', error => {clearTimeout(deadline); no(error);}); client.connect();}));
    assert.equal((await cancellable(client.timeout(5000).emitWithAck('session.check', {schemaVersion: 1, requestId: randomUUID()}))).ok, true);
    return client;
  } catch (error) { client.close(); throw error; }
  finally {clearTimeout(deadline); signal.removeEventListener('abort', abort);}
}
try {
  stage = 'missing-secret';
  const absent = Object.fromEntries(Object.entries(common).filter(([key]) => key !== 'SESSION_SECRET'));
  const missingSecret = await run('docker', ['run', '--rm', ...flags, ...environment(absent), image], {env: absent, allowFailure: true});
  assert.equal(missingSecret.code, 1); assert.match(missingSecret.stderr, /Platform startup failed/);
  result.scenarios.push({id: 'API-01', missingSecretDenied: true});
  stage = 'migrate'; await migrate(); await migrate();
  const history = (await pool.query('SELECT name,checksum FROM city_schema_migrations ORDER BY name')).rows;
  assert(history.length > 0); result.scenarios.push({id: 'API-02', emptyDatabaseAndRerun: true, migrations: history.length, sameImage: true});
  stage = 'identity-socket'; const api = await start(); assert.equal(await api.ready(), 200);
  const guest = await http(api.url + '/v1/session/guest', {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({requestId: randomUUID(), displayName: 'Image visitor', avatarKey: 'mint'})});
  assert.equal(guest.status, 201); const cookie = guest.headers.get('set-cookie').split(';')[0], identity = (await guest.json()).profile.id;
  socket = await connect(api, cookie, identity);
  const deniedObservation=await http(api.url+'/internal/observations',{headers:{cookie}});assert.equal(deniedObservation.status,404);
  const observed=await http(api.url+'/internal/observations',{headers:{authorization:'Bearer '+common.OPERATOR_TELEMETRY_TOKEN}});assert.equal(observed.status,200);const aggregate=OperationalObservationSchema.parse(await observed.json());assert.equal(aggregate.durations.window,'PROCESS_LIFETIME');assert.equal(aggregate.source,'platform-api');assert(aggregate.http.requests>0);assert.equal(aggregate.coverage.workerBacklog,'NOT_OBSERVED');assert(!JSON.stringify(aggregate).includes(common.OPERATOR_TELEMETRY_TOKEN));
  const systemResponse=await http(api.url+'/internal/system-state',{headers:{authorization:'Bearer '+common.OPERATOR_TELEMETRY_TOKEN}});assert.equal(systemResponse.status,200);const system=SystemObservationSchema.parse(await systemResponse.json());assert.equal(system.database.status,'OBSERVED');assert.equal(system.pool.status,'OBSERVED');assert.equal(system.versions.expectedMigrationCount,expectedMigrations);assert.equal((await http(api.url+'/internal/system-state',{headers:{cookie}})).status,404);
  result.scenarios.push({id: 'API-03', realHttpSessionAndSocket: true, readonlyNonrootRuntime: true,aggregateObservations:true,actualSystemSources:true,observationCookieDenied:true});
  stage = 'checksum'; const original = history[0];
  await pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1', [original.name, '0'.repeat(64)]);
  assert.equal(await api.ready(), 503); const rejected = await migrate(true); assert.equal(rejected.code, 1); assert.match(rejected.stderr, /City migration failed/);
  await pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1', [original.name, original.checksum]); assert.equal(await api.ready(), 200);
  result.scenarios.push({id: 'API-04', checksumReadinessAndMigratorDenied: true, recovered: true});
  stage = 'singleton'; const competitor = await start(); assert.equal(await competitor.ready(), 503); await stop(competitor.name); assert.equal(await api.ready(), 200);
  result.scenarios.push({id: 'API-05', competingOwnerDenied: true});
  stage = 'graceful-replacement'; await stop(api.name);
  for (let attempt = 0; socket.connected && attempt < 50; attempt++) await new Promise(ok => setTimeout(ok, 100));
  assert.equal(socket.connected, false); socket.close(); socket = undefined;
  const replacement = await start(); assert.equal(await replacement.ready(), 200); socket = await connect(replacement, cookie, identity); socket.close(); socket = undefined; await stop(replacement.name);
  result.scenarios.push({id: 'API-06', sigtermExitZero: true, socketDisconnected: true, ownerReleased: true, sameIdentityAfterReplacement: true});
  assert(!signal.aborted); result.result = 'PASS';
} catch (error) { result.result = 'FAIL'; result.failedStage = stage; result.error = error.message; process.exitCode = 1; }
finally {
  stage = 'cleanup';
  socket?.close();
  for (const name of owned) {
    const removed = await run('docker', ['rm', '--force', name], {allowFailure: true, ignoreCancellation: true, timeout: 4000});
    if (removed.code === 0 || /No such container|No such object/.test(removed.stderr)) owned.delete(name);
  }
  await pool.end(); result.cleanupComplete = owned.size === 0;
  if (!result.cleanupComplete) {result.result = 'FAIL'; process.exitCode = 1;}
  await save('commands.json', commands); await save('result.json', result); dispose();
  console.log(JSON.stringify(result, null, 2));
}
