import assert from 'node:assert/strict';
import {access,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {validateTestDatabaseURL} from '../../scripts/test-environment.mjs';
import {createServer} from 'node:net';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import {checkWaterOpening,checkWaterEffect} from '../coop-advanced-publication-probe.mjs';
import {prepareAdmissionTestTls} from '../../scripts/runtime-admission-test-tls.mjs';
const require=createRequire(import.meta.url);
const {migrate}=require('../../apps/platform-api/src/shared/database/migrations.ts');
const {createApp}=require('../../apps/platform-api/src/app.ts');
const {readConfig}=require('../../apps/platform-api/src/shared/config/environment.ts');
const {installGameplayConfig}=require('../../apps/platform-api/src/features/gameplay/modules/config/application/seed-gameplay-config.ts');
const {EngineGameplayBundleValidator}=require('../../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-validator.ts');
const {CoopSettlement}=require('../../apps/platform-api/src/features/coop/modules/settlement/application/service.ts');
const {OperatorService}=require('../../apps/platform-api/src/features/identity/modules/operators/application/operator-service.ts');
const {totp}=require('../../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto.ts');
const {decodeServer}=require('../../packages/native-protocol/dist/index.js');
const socketRequire=createRequire(require.resolve('socket.io-client/package.json'));
const WebSocket=createRequire(socketRequire.resolve('engine.io-client/package.json'))('ws');
const varint=value=>{let n=BigInt(value);const out=[];do{let byte=Number(n&0x7fn);n>>=7n;if(n)byte|=0x80;out.push(byte);}while(n);return Buffer.from(out);};
const tag=(field,wire)=>varint((field<<3)|wire);
const uintField=(field,value)=>Buffer.concat([tag(field,0),varint(value)]);
const bytesField=(field,bytes)=>Buffer.concat([tag(field,2),varint(bytes.length),Buffer.from(bytes)]);
const stringField=(field,text)=>bytesField(field,Buffer.from(text,'utf8'));
const messageField=(field,bytes)=>bytesField(field,bytes);
function envelope(bodyField,body,commandId,sequence){return Buffer.concat([uintField(1,1),bytesField(2,commandId),uintField(3,BigInt(sequence)),messageField(bodyField,body)]);}
const boardMode=process.env.PACKAGED_QA_BOARD??'functional';
assert.ok(['functional','elemental','advanced-water'].includes(boardMode),'Unknown packaged board fixture');
const advancedWater=boardMode==='advanced-water';
const isFunctional=boardMode!=='elemental';
function helloMessage(ticket,contentHash,build){return Buffer.concat([stringField(1,ticket),stringField(2,build??(isFunctional?'unity-native-v2':'coop-process-v1')),bytesField(3,contentHash)]);}
function intentMessage(sessionId,expectedVersion,action,kind='arena8-coop.intent.v1'){return Buffer.concat([bytesField(1,sessionId),uintField(2,BigInt(expectedVersion)),stringField(3,kind),bytesField(4,Buffer.from(action,'utf8'))]);}

// Search only the committed board. A stable board has no existing matches, so
// any three aligned elements after the trial swap constitute a legal move.
function legalSwap(board, preferOffense=false){
 const tiles=board.map(tile=>{
  const identity=isFunctional?tile.kind:tile.element;
  assert.equal(typeof identity,'string','Missing versioned tile identity');
  return {identity,multiplier:tile.multiplier};
 });
 let bestMove, bestDamageWeight=-1;
 for(let a=0;a<tiles.length;a++){
  for(const b of [a%8<7?a+1:-1,a<56?a+8:-1]){
   if(b<0||tiles[a].identity===tiles[b].identity)continue;
   [tiles[a],tiles[b]]=[tiles[b],tiles[a]];
   const matched=new Set();
   for(const [index,{identity}] of tiles.entries()){
    if(index%8<6&&identity===tiles[index+1].identity&&identity===tiles[index+2].identity){
     matched.add(index);matched.add(index+1);matched.add(index+2);
    }
    if(index<48&&identity===tiles[index+8].identity&&identity===tiles[index+16].identity){
     matched.add(index);matched.add(index+8);matched.add(index+16);
    }
   }
   if(matched.size){
    const move={kind:'swap',first:a,second:b};
    if(!isFunctional||!preferOffense)return move;
    // The functional fixture can complete all scripted host controls first.
    // Then favor visible sword matches to finish the battle without stalling.
    const damageWeight=[...matched].reduce((weight,index)=>
     weight+(tiles[index].identity==='sword'?tiles[index].multiplier:0),0);
    if(damageWeight>bestDamageWeight){bestMove=move;bestDamageWeight=damageWeight;}
   }
   [tiles[a],tiles[b]]=[tiles[b],tiles[a]];
  }
 }
 if(bestMove)return bestMove;
 throw Error('Committed board has no legal swap');
}

const origin='http://127.0.0.1:3300',adminOrigin='http://127.0.0.1:3301',binary=resolve(process.env.PACKAGED_QA_ENGINE);
const facts={result:'FAIL',scenarios:[], backendSource:process.env.PACKAGED_QA_REVISION, unitySource:process.env.PACKAGED_QA_REVISION};
const nativeFailures=new WeakMap();
const root=resolve(process.env.PACKAGED_QA_RUN);
const roster=['Unity player', 'Integration seat 2','Integration seat 3','Integration seat 4'];
let stopping;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping??=signal;});
const directory=await mkdtemp(join(root,'db-'));
const schema='coop_process_'+randomUUID().replaceAll('-',''),role='coop_runtime_'+randomUUID().replaceAll('-',''),password=randomBytes(32).toString('hex');
const address=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL));
const runtimePort=await new Promise((resolve,reject)=>{
 const server=createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(error=>error?reject(error):resolve(port));});
});
const runtimeOrigin='https://127.0.0.1:'+runtimePort;
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
 const seed=JSON.parse(await readFile('config/gameplay/arena8-coop-v1.seed.json','utf8'));
 const validator=new EngineGameplayBundleValidator(binary);
 const installation=await installGameplayConfig(pool,'arena8-coop-pve',seed,validator,'system:process-test');
 console.log('Installed seed configuration',installation.version,installation.digest);
 const bundle=JSON.parse(await readFile(isFunctional?'config/gameplay/arena8-coop-functional-v1.candidate.json':'config/gameplay/arena8-coop-v2.seed.json','utf8'));
 // Historical captures use the elemental QA publication at content revision 4.
 bundle.contentRevision=isFunctional?bundle.contentRevision+1:4;
 const fire=bundle.bosses.find(boss=>boss.mapId==='cinder-terraces');
 const water=bundle.bosses.find(boss=>boss.mapId==='tideglass-lagoon');
 for(const boss of [fire,water]){
  boss.attackModel.baseDamage=1;
  boss.attackModel.perRoundDamage=0;
  boss.attackModel.minimumDamage=1;
  boss.requiredRoomPoints=0;
 }
 // A test-only publication makes the Fire match winnable with legal swaps.
 fire.maxHp=7000;
 water.requiredRoomPoints=333;
 fire.phase.maxGrowthBp=5000;
 fire.phase.currentBp=1500;
 fire.rewardPolicy.firstClear={achievementPoints:333,coins:144,exp:105,materials:7};
 bundle.multiplier.schedule[0].tiers[0].weight=1;
 bundle.multiplier.schedule[0].tiers.push({...bundle.multiplier.schedule[1].tiers[1],weight:10000});
 fire.defense=1;
 bundle.party.maxRounds=32;
 for(const skill of bundle.skills){
  if(skill.id==='fire-coalwhisk-ember-lance')skill.manaCost=isFunctional?0:1;
  if(skill.id==='fire-coalwhisk-ember-solar-flare')skill.rageCost=isFunctional?0:1;
  if(skill.id==='fire-coalwhisk-blazing-descent')skill.rageCost=isFunctional?0:1;
 }
 const verdict=await validator.validate('arena8-coop-pve',bundle);
 await writeFile(join(root,'test-publication.json'),JSON.stringify(bundle,null,2)+'\n');
 const operatorPassword='process-operator-password',operatorSecret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',operatorKey=randomBytes(32).toString('hex');
 const operatorNow=Date.now();
 await new OperatorService(pool,operatorKey,()=>operatorNow-60000).bootstrap({password:operatorPassword,totpSecret:operatorSecret,code:totp(operatorSecret,operatorNow-60000)});
 const config=readConfig({
  NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:randomBytes(48).toString('base64url'),
  ADMIN_ORIGIN:adminOrigin,OPERATOR_AUTH_KEY:operatorKey,
  LOCAL_COOP_ROOMS:'1',LOCAL_COOP_NATIVE:'1',GAMEPLAY_CONFIG_VALIDATOR_BINARY:binary,
  LOCAL_ARENA8_NATIVE_BINARY:binary,LOCAL_ARENA8_NATIVE_DATABASE_URL:runtime.toString(),
  LOCAL_ARENA8_NATIVE_DB_ROLE:role,LOCAL_ARENA8_NATIVE_CA_FILE:tls.caFile,
  LOCAL_ARENA8_NATIVE_STORAGE_KEY:randomBytes(32).toString('hex'),LOCAL_ARENA8_NATIVE_STORAGE_KEY_ID:'local-v1',
  LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN:runtimeOrigin,
  LOCAL_ARENA8_NATIVE_TLS_CERT_FILE:resolve(directory,'tls/server.pem'),
  LOCAL_ARENA8_NATIVE_TLS_KEY_FILE:resolve(directory,'tls/server.key'),
 });
 app=await createApp(config,pool,false,{petArenaWave1:{enabled:true},petArtifacts:{enabled:true}});
 const loginResponse=await app.http.inject({method:'POST',url:'/v1/operator/login',headers:{origin:adminOrigin},payload:{password:operatorPassword,code:totp(operatorSecret,operatorNow)}});
 assert.equal(loginResponse.statusCode,200,JSON.stringify(loginResponse.json()));
 const operator={cookie:String(loginResponse.headers['set-cookie']).split(';')[0],csrf:loginResponse.json().csrfToken};
 const operatorPost=(action,payload)=>app.http.inject({method:'POST',url:'/v1/operator/'+action,headers:{origin:adminOrigin,cookie:operator.cookie,'x-csrf-token':operator.csrf},payload});
 async function publishFixture(input,expected,parentVersion,expectedActiveRevision){
  const draftResponse=await operatorPost('gameplay-config-draft',{requestId:randomUUID(),ruleset:'arena8-coop-pve',parentVersion,bundle:input});
  const created=draftResponse.json();
  assert.ok(created.version>1,JSON.stringify(created));
  const validation=await operatorPost('gameplay-config-validate',{requestId:randomUUID(),ruleset:'arena8-coop-pve',version:created.version,expectedRevision:created.revision});
  assert.equal(validation.statusCode,200,JSON.stringify(validation.json()));
  assert.equal(validation.json().contentDigest,expected.digest);
  const release=await operatorPost('gameplay-config-publish',{requestId:randomUUID(),ruleset:'arena8-coop-pve',version:created.version,expectedRevision:validation.json().revision,expectedActiveRevision});
  assert.equal(release.statusCode,200,JSON.stringify(release.json()));
  return {version:created.version,activeRevision:release.json().activeRevision};
 }
 const created=await publishFixture(bundle,verdict,null,1);
 const reseed=await installGameplayConfig(pool,'arena8-coop-pve',seed,validator,'system:process-test');
 assert.equal(reseed.created,false);
 assert.equal(reseed.version,created.version);
 assert.equal(reseed.digest,verdict.digest);
 facts.adminPublishedVersion=created.version;
 facts.adminDigest=verdict.digest;
 facts.scenarios.push('admin-published-the-test-bundle-through-the-validated-operator-path');
 let addressIndex=1;
 async function guest(name,petId){
  const response=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.214.1.'+addressIndex++,headers:{origin},payload:{requestId:randomUUID(),displayName:name,avatarKey:'mint'}});
  assert.equal(response.statusCode,201);
  const body=response.json();const accountId=body.profile.id;
  await pool.query('INSERT INTO pet_wave_one_players(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
  const owned=await pool.query('INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,$2,1,0,$3) RETURNING owned_pet_instance_id',[accountId,petId,'starter']);
  return {cookie:String(response.headers['set-cookie']).split(';')[0],csrf:body.csrfToken,accountId,petId,instanceId:owned.rows[0].owned_pet_instance_id};
 }
 const post=(auth,url,payload)=>app.http.inject({method:'POST',url,remoteAddress:'127.214.2.1',headers:{origin,cookie:auth.cookie,'x-csrf-token':auth.csrf},payload});
 const pets=['fire-coalwhisk','water-dewskip','fire-coalwhisk','ground-clodkin'];
 const members=[null];
 for(const [index,pet] of pets.slice(1).entries())members.push(await guest('Integration seat '+(index+1),pet));
 const endpoint=await app.http.listen({host:'127.0.0.1',port:0});
 await writeFile(join(root,'game-endpoint'),endpoint);
 await writeFile(join(root,'game-ca'),tls.caFile);
 console.log('endpoint',endpoint);
 const present=file=>access(join(root,file)).then(()=>true,()=>false);
 const json=(file,value)=>writeFile(join(root,file),JSON.stringify(value,null,2)+'\n');
 async function waitForFile(file){
  for(let attempt=0;attempt<720&&!stopping;attempt++){
   if(await present(file))return;
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw Error('Timed out waiting for '+file);
 }
 async function until(query, values = []) {
  for(let i=0;i<2400&&!stopping;i++){
   const result=await pool.query(query, values);
   if(result.rows.length)return result.rows[0];
   await new Promise(r=>setTimeout(r,500));
  }
  throw Error('Timed out waiting for player action');
 }
 const boss=fire;
 {
 const room=await until("SELECT id AS \"roomId\",boss_id AS \"bossId\" FROM coop_rooms WHERE status='OPEN'");
 const host=(await pool.query('SELECT host_account_id FROM coop_rooms WHERE id=$1',[room.roomId])).rows[0].host_account_id;
 const firstHost=await pool.query('SELECT pet_id,owned_pet_instance_id FROM coop_room_seats WHERE room_id=$1 AND account_id=$2',[room.roomId,host]);
 console.log('Packaged seat originally',JSON.stringify(firstHost.rows));
 const hostTickets=async()=> (await pool.query(
   'SELECT count(t.nonce)::int AS n FROM coop_allocations a LEFT JOIN platform_native_ticket_uses t ON t.world_id=a.world_id AND t.account_id=$2 WHERE a.room_id=$1',
   [room.roomId,host])).rows[0].n;
 facts.accounts=[roster[0],...roster.slice(1)];
 console.log('player-created',room.roomId,room.bossId);
 await writeFile(join(root,'room-id'),room.roomId);
 await json('room-id-json.json',room);
 for(const [index,member] of members.entries())if(index>0){
  assert.equal((await post(member,'/v1/coop/rooms/'+room.roomId+'/join',{requestId:randomUUID()})).statusCode,200);
  assert.equal((await post(member,'/v1/coop/rooms/'+room.roomId+'/pet',{requestId:randomUUID(),petId:member.petId,ownedPetInstanceId:member.instanceId})).statusCode,200);
  assert.equal((await post(member,'/v1/coop/rooms/'+room.roomId+'/ready',{requestId:randomUUID(),ready:true})).statusCode,200);
 }
 console.log('three integrations ready');
 await until("SELECT match_id FROM coop_allocations WHERE status='ACTIVE'");
 const allocation=(await pool.query('SELECT match_id,world_id,boot_id,status,generation,content_hash,config_version,config_digest,jsonb_array_length(seats) AS seats FROM coop_allocations WHERE room_id=$1',[room.roomId])).rows[0];
 const hex=value=>Buffer.isBuffer(value)?value.toString('hex'):String(value);
 assert.equal(allocation.status,'ACTIVE');assert.equal(allocation.seats,4);
 const expected=boss===fire?verdict:await validator.validate('arena8-coop-pve',{...bundle,contentRevision:bundle.contentRevision+1});
 assert.equal(Number(allocation.config_version),boss===fire?created.version:facts.replacementVersion);
 assert.equal(allocation.config_digest,expected.digest);
 assert.equal(hex(allocation.content_hash),expected.contentHash);
 facts.scenarios.push('new-allocation-pinned-the-admin-published-digest-and-content-hash');
 let waterBundle=bundle,waterVerdict=verdict;
 if(advancedWater){
  waterBundle=JSON.parse(await readFile('config/gameplay/arena8-coop-advanced-v1.candidate.json','utf8'));
  // Preserve the existing packaged fixture's earned 333-point Water gate.
  waterBundle.bosses.find(value=>value.id===water.id).requiredRoomPoints=water.requiredRoomPoints;
  waterVerdict=await validator.validate('arena8-coop-pve',waterBundle);
  const next=await publishFixture(waterBundle,waterVerdict,created.version,created.activeRevision);
  await json('advanced-water-publication.json',{version:next.version,digest:waterVerdict.digest,contentHash:waterVerdict.contentHash,bundle:waterBundle});
 }
 const world=(await pool.query('SELECT world_id,enabled,capacity,generation FROM platform_native_worlds WHERE world_id=$1',[allocation.world_id])).rows[0];
 assert.equal(world.world_id,allocation.world_id);assert.equal(world.enabled,true);assert.equal(world.capacity,4);assert.equal(String(world.generation),'1');
 facts.scenarios.push('restricted-runtime-owner-and-four-seat-admission-world-enabled');
 const fireTarget={room,allocation,boss};
 async function freshTicket(seat,{room,allocation,boss}=fireTarget){
  const member=members[seat];
  const response=await post(member,'/v1/coop/rooms/'+room.roomId+'/admission',{});
  assert.equal(response.statusCode,200,JSON.stringify(response.json()));
  const view=response.json();
  assert.equal(view.bossId,boss.id);
  assert.equal(view.matchId,allocation.match_id);
  assert.equal(view.bootId,allocation.boot_id);
  assert.equal(view.accountId,member.accountId);
  assert.equal(view.seat,seat);
  assert.equal(view.contentHash,allocation.content_hash);
  assert.equal(view.clientBuild,advancedWater&&boss.id===water.id?'unity-native-v3':undefined);
  return {value:view.ticket,build:view.clientBuild,expiresAt:Date.parse(view.expiresAt)};
 }
 const caPem=await readFile(tls.caFile,'utf8');
 function reportNativeFailure(error,phase,seat,connection,ticket=connection?.ticket){
  const diagnostics={
   phase,seat,
   closeCode:connection?.closeCode()??null,
   remainingTtlMs:Number.isFinite(ticket?.expiresAt)?ticket.expiresAt-Date.now():null,
   socketAgeMs:connection?.socketAgeMs()??null,
  };
  nativeFailures.set(error,diagnostics);
  console.log('native connection failure',JSON.stringify(diagnostics));
 }
 function client(ticket,seat){
  const startedAt=performance.now();
  const ws=new WebSocket(runtimeOrigin.replace('https:','wss:')+'/rt/v1','vl.native.v1',{ca:caPem,headers:{origin:runtimeOrigin}});
  const queue=[];
  let waiting,closeCode;
  ws.on('message',data=>{
   try{queue.push(decodeServer(new Uint8Array(data)));}
   catch{waiting?.(new Error('Invalid native message'));return;}
   waiting?.(null,queue.shift());
  });
  ws.on('close',code=>{
   closeCode=code;
   waiting?.(new Error('Native socket closed'));
  });
  const next=()=>new Promise((resolve,reject)=>{
   if(queue.length){resolve(queue.shift());return;}
   if(ws.readyState!==WebSocket.OPEN){reject(new Error('Native socket closed'));return;}
   const timer=setTimeout(()=>waiting?.(new Error('Native message timeout')),5000);
   waiting=(error,message)=>{
    waiting=undefined;
    clearTimeout(timer);
    if(error)reject(error);else resolve(message);
   };
  });
  const opened=new Promise((resolve,reject)=>{
   ws.once('open',resolve);
   ws.on('error',()=>{const error=new Error('Native socket transport failed');waiting?.(error);reject(error);});
  });
  return {ws,seat,ticket,opened,next,sequence:1,
   closeCode:()=>closeCode,socketAgeMs:()=>Math.round(performance.now()-startedAt)};
 }
 async function openConnection(seat,target=fireTarget){
  let connection,ticket,phase='ticket';
  try{
   ticket=await freshTicket(seat,target);
   phase='upgrade';
   connection={...client(ticket,seat),target};
   const contentBytes=Buffer.from(target.allocation.content_hash,'hex');
   await connection.opened;
   phase='hello';
   const id=randomBytes(16);
   connection.ws.send(envelope(10,helloMessage(ticket.value,contentBytes,ticket.build),id,connection.sequence++));
   const hello=await connection.next();
   assert.equal(hello.body.case,'hello');
   return connection;
  }catch(error){
   reportNativeFailure(error,phase,seat,connection,ticket);
   connection?.ws.terminate();
   throw error;
  }
 }
 let connections=[];
 async function intent({seat,target},expectedVersion,action,kind='arena8-coop.intent.v1'){
  const matchBytes=Buffer.from(target.allocation.match_id.replaceAll('-',''),'hex');
  const id=randomBytes(16);
  let connection=connections[seat];
  for(let attempt=0;attempt<5&&!stopping;attempt++){
   let awaitingReceipt=false;
   try{
    if(attempt>0||connection.ws.readyState!==WebSocket.OPEN||connection.ticket.expiresAt-Date.now()<2_000){
     connection.ws.terminate();
     connection=await openConnection(seat,target);
     connections[seat]=connection;
    }
    awaitingReceipt=true;
    connection.ws.send(envelope(11,intentMessage(matchBytes,expectedVersion,action,kind),id,connection.sequence++));
    for(let message=0;message<16;message++){
     const env=await connection.next();
     if(Buffer.compare(Buffer.from(env.commandId),id)!==0)continue;
     if(env.body.case==='receipt')return env;
     if(env.body.case==='rejection'){
      if(attempt<4&&[12,13].includes(env.body.value.code))break;
      return env;
     }
    }
   }catch(error){
    if(awaitingReceipt)reportNativeFailure(error,'receipt',seat,connection);
    if(attempt===4)throw error;
    await new Promise(resolve=>setTimeout(resolve,400));
   }
  }
  const error=new Error('Native command did not return a matching result');
  if(!stopping)reportNativeFailure(error,'receipt',seat,connection);
  throw error;
 }
 try{
  async function connectTeammates(){
   for(const seat of [1,2,3]){
    for(let attempt=0;attempt<3;attempt++){
     try{connections[seat]=await openConnection(seat);break;}
     catch(error){if(attempt===2)throw error;await new Promise(r=>setTimeout(r,350));}
    }
   }
  }
  await connectTeammates();
  let froze=false,won=false,lastVersion;
  const seatActions=[0,0,0,0];
  const localTurnActions=new Map([[0,'swap'],[4,'skill'],[8,'signature'],[12,'ultimate'],[16,'guard']]);
  const actionProof=[];
  for(let attempts=0;attempts<1600&&!stopping;attempts++){
   const peek=await intent(connections[1],0,'','arena8-coop.view.v1');
   assert.equal(peek.body.case,'receipt');
   const state=JSON.parse(Buffer.from(peek.body.value.authorizedProjection)).state;
   const version=Number(peek.canonicalVersion);
   if(lastVersion!==version){
    lastVersion=version;
    console.log('projection',JSON.stringify({version,phase:state.phase,activeSeat:state.activeSeat,turn:state.turn,multipliers:state.board.filter(tile=>tile?.multiplier>1).length,boss:state.boss.hp,bossPhase:state.boss.phase}));
    await json('state-'+String(version).padStart(3,'0')+'.json',{version,state});
    await json('live-state.json',{version,state,move:state.phase==='playing'&&state.activeSeat===0?legalSwap(state.board,state.turn>16):null,playerAction:localTurnActions.get(state.turn)??'swap'});
    if(state.phase==='playing'&&state.turn>0&&state.turn%4===1){
     const entry={preActionTurn:state.turn-1,expectedCtrl:localTurnActions.get(state.turn-1)??'swap',version,localCombatant:state.participants[0],bossHp:state.boss.hp};
     seatActions[0]++;
     actionProof.push(entry);await json('player-actions.json',actionProof);
    }
   }
   if(state.phase==='won'||state.phase==='lost'){console.log('terminal',state.phase);won=state.phase==='won';break;}
   if(!froze&&state.phase==='playing'&&state.activeSeat===2&&state.board.some(tile=>tile?.multiplier>1)){
    froze=true;
    await json('before-restart.json',{version,state,hostTickets:await hostTickets()});
    console.log('frozen for packaged reconnect',version,state.activeSeat);
    await waitForFile('restart');
    for(const connection of connections)connection?.ws.terminate();
    connections=[];
    await app.app.close();
    await waitForFile('offline-observed');
    app=await createApp(config,pool,false,{petArenaWave1:{enabled:true},petArtifacts:{enabled:true}});
    await app.http.listen({host:'127.0.0.1',port:Number(new URL(endpoint).port)});
    await connectTeammates();
    const resumed=await intent(connections[1],0,'','arena8-coop.view.v1');
    assert.equal(resumed.body.case,'receipt');
    const restored=JSON.parse(Buffer.from(resumed.body.value.authorizedProjection)).state;
    assert.equal(Number(resumed.canonicalVersion),version);
    assert.deepEqual(restored,state);
    const generation=(await pool.query('SELECT generation FROM coop_allocations WHERE match_id=$1',[allocation.match_id])).rows[0].generation;
    assert.ok(Number(generation)>Number(allocation.generation));
    const heldTickets=await hostTickets();
    await json('after-restart.json',{version,state:restored,generation,hostTickets:heldTickets});
    console.log('recovered exact projection',version,generation,state.ruleset.configDigest);
    await waitForFile('go');
    const renewed=await hostTickets();
    assert.ok(renewed>heldTickets, 'Packaged reconnect must consume a fresh ticket after restart');
    await json('host-renewed.json',{generation,hostTickets:renewed});
    facts.scenarios.push('same-board-and-configuration-survived-runtime-restart-and-a-fresh-packaged-admission');
    continue;
   }
   if(state.phase==='playing'&&state.activeSeat>0){
    const action=state.turn===1||state.turn>16?legalSwap(state.board,state.turn>16):{kind:'guard'};
    const played=await intent(connections[state.activeSeat],version,JSON.stringify({epoch:1,action}));
    assert.equal(played.body.case,'receipt',JSON.stringify(played.body.value));
    seatActions[state.activeSeat]++;
    console.log('integration action',state.activeSeat,action.kind,played.body.case);
   }
   await new Promise(r=>setTimeout(r,650));
  }
   if(stopping)throw new Error('Packaged acceptance was interrupted');
   assert.ok(froze,'Did not reach multiplier and restart hold');
   assert.ok(won,'Fixture expected a cooperative win');
   assert.ok(seatActions.every(count=>count>0));
   await json('seat-actions.json',seatActions);
   facts.scenarios.push('every-independently-authenticated-fire-seat-committed-a-legal-intent');
   for(const action of localTurnActions.values())assert.ok(actionProof.some(entry=>entry.expectedCtrl===action),'Missing player action '+action);
 }finally{for(const c of connections)if(c)c.ws.close();}
 const match=(await pool.query("SELECT ruleset_id,ruleset_version,status,encode(content_hash,'hex') AS content_hash FROM game_native_matches WHERE id=$1",[allocation.match_id])).rows[0];
 assert.equal(match.ruleset_id,'arena8-coop-pve');assert.equal(match.ruleset_version,isFunctional?2:1);assert.equal(match.content_hash,allocation.content_hash);
 assert.equal(match.status,'SETTLING');
 await json('terminal.json',{matchId:allocation.match_id,roomId:room.roomId});
 await waitForFile('settle');
 await Promise.all([new CoopSettlement(pool).drain(),new CoopSettlement(pool).drain()]);
 await new CoopSettlement(pool).drain();
 const inbox=(await pool.query('SELECT outcome FROM coop_settlement_inbox WHERE match_id=$1',[allocation.match_id])).rows[0];
 const expectedOutcome=boss===fire?'won':'lost';
 assert.equal(inbox.outcome,expectedOutcome);
 const rewards=(await pool.query('SELECT achievement_points,coins,exp FROM coop_settlement_rewards WHERE settlement_id IN (SELECT settlement_id FROM coop_settlement_inbox WHERE match_id=$1)',[allocation.match_id])).rows;
 assert.equal(rewards.length,4);
 for(const row of rewards){
  assert.equal(row.achievement_points,fire.rewardPolicy.firstClear.achievementPoints);
  assert.equal(row.coins,fire.rewardPolicy.firstClear.coins);
  assert.equal(row.exp,fire.rewardPolicy.firstClear.exp);
 }
 const materialRows=(await pool.query('SELECT p.materials FROM pet_artifact_players p JOIN coop_room_seats s ON p.account_id=s.account_id WHERE s.room_id=$1',[room.roomId])).rows;
 assert.equal(materialRows.length,4);
 assert.ok(materialRows.every(row=>row.materials===150+fire.rewardPolicy.firstClear.materials),JSON.stringify(materialRows));
 await json('reward-facts.json',{count:rewards.length,rewards,materialRows});
 const settled=(await pool.query('SELECT status FROM coop_allocations WHERE match_id=$1',[allocation.match_id])).rows[0];
 assert.equal(settled.status,'SETTLED');
 const finished=(await pool.query('SELECT status FROM game_native_matches WHERE id=$1',[allocation.match_id])).rows[0];
 assert.equal(finished.status,'FINISHED');
 const delivered=(await pool.query('SELECT count(*)::int AS n FROM game_native_outbox WHERE match_id=$1 AND delivered_at IS NOT NULL',[allocation.match_id])).rows[0];
 assert.equal(delivered.n,1);
 facts.scenarios.push('worker-settlement-paid-all-four-seats-once-and-finished-the-match');
 facts[boss.element+'MatchId']=allocation.match_id;
 const preUpgrade=(await pool.query(
   'SELECT o.artifact_id,o.definition_id,o.upgrade_level,o.acquired_from,p.materials FROM pet_artifact_owned o JOIN pet_artifact_players p USING(account_id) WHERE o.account_id=$1',
   [host])).rows;
 assert.equal(preUpgrade.length,1);
 assert.equal(preUpgrade[0].definition_id,'core-emberglass');
 assert.equal(preUpgrade[0].acquired_from,'starter');
 await json('upgrade-original.json',preUpgrade[0]);
 const waterRoom=await until("SELECT id AS \"roomId\",boss_id AS \"bossId\" FROM coop_rooms WHERE status='OPEN' AND boss_id='tideglass-lagoon-warden'");
 const equipped=(await pool.query(
   'SELECT l.pet_id,l.artifact_id,o.definition_id,o.upgrade_level,p.materials FROM pet_artifact_loadouts l JOIN pet_artifact_owned o USING(account_id,artifact_id) JOIN pet_artifact_players p USING(account_id) WHERE l.account_id=$1',
   [host])).rows;
 assert.equal(equipped.length,1);
 assert.equal(equipped[0].definition_id,'core-emberglass');
 assert.equal(equipped[0].artifact_id,preUpgrade[0].artifact_id);
 assert.equal(equipped[0].upgrade_level,preUpgrade[0].upgrade_level+1);
 assert.equal(preUpgrade[0].materials-equipped[0].materials,60);
 await json('gear-water-facts.json',{waterRoom,equipped,preUpgrade:preUpgrade[0],materialsSpent:preUpgrade[0].materials-equipped[0].materials});
 facts.scenarios.push('packaged-player-equipped-and-upgraded-in-plaza-then-created-a-water-room-using-the-earned-threshold');
 for(const member of members.slice(1)){
  const roomPath='/v1/coop/rooms/'+waterRoom.roomId;
  assert.equal((await post(member,roomPath+'/join',{requestId:randomUUID(),mapId:'tideglass-lagoon'})).statusCode,200);
  assert.equal((await post(member,roomPath+'/pet',{requestId:randomUUID(),petId:member.petId,ownedPetInstanceId:member.instanceId})).statusCode,200);
  assert.equal((await post(member,roomPath+'/ready',{requestId:randomUUID(),ready:true})).statusCode,200);
 }
 await json('water-roster-ready.json',{seats:4});
 const waterAllocation=await until(
   "SELECT match_id, world_id, boot_id, content_hash, seats, config_digest FROM coop_allocations WHERE status='ACTIVE' AND room_id=$1",
   [waterRoom.roomId]);
 const hostLoadout=waterAllocation.seats.find(seat=>seat.account===host);
 assert.equal(waterAllocation.seats.length,4);
 assert.equal(waterAllocation.config_digest,waterVerdict.digest);
 assert.equal(waterAllocation.content_hash,waterVerdict.contentHash);
 assert.equal(hostLoadout.petId,equipped[0].pet_id);
 assert.ok(hostLoadout.loadout.entries.some(entry=>entry.artifactId===equipped[0].artifact_id&&entry.definitionId==='core-emberglass'&&entry.upgradeLevel===equipped[0].upgrade_level));
 const comparison=waterAllocation.seats.find(seat=>seat.account!==host&&seat.petId===hostLoadout.petId);
 assert.ok(comparison);
 assert.equal(comparison.petLevel,hostLoadout.petLevel);
 assert.equal(comparison.loadout.entries.length,0);
 const hp=Number(bundle.artifacts.find(artifact=>artifact.id==='core-emberglass').modifiers.hp);
 const hpPerLevel=Number(bundle.artifacts.find(artifact=>artifact.id==='core-emberglass').perLevel.hp);
 const artifactHp=hp+hpPerLevel*(equipped[0].upgrade_level-1);
 await json('water-allocation-facts.json',{petLevel:hostLoadout.petLevel,comparisonPetLevel:comparison.petLevel,
   unequippedComparison:true,artifactHp,seats:waterAllocation.seats.length,matchId:waterAllocation.match_id,petId:hostLoadout.petId,entries:hostLoadout.loadout.entries,loadoutDigest:hostLoadout.loadout.digest,configDigest:waterAllocation.config_digest});
 facts.scenarios.push('water-allocation-pinned-the-upgraded-emberglass-from-the-packaged-player');
 await until('SELECT nonce FROM platform_native_ticket_uses WHERE world_id=$1 AND account_id=$2', [waterAllocation.world_id,host]);
 facts.scenarios.push('packaged-player-consumed-a-native-admission-in-the-equipped-water-allocation');
 await waitForFile('water-hud-observed');
 if(isFunctional){
  const target={room:waterRoom,allocation:waterAllocation,boss:water};
  async function readWaterVersion(version){
   for(let attempt=0;attempt<100&&!stopping;attempt++){
    const receipt=await intent(connections[1],0,'','arena8-coop.view.v1');
    assert.equal(receipt.body.case,'receipt');
    const observed=Number(receipt.canonicalVersion);
    assert.ok(observed<=version,'Water advanced past the expected version');
    if(observed===version){
     return {version,state:JSON.parse(Buffer.from(receipt.body.value.authorizedProjection)).state};
    }
    await new Promise(resolve=>setTimeout(resolve,300));
   }
   throw Error('Timed out waiting for Water version '+version);
  }
  try{
   connections[1]=await openConnection(1,target);
   const started=await readWaterVersion(1);
   assert.equal(started.state.phase,'playing');
   assert.equal(started.state.activeSeat,0);
   const frost=advancedWater?checkWaterOpening(started.state,waterBundle):null;
   await json('water-started.json',{...started,move:frost?.action??legalSwap(started.state.board)});
   const swapped=await readWaterVersion(2);
   const receipts=(await pool.query(
     'SELECT actor_id=$2 AS "host", committed_version::int AS version FROM game_native_receipts WHERE match_id=$1 ORDER BY committed_version',
     [waterAllocation.match_id,host])).rows;
   await json('water-version-two-observed.json',{...swapped,receipts});
   assert.deepEqual(receipts,[{host:true,version:1},{host:true,version:2}],
    'Water version 2 must be the authenticated host swap before its deadline');
   if(frost)checkWaterEffect(swapped.state,waterBundle,frost.matched);
   await json('water-swapped.json',{...swapped,receipts});
   const retained=(await pool.query('SELECT seats FROM coop_allocations WHERE match_id=$1',[waterAllocation.match_id])).rows[0].seats;
   assert.deepEqual(retained,waterAllocation.seats);
   facts.scenarios.push('packaged-water-host-started-and-swapped-with-the-upgraded-core');
   if(frost)facts.scenarios.push('packaged-host-scored-an-authored-frost-group-and-committed-chill');
   await waitForFile('water-swap-observed');
  }finally{
   connections[1]?.ws.close();
  }
 }

 }
 facts.result='PASS';console.log('reward rows verified',JSON.stringify(facts));

}catch(error){
 if(stopping){
  facts.result='INTERRUPTED';
  facts.signal=stopping;
  process.exitCode=stopping==='SIGINT'?130:143;
 }else{
  const diagnostic=nativeFailures.get(error);
  facts.failure=diagnostic??{name:error.name,message:String(error.message).slice(0,500)};
  if(!diagnostic)facts.frames=String(error.stack??'').split('\n').filter(line=>line.trim().startsWith('at ')).slice(0,4);
  process.exitCode=1;
 }
}finally{
 try{await app?.app.close();}catch{/* Best-effort teardown after a failed assertion. */}
 try{await pool?.end();}catch{/* The pool may already be closing. */}
 if(roleCreated)await admin.query('DROP OWNED BY '+identifier(role)).catch(()=>{});
 if(roleCreated)await admin.query('DROP ROLE '+identifier(role)).catch(()=>{});
 await admin.query('DROP SCHEMA IF EXISTS '+identifier(schema)+' CASCADE').catch(()=>{});
 await admin.end();await rm(directory,{recursive:true,force:true});
 console.log(JSON.stringify(facts));
}
