import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

const SYSTEM_ACTOR='00000000-0000-0000-0000-000000000000';
const STALE_VERSION=4;

function checkTurnTimer(state,timeoutMs){
 assert.equal(state.phase,'playing');
 assert.equal(state.maxRounds,null);
 assert.equal(state.turnTimeoutMs,timeoutMs);
 assert.equal(state.turnRemainingMs,state.turnDeadlineUnixMs-state.serverUnixMs);
 assert.ok(state.turnRemainingMs>0&&state.turnRemainingMs<=timeoutMs);
 assert.equal(state.canEndTurn,true);
}

export async function verifyTimedSoloPublication({
 pool,host,published,validator,ruleset,mark,post,publish,soloAdmission,native,connections,closeMatch,restart,pureSwap,legalSwap,
}){
 const timeoutMs=published.bundle.party.turnTimeoutMs;
 assert.equal(published.bundle.schemaVersion,4);
 assert.equal(timeoutMs,15_000);

 const encounterId='cinder-terraces-regular';
 async function allocate(config){
  const checked=await validator.validate(ruleset,config.bundle);
  assert.equal(checked.digest,config.digest);
  const input={requestId:randomUUID(),boardRuleset:'functional',petId:host.petId,mapId:'cinder-terraces',encounterId};
  const admission=await soloAdmission(input);
  assert.equal(admission.contentHash,checked.soloContentHash);
  const match={input,row:{match_id:admission.matchId,content_hash:admission.contentHash},version:config,admission};
  connections.push(match);
  return match;
 }

 async function checkPin(match){
  const {rows:[row]}=await pool.query(
   `SELECT functional_config_version::int AS version,functional_config_digest AS digest,
     content_hash,status,generation,functional_allocation FROM platform_native_arena8_matches WHERE match_id=$1`,
   [match.row.match_id],
  );
  assert.equal(row.status,'ACTIVE');
  assert.equal(row.version,match.version.version);
  assert.equal(row.digest,match.version.digest);
  assert.equal(row.content_hash,match.row.content_hash);
  assert.equal(row.functional_allocation.bossId,encounterId);
  assert.equal(row.functional_allocation.seat.ownedPetInstanceId,host.instanceId);
  return row;
 }

 const match=await allocate(published);
 const originalPin=await checkPin(match);
 const replacement=await publish('B');
 assert.notEqual(replacement.digest,published.digest);

 const started=await native(match,0,0,{kind:'start'});
 assert.equal(started.committed,true,JSON.stringify(started));
 assert.equal(started.version,1);
 assert.deepEqual(started.state.ruleset,{
  id:'arena8-functional-pve',version:2,configDigest:published.digest,contentHash:match.row.content_hash,
 });
 assert.equal(started.state.participants.length,1);
 assert.equal(started.state.board.length,64);
 checkTurnTimer(started.state,timeoutMs);

 // Make the reset distinguishable in milliseconds even on a fast local runtime.
 await pause(100);
 const ended=await native(match,0,started.version,{kind:'endTurn'});
 assert.equal(ended.committed,true,JSON.stringify(ended));
 assert.equal(ended.version,2);
 assert.equal(ended.state.turn,started.state.turn+1);
 assert.deepEqual(ended.state.board,started.state.board);
 assert.equal(ended.state.participants[0].mana,started.state.participants[0].mana);
 assert.equal(ended.state.participants[0].rage,started.state.participants[0].rage);
 checkTurnTimer(ended.state,timeoutMs);
 assert.ok(ended.state.turnDeadlineUnixMs>started.state.turnDeadlineUnixMs);
 mark('authenticated EndTurn advanced the pinned schema 4 match and reset its deadline',{
  configVersion:published.version,activeVersion:replacement.version,digest:published.digest,
  rulesetVersion:2,timeoutMs,previousDeadlineUnixMs:started.state.turnDeadlineUnixMs,deadlineUnixMs:ended.state.turnDeadlineUnixMs,
 });

 await restart();
 const restored=await native(match,0,0);
 assert.equal(restored.version,ended.version,JSON.stringify(restored));
 assert.deepEqual(restored.state.ruleset,ended.state.ruleset);
 assert.deepEqual(restored.state.board,ended.state.board);
 assert.equal(restored.state.turnDeadlineUnixMs,ended.state.turnDeadlineUnixMs);
 checkTurnTimer(restored.state,timeoutMs);
 assert.ok(restored.state.turnRemainingMs<ended.state.turnRemainingMs);
 const restoredPin=await checkPin(match);
 assert.ok(Number(restoredPin.generation)>Number(originalPin.generation));
 mark('Nest and Rust restart recovered the pinned publication and original absolute deadline',{
  canonicalVersion:restored.version,digest:published.digest,generation:restoredPin.generation,
  deadlineUnixMs:restored.state.turnDeadlineUnixMs,remainingMs:restored.state.turnRemainingMs,
 });

 // Read only PostgreSQL until the system receipt appears. A player command
 // arriving after the deadline could otherwise drive the same expiry inline.
 const expiredVersion=restored.version+1;
 const waitUntil=performance.now()+restored.state.turnRemainingMs+5_000;
 let expiry;
 do{
  const result=await pool.query(
   'SELECT actor_id FROM game_native_receipts WHERE match_id=$1 AND committed_version=$2',
   [match.row.match_id,expiredVersion],
  );
  expiry=result.rows[0];
  if(!expiry)await pause(100);
 }while(!expiry&&performance.now()<waitUntil);
 assert.equal(expiry?.actor_id,SYSTEM_ACTOR,'Background expiry did not commit its system receipt');

 const late=await native(match,0,restored.version,{kind:'guard'});
 assert.equal(late.code,STALE_VERSION,JSON.stringify(late));
 let current=await native(match,0,0);
 assert.equal(current.version,expiredVersion,JSON.stringify(current));
 assert.equal(current.state.turn,restored.state.turn+1);
 assert.deepEqual(current.state.board,restored.state.board);
 checkTurnTimer(current.state,timeoutMs);
 assert.ok(current.state.turnDeadlineUnixMs>=restored.state.turnDeadlineUnixMs+timeoutMs);
 mark('the background ticker committed one expiry before the stale authenticated Guard',{
  canonicalVersion:current.version,turn:current.state.turn,rejection:late.code,actor:expiry.actor_id,
  deadlineUnixMs:current.state.turnDeadlineUnixMs,
 });

 while(current.state.phase==='playing'){
  assert.ok(current.version<32,'Timed Fire fixture did not finish');
  const action=pureSwap(current.state.board,'sword')?.action??legalSwap(current.state.board);
  current=await native(match,0,current.version,action);
  assert.equal(current.committed,true,JSON.stringify(current));
 }
 assert.equal(current.state.phase,'won');
 assert.equal(current.state.turnDeadlineUnixMs,null);
 assert.equal(current.state.turnRemainingMs,null);
 assert.equal(current.state.canEndTurn,false);
 const {rows:[{proposal}]}=await pool.query('SELECT proposal FROM game_native_settlements WHERE match_id=$1',[match.row.match_id]);
 assert.equal(proposal.rulesetVersion,2);
 assert.equal(proposal.configDigest,published.digest);
 assert.equal(proposal.encounterId,encounterId);
 assert.equal(proposal.outcome,'won');

 const regular=bundle=>bundle.bosses.find(boss=>boss.mapId===match.input.mapId).regular;
 const expected=regular(published.bundle).rewardPolicy.firstClear;
 assert.notEqual(regular(replacement.bundle).rewardPolicy.firstClear.coins,expected.coins);
 const coins=async()=>Number((await pool.query('SELECT coins FROM pet_wave_one_players WHERE account_id=$1',[host.accountId])).rows[0].coins);
 const previousCoins=await coins();
 const settlementUrl='/v1/pets/wave-a/arena8/native/matches/'+match.row.match_id+'/settle';
 const settled=await post(host,settlementUrl,{requestId:randomUUID()});
 assert.equal(settled.statusCode,200,JSON.stringify(settled.json()));
 const {won,firstClear,coins:awardedCoins,exp,materials}=settled.json();
 assert.deepEqual({won,firstClear,awardedCoins,exp,materials},{
  won:true,firstClear:true,awardedCoins:expected.coins,exp:expected.exp,materials:expected.materials,
 });
 const retry=await post(host,settlementUrl,{requestId:randomUUID()});
 assert.equal(retry.statusCode,200,JSON.stringify(retry.json()));
 assert.deepEqual(retry.json(),settled.json());
 assert.equal(await coins(),previousCoins+expected.coins);
 closeMatch(match);
 mark('timed solo victory paid the original publication reward once',{
  canonicalVersion:current.version,rulesetVersion:proposal.rulesetVersion,digest:proposal.configDigest,coins:awardedCoins,
 });

 const next=await allocate(replacement);
 assert.notEqual(next.row.match_id,match.row.match_id);
 assert.notEqual(next.row.content_hash,match.row.content_hash);
 const nextPin=await checkPin(next);
 const nextView=await native(next,0,0);
 assert.equal(nextView.state.phase,'ready');
 assert.equal(nextView.state.ruleset.version,2);
 assert.equal(nextView.state.ruleset.configDigest,replacement.digest);
 mark('a new authenticated WSS allocation selected the replacement publication',{
  configVersion:nextPin.version,digest:nextPin.digest,contentHash:nextPin.content_hash,
 });
}
