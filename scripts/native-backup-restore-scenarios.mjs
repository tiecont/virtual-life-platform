import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {backupPostgres,restorePostgres} from './postgres-backup.mjs';

const execute=promisify(execFile);
const tables=['game_native_matches','game_native_events','game_native_receipts','game_native_settlements','game_native_outbox','platform_native_reward_inbox','platform_native_reward_ledger','city_schema_migrations'];
const identifier=value=>{assert.match(value,/^[a-z][a-z0-9_]*$/);return '"'+value+'"';};
async function fingerprint(pool){
 const hash=createHash('sha256');
 for(const table of tables){
  const rows=(await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows;
  hash.update(table);hash.update(JSON.stringify(rows));
 }
 return hash.digest('hex');
}

// Restore only to an owned, empty disposable database. The source runtime is
// stopped by the caller; this never repairs or replaces its database.
export async function nativeBackupRestoreScenarios(c){
 const {pool,schema,role,runtime,tls,directory,startHost,stopHost,rejectHost,record}=c;
 assert.match(runtime.password,/^[a-f0-9]{64}$/);
 const sourceProject=process.env.AETHERIA_TEST_DB_PROJECT;
 assert.match(sourceProject??'',/^aetheria-soulbound-test-[a-f0-9]{8}$/);
 const project='aetheria-soulbound-backup-test-'+randomUUID().slice(0,8),root=resolve(directory,'native-restore');
 await mkdir(root,{recursive:true,mode:0o700});
 const keyPath=root+'/archive.key',wrongPath=root+'/wrong.key',archive=root+'/native.vlcb',damaged=root+'/damaged.vlcb',envPath=root+'/compose.env';
 const password=randomBytes(32).toString('hex');
 const composeArgs=['compose','--project-name',project,'--env-file',envPath,'-f','infra/compose/native-restore-test.yml'];
 const docker=async args=>(await execute('docker',args,{timeout:120000,maxBuffer:1024**2})).stdout.trim();
 const compose=args=>docker([...composeArgs,...args]);
 let target,started=false,running=false,heartbeat,heartbeatWork=Promise.resolve();
 try{
  await writeFile(envPath,'AETHERIA_BACKUP_TEST_PROJECT='+project+'\nAETHERIA_BACKUP_TEST_PASSWORD='+password+'\n',{mode:0o600});
  await writeFile(keyPath,randomBytes(32).toString('hex'),{mode:0o600});
  await writeFile(wrongPath,randomBytes(32).toString('hex'),{mode:0o600});
  const before=await fingerprint(pool);
  const backup=await backupPostgres({project:sourceProject,service:'db',keyPath,output:archive});
  const bytes=await readFile(archive);assert.equal(createHash('sha256').update(bytes).digest('hex'),backup.sha256);
  assert(!bytes.subarray(0,5).equals(Buffer.from('PGDMP')));
  started=true;await compose(['up','-d','--wait','--wait-timeout','60']);
  const mapping=await compose(['port','restore','5432']),port=/^127\.0\.0\.1:(\d+)$/.exec(mapping)?.[1];assert(port);
  const address=new URL('postgresql://127.0.0.1:'+port+'/aetheria_soulbound_restore_test');
  address.username='city_backup_test';address.password=password;
  target=new Pool({connectionString:address.toString()});
  const empty=async()=>assert.equal((await target.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1",[schema])).rows[0].n,0);
  await assert.rejects(restorePostgres({project,keyPath:wrongPath,input:archive}));await empty();
  const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;await writeFile(damaged,corrupt,{mode:0o600});
  await assert.rejects(restorePostgres({project,keyPath,input:damaged}));await empty();
  await restorePostgres({project,keyPath,input:archive});
  await target.end();address.searchParams.set('options','-csearch_path='+schema);
  target=new Pool({connectionString:address.toString()});
  assert.equal(await fingerprint(target),before,'Native archive must restore every checkpoint, encrypted event/receipt, settlement and migration exactly');
  await assert.rejects(restorePostgres({project,keyPath,input:archive}));
  record('native-encrypted-backup-restores-exact-journal-hashes-and-migrations-to-empty-isolated-postgres');
  record('native-archive-wrong-key-tamper-and-occupied-target-denied');

  // pg_dump excludes roles/grants. Reapply only the existing runtime privilege
  // contracts; the restored host still cannot use the fixture administrator.
  await target.query(`CREATE ROLE ${identifier(role)} LOGIN PASSWORD '${runtime.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8`);
  await target.query(`GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${identifier(role)}`);
  const admission=JSON.parse(await readFile('config/native-runtime-db-privileges.json'));
  for(const [table,columns]of Object.entries(admission.select).filter(([table])=>!table.startsWith('game_')))await target.query(`GRANT SELECT (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(role)}`);
  await target.query(`GRANT INSERT ON platform_native_ticket_uses TO ${identifier(role)}`);
  const gameplay=JSON.parse(await readFile('config/native-game-db-privileges.json'));
  for(const [table,columns]of Object.entries(gameplay.rewardStatusSelect))await target.query(`GRANT SELECT (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(role)}`);
  for(const op of ['select','insert'])for(const table of gameplay[op])await target.query(`GRANT ${op.toUpperCase()} ON ${identifier(table)} TO ${identifier(role)}`);
  for(const [table,columns]of Object.entries(gameplay.update))await target.query(`GRANT UPDATE (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(role)}`);
  const container=await compose(['ps','-q','restore']);assert.match(container,/^[a-f0-9]{12,64}$/);
  for(const name of ['server.pem','server.key'])await docker(['cp',resolve(directory,'tls',name),container+':/tmp/restore-'+name]);
  await docker(['exec','--user','0',container,'chown','postgres:postgres','/tmp/restore-server.key','/tmp/restore-server.pem']);
  await docker(['exec','--user','0',container,'chmod','600','/tmp/restore-server.key']);
  for(const sql of ["ALTER SYSTEM SET ssl_cert_file='/tmp/restore-server.pem'","ALTER SYSTEM SET ssl_key_file='/tmp/restore-server.key'","ALTER SYSTEM SET ssl_min_protocol_version='TLSv1.2'","ALTER SYSTEM SET ssl='on'",'SELECT pg_reload_conf()'])await target.query(sql);
  assert(tls.caFile);
  const restored=new URL(address);restored.username=role;restored.password=runtime.password;
  // Archived leases are not permission to serve. The fixture's trusted
  // allocator explicitly reacquires the restored scope before any key probes.
  const allocator=c.createAdmissionStore(target);
  const prior=(await target.query('SELECT generation FROM platform_native_worlds WHERE world_id=$1',[c.scope.worldId])).rows[0];
  const generation=await allocator.configure(c.scope,Number(prior.generation),true,8);
  heartbeat=setInterval(()=>{heartbeatWork=heartbeatWork.then(()=>allocator.heartbeat(c.scope,generation));heartbeatWork.catch(()=>{});},500);
  for(const overrides of [{activeStorageKey:'replacement',storageKeys:{replacement:Array.from(randomBytes(32))}},{storageKeys:{current:Array.from(randomBytes(32))}},{engineHash:Array(32).fill(0x65)}]){
   await rejectHost(overrides,restored.toString());assert.equal(await fingerprint(target),before);
  }
  running=true;await startHost(restored.toString());
  const readiness=await fetch('http://127.0.0.1:'+c.upstream()+'/health/ready');
  assert.equal(readiness.status,200);
  assert.equal((await readiness.json()).ruleset,'pet-arena-pve');
  await stopHost();running=false;
  assert.equal(await fingerprint(target),before,'Successful restricted Rust recovery must preserve exact restored journal');
  assert.equal(await fingerprint(pool),before,'Restore exercise must leave source gameplay data unchanged');
  record('restored-native-rust-host-requires-storage-key-compatible-engine-and-restricted-tls-role');
 }finally{
  if(heartbeat)clearInterval(heartbeat);
  const heartbeatResult=await Promise.allSettled([heartbeatWork]);
  if(running)await stopHost();await target?.end();
  try{if(started)await compose(['down','--volumes','--remove-orphans','--timeout','5']);}
  finally{for(const path of [keyPath,wrongPath,archive,damaged,envPath])await rm(path,{force:true});}
  assert.equal(heartbeatResult[0].status,'fulfilled','Restored fixture allocator heartbeat must remain valid');
 }
}
