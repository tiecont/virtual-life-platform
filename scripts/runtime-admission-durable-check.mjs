import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generateKeyPairSync,randomUUID,randomBytes,sign,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {Pool} from 'pg';
import {validateTestDatabaseURL} from './test-environment.mjs';
import {prepareAdmissionTestTls} from './runtime-admission-test-tls.mjs';
const execute=promisify(execFile);
const require=createRequire(import.meta.url);
const {migrate}=require('../apps/platform-api/src/shared/database/migrations.ts');
const {IdentityService}=require('../apps/platform-api/src/features/identity/modules/accounts/application/service.ts');
const {readConfig}=require('../apps/platform-api/src/shared/config/environment.ts');
const {RuntimeAdmissionStore}=require('../apps/platform-api/src/features/identity/modules/runtime-access/application/runtime-admission.ts');
const {RuntimeTicketIssuer}=require('../apps/platform-api/src/features/identity/modules/runtime-access/application/runtime-tickets.ts');

const address=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL));
const schema='durable_trust_'+randomUUID().replaceAll('-','');
const directory=resolve('artifacts/desktop-first/vl013/durable-'+randomUUID().slice(0,8));
await mkdir(directory,{recursive:true,mode:0o700});
const facts={taskId:'VL-013',scope:'Actual Node identity/native admission -> Rust signed trust -> disposable PG transaction; synthetic storage effects only, not domain rules or production transport',scenarios:[],result:'FAIL',startedAt:new Date().toISOString()};
const admin=new Pool({connectionString:address.toString()});let pool,created=false,roleCreated=false;
const role='runtime_probe_'+randomUUID().replaceAll('-',''),password=randomBytes(32).toString('hex');
try{
 await admin.query(`CREATE SCHEMA "${schema}"`);created=true;
 address.searchParams.set('options','-csearch_path='+schema);pool=new Pool({connectionString:address.toString()});await migrate(pool);
 const privilegeBytes=await readFile('config/native-runtime-db-privileges.json'),privileges=JSON.parse(privilegeBytes);
 assert.equal(privileges.schemaVersion,1);assert.equal(privileges.activation,'DISABLED');
 facts.privilegeProfile={ref:'config/native-runtime-db-privileges.json',sha256:createHash('sha256').update(privilegeBytes).digest('hex')};
 // Only the disposable owner provisions this fresh non-inheriting role. There
 // is no production DDL, migration grant or credential stored in the manifest.
 await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2`);roleCreated=true;
 await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
 function identifier(value){assert.match(value,/^[a-z][a-z0-9_]*$/);return '"'+value+'"';}
 for(const operation of ['select','update'])for(const [table,columns]of Object.entries(privileges[operation])){
  assert(Array.isArray(columns)&&columns.length>0);
  await pool.query(`GRANT ${operation.toUpperCase()} (${columns.map(identifier).join(',')}) ON ${identifier(schema)}.${identifier(table)} TO ${identifier(role)}`);
 }
 for(const table of privileges.insert)await pool.query(`GRANT INSERT ON ${identifier(schema)}.${identifier(table)} TO ${identifier(role)}`);
 const runtimeAddress=new URL(address);runtimeAddress.username=role;runtimeAddress.password=password;
 const runtimePool=new Pool({connectionString:runtimeAddress.toString(),max:1});
 try{
  const capabilities=(await runtimePool.query('SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.deepEqual(capabilities,{name:role,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolreplication:false,rolbypassrls:false});
  assert.equal((await runtimePool.query('SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rowCount,0);
  facts.deniedPrivileges=[];
  for(const [name,sql]of [
   ['identity-secret-read','SELECT token_hash FROM identity_sessions'],
   ['identity-write',"UPDATE identity_accounts SET status='active' WHERE false"],
   ['session-write',"UPDATE identity_sessions SET revoked_at=clock_timestamp() WHERE false"],
   ['sanction-write','DELETE FROM safety_sanctions WHERE false'],
   ['admission-write','UPDATE platform_native_admissions SET allowed=true WHERE false'],
   ['world-write','UPDATE platform_native_worlds SET enabled=true WHERE false'],
   ['nonce-delete','DELETE FROM platform_native_ticket_uses WHERE false'],
   ['journal-read','SELECT name FROM city_schema_migrations'],
   ['legacy-write','DELETE FROM engine_game_matches WHERE false'],
   ['owner-takeover','UPDATE game_native_matches SET epoch=epoch+1 WHERE false'],
   ['receipt-delete','DELETE FROM game_native_receipts WHERE false'],
   ['schema-create',`CREATE TABLE "${schema}".forbidden_fixture(id int)`],
  ]){await assert.rejects(runtimePool.query(sql),{code:'42501'});facts.deniedPrivileges.push(name);}
 }finally{await runtimePool.end();}
 const invalidAddress=new URL(runtimeAddress);invalidAddress.password=randomBytes(32).toString('hex');
 const invalidPool=new Pool({connectionString:invalidAddress.toString(),max:1});
 try{await assert.rejects(invalidPool.query('SELECT 1'),{code:'28P01'});facts.wrongPasswordRejected=true;}finally{await invalidPool.end();}
 const binary=resolve('artifacts/rust/target/debug/durable-check'),tls=await prepareAdmissionTestTls(directory,pool);
 facts.tls=tls.publicFacts;facts.transportNegatives=[];
 async function rejectTransport(name,target,caFile=tls.caFile,expectedRole=role){
  const path=directory+'/'+name+'.private.json';
  await writeFile(path,JSON.stringify({publicKeys:{},ticket:'',world:'',boot:'',content:'',matchId:'',commandId:'',mode:'transport-deny',caFile,expectedRole}),{mode:0o600});
  const result=await execute(binary,[path],{env:{PATH:process.env.PATH,TEST_DATABASE_URL:target.toString()},timeout:10000,maxBuffer:1024**2});
  assert.match(result.stdout,/PASS: rejected untrusted transport/);facts.transportNegatives.push(name);
 }
 await rejectTransport('plaintext-server',runtimeAddress);
 await tls.enable();
 const securePool=new Pool({connectionString:runtimeAddress.toString(),ssl:{ca:await readFile(tls.caFile),rejectUnauthorized:true},max:1});
 try{assert.equal((await securePool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);}finally{await securePool.end();}
 await rejectTransport('untrusted-ca',runtimeAddress,tls.wrongCaFile);
 const wrongHost=new URL(runtimeAddress);wrongHost.hostname='localhost';wrongHost.searchParams.set('hostaddr','127.0.0.1');
 await rejectTransport('wrong-hostname',wrongHost);
 await rejectTransport('wrong-password',invalidAddress);
 await rejectTransport('wrong-role',runtimeAddress,tls.caFile,'different_role');
 await rejectTransport('database-owner',address,tls.caFile,decodeURIComponent(address.username));
 const identity=new IdentityService(pool,readConfig({NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:randomBytes(48).toString('hex')}));
 const store=new RuntimeAdmissionStore(pool,identity),keys=generateKeyPairSync('ed25519');
 const issuer=new RuntimeTicketIssuer(identity,'fixture',keys.privateKey,store.admission);
 async function scenario(name,mode,alter,afterAdmission){
  const scope={worldId:'native:probe-'+randomUUID(),runtimeBootId:randomUUID(),contentHash:'ab'.repeat(32),protocolVersion:1};
  const user=await identity.guest({requestId:randomUUID(),displayName:'Durable fixture',avatarKey:'mint'});
  await store.configure(scope,0,true,1);await store.allocate(user.token,scope);
  const issued=await issuer.issue(user.token,scope),matchId=randomUUID(),commandId=randomUUID();
  await pool.query(`INSERT INTO game_native_matches(id,world_id,ruleset_id,ruleset_version,content_hash,engine_hash,owner_boot_id,epoch,server_tick,logical_time_ms,rng_cursor,status,seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot,protocol_version,canonical_version,rng_version)
   VALUES($1,$2,'auth-fixture',1,$3,$4,$5,1,0,0,0,'ACTIVE',$6,$7,'fixture',$8,$9,$10,1,1,1)`,[matchId,scope.worldId,Buffer.from(scope.contentHash,'hex'),randomBytes(32),scope.runtimeBootId,randomBytes(32),randomBytes(32),randomBytes(12),randomBytes(16),randomBytes(20)]);
  const claims=JSON.parse(Buffer.from(issued.ticket.split('.')[1],'base64url').toString());
  let ticket=issued.ticket;
  if(alter){
   const change=await alter({scope,user,claims,ticket});
   if(typeof change==='string')ticket=change;
   else if(change){const input=issued.ticket.split('.')[0]+'.'+Buffer.from(JSON.stringify({...claims,...change})).toString('base64url');ticket=input+'.'+sign(null,Buffer.from(input),keys.privateKey).toString('base64url');}
  }
  const path=directory+'/'+name+'.private.json';
  await writeFile(path,JSON.stringify({publicKeys:{fixture:keys.publicKey.export({format:'jwk'}).x},ticket,world:scope.worldId,boot:scope.runtimeBootId,content:scope.contentHash,matchId,commandId,mode,caFile:tls.caFile,expectedRole:role}),{mode:0o600});
  const child=spawn(binary,[path],{env:{PATH:process.env.PATH,TEST_DATABASE_URL:runtimeAddress.toString()},stdio:['pipe','pipe','pipe']});
  let output='',errors='',notified=false,action=Promise.resolve(),failed=false;
  const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},10000);
  child.stdout.on('data',chunk=>{
   output+=chunk;
   if(mode==='wait'&&!notified&&output.includes('ADMITTED')){
    notified=true;action=Promise.resolve().then(()=>afterAdmission({scope,user,claims})).then(()=>{child.stdin.end('execute\n');}).catch(()=>{failed=true;child.kill('SIGKILL');});
   }
  });
  child.stderr.on('data',chunk=>{errors+=chunk;});
  const code=await new Promise((ok,no)=>{child.once('error',no);child.once('close',ok);});clearTimeout(timer);await action;
  await writeFile(directory+'/'+name+'.log',output+errors,{mode:0o600});
  assert.equal(failed,false,'Timed out or control action failed: '+name);assert.equal(code,0,'Rust probe failed: '+name);
  const state=(await pool.query('SELECT state_version,(SELECT count(*) FROM game_native_receipts WHERE match_id=m.id) AS receipts FROM game_native_matches m WHERE id=$1',[matchId])).rows[0];
  assert.deepEqual(state,mode==='accept'?{state_version:'1',receipts:'1'}:{state_version:'0',receipts:'0'});
  facts.scenarios.push({name,mode,exitCode:code,...state});
 }
 await scenario('authorized-commit','accept');
 await scenario('forged-signature','deny',({ticket})=>{const parts=ticket.split('.'),signature=Buffer.from(parts[2],'base64url');signature[0]^=1;return parts[0]+'.'+parts[1]+'.'+signature.toString('base64url');});
 await scenario('expired','deny',({claims})=>({iat:claims.iat-30,nbf:claims.iat-30,exp:claims.iat}));
 await scenario('wrong-world','deny',()=>({world:'native:other'}));
 await scenario('wrong-generation','deny',()=>({generation:'9007199254740991'}));
 await scenario('revoked-before-admission','deny',async({user})=>{await store.release(user.token);});
 await scenario('rollback-after-native-write','rollback');
 await scenario('foreign-domain-session','foreign');
 await scenario('logout-after-admission','wait',undefined,async({user})=>{await identity.logout(user.token,randomUUID());});
 await scenario('release-after-admission','wait',undefined,async({user})=>{await store.release(user.token);});
 await scenario('owner-expired-after-admission','wait',undefined,async({scope})=>{await pool.query("UPDATE platform_native_worlds SET lease_until=clock_timestamp()-interval '1 second' WHERE world_id=$1",[scope.worldId]);});
 await scenario('suspended-after-admission','wait',undefined,async({user})=>{await pool.query("UPDATE identity_accounts SET status='suspended' WHERE id=$1",[user.me.profile.id]);});
 await scenario('admission-expired-after-admission','wait',undefined,async({user})=>{await pool.query("UPDATE platform_native_admissions SET valid_until=clock_timestamp()-interval '1 second' WHERE account_id=$1",[user.me.profile.id]);});
 await scenario('world-disabled-after-admission','wait',undefined,async({scope})=>{await store.configure(scope,1,false,0);});
 await scenario('nonce-deleted-after-admission','wait',undefined,async({claims})=>{await pool.query('DELETE FROM platform_native_ticket_uses WHERE nonce=$1',[claims.jti]);});
 await scenario('owner-replaced-after-admission','wait',undefined,async({scope})=>{await store.configure({...scope,runtimeBootId:randomUUID()},1,true,1);});
 await scenario('reallocated-after-admission','wait',undefined,async({scope,user})=>{await store.allocate(user.token,scope);});
 facts.result='PASS';
}catch(error){facts.errorKind=error.name;facts.failure=String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted-test-address]');process.exitCode=1;}
finally{
 await pool?.end();if(created)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);if(roleCreated)await admin.query(`DROP ROLE "${role}"`);await admin.end();facts.cleanupComplete=true;facts.completedAt=new Date().toISOString();
 await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({result:facts.result,scenarios:facts.scenarios.length,artifactDirectory:directory}));
}
