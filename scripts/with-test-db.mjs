import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { toolEnvironment,testEnvironment,validateTestDatabaseURL } from './test-environment.mjs';
import { validateDockerEndpoint } from './postgres-backup.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),project='virtual-city-test-'+randomUUID().slice(0,8),compose=['compose','-p',project,'-f','infra/compose/test.yml'];
const tools={...toolEnvironment(process.env),CITY_TEST_DB_PASSWORD:randomUUID()};
let active,started=false,cleaning=false,cancelled=0,phase='validate',stopping=Promise.resolve();
function killGroup(pid,signal){try{process.kill(-pid,signal);}catch{ /* Already exited group. */ }}
function stopGroup(pid){killGroup(pid,'SIGTERM');return new Promise(resolve=>{setTimeout(()=>{killGroup(pid,'SIGKILL');resolve();},5000);});}
function cancel(signal){if(cleaning||cancelled)return;cancelled=signal==='SIGINT'?130:143;if(active?.pid)stopping=stopGroup(active.pid);}
const interrupt=()=>cancel('SIGINT'),terminate=()=>cancel('SIGTERM');process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
async function run(command,commandArgs,env,capture=false){
 if(cancelled&&!cleaning)throw Error('Test run cancelled');
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: root, env,detached:true, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });active=child;
    let output = '';
    if (capture) child.stdout.on('data', chunk => { output += chunk; });
    child.once('error',()=>{active=undefined;reject(Error('Test subprocess unavailable'));});
    child.once('close',async code=>{active=undefined;if(cancelled&&!cleaning){await stopping;reject(Error('Test run cancelled'));}else if(code===0)resolve(output);else{if(child.pid)await stopGroup(child.pid);const error=Error('Test subprocess failed');error.exitCode=Number.isInteger(code)&&code>0?code:1;reject(error);}});
  });
}
try {
  if(!args.length)throw Error('Test command required');
  let url = process.env.TEST_DATABASE_URL?validateTestDatabaseURL(process.env.TEST_DATABASE_URL):undefined;
  if (!url) {
    if(tools.DOCKER_HOST)validateDockerEndpoint(tools.DOCKER_HOST);validateDockerEndpoint(JSON.parse(await run('docker',['context','inspect','--format','{{json .Endpoints.docker.Host}}'],tools,true)));
    phase='database-start';
    started = true;
    await run('docker', [...compose, 'up', '-d', '--wait','--wait-timeout','60'], tools);
    phase='mapping';const mapping = (await run('docker', [...compose, 'port', 'db', '5432'], tools, true)).trim(),matched=/^127\.0\.0\.1:(\d+)$/.exec(mapping);if(!matched)throw Error('Invalid owned DB mapping');
    url = validateTestDatabaseURL(`postgresql://virtual_city_test:${tools.CITY_TEST_DB_PASSWORD}@127.0.0.1:${matched[1]}/virtual_city_test`);
  }
  phase='command';await run(args[0], args.slice(1), testEnvironment(process.env,url,started?project:'external'));
} catch (error) {
  console.error('Test harness failed during '+phase+';no raw URL or configuration emitted');process.exitCode=cancelled||(Number.isInteger(error.exitCode)?error.exitCode:1);
} finally {
  if (started) {
    cleaning=true;phase='cleanup';try { await run('docker', [...compose, 'down', '--volumes','--timeout','5'], tools); }
    catch { console.error('Test database cleanup failed for ' + project); process.exitCode = 1; }
  }
  process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);
}
