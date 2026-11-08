import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {GameAckSchema,GameCommandSchema,GameIdSchema,GameModeSchema,GameRulesetVersionSchema,TravelSourceSchema,type GameAck,type GameErrorCode,type GameMode,type GameOwnView,type TravelSource} from '@virtual-city/contracts';
import {GameRulesEngine,projectGameOwn,projectGamePublic,type GameState} from '@virtual-city/boardgame-core';
import type {IdentityService} from '../identity/service';
import type {SocialService} from '../social/service';
import {IncidentPolicy} from '../safety/incidents';
import {SanctionPolicy} from '../safety/sanctions';
import {GameJournalCrypto,type JournalBinding} from './journal-crypto';
import type {GameAdmission,GameInitialFactory,GameJournalHost} from './journal-host';
const startInput=z.strictObject({schemaVersion:z.literal(1),requestId:GameIdSchema,source:TravelSourceSchema,tableId:GameIdSchema,generation:GameIdSchema,expectedVersion:z.number().int().min(1)});
type MatchRow={id:string;table_id:string;generation:string;room_epoch:string;room_id:string;mode:GameMode;ruleset_version:string;status:GameState['status'];state_version:number;deadline_ms:string|null;key_id:string|null;sealed_state:string|null;seed_commitment:string;start_fingerprint:string};
type Participant={account_id:string;membership_id:string;session_id:string;seat_index:number};
type Receipt={fingerprint:string;accepted:boolean;committed_version:number;error_code:GameErrorCode|null};
type Tx={db:PoolClient;open():boolean;beforeCommit?:()=>void;validate:()=>Promise<void>;publish?:()=>Promise<void>};
const terminal=(status:string)=>['FINISHED','ABORTED','INTERRUPTED'].includes(status);
export class GameJournalError extends Error{constructor(readonly code:GameErrorCode){super('Game journal request unavailable');}}
function fail(code:GameErrorCode='UNAVAILABLE'):never{throw new GameJournalError(code);}
// No routes, timers, rule implementations or RoomAuthority are constructed here.
// All I/O is outside the global RoomService queue. Identity locks precede match
// locks; private state is encrypted, receipts/outbox contain only opaque hints.
export class GameJournal{
 #closed=false;#recovered=false;#pending=0;#checkouts=0;#clients=new Map<PoolClient,()=>void>();#factories=new Map<GameMode,GameInitialFactory>();
 constructor(private pool:Pick<Pool,'connect'|'query'>,private identity:IdentityService,private social:Pick<SocialService,'isBlocked'>,private host:GameJournalHost,private crypto:GameJournalCrypto|undefined,private engine=new GameRulesEngine(),factories:readonly GameInitialFactory[]=[]){
  GameIdSchema.parse(host.epoch);
  for(const factory of factories){GameModeSchema.parse(factory.mode);GameRulesetVersionSchema.parse(factory.rulesetVersion);if(this.#factories.has(factory.mode)||!engine.registered.includes(factory.mode+'@'+factory.rulesetVersion))throw Error('Game journal rules configuration unavailable');this.#factories.set(factory.mode,Object.freeze({...factory}));}
 }
 private async checkout(){
  if(this.#closed||this.#checkouts>=16)fail();this.#checkouts++;
  return new Promise<PoolClient>((ok,no)=>{let expired=false;const timer=setTimeout(()=>{expired=true;no(new GameJournalError('UNAVAILABLE'));},2000);
   Promise.resolve().then(()=>this.pool.connect()).then(db=>{clearTimeout(timer);this.#checkouts--;if(expired||this.#closed){db.release(true);if(!expired)no(new GameJournalError('UNAVAILABLE'));return;}ok(db);},()=>{clearTimeout(timer);this.#checkouts--;if(!expired)no(new GameJournalError('UNAVAILABLE'));});
  });
 }
 private async transaction<T>(work:(tx:Tx)=>Promise<T>):Promise<T>{
  if(this.#closed)fail();if(this.#pending>=16)fail('RATE_LIMITED');this.#pending++;
  let db:PoolClient|undefined,timer:ReturnType<typeof setTimeout>|undefined,expired=false,released=false;
  const onError=()=>release(true);
  const release=(destroy=false)=>{if(!db||released)return;released=true;this.#clients.delete(db);db.removeListener('error',onError);db.release(destroy);};
  try{
   await this.host.assertOwner();db=await this.checkout();const client=db;db.on('error',onError);this.#clients.set(db,()=>release(true));
   const tx:Tx={db:client,open:()=>!expired&&!released&&!this.#closed,validate:async()=>{}};
   const run=async()=>{await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='2000ms'");await client.query("SET LOCAL lock_timeout='1000ms'");const value=await work(tx);await this.host.assertOwner();await tx.validate();if(!tx.open())fail();tx.beforeCommit?.();await client.query('COMMIT');return value;};
   const value=await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;release(true);reject(new GameJournalError('UNAVAILABLE'));},6000);})]);
   // COMMIT can succeed while its reply/owner is lost. Never publish a private
   // view until the owner is confirmed; retry reads the durable receipt.
   await this.host.assertOwner();await tx.publish?.();if(!tx.open())fail();release();return value;
  }catch(error){if(db&&!released){try{await db.query('ROLLBACK');}catch{release(true);}}if(error instanceof GameJournalError)throw error;fail();}
  finally{clearTimeout(timer);release(expired);this.#pending--;}
 }
 private async clock(db:PoolClient){const value=Number((await db.query<{at:string}>("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS at")).rows[0].at);if(!Number.isSafeInteger(value)||value<0)fail();return value;}
 private binding(row:MatchRow):JournalBinding{return {matchId:row.id,generation:row.generation,roomEpoch:row.room_epoch,mode:row.mode,rulesetVersion:row.ruleset_version,version:row.state_version};}
 private document(row:MatchRow):{state:GameState;seed:string}{
  if(!this.crypto||row.key_id!==this.crypto.keyId||!row.sealed_state)fail();
  try{const doc=JSON.parse(this.crypto.open(row.sealed_state,this.binding(row)));if(!doc||doc.schemaVersion!==1||Object.keys(doc).sort().join(',')!=='schemaVersion,seed,state'||typeof doc.seed!=='string'||!(/^[a-f0-9]{64}$/.test(doc.seed)))fail();const state:GameState=doc.state,commitment=createHash('sha256').update(JSON.stringify(['game-seed-v1',doc.seed,row.id,row.ruleset_version])).digest('hex');if(state.seedCommitment!==commitment||state.seedCommitment!==row.seed_commitment||state.matchId!==row.id||state.tableId!==row.table_id||state.generation!==row.generation||state.roomEpoch!==row.room_epoch||state.roomId!==row.room_id||state.mode!==row.mode||state.rulesetVersion!==row.ruleset_version||state.stateVersion!==row.state_version||state.status!==row.status||state.deadline!==(row.deadline_ms===null?null:Number(row.deadline_ms))||!projectGamePublic(state,state.committedAt).ok)fail();return {state,seed:doc.seed};}catch{fail();}
 }
 private state(row:MatchRow){return this.document(row).state;}
 private own(state:GameState,account:string,clock:number):GameOwnView{const result=projectGameOwn(state,account,clock);if(!result.ok)fail(result.error);return result.value;}
 private async participants(db:Pick<Pool,'query'>|PoolClient,matchId:string){return (await db.query<Participant>('SELECT account_id,membership_id,session_id,seat_index FROM engine_game_participants WHERE match_id=$1 ORDER BY account_id',[matchId])).rows;}
 private async locked(tx:Tx,matchId:string,account?:string){
  const candidates=await this.participants(tx.db,matchId);if(!candidates.length||account&&!candidates.some(p=>p.account_id===account))fail('NOT_PARTICIPANT');
  await this.identity.lockAccounts(tx.db,candidates.map(p=>p.account_id));
  const row=(await tx.db.query<MatchRow>('SELECT * FROM engine_game_matches WHERE id=$1 FOR UPDATE',[matchId])).rows[0];if(!row)fail('NOT_PARTICIPANT');
  const members=await this.participants(tx.db,matchId);if(JSON.stringify(members)!==JSON.stringify(candidates))fail('STATE_CONFLICT');return {row,members};
 }
 private async authorize(tx:Tx,token:string,row:MatchRow,members:Participant[],source:TravelSource,lease:()=>boolean,deadline?:number){
  const actor=await this.identity.contextInTransaction(tx.db,token);if(!members.some(m=>m.account_id===actor.accountId)||row.room_epoch!==this.host.epoch||source.epoch!==row.room_epoch||source.roomId!==row.room_id||members.find(m=>m.account_id===actor.accountId)?.membership_id!==source.membershipId||!this.host.enabled(row.mode))fail('NOT_IN_ROOM');
  for(const member of members){
   if(!await this.identity.hasConnectedSession(member.account_id,[member.session_id],tx.db))fail('NOT_IN_ROOM');
   await new IncidentPolicy(tx.db).assert(member.account_id,'lantern-lodge',row.room_id);await new SanctionPolicy(tx.db).assert(member.account_id,'lantern-lodge',row.room_id);
  }
  for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++)if(await this.social.isBlocked(members[i].account_id,members[j].account_id,tx.db))fail('UNAVAILABLE');
  const clock=await this.clock(tx.db);if(deadline!==undefined&&clock>=deadline)fail('DEADLINE_EXPIRED');
  if(!lease()||members.some(m=>!this.host.present(m.account_id,m.session_id,{epoch:row.room_epoch,roomId:row.room_id,membershipId:m.membership_id})))fail('NOT_IN_ROOM');return {actor,clock};
 }
 private async save(tx:Tx,state:GameState,seed:string){
  if(!this.crypto||!projectGamePublic(state,state.committedAt).ok)fail();
  if(terminal(state.status)){state={...state,members:state.members.map(m=>({...m,handCount:0})),own:Object.fromEntries(state.members.map(m=>[m.accountId,null])),internal:null};if(!projectGamePublic(state,state.committedAt).ok)fail();}
  const binding:JournalBinding={matchId:state.matchId,generation:state.generation,roomEpoch:state.roomEpoch,mode:state.mode,rulesetVersion:state.rulesetVersion,version:state.stateVersion};
  const sealed=this.crypto.seal(JSON.stringify({schemaVersion:1,state,seed}),binding);
  await tx.db.query('UPDATE engine_game_matches SET state_version=$2,status=$3,deadline_ms=$4,key_id=$5,sealed_state=$6,updated_at=clock_timestamp() WHERE id=$1',[state.matchId,state.stateVersion,state.status,state.deadline,this.crypto.keyId,sealed]);
  await tx.db.query("INSERT INTO engine_game_outbox(match_id,state_version,recipient_id,created_at) SELECT $1,$2,account_id,clock_timestamp() FROM engine_game_participants WHERE match_id=$1 ON CONFLICT DO NOTHING",[state.matchId,state.stateVersion]);
  if(terminal(state.status)){await tx.db.query('DELETE FROM engine_game_active_claims WHERE match_id=$1',[state.matchId]);await tx.db.query('INSERT INTO engine_game_results(match_id,outcome,state_version,created_at) VALUES($1,$2,$3,clock_timestamp()) ON CONFLICT DO NOTHING',[state.matchId,state.status==='FINISHED'?'finished':'aborted',state.stateVersion]);}
  return state;
 }
 async command(token:string,raw:unknown):Promise<GameAck>{
  if(!this.#recovered)fail('OWNER_UNAVAILABLE');
  const command=GameCommandSchema.parse(raw);if(!this.crypto)fail();const fingerprint=this.crypto.fingerprint(JSON.stringify(command)),lease=await this.host.visit(token,command.source);
  return this.transaction(async tx=>{
   const {row,members}=await this.locked(tx,command.matchId,lease.actor.accountId),document=this.document(row);let state=document.state;const first=await this.authorize(tx,token,row,members,command.source,lease.valid);
   const receipt=(await tx.db.query<Receipt>('SELECT fingerprint,accepted,committed_version,error_code FROM engine_game_receipts WHERE match_id=$1 AND account_id=$2 AND request_id=$3',[row.id,first.actor.accountId,command.requestId])).rows[0];
   if(receipt&&receipt.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT');
   let accepted=receipt?.accepted,error=receipt?.error_code??null,version=receipt?.committed_version,deadline:number|undefined;
   if(!receipt){
    const decision=this.engine.decide(state,command,{accountId:first.actor.accountId,source:command.source,now:first.clock,randomWords:[]});accepted=decision.ok;
    if(decision.ok){deadline=state.deadline??undefined;state=await this.save(tx,decision.state,document.seed);version=state.stateVersion;}else{error=decision.error;version=state.stateVersion;}
    await tx.db.query('INSERT INTO engine_game_receipts(match_id,account_id,request_id,fingerprint,accepted,committed_version,error_code,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())',[row.id,first.actor.accountId,command.requestId,fingerprint,accepted,version,error]);
   }
   tx.validate=async()=>{await this.authorize(tx,token,row,members,command.source,lease.valid,deadline);};
   tx.publish=async()=>{await this.authorize(tx,token,row,members,command.source,lease.valid);};
   const current=await this.clock(tx.db);return GameAckSchema.parse(accepted?{schemaVersion:1,requestId:command.requestId,ok:true,replayed:!!receipt,committedVersion:version,view:this.own(state,first.actor.accountId,current)}:{schemaVersion:1,requestId:command.requestId,ok:false,serverVersion:state.stateVersion,error:{code:error??'INTERNAL_ERROR',retryable:false}});
  });
 }
 async read(token:string,matchId:string,source:TravelSource){
  GameIdSchema.parse(matchId);TravelSourceSchema.parse(source);const lease=await this.host.visit(token,source);return this.transaction(async tx=>{const {row,members}=await this.locked(tx,matchId,lease.actor.accountId);const fresh=await this.authorize(tx,token,row,members,source,lease.valid);const state=this.state(row);tx.validate=async()=>{await this.authorize(tx,token,row,members,source,lease.valid);};tx.publish=tx.validate;return this.own(state,fresh.actor.accountId,fresh.clock);});
 }
 async start(token:string,raw:unknown){
  if(!this.#recovered)fail('OWNER_UNAVAILABLE');
  const input=startInput.parse(raw);if(!this.crypto)fail();const fingerprint=this.crypto.fingerprint(JSON.stringify(input)),lease=await this.host.visit(token,input.source);
  const prior=await this.transaction(async tx=>{await this.identity.lockAccounts(tx.db,[lease.actor.accountId]);await this.identity.contextInTransaction(tx.db,token);const row=(await tx.db.query<MatchRow>('SELECT * FROM engine_game_matches WHERE starter_id=$1 AND start_request_id=$2',[lease.actor.accountId,input.requestId])).rows[0];tx.validate=async()=>{await this.identity.contextInTransaction(tx.db,token);if(!lease.valid())fail('NOT_IN_ROOM');};return row;});
  if(prior){if(prior.start_fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT');return {replayed:true,view:await this.read(token,prior.id,input.source)};}
  const admission=await this.host.admit(token,input),factory=this.#factories.get(admission.mode);if(!factory||!this.host.enabled(admission.mode))fail('WORLD_DISABLED');
  return this.transaction(async tx=>{
   await this.identity.lockAccounts(tx.db,admission.members.map(m=>m.accountId));const actor=await this.identity.contextInTransaction(tx.db,token);
   if(actor.accountId!==lease.actor.accountId||!admission.members.some(m=>m.accountId===actor.accountId))fail('NOT_PARTICIPANT');
   const raced=(await tx.db.query<MatchRow>('SELECT * FROM engine_game_matches WHERE starter_id=$1 AND start_request_id=$2 FOR UPDATE',[actor.accountId,input.requestId])).rows[0];
   if(raced){if(raced.start_fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT');const members=await this.participants(tx.db,raced.id);const fresh=await this.authorize(tx,token,raced,members,input.source,lease.valid);tx.validate=async()=>{await this.authorize(tx,token,raced,members,input.source,lease.valid);};tx.publish=tx.validate;return {replayed:true,view:this.own(this.state(raced),actor.accountId,fresh.clock)};}
   if(!admission.valid())fail('STATE_CONFLICT');const clock=await this.clock(tx.db),matchId=randomUUID(),seed=this.crypto!.seed(matchId,factory.rulesetVersion),state=factory.create({admission,matchId,seed:seed.seed,seedCommitment:seed.commitment,clock});
   this.validateInitial(state,admission,matchId,factory.rulesetVersion,seed.commitment,clock);
   const sealed=this.crypto!.seal(JSON.stringify({schemaVersion:1,state,seed:seed.seed}),{matchId,generation:state.generation,roomEpoch:state.roomEpoch,mode:state.mode,rulesetVersion:state.rulesetVersion,version:state.stateVersion});
   await tx.db.query('INSERT INTO engine_game_matches(id,table_id,generation,room_epoch,room_id,mode,ruleset_version,status,state_version,deadline_ms,starter_id,start_request_id,start_fingerprint,key_id,sealed_state,seed_commitment,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,clock_timestamp(),clock_timestamp())',[matchId,state.tableId,state.generation,state.roomEpoch,state.roomId,state.mode,state.rulesetVersion,state.status,state.stateVersion,state.deadline,actor.accountId,input.requestId,fingerprint,this.crypto!.keyId,sealed,state.seedCommitment]);
   for(const member of admission.members){await tx.db.query('INSERT INTO engine_game_participants(match_id,account_id,membership_id,session_id,seat_index) VALUES($1,$2,$3,$4,$5)',[matchId,member.accountId,member.membershipId,member.sessionId,member.seatIndex]);await tx.db.query('INSERT INTO engine_game_active_claims(account_id,match_id,generation) VALUES($1,$2,$3)',[member.accountId,matchId,state.generation]);}
   const saved=await this.save(tx,state,seed.seed),row=(await tx.db.query<MatchRow>('SELECT * FROM engine_game_matches WHERE id=$1',[matchId])).rows[0],members=await this.participants(tx.db,matchId);
   tx.validate=async()=>{await this.authorize(tx,token,row,members,input.source,()=>lease.valid()&&admission.valid(),state.deadline??undefined);};
   tx.publish=async()=>{await this.authorize(tx,token,row,members,input.source,lease.valid);};
   // Consume readiness conservatively before COMMIT. A failed/ambiguous commit
   // never leaves an old consent proof capable of starting another match.
   tx.beforeCommit=()=>admission.consume();return {replayed:false,view:this.own(saved,actor.accountId,clock)};
  });
 }
 private validateInitial(state:GameState,admission:GameAdmission,id:string,rules:string,commitment:string,clock:number){
  const limits={'lantern-colors':[2,6],'mask-and-tell':[3,6],'mistbound-routes':[4,8]}[admission.mode];
  if(state.matchId!==id||state.tableId!==admission.tableId||state.generation!==admission.generation||state.roomEpoch!==admission.roomEpoch||state.roomEpoch!==this.host.epoch||state.roomId!==admission.roomId||state.mode!==admission.mode||state.rulesetVersion!==rules||state.stateVersion!==1||state.committedAt!==clock||state.seedCommitment!==commitment||state.status!=='ACTIVE'||state.deadline===null||state.deadline<=clock||admission.members.length<limits[0]||admission.members.length>limits[1]||state.members.length!==admission.members.length||state.members.some(m=>!m.ready||!m.connected||!admission.members.some(a=>a.accountId===m.accountId&&a.membershipId===m.membershipId&&a.seatIndex===m.seatIndex))||!projectGamePublic(state,clock).ok)fail('INVALID_REQUEST');
 }
 async abort(token:string,matchId:string){
  GameIdSchema.parse(matchId);const actor=await this.identity.authenticate(token);return this.transaction(async tx=>{const {row}=await this.locked(tx,matchId,actor.accountId);await this.identity.contextInTransaction(tx.db,token);tx.validate=async()=>{await this.identity.contextInTransaction(tx.db,token);};return this.abortRow(tx,row);});
 }
 private async abortRow(tx:Tx,row:MatchRow){
  if(!terminal(row.status)){if(row.state_version>=2147483647)fail();await tx.db.query("UPDATE engine_game_matches SET status='ABORTED',state_version=state_version+1,deadline_ms=NULL,key_id=NULL,sealed_state=NULL,updated_at=clock_timestamp() WHERE id=$1",[row.id]);await tx.db.query('DELETE FROM engine_game_active_claims WHERE match_id=$1',[row.id]);await tx.db.query("INSERT INTO engine_game_results(match_id,outcome,state_version,created_at) VALUES($1,'aborted',$2,clock_timestamp()) ON CONFLICT DO NOTHING",[row.id,row.state_version+1]);await tx.db.query('INSERT INTO engine_game_outbox(match_id,state_version,recipient_id,created_at) SELECT $1,$2,account_id,clock_timestamp() FROM engine_game_participants WHERE match_id=$1 ON CONFLICT DO NOTHING',[row.id,row.state_version+1]);}
  return {matchId:row.id,status:terminal(row.status)?row.status:'ABORTED',stateVersion:terminal(row.status)?row.state_version:row.state_version+1,winnerDeclared:false as const};
 }
 async recover(){
  const candidates=await this.transaction(async tx=>(await tx.db.query<{id:string}>("SELECT id FROM engine_game_matches WHERE status NOT IN ('FINISHED','ABORTED','INTERRUPTED') ORDER BY updated_at,id LIMIT 10")).rows);let aborted=0;
  for(const candidate of candidates)await this.transaction(async tx=>{const {row,members}=await this.locked(tx,candidate.id);if(terminal(row.status))return;const clock=await this.clock(tx.db);let invalid=row.room_epoch!==this.host.epoch||!this.host.enabled(row.mode)||!this.crypto||row.key_id!==this.crypto.keyId||row.deadline_ms!==null&&Number(row.deadline_ms)<=clock;
   for(const member of members)if(!invalid&&(!this.host.present(member.account_id,member.session_id,{epoch:row.room_epoch,roomId:row.room_id,membershipId:member.membership_id})||!await this.identity.hasConnectedSession(member.account_id,[member.session_id],tx.db)||!await new IncidentPolicy(tx.db).permits(member.account_id,'lantern-lodge')||!await new SanctionPolicy(tx.db).permits(member.account_id,'lantern-lodge',row.room_id)))invalid=true;
   for(let i=0;!invalid&&i<members.length;i++)for(let j=i+1;!invalid&&j<members.length;j++)if(await this.social.isBlocked(members[i].account_id,members[j].account_id,tx.db))invalid=true;
   if(!invalid){try{this.state(row);}catch{invalid=true;}}
   if(invalid){await this.abortRow(tx,row);aborted++;}else await tx.db.query('UPDATE engine_game_matches SET updated_at=clock_timestamp() WHERE id=$1',[row.id]);
  });if(candidates.length<10)this.#recovered=true;return {examined:candidates.length,aborted,ready:this.#recovered};
 }
 async withdrawContact(db:PoolClient,a:string,b:string){const rows=(await db.query<MatchRow>("SELECT m.* FROM engine_game_matches m WHERE m.status NOT IN ('FINISHED','ABORTED','INTERRUPTED') AND m.id IN (SELECT match_id FROM engine_game_participants WHERE account_id=ANY($1::uuid[]) GROUP BY match_id HAVING count(*)=2) ORDER BY m.id FOR UPDATE",[[a,b]])).rows;for(const row of rows)await this.abortRow({db,open:()=>true,validate:async()=>{}},row);}
 async status(token:string,matchId:string){GameIdSchema.parse(matchId);const actor=await this.identity.authenticate(token);return this.transaction(async tx=>{const {row}=await this.locked(tx,matchId,actor.accountId);tx.validate=async()=>{await this.identity.contextInTransaction(tx.db,token);};tx.publish=tx.validate;return {matchId:row.id,status:row.status,stateVersion:row.state_version,privateStateAvailable:false as const};});}
 async redactAccount(db:PoolClient,account:string){const rows=(await db.query<MatchRow>('SELECT m.* FROM engine_game_matches m JOIN engine_game_participants p ON p.match_id=m.id WHERE p.account_id=$1 ORDER BY m.id FOR UPDATE OF m',[account])).rows;for(const row of rows){await this.abortRow({db,open:()=>true,validate:async()=>{}},row);await db.query('DELETE FROM engine_game_outbox WHERE match_id=$1',[row.id]);await db.query('UPDATE engine_game_matches SET key_id=NULL,sealed_state=NULL WHERE id=$1',[row.id]);}}
 async exportAccount(db:PoolClient,account:string){return {schemaVersion:1,matches:(await db.query("SELECT m.id,m.mode,m.status,m.state_version FROM engine_game_matches m JOIN engine_game_participants p ON p.match_id=m.id WHERE p.account_id=$1 ORDER BY m.updated_at DESC LIMIT 100",[account])).rows};}
 async close(){this.#closed=true;for(const release of this.#clients.values())release();this.#clients.clear();this.crypto?.close();}
}
