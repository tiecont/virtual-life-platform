import assert from 'node:assert/strict';
import {nativeRewardFixture} from './native-reward-fixture.mjs';

// Isolated process controls for the rendered player. The player sends only
// ordinary authenticated intents; restart/settlement controls never ship in it.
export async function renderedPetArenaScenarios(c){
 const {pool,scope,credential,store,csrf,call,origin,matchId,loss,record,facts,probeUnity,restart}=c;
 const snapshot=async()=>(await pool.query('SELECT state_version,rng_cursor,audit_hash,sealed_snapshot FROM game_native_matches WHERE id=$1',[matchId])).rows[0];
 await store.allocate(credential,scope);
 const ticket=await call('ticket',csrf);assert.equal(ticket.status,200);
 const link=await call('open',origin.replace('https:','wss:')+'/rt/v1');
 await call('send',link,1,1,'hello',{ticket:ticket.body.ticket,clientBuild:'pet-proximity-fixture',contentHash:Array.from(Buffer.from(scope.contentHash,'hex'))});
 assert.equal((await call('next',link)).kind,'hello');
 const before=await snapshot();
 await call('send',link,2,2,'gameIntent',{gameSessionId:Array.from(Buffer.from(matchId.replaceAll('-',''),'hex')),expectedStateVersion:'0',kind:'pet.intent.v1',actionPayload:Array.from(Buffer.from('{"epoch":1,"action":{"kind":"start"}}'))});
 const rejected=await call('next',link);assert.equal(rejected.kind,'rejection');assert.equal(rejected.code,6);
 assert.deepEqual(await snapshot(),before);assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_native_receipts')).rows[0].n,0);
 await call('close',link);record('remote-pet-arena-start-denied-at-spawn-with-zero-effects');
 let restarted=false,settled=false;
 await probeUnity({
  onRestart:async()=>{
   assert(!restarted);const saved=await snapshot();assert.equal(saved.state_version,'2');
   await restart();assert.deepEqual(await snapshot(),saved);restarted=true;
   record('rendered-pet-mid-match-sigkill-restores-exact-checkpoint');
  },
  onSettle:async()=>{
   assert(restarted&&!settled);
   const outcome=loss?'lost':'won';
   const proposals=(await pool.query('SELECT proposal FROM game_native_settlements')).rows;
   assert.equal(proposals.length,1);assert.deepEqual(proposals[0].proposal,{kind:'pet-arena.completed.v1',outcome,ruleset:'pet-arena-pve',rulesetVersion:1});
   const worker=await nativeRewardFixture(c);
   await worker();await worker();
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM platform_native_reward_ledger')).rows[0].n,loss?0:1);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM platform_native_reward_inbox')).rows[0].n,1);
   settled=true;record('rendered-pet-terminal-result-settles-once-through-restricted-platform-worker');
  }
 });
 assert(restarted&&settled);
 const player=facts.unityPlayers[0];
 assert.equal(player.outcome,loss?'lost':'won');assert.equal(player.reward,loss?'DECLINED':'GRANTED');
 assert.equal(Number((await snapshot()).state_version),player.version);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_native_receipts')).rows[0].n,player.version);
 record('rendered-pet-os-input-walk-board-swap-skill-or-pass-result-reward-and-return-to-roam');
}
