import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';

const SYSTEM_ACTOR='00000000-0000-0000-0000-000000000000';
const STALE_VERSION=4;
const TEMPORARILY_UNAVAILABLE=13;
const UNSUPPORTED_CLIENT=15;

function checkTimer(state,timeoutMs,seat){
 assert.equal(state.phase,'playing');
 assert.equal(state.maxRounds,null);
 assert.equal(state.turnTimeoutMs,timeoutMs);
 assert.equal(state.you,seat);
 assert.equal(state.canEndTurn,state.activeSeat===seat);
 assert.equal(state.turnRemainingMs,state.turnDeadlineUnixMs-state.serverUnixMs);
 assert.ok(state.turnRemainingMs>0&&state.turnRemainingMs<=timeoutMs);
}

function committedState(state){
 const committed={...state};
 for(const field of ['serverUnixMs','turnRemainingMs','you','abilities','canEndTurn'])delete committed[field];
 return committed;
}

export async function verifyTimedCoopPublication({
 pool,members,outsider,published,mark,get,post,publish,createRoom,prepareRoom,allocate,allocationRow,
 native,sendOnce,connections,closeMatch,restart,pureSwap,legalSwap,drain,
}){
 const timeoutMs=published.bundle.party.turnTimeoutMs;
 const accounts=members.map(member=>member.accountId);
 const endTurn={kind:'endTurn'};
 const guard={kind:'guard'};
 assert.equal(published.bundle.schemaVersion,4);
 assert.equal(timeoutMs,15_000);
 assert.equal(members.length,4);

 async function start(config,mapId){
  const boss=config.bundle.bosses.find(value=>value.mapId===mapId);
  const response=await createRoom(members[0],boss.id);
  assert.equal(response.statusCode,200,JSON.stringify(response.json()));
  const match=await allocate(config,await prepareRoom(config,response.json()));
  connections.push(match);
  const ready=await native(match,0,0);
  assert.equal(ready.state.phase,'ready');
  const current=await commit(match,ready,{kind:'start'});
  assert.equal(current.version,1);
  assert.deepEqual(current.state.ruleset,{
   id:'arena8-coop-pve',version:3,configDigest:config.digest,contentHash:config.hash,
  });
  assert.equal(current.state.bossId,boss.id);
  assert.equal(current.state.boss.maxHp,boss.maxHp);
  assert.deepEqual(current.state.participants.map(pet=>pet.petId),members.map(member=>member.petId));
  assert.equal(current.state.board.length,64);
  assert.ok(current.state.board.every(tile=>typeof tile.kind==='string'&&!Object.hasOwn(tile,'element')));
  checkTimer(current.state,timeoutMs,0);
  return {match,boss,current};
 }

 async function commit(match,current,action){
  const seat=current.state.activeSeat;
  const next=await native(match,seat,current.version,action);
  assert.equal(next.committed,true,JSON.stringify(next));
  assert.equal(next.version,current.version+1);
  assert.equal(next.state.you,seat);
  return next;
 }

 const journal=async match=>(await pool.query(
  `SELECT committed_version::int AS version,actor_id,encode(receipt_hash,'hex') AS hash
   FROM game_native_receipts WHERE match_id=$1 ORDER BY committed_version`,
  [match.row.match_id],
 )).rows;
 const balances=async()=>(await pool.query(
  `SELECT p.account_id,p.coins::int,
    (SELECT COALESCE(sum(l.points),0)::int FROM coop_achievement_ledger l WHERE l.account_id=p.account_id) AS points
   FROM pet_wave_one_players p WHERE p.account_id=ANY($1::uuid[]) ORDER BY p.account_id`,
  [accounts],
 )).rows;

 async function settle(match,current,outcome,payout){
  assert.equal(current.state.phase,outcome);
  assert.equal(current.state.turnDeadlineUnixMs,null);
  assert.equal(current.state.turnRemainingMs,null);
  assert.equal(current.state.canEndTurn,false);
  const id=match.row.match_id;
  const {rows:[{proposal}]}=await pool.query('SELECT proposal FROM game_native_settlements WHERE match_id=$1',[id]);
  assert.equal(proposal.outcome,outcome);
  assert.equal(proposal.rulesetVersion,3);
  assert.equal(proposal.configDigest,match.version.digest);
  assert.equal(proposal.contentHash,match.version.hash);
  assert.deepEqual(proposal.participants.map(seat=>seat.account),accounts);
  const before=await balances();
  closeMatch(match);
  await Promise.all([drain(),drain()]);
  const expected=before.map(row=>({...row,coins:row.coins+payout.coins,points:row.points+payout.achievementPoints}));
  assert.equal(expected.length,4);
  assert.deepEqual(await balances(),expected);
  await restart();
  await drain();
  assert.deepEqual(await balances(),expected);
  assert.equal((await allocationRow(match.room)).status,'SETTLED');
  const {rows:[storage]}=await pool.query(
   `SELECT m.status,m.state_version::int AS version,o.delivery_outcome
    FROM game_native_matches m JOIN game_native_outbox o ON o.match_id=m.id
    WHERE m.id=$1 AND o.delivered_at IS NOT NULL`,[id],
  );
  assert.deepEqual(storage,{status:'FINISHED',version:current.version,delivery_outcome:'granted'});
  const {rows:rewards}=await pool.query(
   `SELECT r.account_id,r.seat,r.outcome,r.first_clear,r.achievement_points,r.coins,r.exp,r.materials
    FROM coop_settlement_rewards r JOIN coop_settlement_inbox i USING(settlement_id)
    WHERE i.match_id=$1 ORDER BY r.seat`,[id],
  );
  assert.deepEqual(rewards,accounts.map((account,seat)=>({
   account_id:account,seat,outcome,first_clear:outcome==='won',achievement_points:payout.achievementPoints,
   coins:payout.coins,exp:payout.exp,materials:payout.materials,
  })));
  for(const member of members){
   const response=await get(member,'/v1/coop/rooms/'+match.room.roomId+'/reward');
   assert.equal(response.statusCode,200,JSON.stringify(response.json()));
   assert.equal(response.json().matchId,id);
   assert.equal(response.json().outcome,outcome);
  }
  assert.equal((await get(outsider,'/v1/coop/rooms/'+match.room.roomId+'/reward')).statusCode,404);
  assert.equal((await journal(match)).length,current.version);
  mark('concurrent settlement and a retry after Nest restart paid the pinned award to four authenticated seats once',{
   matchId:id,bossId:match.room.bossId,outcome,canonicalVersion:current.version,rulesetVersion:proposal.rulesetVersion,
   digest:proposal.configDigest,payout,
  });
 }

 const {match:fire,boss:fireBoss,current:started}=await start(published,'cinder-terraces');
 const replacement=await publish('B');
 assert.notEqual(replacement.digest,published.digest);
 assert.notEqual(replacement.bundle.bosses.find(boss=>boss.id===fireBoss.id).rewardPolicy.firstClear.coins,fireBoss.rewardPolicy.firstClear.coins);
 const denied=await post(outsider,'/v1/coop/rooms/'+fire.room.roomId+'/admission',{});
 assert.equal(denied.statusCode,403,JSON.stringify(denied.json()));
 const journalBefore=await journal(fire);
 const observing=await native(fire,1,0);
 assert.equal(observing.version,started.version);
 checkTimer(observing.state,timeoutMs,1);
 const wrongSeat=await sendOnce(fire,1,started.version,endTurn);
 // Gameplay authorization faults use the gateway's public generic rejection.
 assert.equal(wrongSeat.code,TEMPORARILY_UNAVAILABLE,JSON.stringify(wrongSeat));
 const wrongMatch=await sendOnce(fire,0,started.version,endTurn,randomUUID());
 assert.equal(wrongMatch.code,UNSUPPORTED_CLIENT,JSON.stringify(wrongMatch));
 assert.deepEqual(await journal(fire),journalBefore);
 mark('outsider admission, the wrong seat and a foreign match intent left the journal unchanged',{
  matchId:fire.row.match_id,outsiderStatus:denied.statusCode,wrongSeatCode:wrongSeat.code,wrongMatchCode:wrongMatch.code,
 });

 let current=started;
 for(const seat of members.keys()){
  const view=await native(fire,seat,0);
  assert.equal(view.version,current.version);
  assert.equal(view.state.activeSeat,seat);
  checkTimer(view.state,timeoutMs,seat);
  assert.deepEqual(view.state.board,current.state.board);
  current=await commit(fire,view,guard);
 }
 assert.equal(current.state.activeSeat,0);
 await pause(100);
 const passed=await commit(fire,current,endTurn);
 assert.equal(passed.state.activeSeat,1);
 assert.equal(passed.state.turn,current.state.turn+1);
 assert.deepEqual(passed.state.board,current.state.board);
 assert.ok(passed.state.turnDeadlineUnixMs>current.state.turnDeadlineUnixMs);
 const journalAtRestart=await journal(fire);
 assert.deepEqual(journalAtRestart.map(row=>row.actor_id),[accounts[0],...accounts,accounts[0]]);
 await restart();
 const restored=await native(fire,1,0);
 assert.equal(restored.version,passed.version);
 assert.deepEqual(committedState(restored.state),committedState(passed.state));
 checkTimer(restored.state,timeoutMs,1);
 assert.ok(restored.state.turnRemainingMs<passed.state.turnRemainingMs);
 assert.deepEqual(await journal(fire),journalAtRestart);
 const pin=await allocationRow(fire.room);
 assert.equal(pin.status,'ACTIVE');
 assert.equal(pin.config_version,published.version);
 assert.equal(pin.config_digest,published.digest);
 assert.equal(pin.content_hash,published.hash);
 assert.ok(Number(pin.generation)>Number(fire.row.generation));
 mark('four seats acted on one board and restart preserved the original publication, Boss, journal and absolute deadline',{
  matchId:fire.row.match_id,canonicalVersion:restored.version,digest:pin.config_digest,
  generation:pin.generation,deadlineUnixMs:restored.state.turnDeadlineUnixMs,
 });

 // With the sockets closed, read only PostgreSQL until the ticker writes a receipt.
 closeMatch(fire);
 const waitUntil=performance.now()+restored.state.turnRemainingMs+5_000;
 const expiredVersion=restored.version+1;
 let expired;
 do{
  expired=(await pool.query(
   'SELECT actor_id FROM game_native_receipts WHERE match_id=$1 AND committed_version=$2',
   [fire.row.match_id,expiredVersion],
  )).rows[0];
  if(!expired)await pause(100);
 }while(!expired&&performance.now()<waitUntil);
 assert.equal(expired?.actor_id,SYSTEM_ACTOR,'The background ticker must expire the offline seat');
 const late=await native(fire,1,restored.version,guard);
 assert.equal(late.code,STALE_VERSION,JSON.stringify(late));
 current=await native(fire,2,0);
 assert.equal(current.version,expiredVersion);
 assert.equal(current.state.activeSeat,2);
 assert.equal(current.state.turn,restored.state.turn+1);
 assert.deepEqual(current.state.board,restored.state.board);
 checkTimer(current.state,timeoutMs,2);
 assert.ok(current.state.turnDeadlineUnixMs>=restored.state.turnDeadlineUnixMs+timeoutMs);
 mark('the background ticker passed the offline seat before its stale command and handed the turn to the next seat',{
  matchId:fire.row.match_id,canonicalVersion:current.version,actor:expired.actor_id,activeSeat:current.state.activeSeat,
  lateCode:late.code,deadlineUnixMs:current.state.turnDeadlineUnixMs,
 });

 while(current.state.phase==='playing'){
  assert.ok(current.version<60,'Timed Fire fixture did not finish');
  current=await commit(fire,current,pureSwap(current.state.board,'sword')?.action??legalSwap(current.state.board));
 }
 await settle(fire,current,'won',fireBoss.rewardPolicy.firstClear);

 const {match:water,boss:waterBoss,current:waterStarted}=await start(replacement,'tideglass-lagoon');
 assert.notEqual(water.row.content_hash,fire.row.content_hash);
 current=waterStarted;
 for(const seat of members.keys()){
  assert.equal(current.state.activeSeat,seat);
  current=await commit(water,current,guard);
 }
 while(current.state.phase==='playing'){
  assert.ok(current.version<60,'Timed Water fixture did not finish');
  current=await commit(water,current,endTurn);
 }
 await settle(water,current,'lost',waterBoss.rewardPolicy.defeat);
}
