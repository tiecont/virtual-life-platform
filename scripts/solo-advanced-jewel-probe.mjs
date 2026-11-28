import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {advancedFeedback,basicKinds} from './coop-advanced-publication-probe.mjs';
import {pureSwap} from './coop-visible-kind-swap.mjs';

export async function verifyAdvancedSoloJewel({kind,pool,host,published,mark,soloAdmission,native,connections}){
 const bundle=published.bundle;
 assert.equal(bundle.schemaVersion,5);
 const group=bundle.advancedJewels.encounters.find(row=>row.opening?.kind===kind);
 const boss=bundle.bosses.find(row=>row.id===group.encounterId);
 const previousMap=kind==='nature'?'stormcoil-fields':'ochre-labyrinth';
 // The host owns a level-one starter. Only its previous-map clear is staged.
 // Every board, status, multiplier and elapsed turn comes from native commands.
 await pool.query('INSERT INTO pet_wave_one_map_clears(account_id,map_id) VALUES($1,$2)',[host.accountId,previousMap]);
 mark('staged the solo map prerequisite',{previousMap,petId:host.petId,level:1});
 const input={requestId:randomUUID(),boardRuleset:'functional',petId:host.petId,mapId:boss.mapId,encounterId:boss.mapId+'-boss'};
 const admission=await soloAdmission(input);
 assert.equal(admission.clientBuild,'unity-native-v3');
 const match={input,row:{match_id:admission.matchId,content_hash:admission.contentHash},version:published,admission};
 connections.push(match);
 let current;
 async function commit(action){
  const version=current?.version??0;
  current=await native(match,0,version,action);
  assert.equal(current.committed,true,JSON.stringify(current));
  assert.equal(current.version,version+1);
  assert.equal(current.state.phase,'playing');
  assert.equal(current.state.you,0);
  assert.equal(current.state.participants.length,1);
 }
 await commit({kind:'start'});
 const opening=current.state.board;
 assert.equal(current.state.bossId,boss.id);
 assert.deepEqual(current.state.ruleset,{id:'arena8-functional-pve',version:3,configDigest:published.digest,contentHash:admission.contentHash});
 assert.equal(opening.length,64);
 assert.ok(opening.every(tile=>tile.multiplier===1&&(tile.kind===kind||basicKinds.includes(tile.kind))));
 assert.equal(opening.filter(tile=>tile.kind===kind).length,group.opening.count);
 const move=pureSwap(opening,kind,true);
 assert.equal(move?.matched,group.opening.count);
 const statuses=()=>current.state.participants[0].statuses;
 const vulnerability=()=>statuses().find(s=>s.kind==='vulnerability');
 const nextTier=bundle.multiplier.schedule.find(row=>row.tiers.some(tier=>tier.multiplier>1));
 assert.equal(bundle.multiplier.clockUnit,'turn');
 if(kind==='nature'){
  assert.deepEqual(statuses(),[]);
  while(!vulnerability()){
   assert.ok(current.state.turn<=boss.telegraphTurns+1,'Expected the authored Ghost impact');
   await commit({kind:'guard'});
  }
  assert.equal(vulnerability().value,boss.attackModel.vulnerability.valuePm);
  assert.ok(vulnerability().turns>1,'The negative would survive a normal turn tick');
  assert.ok(statuses().some(s=>s.kind==='defense-buff'),'Guard should have applied its own positive status');
 }else{
  while(current.state.turn<nextTier.from)await commit({kind:'guard'});
  assert.equal(current.state.turn,nextTier.from);
 }
 assert.deepEqual(current.state.board,opening);
 const before={turn:current.state.turn,statuses:statuses(),pending:current.state.pending,bossPhase:current.state.boss.phase};
 await commit(move.action);
 const feedback=advancedFeedback(current.state);
 assert.ok(current.state.board.every(tile=>basicKinds.includes(tile.kind)));
 if(kind==='nature'){
  const limit=bundle.advancedJewels.natureActorLimits[Math.min(move.matched,5)-3];
  assert.equal(limit,1);
  assert.deepEqual(feedback,[{kind:'nature-cleanse',seat:0,value:1}]);
  // The Ghost Warden immediately schedules its next telegraph after each
  // impact. It can therefore apply a fresh negative after the cleanse.
  if(before.pending?.remaining===1&&current.state.boss.phase===before.bossPhase){
   assert.deepEqual(vulnerability(),{kind:'vulnerability',value:boss.attackModel.vulnerability.valuePm,
    turns:boss.attackModel.vulnerability.durationTurns-1});
  }else{
   assert.equal(vulnerability(),undefined);
  }
  // Buff timers tick at the start of the actor's next turn.
  const survivingBuffs=before.statuses.filter(status=>status.kind==='defense-buff'&&status.turns>1)
   .map(status=>({...status,turns:status.turns-1}));
  assert.deepEqual(statuses().filter(status=>status.kind==='defense-buff'),survivingBuffs);
 }else{
  const limit=bundle.advancedJewels.astralUpgradeLimits[Math.min(move.matched,5)-3];
  assert.equal(limit,1);
  assert.equal(feedback?.length,limit);
  const {cell}=feedback[0];
  assert.ok(Number.isInteger(cell)&&cell>=0&&cell<64);
  const next=nextTier.tiers.map(t=>t.multiplier).filter(value=>value>1).sort((a,b)=>a-b)[0];
  assert.deepEqual(feedback,[{kind:'astral-upgrade',seat:0,value:next,cell}]);
  assert.equal(current.state.board[cell].multiplier,next);
  assert.ok(basicKinds.includes(current.state.board[cell].kind));
  assert.ok(current.state.board.every(tile=>nextTier.tiers.some(tier=>tier.multiplier===tile.multiplier)&&tile.multiplier<=8));
 }
 const reread=await native(match,0,0);
 assert.equal(reread.version,current.version);
 assert.deepEqual(reread.state.board,current.state.board);
 assert.ok(!Object.hasOwn(reread.state,'jewelFeedback'));
 const actor=(await pool.query('SELECT actor_id FROM game_native_receipts WHERE match_id=$1 AND committed_version=$2',[admission.matchId,current.version])).rows[0];
 assert.equal(actor.actor_id,host.accountId);
 mark('authenticated solo '+kind+' group and effect committed against the published schema 5 candidate',{
  matchId:admission.matchId,configVersion:published.version,digest:published.digest,contentHash:admission.contentHash,
  boardRulesetVersion:current.state.ruleset.version,canonicalVersion:current.version,before,afterStatuses:statuses(),
  openingCount:group.opening.count,acceptedSwap:move.action,feedback,
  ...(kind==='astral'?{upgradedTile:current.state.board[feedback[0].cell]}:{}),
 });
}
