import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,lstat,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';

const root=resolve('artifacts/local-preview'),envFile=resolve(root,'runtime.env');
const [action,...args]=process.argv.slice(2);
const commands={up:['up','--build','-d','--wait','--wait-timeout','180'],stop:['stop'],down:['down'],status:['ps','-a'],logs:['logs','--tail','80'],config:['config','--quiet']};
export async function readPreviewEnvironment(file=envFile){
 const stat=await lstat(file);assert(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'Private environment required');
 const values=parseEnv(await readFile(file,'utf8'));
 const secrets=['PREVIEW_DB_PASSWORD','PREVIEW_SESSION_SECRET','PREVIEW_OPERATOR_KEY','PREVIEW_METRICS_TOKEN'].map(key=>values[key]);
 assert(secrets.every(value=>typeof value==='string'&&/^[a-f0-9]{64,96}$/.test(value))&&new Set(secrets).size===secrets.length,'Independent local secrets required');
 const ports=['PREVIEW_WEB_PORT','PREVIEW_ADMIN_PORT','PREVIEW_API_PORT','PREVIEW_NATIVE_PORT'].map(key=>values[key]);
 assert(ports.every(value=>/^\d{4,5}$/.test(value??'')&&Number(value)>1024&&Number(value)<=65535)&&new Set(ports).size===ports.length,'Distinct loopback ports required');
 return values;
}
async function main(){
 assert(args.length===0&&(action==='prepare'||Object.hasOwn(commands,action)),'Expected prepare/up/stop/down/status/logs/config');
 if(action==='prepare'){
  await mkdir(root,{recursive:true,mode:0o700});
  const directory=await lstat(root);assert(directory.isDirectory()&&!directory.isSymbolicLink()&&(directory.mode&0o077)===0,'Private local directory required');
  try{await readPreviewEnvironment();console.log('Existing local environment retained.');return;}catch(error){if(error.code!=='ENOENT')throw error;}
  const owned=execFileSync('docker',['ps','-aq','--filter','label=com.docker.compose.project=aetheria-preview'],{encoding:'utf8'}).trim();
  const volumes=execFileSync('docker',['volume','ls','-q','--filter','label=com.docker.compose.project=aetheria-preview'],{encoding:'utf8'}).trim();
  assert(!owned&&!volumes,'Existing preview resources require their original environment; refusing to replace secrets');
  const env={PREVIEW_DB_PASSWORD:randomBytes(32).toString('hex'),PREVIEW_SESSION_SECRET:randomBytes(48).toString('hex'),PREVIEW_OPERATOR_KEY:randomBytes(32).toString('hex'),PREVIEW_METRICS_TOKEN:randomBytes(32).toString('hex'),PREVIEW_WEB_PORT:'4800',PREVIEW_ADMIN_PORT:'4900',PREVIEW_API_PORT:'4700',PREVIEW_NATIVE_PORT:'4600'};
  await writeFile(envFile,Object.entries(env).map(([key,value])=>key+'='+value).join('\n')+'\n',{mode:0o600,flag:'wx'});
  console.log('Prepared private artifacts/local-preview/runtime.env. Existing database volumes are retained by down.');return;
 }
 const env=await readPreviewEnvironment();
 const code=await new Promise((done,fail)=>{const child=spawn('docker',['compose','--project-name','aetheria-preview','--env-file',envFile,'-f','infra/compose/preview.yml',...commands[action]],{stdio:'inherit',env:{...process.env,...env}});child.once('error',fail);child.once('exit',code=>done(code??1));});
 process.exitCode=code;
 if(action==='up'&&code===0)console.log('Local preview: http://127.0.0.1:'+env.PREVIEW_ADMIN_PORT+' | Portal: http://127.0.0.1:'+env.PREVIEW_WEB_PORT+' | Private console: http://127.0.0.1:'+env.PREVIEW_ADMIN_PORT+'/admin\nDevelopment only; registration/email and native gameplay remain unavailable.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main().catch(()=>{console.error('Local preview failed. Check Docker, private runtime.env, occupied ports and preview:logs; existing environments are never overwritten.');process.exitCode=1;});
