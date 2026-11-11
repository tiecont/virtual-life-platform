import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,generateKeyPairSync,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createInterface} from 'node:readline';
import {Pool} from 'pg';
import {validateTestDatabaseURL} from './test-environment.mjs';
import {prepareAdmissionTestTls} from './runtime-admission-test-tls.mjs';

const require=createRequire(import.meta.url);
const {migrate}=require('../apps/platform-api/src/shared/database/migrations.ts');
const {IdentityService}=require('../apps/platform-api/src/features/identity/modules/accounts/application/service.ts');
const {DEFAULT_PROGRESSION_POLICY}=require('../apps/platform-api/src/features/progression/modules/rewards/domain/policy.ts');
const {readConfig}=require('../apps/platform-api/src/shared/config/environment.ts');
const {RuntimeAdmissionStore}=require('../apps/platform-api/src/features/identity/modules/runtime-access/application/runtime-admission.ts');
const {RuntimeTicketIssuer}=require('../apps/platform-api/src/features/identity/modules/runtime-access/application/runtime-tickets.ts');
const address=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL));
const directory=resolve('artifacts/desktop-first/vl017/orchestration-'+randomUUID().slice(0,8));
await mkdir(directory,{recursive:true,mode:0o700});
const schema='turns_'+randomUUID().replaceAll('-',''),role='turns_'+randomUUID().replaceAll('-',''),password=randomBytes(32).toString('hex');
const admin=new Pool({connectionString:address.toString()});
const facts={taskIds:['VL-017','VL-018','VL-020','VL-021'],result:'FAIL',startedAt:new Date().toISOString(),scenarios:[],deniedPrivileges:[],scope:'Synthetic three-turn domain, actor/spectator privacy, restricted reward worker, real Rust/worker crashes and TLS PostgreSQL. Library orchestration retains the logical boot under allocator lease. apps/game-runtime composition and boot lifecycle remain VL-111.'};
const workerRole='rewards_'+randomUUID().replaceAll('-',''),workerPassword=randomBytes(32).toString('hex');
let workerRoleCreated=false;const workers=new Set();
let pool,created=false,roleCreated=false,child,closed,lines,heartbeat,heartbeatWork=Promise.resolve(),heartbeatError,slowSql=false,leaseFault=false,output='';
const record=name=>facts.scenarios.push({name,result:'PASS'});
const identifier=v=>{assert.match(v,/^[a-z][a-z0-9_]*$/);return '"'+v+'"';};
async function nextLine(){
 let timer;
 try {const item=await Promise.race([lines.next(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Rust fixture reply deadline')),10000);})]);assert(!item.done,'Rust fixture closed');return item.value;}
 finally{clearTimeout(timer);}
}
async function send(input){child.stdin.write(JSON.stringify(input)+'\n');return JSON.parse(await nextLine());}
async function stop(){if(child){child.kill('SIGKILL');await closed;child=undefined;}}
try {
 await admin.query(`CREATE SCHEMA ${identifier(schema)}`);created=true;
 address.searchParams.set('options','-csearch_path='+schema);pool=new Pool({connectionString:address.toString()});await migrate(pool);
 await admin.query(`CREATE ROLE ${identifier(role)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8`);roleCreated=true;
 await pool.query(`GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${identifier(role)}`);
 const profileBytes=await readFile('config/native-game-db-privileges.json'),profile=JSON.parse(profileBytes);
 assert.equal(profile.activation,'DISABLED');assert.equal(profile.schemaVersion,1);
 facts.profile={ref:'config/native-game-db-privileges.json',sha256:createHash('sha256').update(profileBytes).digest('hex')};
 const admission=JSON.parse(await readFile(profile.admissionSelectProfile));
 for(const [table,columns]of [...Object.entries(admission.select).filter(([name])=>!name.startsWith('game_')),...Object.entries(profile.rewardStatusSelect)])await pool.query(`GRANT SELECT (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(role)}`);
 for(const op of ['select','insert'])for(const table of profile[op])await pool.query(`GRANT ${op.toUpperCase()} ON ${identifier(table)} TO ${identifier(role)}`);
 for(const [table,columns]of Object.entries(profile.update))await pool.query(`GRANT UPDATE (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(role)}`);
 const runtime=new URL(address);runtime.username=role;runtime.password=password;
 const restricted=new Pool({connectionString:runtime.toString(),max:1});
 try {
  for(const [name,sql]of [
   ['identity-secret','SELECT token_hash FROM identity_sessions'],['identity-write',"UPDATE identity_accounts SET status='active' WHERE false"],
   ['policy-write','UPDATE platform_native_admissions SET allowed=true WHERE false'],['world-write','UPDATE platform_native_worlds SET enabled=true WHERE false'],
   ['nonce-delete','DELETE FROM platform_native_ticket_uses WHERE false'],['owner-takeover','UPDATE game_native_matches SET epoch=epoch+1 WHERE false'],
   ['receipt-delete','DELETE FROM game_native_receipts WHERE false'],['event-read','SELECT * FROM game_native_events'],
   ['ledger-write','INSERT INTO platform_native_reward_ledger SELECT * FROM platform_native_reward_ledger WHERE false'],['inbox-write','DELETE FROM platform_native_reward_inbox WHERE false'],
   ['outbox-delivered','UPDATE game_native_outbox SET delivered_at=clock_timestamp() WHERE false'],['legacy-write','DELETE FROM engine_game_matches WHERE false'],
   ['migration-read','SELECT name FROM city_schema_migrations'],['schema-create',`CREATE TABLE ${identifier(schema)}.forbidden_fixture(id int)`],
  ]){await assert.rejects(restricted.query(sql),{code:'42501'});facts.deniedPrivileges.push(name);}
 }finally{await restricted.end();}
 const tls=await prepareAdmissionTestTls(directory,pool);await tls.enable();facts.tls=tls.publicFacts;
 const identity=new IdentityService(pool,readConfig({NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:randomBytes(48).toString('hex')}));
 const store=new RuntimeAdmissionStore(pool,identity),keys=generateKeyPairSync('ed25519');
 const scope={worldId:'native:turns-'+randomUUID(),runtimeBootId:randomUUID(),contentHash:'17'.repeat(32),protocolVersion:1};
 await store.configure(scope,0,true,4);
 heartbeat=setInterval(()=>{if(leaseFault)return;heartbeatWork=heartbeatWork.then(async()=>{const fault=slowSql;try{await store.heartbeat(scope,1);}catch(e){if(fault&&e.code==='55P03')facts.expectedHeartbeatLockTimeouts=(facts.expectedHeartbeatLockTimeouts??0)+1;else heartbeatError=e;}});},500);
 const issuer=new RuntimeTicketIssuer(identity,'fixture',keys.privateKey,store.admission);
 const users=[];
 for(let i=0;i<3;i++){const user=await identity.guest({requestId:randomUUID(),displayName:'Turn fixture',avatarKey:'mint'});await store.allocate(user.token,scope);users.push(user);}
 const players=users.slice(0,2).map(u=>u.me.profile.id);
 const storageKeys={old:Array.from(randomBytes(32)),new:Array.from(randomBytes(32))};
 const base={publicKeys:{fixture:keys.publicKey.export({format:'jwk'}).x},world:scope.worldId,boot:scope.runtimeBootId,caFile:tls.caFile,expectedRole:role};
 async function start(activeKey='old',ring=storageKeys){
  const path=directory+'/host-'+randomUUID()+'.private.json';await writeFile(path,JSON.stringify({...base,activeKey,storageKeys:ring}),{mode:0o600});
  child=spawn(resolve('artifacts/rust/target/debug/examples/orchestration'),[path],{env:{PATH:process.env.PATH,TEST_DATABASE_URL:runtime.toString()},stdio:['pipe','pipe','pipe']});
  child.stderr.on('data',chunk=>{output+=chunk;});child.stdout.on('data',chunk=>{output+=chunk;});
  closed=new Promise((ok,reject)=>{child.once('error',reject);child.once('close',code=>ok(code));});
  lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();assert.equal(await nextLine(),'READY');
  for(let i=0;i<users.length;i++){await store.allocate(users[i].token,scope);const issued=await issuer.issue(users[i].token,scope);assert.equal((await send({op:'admit',ticket:issued.ticket,label:String(i)})).ok,true);}
 }
 const create=async()=>{const id=randomUUID();assert.equal((await send({op:'create',id,players})).ok,true);return id;};
 const command=(id,label='0',version=0,action=1)=>({op:'execute',id,command:randomUUID(),epoch:1,version,action,label});
 const projection=(id,label='0')=>send({op:'projection',id,label});
 const counts=async id=>(await pool.query(`SELECT state_version::int AS version,(SELECT count(*)::int FROM game_native_receipts WHERE match_id=m.id) AS receipts,(SELECT count(*)::int FROM game_native_events WHERE match_id=m.id) AS events,(SELECT count(*)::int FROM game_native_settlements WHERE match_id=m.id) AS settlements,(SELECT count(*)::int FROM game_native_outbox WHERE match_id=m.id) AS outbox FROM game_native_matches m WHERE id=$1`,[id])).rows[0];
 const empty={version:0,receipts:0,events:0,settlements:0,outbox:0};
 const deny=async (input,error)=>{assert.deepEqual(await send(input),{ok:false,error});};
 async function trigger(table,body){await pool.query(`CREATE FUNCTION fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body}; RETURN NEW; END $$; CREATE TRIGGER fixture_failure BEFORE INSERT ON ${identifier(table)} FOR EACH ROW EXECUTE FUNCTION fixture_failure()`);}
 async function untrigger(table){await pool.query(`DROP TRIGGER fixture_failure ON ${identifier(table)};DROP FUNCTION fixture_failure()`);}
 await start();assert.equal((await send({op:'ownerProbe'})).ok,true);record('second-live-owner-rejected');
 const id=await create();const first=command(id);
 assert.equal((await projection(id)).projection.ownCard,411001);
 assert.equal((await projection(id,'1')).projection.ownCard,822002);record('recipient-only-private-projections');
 await deny(command(id,'1'),'Unauthorized');await deny(command(id,'2'),'Unauthorized');assert.deepEqual((await projection(id,'2')).projection,{turn:players[0],turns:0,total:0});
 record('admitted-spectator-public-projection');
 assert.deepEqual(await counts(id),empty);record('wrong-turn-and-spectator-writes-denied');
 await deny({...first,action:0},'Invalid');await deny({...first,version:1},'Conflict');await deny({...first,epoch:2},'Conflict');assert.deepEqual(await counts(id),empty);record('invalid-action-version-epoch-zero-effects');
 const committed=await send(first);assert.equal(committed.ok,true);assert.equal(committed.version,1);assert.deepEqual(await counts(id),{version:1,receipts:1,events:1,settlements:0,outbox:0});record('success-ack-observed-after-committed-checkpoint-receipt-event');
 assert.deepEqual(await send(first),committed);
 await deny({...first,label:'2'},'Unauthorized');
 await deny({...first,label:'1'},'Conflict');
 assert.equal((await projection(id,'1')).projection.ownCard,822002);
 assert.deepEqual((await projection(id,'2')).projection,{turn:players[1],turns:1,total:1});
 record('cross-actor-and-spectator-replay-exposes-no-private-receipt');
 await deny({...first,action:2},'Collision');record('identical-retry-and-command-id-collision');
 const frozenCheckpoint=(await pool.query('SELECT state_version,server_tick,logical_time_ms,rng_cursor,audit_hash,seed_commitment,sealed_snapshot FROM game_native_matches WHERE id=$1',[id])).rows[0];
 await stop();await start();
 assert.deepEqual((await pool.query('SELECT state_version,server_tick,logical_time_ms,rng_cursor,audit_hash,seed_commitment,sealed_snapshot FROM game_native_matches WHERE id=$1',[id])).rows[0],frozenCheckpoint);
 assert.deepEqual(await send(first),committed);const restored=await projection(id);assert.deepEqual(restored,committed);
 await deny(command(id,'0',1),'Unauthorized');assert.equal((await send(command(id,'1',1))).ok,true);record('actual-process-kill-restart-restores-snapshot-rng-turn-and-receipt');
 const finalRace=await send({op:'race',id,label:'0',version:2,duplicate:false});assert.equal(finalRace.results.filter(r=>r.ok).length,1);
 assert.deepEqual(await counts(id),{version:3,receipts:3,events:3,settlements:1,outbox:1});await deny(command(id,'1',3),'Conflict');record('concurrent-final-turn-has-one-settlement-outbox');
 const duplicateId=await create();const duplicate=await send({op:'race',id:duplicateId,label:'0',version:0,duplicate:true});assert.deepEqual(duplicate.results[0],duplicate.results[1]);assert.equal(duplicate.results[0].ok,true);assert.equal((await counts(duplicateId)).receipts,1);record('concurrent-identical-command-returns-one-stored-receipt');
 const ackId=await create(),unknown=command(ackId);child.stdin.write(JSON.stringify(unknown)+'\n');
 for(let n=0;;n++){if((await counts(ackId)).receipts===1)break;assert(n<100,'Commit not observed');await new Promise(ok=>setTimeout(ok,10));}
 // Discard the unread response and kill the actual process. The caller knows
 // neither success nor failure until the exact command is retried after restart.
 await stop();await start();const recovered=await send(unknown);assert.equal(recovered.ok,true);assert.equal(recovered.version,1);assert.deepEqual(await send(unknown),recovered);assert.equal((await counts(ackId)).receipts,1);record('unread-ack-after-commit-recovered-by-exact-command-after-process-kill');
 const rollbackId=await create();await trigger('game_native_events',"RAISE EXCEPTION 'fixture event failure'");await deny(command(rollbackId),'Unavailable');await untrigger('game_native_events');assert.deepEqual(await counts(rollbackId),empty);record('event-insert-failure-rolls-back-checkpoint-and-receipt');
 assert.equal((await send(command(rollbackId))).ok,true);assert.equal((await send(command(rollbackId,'1',1))).ok,true);
 await trigger('game_native_outbox',"RAISE EXCEPTION 'fixture outbox failure'");await deny(command(rollbackId,'0',2),'Unavailable');await untrigger('game_native_outbox');assert.deepEqual(await counts(rollbackId),{version:2,receipts:2,events:2,settlements:0,outbox:0});record('outbox-failure-rolls-back-final-turn-settlement-and-receipt');
 const crashId=await create();slowSql=true;await trigger('game_native_events','PERFORM pg_sleep(1.5)');child.stdin.write(JSON.stringify(command(crashId))+'\n');
 for(let n=0;;n++){const sleeping=await pool.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event='PgSleep'",[role]);if(sleeping.rowCount)break;assert(n<100,'Pending insert not observed');await new Promise(ok=>setTimeout(ok,10));}
 await stop();await untrigger('game_native_events');assert.deepEqual(await counts(crashId),empty);await start();assert.equal((await projection(crashId)).version,0);record('process-kill-after-checkpoint-write-before-commit-leaves-zero-effects');
 const timeoutId=await create();await trigger('game_native_events','PERFORM pg_sleep(2.5)');const timeoutStart=performance.now();assert.equal((await send(command(timeoutId))).ok,false);facts.transactionDeadlineMs=performance.now()-timeoutStart;assert(facts.transactionDeadlineMs>=1900&&facts.transactionDeadlineMs<4000);await untrigger('game_native_events');await heartbeatWork;slowSql=false;assert.deepEqual(await counts(timeoutId),empty);record('transaction-deadline-rolls-back-native-writes');
 // Rotate encryption keys with the old key retained, then remove it to prove
 // missing-key failure and retain it again for the remaining negative checks.
 await stop();await start('new');assert.equal((await projection(ackId)).version,1);const rotationId=await create();assert.equal((await send(command(rotationId))).ok,true);assert.equal((await pool.query('SELECT snapshot_key_id FROM game_native_matches WHERE id=$1',[rotationId])).rows[0].snapshot_key_id,'new');record('key-rotation-reads-old-and-writes-new-envelopes');
 await stop();await start('new',{new:storageKeys.new});await deny({op:'projection',id:ackId,label:'0'},'Integrity');await stop();await start('new');record('missing-old-key-fails-closed');
 const corrupt=await pool.query('SELECT sealed_snapshot FROM game_native_matches WHERE id=$1',[rotationId]);const original=corrupt.rows[0].sealed_snapshot,modified=Buffer.from(original);modified[0]^=1;
 await pool.query('UPDATE game_native_matches SET sealed_snapshot=$2 WHERE id=$1',[rotationId,modified]);await deny({op:'projection',id:rotationId,label:'0'},'Integrity');await pool.query('UPDATE game_native_matches SET sealed_snapshot=$2 WHERE id=$1',[rotationId,original]);record('authenticated-snapshot-tampering-denied');
 const envelope=(await pool.query('SELECT snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot FROM game_native_matches WHERE id=$1',[rotationId])).rows[0];
 const otherId=await create(),other=(await pool.query('SELECT snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot FROM game_native_matches WHERE id=$1',[otherId])).rows[0];
 await pool.query('UPDATE game_native_matches SET snapshot_key_id=$2,snapshot_nonce=$3,snapshot_tag=$4,sealed_snapshot=$5 WHERE id=$1',[otherId,envelope.snapshot_key_id,envelope.snapshot_nonce,envelope.snapshot_tag,envelope.sealed_snapshot]);await deny({op:'projection',id:otherId,label:'0'},'Integrity');
 await pool.query('UPDATE game_native_matches SET snapshot_key_id=$2,snapshot_nonce=$3,snapshot_tag=$4,sealed_snapshot=$5 WHERE id=$1',[otherId,other.snapshot_key_id,other.snapshot_nonce,other.snapshot_tag,other.sealed_snapshot]);record('cross-match-envelope-swap-denied');

 const incompatibleId=randomUUID();
 await pool.query(
  "INSERT INTO game_native_matches SELECT $1,world_id,ruleset_id,ruleset_version+1,content_hash,engine_hash,protocol_version,canonical_version,rng_version,owner_boot_id,epoch,state_version,server_tick,logical_time_ms,rng_cursor,status,seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot,created_at,updated_at FROM game_native_matches WHERE id=$2",
  [incompatibleId,otherId],
 );
 await deny({op:'projection',id:incompatibleId,label:'0'},'Integrity');
 record('incompatible-ruleset-journal-is-rejected-before-projection');
 const receipt=(await pool.query('SELECT sealed_receipt FROM game_native_receipts WHERE match_id=$1',[ackId])).rows[0].sealed_receipt,damaged=Buffer.from(receipt);damaged[0]^=1;
 await pool.query('UPDATE game_native_receipts SET sealed_receipt=$2 WHERE match_id=$1',[ackId,damaged]);await deny(unknown,'Integrity');await pool.query('UPDATE game_native_receipts SET sealed_receipt=$2 WHERE match_id=$1',[ackId,receipt]);record('authenticated-receipt-tampering-denied');

 const privateReceipts=(await pool.query(
  'SELECT actor_id,command_id,key_id,nonce,tag,sealed_receipt,receipt_hash FROM game_native_receipts WHERE match_id=$1 ORDER BY committed_version',
  [id],
 )).rows;
 const firstPrivate=privateReceipts[0],secondPrivate=privateReceipts[1];
 await pool.query(
  'UPDATE game_native_receipts SET key_id=$4,nonce=$5,tag=$6,sealed_receipt=$7,receipt_hash=$8 WHERE match_id=$1 AND actor_id=$2 AND command_id=$3',
  [id,secondPrivate.actor_id,secondPrivate.command_id,firstPrivate.key_id,firstPrivate.nonce,firstPrivate.tag,firstPrivate.sealed_receipt,firstPrivate.receipt_hash],
 );
 await deny({...command(id,'1',1),command:secondPrivate.command_id},'Integrity');
 await pool.query(
  'UPDATE game_native_receipts SET key_id=$4,nonce=$5,tag=$6,sealed_receipt=$7,receipt_hash=$8 WHERE match_id=$1 AND actor_id=$2 AND command_id=$3',
  [id,secondPrivate.actor_id,secondPrivate.command_id,secondPrivate.key_id,secondPrivate.nonce,secondPrivate.tag,secondPrivate.sealed_receipt,secondPrivate.receipt_hash],
 );
 record('cross-viewer-valid-receipt-envelope-transplant-fails-authentication');
 const ownerKey=createHash('sha256').update('vl.native.owner.v1:'+scope.worldId).digest().readBigInt64BE(0)&0x7fffffffffffffffn;
 const owner=(await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=($1::bigint>>32)::oid AND objid=($1::bigint&4294967295)::oid AND objsubid=1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",[ownerKey.toString()])).rows;
 assert.equal(owner.length,1);await pool.query('SELECT pg_terminate_backend($1)',[owner[0].pid]);await deny(command(otherId),'Unavailable');assert.deepEqual(await counts(otherId),empty);await stop();await start('new');record('lost-owner-lock-connection-cannot-commit');
 const leaseId=await create();leaseFault=true;await heartbeatWork;await trigger('game_native_events','PERFORM pg_sleep(0.75)');
 await pool.query("UPDATE platform_native_worlds SET lease_until=clock_timestamp()+interval '0.35 seconds' WHERE world_id=$1",[scope.worldId]);await deny(command(leaseId),'Unauthorized');await untrigger('game_native_events');assert.deepEqual(await counts(leaseId),empty);
 await pool.query("UPDATE platform_native_worlds SET lease_until=clock_timestamp()+interval '5 seconds' WHERE world_id=$1",[scope.worldId]);leaseFault=false;record('owner-lease-expiry-after-native-write-rolls-back-before-ack');

 const nativePolicy=directory+'/native-policy.private.json',progressionPolicy=directory+'/progression-policy.private.json';
 await writeFile(nativePolicy,JSON.stringify({schemaVersion:1,world:scope.worldId,ruleset:'storage-fixture',rulesetVersion:1,contentHash:scope.contentHash,rewardKey:'fixture-completion'}),{mode:0o600});
 await writeFile(progressionPolicy,JSON.stringify({...DEFAULT_PROGRESSION_POLICY,enabled:true}),{mode:0o600});
 await admin.query(`CREATE ROLE ${identifier(workerRole)} LOGIN PASSWORD '${workerPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8`);workerRoleCreated=true;
 await pool.query(`GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${identifier(workerRole)}`);
 const workerProfile=JSON.parse(await readFile('config/native-reward-worker-db-privileges.json'));
 assert.equal(workerProfile.activation,'DISABLED');
 for(const op of ['select','insert'])for(const table of workerProfile[op])await pool.query(`GRANT ${op.toUpperCase()} ON ${identifier(table)} TO ${identifier(workerRole)}`);
 for(const [table,columns]of Object.entries(workerProfile.update))await pool.query(`GRANT UPDATE (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(workerRole)}`);
 const workerAddress=new URL(address);workerAddress.username=workerRole;workerAddress.password=workerPassword;
 const workerProbe=new Pool({connectionString:workerAddress.toString()});
 try {
  for(const sql of ['DELETE FROM platform_native_reward_inbox WHERE false',"UPDATE game_native_matches SET status='FINISHED' WHERE false","UPDATE platform_native_reward_ledger SET reward_key='forged' WHERE false",'INSERT INTO game_native_settlements SELECT * FROM game_native_settlements WHERE false']){
   await assert.rejects(workerProbe.query(sql),{code:'42501'});
  }
 } finally {await workerProbe.end();}
 const worker=(configured=true)=>{
  const proc=spawn(process.execPath,['apps/platform-api/dist/worker.js','--once'],{env:{PATH:process.env.PATH,NODE_ENV:'test',DATABASE_URL:workerAddress.toString(),DURABLE_JOB_ROLE:'worker',...configured?{NATIVE_REWARD_POLICY_FILE:nativePolicy}:{PROGRESSION_POLICY_FILE:progressionPolicy}},stdio:['ignore','pipe','pipe']});
  workers.add(proc);let logs='';
  proc.stdout.on('data',b=>{logs+=b;});proc.stderr.on('data',b=>{logs+=b;});
  const result=new Promise((ok,no)=>{proc.once('error',no);proc.once('close',(code,signal)=>{workers.delete(proc);assert(!logs.includes(workerPassword));assert(!/ownCard|411001|822002|sealed_snapshot/.test(logs));ok({code,signal,logs});});});
  return {proc,result};
 };
 const runWorker=async()=>{const result=await worker().result;assert.equal(result.code,0,result.logs);};
 const grantCount=async match=>(await pool.query('SELECT count(*)::int AS n FROM platform_native_reward_ledger l JOIN game_native_settlements s USING(settlement_id) WHERE s.match_id=$1',[match])).rows[0].n;
 assert.equal((await projection(id)).reward,'REWARD_PENDING');
 assert.equal((await projection(id,'1')).reward,null);
 assert.equal((await projection(id,'2')).reward,null);
 const finalCommand=(await pool.query('SELECT command_id FROM game_native_receipts WHERE match_id=$1 AND committed_version=3',[id])).rows[0].command_id;
 const finalRequest={...command(id,'0',2),command:finalCommand};
 assert.equal((await send(finalRequest)).reward,'REWARD_PENDING');
 assert.equal(await grantCount(id),0);
 const unconfigured=await worker(false).result;
 assert.equal(unconfigured.code,0,unconfigured.logs);
 assert.equal(await grantCount(id),0);
 record('unconfigured-worker-leaves-native-rewards-pending');
 record('delayed-worker-returns-reward-pending-on-reconnect-and-replay');
 const simultaneous=await Promise.all([worker().result,worker().result]);
 for(const result of simultaneous)assert.equal(result.code,0,result.logs);
 assert.equal(await grantCount(id),1);
 assert.equal((await projection(id)).reward,'GRANTED');
 assert.equal((await send(finalRequest)).reward,'GRANTED');
 await stop();await start('new');
 assert.equal((await send(finalRequest)).reward,'GRANTED');record('two-restricted-workers-one-grant-and-reconciled-receipt-after-game-restart');
 await pool.query('UPDATE game_native_outbox SET delivered_at=NULL,delivery_outcome=NULL WHERE match_id=$1',[id]);
 await runWorker();await runWorker();assert.equal(await grantCount(id),1);record('redelivery-and-worker-restart-deduplicate-through-platform-inbox');
 // Obtain fresh admission credentials after the worker subprocess phases.
 await stop();await start('new');
 const rewardCrashId=await create();
 for(const [label,version]of [['0',0],['1',1],['0',2]])assert.equal((await send(command(rewardCrashId,label,version))).ok,true);
 await pool.query("CREATE FUNCTION pause_reward_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1.5); RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER pause_reward_commit AFTER INSERT ON platform_native_reward_inbox DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pause_reward_commit()");
 const crashing=worker();
 for(let n=0;;n++){const waiting=await pool.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event='PgSleep'",[workerRole]);if(waiting.rowCount)break;assert(n<150,'Worker did not reach blocked COMMIT');await new Promise(ok=>setTimeout(ok,10));}
 assert.equal(await grantCount(rewardCrashId),0);
 crashing.proc.kill('SIGKILL');assert.equal((await crashing.result).signal,'SIGKILL');
 await pool.query('DROP TRIGGER pause_reward_commit ON platform_native_reward_inbox; DROP FUNCTION pause_reward_commit()');
 await runWorker();await runWorker();assert.equal(await grantCount(rewardCrashId),1);record('worker-process-kill-at-deferred-commit-rolls-back-and-restart-grants-once');
 await stop();await start('new');
 const badRewardId=await create();
 for(const [label,version]of [['0',0],['1',1],['0',2]])assert.equal((await send(command(badRewardId,label,version))).ok,true);
 await pool.query("UPDATE game_native_settlements SET proposal='{}' WHERE match_id=$1",[badRewardId]);
 await runWorker();assert.equal(await grantCount(badRewardId),0);assert.equal((await projection(badRewardId)).reward,'DECLINED');record('invalid-settlement-proposal-is-declined-without-ledger-effect');
 await store.release(users[0].token);await deny(unknown,'Unauthorized');await deny({op:'projection',id:ackId,label:'0'},'Unauthorized');record('revoked-admission-denies-stored-receipt-and-private-snapshot');
 const stored=await pool.query('SELECT sealed_snapshot FROM game_native_matches');for(const row of stored.rows)for(const player of players)assert(!row.sealed_snapshot.includes(Buffer.from(player)));record('snapshot-storage-does-not-contain-plaintext-player-state');
 const economy=(await pool.query("SELECT proposal FROM game_native_settlements WHERE match_id=$1",[id])).rows[0].proposal;
 assert.deepEqual(economy,{kind:'game.completed.v1',ruleset:'storage-fixture',rulesetVersion:1});record('settlement-only-stores-nonprivate-completion-proposal');
 assert.equal(heartbeatError,undefined);facts.result='PASS';
}catch(error){facts.failure={name:error.name,message:String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted-test-address]')};process.exitCode=1;}
finally {
 for(const proc of workers){proc.kill('SIGKILL');await new Promise(ok=>proc.once('close',ok));}
 if(heartbeat)clearInterval(heartbeat);await heartbeatWork;await stop();
 await writeFile(directory+'/rust.private.log',output,{mode:0o600});await pool?.end();
 if(created)await admin.query(`DROP SCHEMA ${identifier(schema)} CASCADE`);if(workerRoleCreated)await admin.query(`DROP ROLE ${identifier(workerRole)}`);if(roleCreated)await admin.query(`DROP ROLE ${identifier(role)}`);await admin.end();
 facts.cleanupComplete=true;facts.completedAt=new Date().toISOString();await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({result:facts.result,scenarios:facts.scenarios.length,deniedPrivileges:facts.deniedPrivileges.length,artifactDirectory:directory,failure:facts.failure}));
}
