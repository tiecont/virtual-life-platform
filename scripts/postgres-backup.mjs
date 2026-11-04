import { spawn } from 'node:child_process';
import { createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open,link,unlink,stat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { dirname,resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
const MAGIC=Buffer.from('VLCB1\0'),MAX=64*1024*1024,HEADER=MAGIC.length+12+16;
const fail=()=>Error('Private Postgres operation unavailable');
export function sealArchive(plain,key){
 if(!Buffer.isBuffer(plain)||plain.length>MAX||key.length!==32)throw fail();
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(MAGIC);
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),encrypted]);
}
export function openArchive(archive,key){
 if(!Buffer.isBuffer(archive)||archive.length<HEADER||archive.length>MAX+HEADER||key.length!==32||!archive.subarray(0,MAGIC.length).equals(MAGIC))throw fail();
 const decipher=createDecipheriv('aes-256-gcm',key,archive.subarray(MAGIC.length,MAGIC.length+12));decipher.setAAD(MAGIC);decipher.setAuthTag(archive.subarray(MAGIC.length+12,HEADER));
 return Buffer.concat([decipher.update(archive.subarray(HEADER)),decipher.final()]);
}
async function privateFile(path,max){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const info=await file.stat();if(!info.isFile()||info.size>max||(info.mode&0o077)!==0||info.uid!==process.getuid())throw fail();return await file.readFile();}finally{await file.close();}
}
async function keyFile(path){const raw=await privateFile(path,128),value=raw.toString('utf8').trim();raw.fill(0);if(!/^[a-f0-9]{64}$/.test(value))throw fail();return Buffer.from(value,'hex');}
export function validateTarget(project,service,restoring=false){
 if(!/^virtual-(?:life|city)-[a-z0-9-]{1,64}$/.test(project)||!/^[a-z][a-z0-9-]{0,31}$/.test(service))throw fail();
 if(restoring&&(!/^virtual-city-backup-test-[a-f0-9]{8}$/.test(project)||service!=='restore'))throw fail();
}
export function validateDockerEndpoint(host){if(typeof host!=='string'||!host.startsWith('unix:///'))throw fail();}
async function docker(args,input,max=MAX){
 return new Promise((ok,no)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});const chunks=[];let bytes=0,failed=false;
  const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},120000);
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>max){failed=true;child.kill('SIGKILL');}else chunks.push(chunk);});
  // SQL/dump errors may contain data. Never put raw diagnostics in the result.
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  child.once('error',()=>{clearTimeout(timer);no(fail());});child.once('close',code=>{clearTimeout(timer);if(code!==0||failed)no(fail());else ok(Buffer.concat(chunks));});
  child.stdin.end(input);
 });
}
async function container(project,service,restoring=false){
 validateTarget(project,service,restoring);
 if(process.env.DOCKER_HOST)validateDockerEndpoint(process.env.DOCKER_HOST);
 validateDockerEndpoint(JSON.parse((await docker(['context','inspect','--format','{{json .Endpoints.docker.Host}}'],undefined,4096)).toString()));
 const found=(await docker(['ps','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service='+service,'--format','{{.ID}}'],undefined,4096)).toString().trim().split('\n');if(found.length!==1||!/^[a-f0-9]{12,64}$/.test(found[0]))throw fail();
 const id=found[0],labels=JSON.parse((await docker(['inspect','--format','{{json .Config.Labels}}',id],undefined,16384)).toString());
 if(labels['com.docker.compose.project']!==project||labels['com.docker.compose.service']!==service)throw fail();
 if((await docker(['inspect','--format','{{.Config.Image}}',id],undefined,1024)).toString().trim()!=='postgres:17.7-alpine')throw fail();
 return id;
}
const postgres=(id,tool,args,input)=>docker(['exec','-i','--env','PGOPTIONS=-c statement_timeout=60000 -c lock_timeout=5000',id,'timeout','-s','TERM','-k','2','110','sh','-c','exec "$@" -U "$POSTGRES_USER" -d "$POSTGRES_DB"','sh',tool,...args],input);
async function sql(id,text){return JSON.parse((await postgres(id,'psql',['--no-psqlrc','--no-password','--set','ON_ERROR_STOP=1','--tuples-only','--no-align','--command',text])).toString().trim());}
async function exclusiveArchive(output,archive){
 const path=resolve(output),parent=await stat(dirname(path));if(!parent.isDirectory()||(parent.mode&0o077)!==0||parent.uid!==process.getuid())throw fail();
 const pending=path+'.partial-'+randomUUID();
 try{const file=await open(pending,'wx',0o600);try{await file.writeFile(archive);await file.sync();}finally{await file.close();}await link(pending,path);const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}}finally{await unlink(pending).catch(()=>{});}
}
export async function backupPostgres({project,service='db',keyPath,output}){
 const started=performance.now(),key=await keyFile(keyPath);let plain;
 try{
  const id=await container(project,service);plain=await postgres(id,'pg_dump',['--no-password','--format=custom','--no-owner','--no-privileges','--lock-wait-timeout=5000']);if(!plain.subarray(0,5).equals(Buffer.from('PGDMP')))throw fail();
  const archive=sealArchive(plain,key);await exclusiveArchive(output,archive);
  return {schemaVersion:1,operation:'backup',encrypted:true,bytes:archive.length,sha256:createHash('sha256').update(archive).digest('hex'),durationMs:performance.now()-started,maximumPlaintextBytes:MAX};
 }finally{key.fill(0);plain?.fill(0);}
}
export async function restorePostgres({project,service='restore',keyPath,input}){
 const started=performance.now();validateTarget(project,service,true);const key=await keyFile(keyPath);let plain;
 try{
  // Authentication finishes before container lookup,emptiness check or SQL.
  plain=openArchive(await privateFile(input,MAX+HEADER),key);if(!plain.subarray(0,5).equals(Buffer.from('PGDMP')))throw fail();
  const id=await container(project,service,true),before=await sql(id,"SELECT json_build_object('database',current_database(),'objects',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')+(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')+(SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'))+(SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')+(SELECT count(*) FROM pg_extension WHERE extname<>'plpgsql'))");
  if(before.database!=='virtual_city_restore_test'||before.objects!==0)throw fail();
  await postgres(id,'pg_restore',['--no-password','--single-transaction','--exit-on-error','--no-owner','--no-privileges'],plain);
  return {schemaVersion:1,operation:'restore',authenticatedBeforeSQL:true,emptyDisposableTarget:true,singleTransaction:true,durationMs:performance.now()-started};
 }finally{key.fill(0);plain?.fill(0);}
}
export function diskObservation(raw){
 const fields=raw.trim().split('\n').at(-1).trim().split(/\s+/),[total,used,available]=fields.slice(1,4).map(Number);
 if(fields.length<6||![total,used,available].every(n=>Number.isSafeInteger(n*1024)&&n>=0)||total===0||available>total||used>total)throw fail();
 return {totalBytes:total*1024,availableBytes:available*1024,usedRatio:used/total};
}
export async function observePostgres({project,service='db'}){
 const id=await container(project,service),db=await sql(id,"SELECT json_build_object('databaseBytes',pg_database_size(current_database()),'databaseConnections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()),'databaseActiveConnections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active'),'serverConnections',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'),'connectionLimit',current_setting('max_connections')::int)");
 if(!Object.values(db).every(n=>Number.isSafeInteger(n)&&n>=0)||db.connectionLimit<1)throw fail();
 const disk=diskObservation((await docker(['exec',id,'df','-Pk','/var/lib/postgresql/data'],undefined,8192)).toString()),alerts=[];
 if(disk.availableBytes<1024**3||disk.availableBytes/disk.totalBytes<.2)alerts.push('DATABASE_DISK_LOW');if(db.serverConnections/db.connectionLimit>=.8)alerts.push('DATABASE_CONNECTIONS_HIGH');
 return {schemaVersion:1,observedAt:Date.now(),scope:'single PostgreSQL container PGDATA filesystem and aggregate server/database connections',...db,disk,alerts};
}
export function postgresMetrics(value){return ['# TYPE virtual_life_postgres_database_bytes gauge','virtual_life_postgres_database_bytes '+value.databaseBytes,'# TYPE virtual_life_postgres_connections gauge','virtual_life_postgres_connections '+value.serverConnections,'# TYPE virtual_life_postgres_connection_limit gauge','virtual_life_postgres_connection_limit '+value.connectionLimit,'# TYPE virtual_life_postgres_disk_available_bytes gauge','virtual_life_postgres_disk_available_bytes '+value.disk.availableBytes,'# TYPE virtual_life_postgres_disk_total_bytes gauge','virtual_life_postgres_disk_total_bytes '+value.disk.totalBytes].join('\n')+'\n';}
async function main(){
 const {positionals,values}=parseArgs({allowPositionals:true,strict:true,options:{project:{type:'string'},service:{type:'string'},'key-file':{type:'string'},output:{type:'string'},input:{type:'string'},format:{type:'string',default:'json'}}}),action=positionals[0];if(positionals.length!==1||!['backup','restore','observe'].includes(action)||!['json','prometheus'].includes(values.format))throw fail();
 const options={project:values.project,service:values.service,keyPath:values['key-file'],output:values.output,input:values.input};const result=await(action==='backup'?backupPostgres(options):action==='restore'?restorePostgres(options):observePostgres(options));
 console.log(values.format==='prometheus'&&action==='observe'?postgresMetrics(result):JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main().catch(()=>{console.error('Private Postgres operation failed;verify local inputs and runbook without printing secrets');process.exitCode=1;});
