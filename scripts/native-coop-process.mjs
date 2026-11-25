import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createRequire} from 'node:module';
import {prepareAdmissionTestTls} from './runtime-admission-test-tls.mjs';
const require=createRequire(import.meta.url);
const {migrate}=require('../apps/platform-api/src/shared/database/migrations.ts');
const {createApp}=require('../apps/platform-api/src/app.ts');
const {readConfig}=require('../apps/platform-api/src/shared/config/environment.ts');
const {installGameplayConfig}=require('../apps/platform-api/src/features/gameplay/modules/config/application/seed-gameplay-config.ts');
const {EngineGameplayBundleValidator}=require('../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-validator.ts');
const {decodeServer}=require('../packages/native-protocol/dist/index.js');
const socketRequire=createRequire(require.resolve('socket.io-client/package.json'));
const WebSocket=createRequire(socketRequire.resolve('engine.io-client/package.json'))('ws');
const varint=value=>{let n=BigInt(value);const out=[];do{let byte=Number(n&0x7fn);n>>=7n;if(n)byte|=0x80;out.push(byte);}while(n);return Buffer.from(out);};
const tag=(field,wire)=>varint((field<<3)|wire);
const uintField=(field,value)=>Buffer.concat([tag(field,0),varint(value)]);
const bytesField=(field,bytes)=>Buffer.concat([tag(field,2),varint(bytes.length),Buffer.from(bytes)]);
const stringField=(field,text)=>bytesField(field,Buffer.from(text,'utf8'));
const messageField=(field,bytes)=>bytesField(field,bytes);
function envelope(bodyField,body,commandId,sequence){return Buffer.concat([uintField(1,1),bytesField(2,commandId),uintField(3,BigInt(sequence)),messageField(bodyField,body)]);}
function helloMessage(ticket,contentHash){return Buffer.concat([stringField(1,ticket),stringField(2,'coop-process-v1'),bytesField(3,contentHash)]);}
function intentMessage(sessionId,expectedVersion,action,kind='arena8-coop.intent.v1'){return Buffer.concat([bytesField(1,sessionId),uintField(2,BigInt(expectedVersion)),stringField(3,kind),bytesField(4,Buffer.from(action,'utf8'))]);}

const origin='http://127.0.0.1:3300',binary=resolve('artifacts/rust/target/debug/aetheria-game-runtime');
const facts={result:'FAIL',scenarios:[]};
const directory=await mkdtemp(join(tmpdir(),'aetheria-coop-process-'));
const schema='coop_process_'+randomUUID().replaceAll('-',''),role='coop_runtime_'+randomUUID().replaceAll('-',''),password=randomBytes(32).toString('hex');
const address=new URL(process.env.TEST_DATABASE_URL??'');
const admin=new Pool({connectionString:address.toString()});let pool,app,roleCreated=false;
const identifier=value=>{assert.match(value,/^[a-z][a-z0-9_]*$/);return '"'+value+'"';};
try{
 await admin.query('CREATE SCHEMA '+identifier(schema));address.searchParams.set('options','-csearch_path='+schema);
 pool=new Pool({connectionString:address.toString()});await migrate(pool);
 await admin.query('CREATE ROLE '+identifier(role)+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8");roleCreated=true;
 await pool.query('GRANT USAGE ON SCHEMA '+identifier(schema)+' TO '+identifier(role));
 const runtimeProfile=JSON.parse(await readFile('config/native-runtime-db-privileges.json'));
 const gameProfile=JSON.parse(await readFile('config/native-game-db-privileges.json'));
 for(const [table,columns] of Object.entries(runtimeProfile.select))await pool.query('GRANT SELECT ('+columns.map(identifier).join(',')+') ON '+identifier(table)+' TO '+identifier(role));
 await pool.query('GRANT INSERT ON platform_native_ticket_uses TO '+identifier(role));
 for(const [table,columns] of Object.entries(gameProfile.rewardStatusSelect))await pool.query('GRANT SELECT ('+columns.map(identifier).join(',')+') ON '+identifier(table)+' TO '+identifier(role));
 for(const op of ['select','insert'])for(const table of gameProfile[op])await pool.query('GRANT '+op.toUpperCase()+' ON '+identifier(table)+' TO '+identifier(role));
 for(const [table,columns] of Object.entries(gameProfile.update))await pool.query('GRANT UPDATE ('+columns.map(identifier).join(',')+') ON '+identifier(table)+' TO '+identifier(role));
 const database=decodeURIComponent(address.pathname.slice(1));
 await admin.query('ALTER ROLE '+identifier(role)+' IN DATABASE '+identifier(database)+' SET search_path TO '+identifier(schema));
 const tls=await prepareAdmissionTestTls(directory,pool);await tls.enable();
 const runtime=new URL(process.env.TEST_DATABASE_URL);runtime.username=role;runtime.password=password;
 const bundle=JSON.parse(await readFile('config/gameplay/arena8-coop-v1.seed.json','utf8'));
 await installGameplayConfig(pool,'arena8-coop-pve',bundle,new EngineGameplayBundleValidator(binary),'system:process-test');
 const config=readConfig({
  NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:randomBytes(48).toString('base64url'),
  LOCAL_COOP_ROOMS:'1',LOCAL_COOP_NATIVE:'1',GAMEPLAY_CONFIG_VALIDATOR_BINARY:binary,
  LOCAL_ARENA8_NATIVE_BINARY:binary,LOCAL_ARENA8_NATIVE_DATABASE_URL:runtime.toString(),
  LOCAL_ARENA8_NATIVE_DB_ROLE:role,LOCAL_ARENA8_NATIVE_CA_FILE:tls.caFile,
  LOCAL_ARENA8_NATIVE_STORAGE_KEY:randomBytes(32).toString('hex'),LOCAL_ARENA8_NATIVE_STORAGE_KEY_ID:'local-v1',
  LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN:'https://127.0.0.1:4443',
  LOCAL_ARENA8_NATIVE_TLS_CERT_FILE:resolve(directory,'tls/server.pem'),
  LOCAL_ARENA8_NATIVE_TLS_KEY_FILE:resolve(directory,'tls/server.key'),
 });
 app=await createApp(config,pool,false,{});
 let addressIndex=1;
 async function guest(name,petId){
  const response=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.214.1.'+addressIndex++,headers:{origin},payload:{requestId:randomUUID(),displayName:name,avatarKey:'mint'}});
  assert.equal(response.statusCode,201);
  const body=response.json();const accountId=body.profile.id;
  await pool.query('INSERT INTO pet_wave_one_players(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
  await pool.query('INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,$2,1,0,$3)',[accountId,petId,'starter']);
  return {cookie:String(response.headers['set-cookie']).split(';')[0],csrf:body.csrfToken,accountId,petId};
 }
 const post=(auth,url,payload)=>app.http.inject({method:'POST',url,remoteAddress:'127.214.2.1',headers:{origin,cookie:auth.cookie,'x-csrf-token':auth.csrf},payload});
 const pets=['icarus','coralline','volt','terran'];
 const members=[];
 for(const [index,pet] of pets.entries())members.push(await guest('Process seat '+(index+1),pet));
 await pool.query('INSERT INTO coop_achievement_ledger(account_id,points,source,source_ref) VALUES($1,5000,$2,$3)',[members[0].accountId,'admin_grant',randomUUID()]);
 const room=(await post(members[0],'/v1/coop/rooms',{requestId:randomUUID(),petId:members[0].petId})).json();
 for(const [index,member] of members.entries())if(index>0){
  assert.equal((await post(member,'/v1/coop/rooms/'+room.roomId+'/join',{requestId:randomUUID()})).statusCode,200);
  assert.equal((await post(member,'/v1/coop/rooms/'+room.roomId+'/pet',{requestId:randomUUID(),petId:member.petId})).statusCode,200);
  assert.equal((await post(member,'/v1/coop/rooms/'+room.roomId+'/ready',{requestId:randomUUID(),ready:true})).statusCode,200);
 }
 assert.equal((await post(members[0],'/v1/coop/rooms/'+room.roomId+'/ready',{requestId:randomUUID(),ready:true})).statusCode,200);
 const started=await post(members[0],'/v1/coop/rooms/'+room.roomId+'/start',{requestId:randomUUID()});
 assert.equal(started.statusCode,200,JSON.stringify(started.json()));
 assert.equal(started.json().status,'STARTED');
 facts.scenarios.push('actual-runtime-process-started-from-published-bundle-and-four-seats');
 const allocation=(await pool.query('SELECT match_id,world_id,status,generation,content_hash,jsonb_array_length(seats) AS seats FROM coop_allocations')).rows[0];
 assert.equal(allocation.status,'ACTIVE');assert.equal(allocation.seats,4);
 const world=(await pool.query('SELECT world_id,enabled,capacity,generation FROM platform_native_worlds WHERE world_id=$1',[allocation.world_id])).rows[0];
 assert.equal(world.world_id,allocation.world_id);assert.equal(world.enabled,true);assert.equal(world.capacity,4);assert.equal(String(world.generation),'1');
 facts.scenarios.push('restricted-runtime-owner-and-four-seat-admission-world-enabled');
 const tickets=[];
 for(const member of members){
  const response=await post(member,'/v1/coop/rooms/'+room.roomId+'/admission',{});
  assert.equal(response.statusCode,200,JSON.stringify(response.json()));
  tickets.push(response.json().ticket);
 }
 assert.equal(new Set(tickets).size,4);
 facts.scenarios.push('four-subject-scoped-tickets-issued-by-the-real-issuer');
 const caPem=await readFile(tls.caFile,'utf8');
 const matchBytes=Buffer.from(allocation.match_id.replaceAll('-',''),'hex'),contentBytes=Buffer.from(allocation.content_hash,'hex');
 function client(ticket,seat){
  const ws=new WebSocket('wss://127.0.0.1:4443/rt/v1','vl.native.v1',{ca:caPem,headers:{origin:'https://127.0.0.1:4443'}});
  const queue=[],waiters=[];
  const flush=()=>{while(waiters.length&&queue.length){const waiter=waiters.shift();waiter(queue.shift());}};
  ws.on('message',data=>{let env;try{env=decodeServer(new Uint8Array(data));}catch{return;}queue.push(env);flush();});
  const next=timeout=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('native message timeout')),timeout);const done=env=>{clearTimeout(timer);resolve(env);};if(queue.length)done(queue.shift());else waiters.push(done);});
  const opened=new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',error=>reject(new Error('native socket failed: '+String(error?.message??error))));});
  return {ws,seat,ticket,opened,next,sequence:1};
 }
 async function intent(connection,expectedVersion,action,kind='arena8-coop.intent.v1'){
  const id=randomBytes(16);
  connection.ws.send(envelope(11,intentMessage(matchBytes,expectedVersion,action,kind),id,connection.sequence++));
  for(;;){
   const env=await connection.next(5000);
   if(Buffer.compare(Buffer.from(env.commandId),id)!==0)continue;
   if(env.body.case==='receipt'||env.body.case==='rejection')return env;
  }
 }
 const connections=[];
 try{
  for(const seat of members.keys()){
   const connection=client(tickets[seat],seat);
   await connection.opened;
   const id=randomBytes(16);
   connection.ws.send(envelope(10,helloMessage(tickets[seat],contentBytes),id,connection.sequence++));
   const hello=await connection.next(5000);
   assert.equal(hello.body.case,'hello');
   connections.push(connection);
  }
  facts.scenarios.push('four-authenticated-sockets-completed-hello-with-their-own-ticket');
  const initial=await intent(connections[0],0,'','arena8-coop.view.v1');
  assert.equal(initial.body.case,'receipt');
  const initialVersion=Number(initial.canonicalVersion);
  const start=await intent(connections[0],initialVersion,'{"epoch":1,"action":{"kind":"start"}}');
  assert.equal(start.body.case,'receipt');
  assert.equal(start.body.value.committed,true);
  const startView=JSON.parse(Buffer.from(start.body.value.authorizedProjection).toString('utf8'));
  assert.equal(startView.state.ruleset.id,'arena8-coop-pve');
  assert.equal(startView.state.participants.length,4);
  assert.equal(startView.state.board.length,64);
  assert.equal(startView.state.you,0);
  assert.equal(startView.state.phase,'playing');
  let version=Number(start.canonicalVersion);
  const first=await intent(connections[0],version,'{"epoch":1,"action":{"kind":"guard"}}');
  assert.equal(first.body.case,'receipt');
  version=Number(first.canonicalVersion);
  const firstView=JSON.parse(Buffer.from(first.body.value.authorizedProjection).toString('utf8'));
  assert.equal(firstView.state.activeSeat,1);
  for(const seat of [1,2,3]){
   const receipt=await intent(connections[seat],version,'{"epoch":1,"action":{"kind":"guard"}}');
   assert.equal(receipt.body.case,'receipt');
   version=Number(receipt.canonicalVersion);
   const view=JSON.parse(Buffer.from(receipt.body.value.authorizedProjection).toString('utf8'));
   assert.equal(view.state.you,seat);
   assert.equal(view.state.participants.length,4);
   assert.equal(view.state.board.length,64);
  }
  assert.equal(version,5);
  facts.scenarios.push('four-seats-committed-five-shared-board-turns-on-one-boss');
  assert.equal((await pool.query('SELECT state_version FROM game_native_matches')).rows[0].state_version,'5');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_native_receipts')).rows[0].n,5);
  facts.scenarios.push('journal-recorded-five-durable-receipts-on-the-same-match');
 }finally{
  for(const connection of connections)try{connection.ws.close();}catch{/* The socket is already closed after a rejection. */}
 }
 const match=(await pool.query("SELECT ruleset_id,status,encode(content_hash,'hex') AS content_hash FROM game_native_matches")).rows[0];
 assert.equal(match.ruleset_id,'arena8-coop-pve');assert.equal(match.status,'ACTIVE');assert.equal(match.content_hash,allocation.content_hash);
 facts.scenarios.push('runtime-created-the-match-with-the-engine-content-hash-before-any-client-command');
 facts.result='PASS';facts.matchId=allocation.match_id;facts.worldId=allocation.world_id;
}catch(error){
 facts.failure={name:error.name,message:String(error.message).slice(0,500)};
 facts.frames=String(error.stack??'').split('\n').filter(line=>line.trim().startsWith('at ')).slice(0,4);
 process.exitCode=1;
}finally{
 try{await app?.app.close();}catch{/* Best-effort teardown after a failed assertion. */}
 try{await pool?.end();}catch{/* The pool may already be closing. */}
 if(roleCreated)await admin.query('DROP OWNED BY '+identifier(role)).catch(()=>{});
 if(roleCreated)await admin.query('DROP ROLE '+identifier(role)).catch(()=>{});
 await admin.query('DROP SCHEMA IF EXISTS '+identifier(schema)+' CASCADE').catch(()=>{});
 await admin.end();await rm(directory,{recursive:true,force:true});
 console.log(JSON.stringify(facts));
}
