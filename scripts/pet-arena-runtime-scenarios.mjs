import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {nativeRecoveryScenarios} from './native-recovery-scenarios.mjs';

// Extends the shared real Nest/Chromium/WSS/Rust/TLS-PostgreSQL harness. The
// driver chooses intents from public board data; Rust computes every effect.
export async function petArenaScenarios(c){
 const {pool,admin,schema,rewardRole,rewardPassword,address,directory,scope,identity,store,issuer,credential,csrf,call,fresh,origin,hello,startHost,stopHost,matchId,player,record}=c;
 const outcome=c.loss?'lost':'won',reward=c.loss?'DECLINED':'GRANTED',grants=c.loss?0:1;
 const baseNonces=(await pool.query('SELECT count(*)::int AS n FROM platform_native_ticket_uses')).rows[0].n;
 let extraNonces=0,id=10,link={index:fresh,sequence:2};
 const workers=new Set();
 const intent=(version,action,kind='pet.intent.v1')=>({gameSessionId:Array.from(Buffer.from(matchId.replaceAll('-',''),'hex')),expectedStateVersion:String(version),kind,actionPayload:kind==='pet.view.v1'?[]:Array.from(Buffer.from(JSON.stringify({epoch:1,action})))});
 const exchange=async(value,command=id++,sequence=link.sequence++)=>{await call('send',link.index,command,sequence,'gameIntent',value);return call('next',link.index);};
 const checkpoint=async()=>(await pool.query('SELECT state_version,rng_cursor,audit_hash,sealed_snapshot FROM game_native_matches WHERE id=$1',[matchId])).rows[0];
 const receiptCount=async()=>(await pool.query('SELECT count(*)::int AS n FROM game_native_receipts')).rows[0].n;
 const view=async()=>{const result=await exchange(intent(0,undefined,'pet.view.v1'));assert.equal(result.kind,'receipt',JSON.stringify({kind:result.kind,code:result.code,closed:result.closed}));return result;};
 const grantCount=async()=>(await pool.query('SELECT count(*)::int AS n FROM platform_native_reward_ledger')).rows[0].n;
 const reconnect=async()=>{
  await store.allocate(credential,scope);
  const ticket=await call('ticket',csrf);assert.equal(ticket.status,200);
  const index=await call('open',origin.replace('https:','wss:')+'/rt/v1');
  await call('send',index,1,1,'hello',hello(ticket.body.ticket));assert.equal((await call('next',index)).kind,'hello');
  extraNonces++;link={index,sequence:2};
 };
 try{
  const health=await (await fetch('http://127.0.0.1:'+c.upstream()+'/health/ready')).json();assert.equal(health.ruleset,'pet-arena-pve');
  const initial=await view();assert.equal(initial.receipt.committed,false);assert.equal(initial.receipt.projection.state.phase,'ready');
  const before=await checkpoint();
  for(const value of [intent(0,{kind:'reward',amount:999999}),{...intent(0,{kind:'start'}),gameSessionId:Array(16).fill(9)},intent(0,{kind:'start',outcome:'won'}),intent(0,{kind:'swap',first:0,second:35})]){
   assert.equal((await exchange(value)).kind,'rejection');assert.deepEqual(await checkpoint(),before);
  }
  assert.equal(await receiptCount(),0);assert.equal(await grantCount(),0);record('forged-reward-client-result-wrong-match-and-invalid-action-have-zero-effects');
  const startId=id++,startIntent=intent(0,{kind:'start'}),startSequence=link.sequence++;
  await call('send',link.index,startId,startSequence,'gameIntent',startIntent);const start=await call('next',link.index);
  assert.equal(start.kind,'receipt');assert.equal(start.version,'1');assert.equal(start.receipt.projection.state.phase,'playing');
  await call('send',link.index,startId,startSequence,'gameIntent',startIntent);assert.equal((await call('next',link.index)).hex,start.hex);
  const active=await checkpoint();
  for(const value of [intent(0,{kind:'pass'}),intent(1,{kind:'swap',first:0,second:35}),intent(1,{kind:'swap',first:255,second:0})]){
   assert.equal((await exchange(value)).kind,'rejection');assert.deepEqual(await checkpoint(),active);
  }
  assert.equal(await receiptCount(),1);record('start-duplicate-intent-invalid-swap-and-stale-version-are-fenced');
  const stranger=await identity.guest({requestId:randomUUID(),displayName:'Pet outsider',avatarKey:'mint'});
  await store.allocate(stranger.token,scope);
  for(const value of [intent(1,{kind:'pass'}),intent(0,undefined,'pet.view.v1')]){
   const ticket=await issuer.issue(stranger.token,scope);const index=await call('open',origin.replace('https:','wss:')+'/rt/v1');
   await call('send',index,1,1,'hello',hello(ticket.ticket));assert.equal((await call('next',index)).kind,'hello');extraNonces++;
   await call('send',index,2,2,'gameIntent',value);
   const denied=await call('next',index);assert.equal(denied.kind,'rejection');assert.equal(denied.receipt,undefined);await call('close',index);
  }
  assert.deepEqual(await checkpoint(),active);record('admitted-wrong-actor-cannot-command-or-read-private-pet-projection');
  const mid=await exchange(intent(1,{kind:'skill'}));assert.equal(mid.kind,'receipt');assert.equal(mid.version,'2');
  const saved=await checkpoint();await stopHost();
  await nativeRecoveryScenarios(c);
  await startHost();assert.deepEqual(await checkpoint(),saved);
  await reconnect();const restored=await view();assert.equal(restored.version,'2');assert.deepEqual(restored.receipt.projection,mid.receipt.projection);
  const replay=await exchange(startIntent,startId);assert.equal(replay.receipt.committed,true);assert.equal(replay.version,'1');assert.deepEqual(replay.receipt.projection,start.receipt.projection);
  assert.equal(await receiptCount(),2);record('sigkill-mid-match-restores-exact-checkpoint-and-authenticated-receipt-replay');
  let current=restored,terminalIntent,terminalId;
  while(current.receipt.projection.state.phase==='playing'){
   const state=current.receipt.projection.state;
   const action=c.loss?{kind:'pass'}:state.cooldown===0?{kind:'skill'}:bestSwap(state.board);
   const value=intent(Number(current.version),action),command=id++;
   current=await exchange(value,command);assert.equal(current.kind,'receipt');
   assert(Number(current.version)<=61);terminalIntent=value;terminalId=command;
  }
  assert.equal(current.receipt.projection.state.phase,outcome);assert.equal(current.receipt.projection.reward,'REWARD_PENDING');
  const finalVersion=Number(current.version);assert.equal(await receiptCount(),finalVersion);
  const settlement=(await pool.query('SELECT proposal,proposal_hash FROM game_native_settlements')).rows;
  assert.equal(settlement.length,1);assert.deepEqual(settlement[0].proposal,{kind:'pet-arena.completed.v1',outcome,ruleset:'pet-arena-pve',rulesetVersion:1});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_native_outbox')).rows[0].n,1);
  assert.equal(await grantCount(),0);assert.equal((await view()).receipt.projection.reward,'REWARD_PENDING');
  record('full-pet-pve-match-creates-one-durable-server-outcome-and-delayed-reward');

  await admin.query(`CREATE ROLE "${rewardRole}" LOGIN PASSWORD '${rewardPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4`);c.markRewardRoleCreated();
  await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${rewardRole}"`);
  const profile=JSON.parse(await readFile('config/native-reward-worker-db-privileges.json'));
  const identifier=value=>{assert.match(value,/^[a-z][a-z0-9_]*$/);return '"'+value+'"';};
  for(const op of ['select','insert'])for(const table of profile[op])await pool.query(`GRANT ${op.toUpperCase()} ON ${identifier(table)} TO ${identifier(rewardRole)}`);
  for(const [table,columns]of Object.entries(profile.update))await pool.query(`GRANT UPDATE (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(rewardRole)}`);
  const rewardPolicy=directory+'/pet-reward-policy.private.json';
  const policy={schemaVersion:1,world:scope.worldId,ruleset:'pet-arena-pve',rulesetVersion:1,contentHash:scope.contentHash,rewardKey:'pet-training-win',completionKind:'pet-arena.completed.v1'};
  await writeFile(rewardPolicy,JSON.stringify(policy),{mode:0o600});
  const workerAddress=new URL(address);workerAddress.username=rewardRole;workerAddress.password=rewardPassword;
  function worker(){
   const child=spawn(process.execPath,['apps/platform-api/dist/worker.js','--once'],{env:{PATH:process.env.PATH,NODE_ENV:'test',DATABASE_URL:workerAddress.toString(),DURABLE_JOB_ROLE:'worker',NATIVE_REWARD_POLICY_FILE:rewardPolicy},stdio:['ignore','pipe','pipe']});
   workers.add(child);let log='';child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
   const done=new Promise((ok,no)=>{child.once('error',no);child.once('close',code=>{workers.delete(child);ok(code);});});
   return {child,done,log:()=>log};
  }
  async function runWorker(){const process=worker();assert.equal(await process.done,0,process.log());assert(!process.log().includes(rewardPassword));}
  // Wrong configured content cannot consume a pending Pet outcome.
  await writeFile(rewardPolicy,JSON.stringify({...policy,contentHash:'ee'.repeat(32)}));await runWorker();assert.equal(await grantCount(),0);
  await writeFile(rewardPolicy,JSON.stringify(policy));record('worker-content-mismatch-leaves-terminal-outcome-pending');
  // Elevated fixture mutations simulate damaged/forged delivery records. The
  // restricted worker must decline them even with a freshly recomputed hash.
  const original=settlement[0].proposal;
  for(const forged of [{...original,outcome:'claimed'}, {...original,amount:9999}, {...original,rulesetVersion:2}, {...original,accountId:randomUUID()}]){
   await pool.query('UPDATE game_native_settlements SET proposal=$1,proposal_hash=$2',[forged,createHash('sha256').update(JSON.stringify(forged)).digest()]);
   await runWorker();assert.equal(await grantCount(),0);await reconnect();assert.equal((await view()).receipt.projection.reward,'DECLINED');
   await pool.query('DELETE FROM platform_native_reward_inbox');
   await pool.query('UPDATE game_native_outbox SET delivered_at=NULL,delivery_outcome=NULL');
  }
  await pool.query('UPDATE game_native_settlements SET proposal=$1,proposal_hash=$2',[original,settlement[0].proposal_hash]);
  for(const [version,epoch] of [[finalVersion-1,1],[finalVersion,2]]){
   await assert.rejects(pool.query('INSERT INTO game_native_settlements(match_id,state_version,epoch,settlement_id,proposal_hash,proposal) VALUES($1,$2,$3,$4,$5,$6)',[matchId,version,epoch,randomUUID(),settlement[0].proposal_hash,original]),{code:'23514'});
  }
  record('forged-mismatched-and-stale-terminal-results-never-grant');
  // Current platform authority can remove eligibility after combat ends.
  for(const reason of ['account-suspended','world-closed']){
   if(reason==='account-suspended')await pool.query("UPDATE identity_accounts SET status='suspended' WHERE id=$1",[player]);
   else await pool.query("INSERT INTO safety_incident_controls VALUES($1,'world',true,NULL,clock_timestamp())",[scope.worldId]);
   await runWorker();assert.equal(await grantCount(),0);
   assert.equal((await pool.query('SELECT outcome FROM platform_native_reward_inbox')).rows[0].outcome,'declined');
   if(reason==='account-suspended')await pool.query("UPDATE identity_accounts SET status='active' WHERE id=$1",[player]);
   else await pool.query('DELETE FROM safety_incident_controls WHERE world_slug=$1',[scope.worldId]);
   await pool.query('DELETE FROM platform_native_reward_inbox');
   await pool.query('UPDATE game_native_outbox SET delivered_at=NULL,delivery_outcome=NULL');
  }
  record('current-platform-account-and-incident-eligibility-controls-reward');
  // Crash after both writes, before commit: neither inbox nor grant survives.
  await pool.query("CREATE FUNCTION pet_reward_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1.5); RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER pet_reward_pause AFTER INSERT ON platform_native_reward_inbox DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pet_reward_pause()");
  const crashed=worker();
  const deadline=Date.now()+10000;let paused=false;
  while(Date.now()<deadline){
   const row=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event='PgSleep'",[rewardRole])).rowCount;
   if(row){paused=true;break;}await new Promise(ok=>setTimeout(ok,25));
  }
  assert(paused,'Worker did not reach deferred commit');crashed.child.kill('SIGKILL');await crashed.done;
  assert.equal(await grantCount(),0);assert.equal((await pool.query('SELECT count(*)::int AS n FROM platform_native_reward_inbox')).rows[0].n,0);
  await pool.query('DROP TRIGGER pet_reward_pause ON platform_native_reward_inbox; DROP FUNCTION pet_reward_pause()');
  await Promise.all([runWorker(),runWorker()]);assert.equal(await grantCount(),grants);
  const grant=(await pool.query('SELECT account_id,reward_key FROM platform_native_reward_ledger')).rows;assert.deepEqual(grant,c.loss?[]:[{account_id:player,reward_key:'pet-training-win'}]);
  await reconnect();assert.equal((await view()).receipt.projection.reward,reward);
  assert.equal((await exchange(terminalIntent,terminalId)).receipt.projection.reward,reward);
  await pool.query('UPDATE game_native_outbox SET delivered_at=NULL,delivery_outcome=NULL');await runWorker();assert.equal(await grantCount(),grants);
  record('worker-commit-crash-concurrent-retry-and-outbox-redelivery-have-one-account-scoped-grant');
  const terminal=await checkpoint();await stopHost();await startHost();assert.deepEqual(await checkpoint(),terminal);
  await reconnect();assert.equal((await view()).receipt.projection.reward,reward);assert.equal(await grantCount(),grants);
  const ended=await exchange(intent(finalVersion,{kind:'pass'}));assert.equal(ended.kind,'rejection');assert.equal(await receiptCount(),finalVersion);
  record('terminal-runtime-restart-reconciles-reward-and-rejects-further-turns');
  await store.release(credential);await call('send',link.index,id++,link.sequence++,'gameIntent',intent(0,undefined,'pet.view.v1'));assert(await call('closed',link.index));
  record('revoked-session-cannot-replay-terminal-private-projection');
  return {receipts:finalVersion,nonces:baseNonces+extraNonces};
 }finally{
  for(const process of workers){process.kill('SIGKILL');await new Promise(ok=>process.once('close',ok));}
 }
}

function bestSwap(board){
 let best,score=-1;
 for(let first=0;first<36;first++)for(const second of [first+1,first+6]){
  if(second>=36||second===first+1&&first%6===5)continue;
  const next=[...board];[next[first],next[second]]=[next[second],next[first]];
  const matched=new Set();
  for(let at=0;at<36;at++)for(const step of [1,6]){
   if(step===1&&at%6>3||step===6&&at>=24)continue;
   if(next[at]===next[at+step]&&next[at]===next[at+2*step])for(let offset=0;offset<3;offset++)matched.add(at+offset*step);
  }
  const damage=[...matched].reduce((sum,cell)=>sum+(next[cell]===0?2:1),0);
  if(damage>score&&matched.size){score=damage;best={kind:'swap',first,second};}
 }
 assert(best,'Authoritative board has no legal swap');return best;
}
