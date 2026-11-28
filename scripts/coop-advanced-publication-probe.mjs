import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {pureSwap} from './coop-visible-kind-swap.mjs';

export const basicKinds = ['sword','mana','rage','heart','shield','special'];

const advancedEffects=new Set(['nature-cleanse','chill-armed','chill-consumed','astral-upgrade']);
const STALE_VERSION=4;
const TEMPORARILY_UNAVAILABLE=13;
export function advancedFeedback(state){
 return (state.jewelFeedback??[]).filter(effect=>advancedEffects.has(effect.kind));
}

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
 pool,host,members,outsider,published,mark,post,publish,createRoom,prepareRoom,allocate,allocationRow,native,sendOnce,connections,restart,
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
 const swapId=randomBytes(16);
 const swap=await native(match,0,start.version,move.action,swapId);
 assert.equal(swap.committed,true);
 assert.equal(swap.version,2);
 assert.equal(swap.state.activeSeat,1);
 checkWaterEffect(swap.state,bundle,move.matched);
 assert.deepEqual(advancedFeedback(swap.state),[{kind:'chill-armed',seat:0,value:swap.state.chillReductionPm}]);
 assert.notEqual(swap.state.chillReductionPm,replacement.bundle.advancedJewels.frostReductionPm[0]);
 const journal=async()=>(await pool.query(`
  SELECT m.state_version::int AS version,m.epoch,m.status,m.rng_cursor,m.audit_hash,
    (SELECT jsonb_agg(jsonb_build_array(r.committed_version,r.actor_id,encode(r.receipt_hash,'hex'))
      ORDER BY r.committed_version) FROM game_native_receipts r WHERE r.match_id=m.id) AS receipts,
    (SELECT jsonb_agg(jsonb_build_array(e.state_version,e.event_index,encode(e.event_hash,'hex'))
      ORDER BY e.state_version,e.event_index) FROM game_native_events e WHERE e.match_id=m.id) AS events,
    (SELECT count(*)::int FROM game_native_settlements s WHERE s.match_id=m.id) AS settlements,
    (SELECT count(*)::int FROM game_native_outbox o WHERE o.match_id=m.id) AS outbox
   FROM game_native_matches m WHERE m.id=$1`,[match.row.match_id])).rows[0];
 const original=await journal();
 assert.equal(original.version,swap.version);
 assert.deepEqual(original.receipts.map(([version,actor])=>[version,actor]),[[1,members[0].accountId],[2,members[0].accountId]]);
 assert.ok(original.events.length>=2);
 assert.equal(original.settlements,0);
 assert.equal(original.outbox,0);
 const endTurn={kind:'endTurn'};
 // A legitimate seat attempts the same ordinary action first with a stale
 // version. A different seated owner attempts it against the current version.
 const stale=await native(match,1,start.version,endTurn);
 assert.equal(stale.code,STALE_VERSION);
 assert.deepEqual(await journal(),original);
 const wrongSeat=await sendOnce(match,0,swap.version,endTurn);
 assert.equal(wrongSeat.code,TEMPORARILY_UNAVAILABLE);
 assert.deepEqual(await journal(),original);
 await restart();
 const view=await native(match,1,0);
 assert.equal(view.version,swap.version);
 assert.deepEqual(view.state.board,swap.state.board);
 assert.deepEqual(view.state.ruleset,swap.state.ruleset);
 assert.equal(view.state.turnDeadlineUnixMs,swap.state.turnDeadlineUnixMs);
 checkWaterEffect(view.state,bundle,move.matched);
 assert.ok(!Object.hasOwn(view.state,'jewelFeedback'),'Re-reading a state must not replay a prior animation');
 assert.deepEqual(await journal(),original);
 // On a fresh authenticated connection the original instruction is returned
 // from the sealed receipt even though seat 0 no longer owns this turn.
 const replay=await native(match,0,start.version,move.action,swapId);
 assert.equal(replay.committed,true);
 assert.equal(replay.version,swap.version);
 assert.match(swap.projectionHash,/^[0-9a-f]{64}$/);
 assert.equal(replay.projectionHash,swap.projectionHash);
 assert.deepEqual(replay.state,swap.state);
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
  boardCells:view.state.board.length,multiplierTiles:view.state.board.filter(tile=>tile.multiplier>1).length,
 });
 const accepted=await native(match,1,swap.version,endTurn);
 assert.equal(accepted.committed,true);
 assert.equal(accepted.version,swap.version+1);
 const after=await journal();
 assert.deepEqual(after.receipts.slice(0,-1),original.receipts);
 assert.deepEqual(after.receipts.at(-1).slice(0,2),[accepted.version,members[1].accountId]);
 mark('duplicate authenticated swap recovered its sealed receipt and stale and wrong-seat commands left no journal mutation',{
  matchId:row.match_id,replayedVersion:replay.version,projectionHash:replay.projectionHash,
  staleCode:stale.code,wrongSeatCode:wrongSeat.code,outsiderStatus:forbidden.statusCode,
  unchangedReceipts:original.receipts.length,unchangedEvents:original.events.length,acceptedControlVersion:accepted.version,
 });
}
