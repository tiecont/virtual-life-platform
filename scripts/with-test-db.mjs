import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolEnvironment,testEnvironment,validateTestDatabaseURL } from './test-environment.mjs';
import { validateDockerEndpoint } from './postgres-backup.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),project='aetheria-soulbound-test-'+randomUUID().slice(0,8),compose=['compose','-p',project,'-f','infra/compose/test.yml'];
const tools={...toolEnvironment(process.env),AETHERIA_TEST_DB_PASSWORD:randomUUID()};
let overrideDirectory,active,started=false,cleaning=false,cancelled=0,phase='validate',stopping=Promise.resolve();
function killGroup(pid,signal){try{process.kill(-pid,signal);}catch{ /* Already exited group. */ }}
function stopGroup(pid){killGroup(pid,'SIGTERM');return new Promise(resolve=>{setTimeout(()=>{killGroup(pid,'SIGKILL');resolve();},5000);});}
function cancel(signal){if(cleaning||cancelled)return;cancelled=signal==='SIGINT'?130:143;if(active?.pid)stopping=stopGroup(active.pid);}
const interrupt=()=>cancel('SIGINT'),terminate=()=>cancel('SIGTERM');process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
async function run(command,commandArgs,env,capture=false){
 if(cancelled&&!cleaning)throw Error('Test run cancelled');
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: root, env,detached:true, stdio: capture === 'stderr' ? ['ignore', 'inherit', 'pipe'] : capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });active=child;
    let output = '';
    if (capture === 'stderr') child.stderr.on('data', chunk => {
      process.stderr.write(chunk);
      output = (output + chunk).slice(-16384);
    });
    else if (capture) child.stdout.on('data', chunk => { output += chunk; });
    child.once('error',()=>{active=undefined;reject(Error('Test subprocess unavailable'));});
    child.once('close',async code=>{active=undefined;if(cancelled&&!cleaning){await stopping;reject(Error('Test run cancelled'));}else if(code===0)resolve(output);else{if(child.pid)await stopGroup(child.pid);const error=Error('Test subprocess failed');if(capture==='stderr')error.diagnostics=output;error.exitCode=Number.isInteger(code)&&code>0?code:1;reject(error);}});
  });
}
function ipv4Range(cidr) {
  const [address, prefix = '32'] = cidr.split('/');
  if (!isIPv4(address) || !/^([0-9]|[12][0-9]|3[0-2])$/.test(prefix)) return undefined;
  const number = address.split('.').reduce((result, octet) => result * 256 + Number(octet), 0);
  const size = 2 ** (32 - Number(prefix));
  const start = Math.floor(number / size) * size;
  return { start, end: start + size };
}

async function freeSubnet(attempted) {
  // Docker knows about disconnected networks as well as running bridges. Host
  // routes also exclude subnets reached through interfaces such as VPNs.
  const ids = (await run('docker', ['network', 'ls', '-q', '--no-trunc'], tools, true)).trim().split(/\s+/).filter(Boolean);
  const occupied = ids.length
    ? (await run('docker', ['network', 'inspect', '--format', '{{json .IPAM.Config}}', ...ids], tools, true))
        .trim().split('\n').flatMap(line => JSON.parse(line) ?? []).map(config => config.Subnet)
    : [];
  const routes = JSON.parse(await run('ip', ['-j', '-4', 'route', 'show', 'table', 'all'], tools, true));
  const ranges = [...attempted, ...occupied, ...routes.map(route => route.dst)]
    .filter(cidr => typeof cidr === 'string' && cidr !== '0.0.0.0/0')
    .map(ipv4Range).filter(Boolean).sort((a, b) => a.start - b.start);
  for (const pool of ['172.16.0.0/12', '192.168.0.0/16', '10.0.0.0/8'].map(ipv4Range)) {
    let start = pool.start;
    for (const range of ranges) {
      if (range.start >= start + 16) break;
      start = Math.max(start, Math.ceil(range.end / 16) * 16);
    }
    if (start + 16 <= pool.end) {
      const octets = [24, 16, 8, 0].map(shift => (start >>> shift) & 255);
      return octets.join('.') + '/28';
    }
  }
  throw Error('No non-overlapping private subnet available for the test database');
}

async function startDatabase() {
  const up = ['up', '-d', '--wait', '--wait-timeout', '60'];
  try {
    await run('docker', [...compose, ...up], tools, 'stderr');
    return;
  } catch (error) {
    if (!/all predefined address pools have been fully subnetted|could not find an available, non-overlapping IPv4 address pool among the defaults/i.test(error.diagnostics ?? '')) throw error;
  }
  console.error('Docker default address pools exhausted. Retrying with an isolated test subnet.');
  overrideDirectory = await mkdtemp(join(tmpdir(), 'aetheria-test-db-'));
  const override = join(overrideDirectory, 'network.json');

  const attempted = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const subnet = await freeSubnet(attempted);
    attempted.push(subnet);
    await writeFile(override, JSON.stringify({
      networks: { default: { driver: 'bridge', ipam: { config: [{ subnet }] } } }
    }), { mode: 0o600 });
    if (attempt === 0) compose.push('-f', override);
    try {
      await run('docker', [...compose, ...up], tools, 'stderr');
      return;
    } catch (error) {
      // Another concurrent run may have acquired the subnet since inspection.
      if (attempt === 3 || !/pool overlaps with other one on this address space/i.test(error.diagnostics ?? '')) throw error;
    }
  }
}

try {
  if(!args.length)throw Error('Test command required');
  let url = process.env.TEST_DATABASE_URL?validateTestDatabaseURL(process.env.TEST_DATABASE_URL):undefined;
  if (!url) {
    if(tools.DOCKER_HOST)validateDockerEndpoint(tools.DOCKER_HOST);validateDockerEndpoint(JSON.parse(await run('docker',['context','inspect','--format','{{json .Endpoints.docker.Host}}'],tools,true)));
    phase='database-start';
    started = true;
    await startDatabase();
    phase='mapping';const mapping = (await run('docker', [...compose, 'port', 'db', '5432'], tools, true)).trim(),matched=/^127\.0\.0\.1:(\d+)$/.exec(mapping);if(!matched)throw Error('Invalid owned DB mapping');
    url = validateTestDatabaseURL(`postgresql://aetheria_soulbound_test:${tools.AETHERIA_TEST_DB_PASSWORD}@127.0.0.1:${matched[1]}/aetheria_soulbound_test`);
  }
  phase='command';await run(args[0], args.slice(1), testEnvironment(process.env,url,started?project:'external'));
} catch (error) {
  console.error('Test harness failed during '+phase+';no raw URL or configuration emitted');process.exitCode=cancelled||(Number.isInteger(error.exitCode)?error.exitCode:1);
} finally {
  if (started) {
    cleaning=true;phase='cleanup';try { await run('docker', [...compose, 'down', '--volumes','--timeout','5'], tools); }
    catch { console.error('Test database cleanup failed for ' + project); process.exitCode = 1; }
  }
  if (overrideDirectory) {
    try { await rm(overrideDirectory, { recursive: true, force: true }); }
    catch { console.error('Test network override cleanup failed'); process.exitCode = 1; }
  }
  process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);
}
