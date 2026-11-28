import assert from 'node:assert/strict';
import {pureSwap} from './coop-visible-kind-swap.mjs';

export const basicKinds = ['sword','mana','rage','heart','shield','special'];

export function checkWaterOpening(state, bundle) {
 const water = bundle.advancedJewels.encounters.find(encounter => encounter.encounterId === state.bossId);
 assert.deepEqual(state.ruleset.version, 4);
 assert.equal(state.board.length,64);
 assert.deepEqual(bundle.board.functionalTiles.spawnWeights.map(row=>row.kind).sort(), [...basicKinds].sort());
 assert.equal(water.opening.kind,'frost');
 assert.equal(state.board.filter(tile=>tile.kind==='frost').length,water.opening.count);
 assert.ok(state.board.every(tile=>[...basicKinds,'frost'].includes(tile.kind)&&!Object.hasOwn(tile,'element')));
 assert.equal(state.chillReductionPm,0);
 const move=pureSwap(state.board,'frost',true);
 assert.equal(move?.matched,water.opening.count,'A legal swap must score the entire authored Frost group');
 return move;
}

export function checkWaterEffect(state, bundle, matched) {
 assert.ok(state.board.every(tile=>basicKinds.includes(tile.kind)));
 const expected=bundle.advancedJewels.frostReductionPm[Math.min(matched,5)-3];
 assert.equal(state.chillReductionPm,expected);
 assert.equal(state.turnTimeoutMs,15_000);
 assert.equal(state.maxRounds,null);
 assert.ok(state.turnRemainingMs>0&&state.turnRemainingMs<=15_000);
 assert.equal(state.turnDeadlineUnixMs-state.serverUnixMs,state.turnRemainingMs);
}

export async function verifyAdvancedCoopPublication({
 pool,host,members,outsider,published,mark,post,publish,createRoom,prepareRoom,allocate,allocationRow,native,connections,restart,
}) {
 const bundle=published.bundle;
 assert.equal(bundle.schemaVersion,5);
 assert.equal(bundle.engineCapability,'arena8-coop-v4');
 const room=await createRoom(host,'tideglass-lagoon-warden');
 assert.equal(room.statusCode,200,JSON.stringify(room.json()));
 const match=await allocate(published,await prepareRoom(published,room.json()));
 connections.push(match);
 const forbidden=await post(outsider,'/v1/coop/rooms/'+match.room.roomId+'/admission',{});
 assert.equal(forbidden.statusCode,403);
 // Publish before starting the clock so operator latency cannot steal a turn.
 const replacement=await publish('B');
 assert.notEqual(replacement.digest,published.digest);
 const start=await native(match,0,0,{kind:'start'});
 assert.equal(start.committed,true);
 assert.equal(start.version,1);
 assert.deepEqual(start.state.ruleset,{
  id:'arena8-coop-pve',version:4,contentHash:published.hash,configDigest:published.digest,
 });
 assert.equal(start.state.you,0);
 const move=checkWaterOpening(start.state,bundle);
 const observer=await native(match,1,0);
 assert.equal(observer.state.you,1);
 assert.deepEqual(observer.state.board,start.state.board);
 assert.deepEqual(observer.state.ruleset,start.state.ruleset);
 const swap=await native(match,0,start.version,move.action);
 assert.equal(swap.committed,true);
 assert.equal(swap.version,2);
 assert.equal(swap.state.activeSeat,1);
 checkWaterEffect(swap.state,bundle,move.matched);
 assert.deepEqual(swap.state.jewelFeedback,[{kind:'chill-armed',seat:0,value:swap.state.chillReductionPm}]);
 assert.notEqual(swap.state.chillReductionPm,replacement.bundle.advancedJewels.frostReductionPm[0]);
 const journal=async()=>(await pool.query(
  "SELECT committed_version::int AS version,actor_id,encode(receipt_hash,'hex') AS hash FROM game_native_receipts WHERE match_id=$1 ORDER BY committed_version",
  [match.row.match_id],
 )).rows;
 const original=await journal();
 assert.deepEqual(original.map(({version,actor_id})=>[version,actor_id]),[[1,members[0].accountId],[2,members[0].accountId]]);
 await restart();
 const view=await native(match,1,0);
 assert.equal(view.version,swap.version);
 assert.deepEqual(view.state.board,swap.state.board);
 assert.deepEqual(view.state.ruleset,swap.state.ruleset);
 assert.equal(view.state.turnDeadlineUnixMs,swap.state.turnDeadlineUnixMs);
 checkWaterEffect(view.state,bundle,move.matched);
 assert.ok(!Object.hasOwn(view.state,'jewelFeedback'),'Re-reading a state must not replay a prior animation');
 assert.deepEqual(await journal(),original);
 const row=await allocationRow(match.room);
 assert.equal(row.config_digest,published.digest);
 assert.equal(row.config_version,published.version);
 assert.equal(row.content_hash,published.hash);
 assert.ok(Number(row.generation)>Number(match.row.generation));
 mark('published schema 5 Water group matched over authorized WSS and retained Chill, deadline and journal across restart',{
  matchId:row.match_id,version:row.config_version,activeVersion:replacement.version,digest:published.digest,contentHash:published.hash,
  naturalPool:basicKinds,openingFrost:move.matched,acceptedSwap:move.action,chillReductionPm:view.state.chillReductionPm,
  canonicalVersion:view.version,deadlineUnixMs:view.state.turnDeadlineUnixMs,generation:row.generation,outsiderStatus:forbidden.statusCode,
 });
}
