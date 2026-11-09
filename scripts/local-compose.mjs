import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import net from 'node:net';
import https from 'node:https';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const composeFile = resolve('infra/compose/local.yml');
export const defaultRoot = resolve('artifacts/local-docker');
export function command(program, args) {
  return execFileSync(program, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000, maxBuffer: 4 * 1024 * 1024});
}
export function compose(root, args) {
  return command('docker', ['compose', '--env-file', resolve(root, 'runtime.env'), '-f', composeFile, ...args]);
}
function range(cidr) {
  const [ip, bits] = cidr.split('/');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^\d+$/.test(bits)) return null;
  const value = ip.split('.').reduce((n, part) => n * 256 + Number(part), 0), size = 2 ** (32 - Number(bits));
  return [Math.floor(value / size) * size, Math.floor(value / size) * size + size - 1];
}
function freeSubnet() {
  const ids = command('docker', ['network', 'ls', '-q']).trim().split(/\s+/).filter(Boolean), used = [];
  if (ids.length) for (const line of command('docker', ['network', 'inspect', '--format', '{{json .IPAM.Config}}', ...ids]).trim().split('\n')) {
    for (const config of JSON.parse(line) ?? []) if (config.Subnet) {const entry = range(config.Subnet); if (entry) used.push(entry);}
  }
  // Host routes, including VPN routes, count as occupied too. Fail if inventory fails.
  for (const route of JSON.parse(command('ip', ['-j', '-4', 'route']))) if (route.dst?.includes('/')) {
    const entry = range(route.dst); if (entry) used.push(entry);
  }
  for (const family of ['172.29', '172.30', '172.31', '10.243']) for (let n = 0; n < 256; n++) {
    const prefix = family + '.' + n, subnet = prefix + '.0/24', entry = range(subnet);
    if (used.every(other => entry[1] < other[0] || entry[0] > other[1])) return {subnet, dynamic: prefix + '.128/25', proxy: prefix + '.2'};
  }
  throw Error('No nonconflicting local subnet available');
}
export async function prepareLocal({root = defaultRoot, api, web, name = 'vc', port = 3443}) {
  assert(/^[a-z][a-z0-9-]{1,15}$/.test(name));
  assert(Number.isSafeInteger(port) && port > 1024 && port <= 65535);
  assert([api, web].every(image => /^sha256:[a-f0-9]{64}$/.test(image)), 'Use tested immutable local image IDs');
  const inspected = JSON.parse(command('docker', ['image', 'inspect', api, web]));
  const revisions = inspected.map(image => image.Config.Labels?.['org.opencontainers.image.revision']);
  assert(revisions.every(value => /^[a-f0-9]{40}$/.test(value)) && revisions[0] === revisions[1], 'API/web source revisions differ');
  assert.equal(inspected[0].Config.Labels?.['org.opencontainers.image.title'], 'vlp-api');
  assert.equal(inspected[1].Config.Labels?.['org.opencontainers.image.title'], 'vlp-web');
  assert(inspected.every(image => image.Config.User === 'node'));
  const names = new Set(command('docker', ['ps', '-a', '--format', '{{.Names}}']).trim().split('\n'));
  for (const service of ['db', 'migrate', 'api', 'web', 'edge']) assert(!names.has(name + '-' + service), 'Container name already owned; choose another prefix');
  const volumes = command('docker', ['volume', 'ls', '--format', '{{.Name}}']).trim().split('\n');
  assert(!volumes.includes(name + '_data'), 'Retained database already exists; restore its original private environment');
  const server = net.createServer();
  await new Promise((ok, no) => {server.once('error', no); server.listen(port, '127.0.0.1', ok);});
  await new Promise(ok => server.close(ok));
  const network = freeSubnet();
  root = resolve(root); assert(root.startsWith(resolve('artifacts') + '/'), 'Local secrets must stay in ignored artifacts');
  await mkdir(root, {mode: 0o700}); // Never replace an existing environment/database identity.
  const tls = resolve(root, 'tls'); await mkdir(tls, {mode: 0o700});
  command('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', resolve(tls, 'key.pem'), '-out', resolve(tls, 'cert.pem'), '-days', '90', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1']);
  await chmod(resolve(tls, 'key.pem'), 0o600);
  const environment = {VC_NAME: name, VC_PORT: String(port), VC_UID: String(process.getuid()), VC_GID: String(process.getgid()), VC_API_IMAGE: api, VC_WEB_IMAGE: web, VC_DB_PASSWORD: randomBytes(32).toString('hex'),
    VC_SESSION_SECRET: randomBytes(48).toString('hex'), VC_SUBNET: network.subnet, VC_DYNAMIC_RANGE: network.dynamic, VC_PROXY_IP: network.proxy, VC_TLS_DIRECTORY: tls};
  assert(Object.values(environment).every(value => !/[\r\n$#'"\s]/.test(value)), 'Unsupported local environment path');
  await writeFile(resolve(root, 'runtime.env'), Object.entries(environment).map(([key, value]) => key + '=' + value).join('\n') + '\n', {mode: 0o600, flag: 'wx'});
  const facts = {sourceRevision: revisions[0], api, web, name, port, origin: 'https://localhost:' + port, publicRelease: false};
  await writeFile(resolve(root, 'selection.json'), JSON.stringify(facts, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  compose(root, ['config', '--quiet']);
  return facts;
}
async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'prepare') {
    assert(args.length === 2 && ['--facts', '--bundle'].includes(args[0]), 'prepare --facts <web image facts> OR --bundle <verified bundle>');
    const input = JSON.parse(await readFile(args[1], 'utf8')); let api, web;
    if (args[0] === '--facts') {assert(input.result === 'PASS' && input.api.actualArtifactAndSixScenarioChecks === 'PASS'); api = input.api.image.id; web = input.image.id;}
    else {assert(input.schemaVersion === 2); api = input.images.api.id; web = input.images.web.id;}
    console.log(JSON.stringify(await prepareLocal({api, web})));
  } else {
    assert(args.length === 0 && ['up', 'stop', 'down', 'status', 'config'].includes(action), 'Expected prepare/up/stop/down/status/config');
    const commands = {up: ['up', '-d', '--wait', '--wait-timeout', '180'], stop: ['stop'], down: ['down'], status: ['ps', '-a'], config: ['config', '--quiet']};
    console.log(compose(defaultRoot, commands[action]));
    if (action === 'up') {
      const selection = JSON.parse(await readFile(resolve(defaultRoot, 'selection.json')));
      const ca = await readFile(resolve(defaultRoot, 'tls/cert.pem'));
      await new Promise((ok, no) => {
        const request = https.get(selection.origin + '/health/ready', {ca}, response => {
          response.resume(); response.on('end', () => response.statusCode === 200 ? ok() : no(Error('TLS readiness unavailable')));
        });
        request.on('error', no); request.setTimeout(10000, () => request.destroy(Error('TLS readiness deadline')));
      });
      console.log(selection.origin);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(() => {console.error('Local Compose operation failed. Check Docker, selected image facts, port/name conflicts and private artifacts/local-docker; existing environments are never overwritten.'); process.exitCode = 1;});
}
