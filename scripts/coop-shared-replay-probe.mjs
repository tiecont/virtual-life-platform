import assert from 'node:assert/strict';

async function journal(pool,matchId){
 return (await pool.query(`
  SELECT m.state_version::int AS version,m.epoch,m.status,m.rng_cursor,encode(m.audit_hash,'hex') AS audit_hash,
    (SELECT jsonb_agg(jsonb_build_array(r.committed_version,r.actor_id,encode(r.receipt_hash,'hex'))
      ORDER BY r.committed_version) FROM game_native_receipts r WHERE r.match_id=m.id) AS receipts,
    (SELECT jsonb_agg(jsonb_build_array(e.state_version,e.event_index,encode(e.event_hash,'hex'))
      ORDER BY e.state_version,e.event_index) FROM game_native_events e WHERE e.match_id=m.id) AS events,
    (SELECT count(*)::int FROM game_native_settlements s WHERE s.match_id=m.id) AS settlements,
    (SELECT count(*)::int FROM game_native_outbox o WHERE o.match_id=m.id) AS outbox
   FROM game_native_matches m WHERE m.id=$1`,[matchId])).rows[0];
}

export async function verifySharedCoopReplay({
 pool,members,match,started,swapped,action,commandId,replacement,
 mark,native,restart,dbActive,allocationRow,
}){
 const matchId=match.row.match_id;
 const activeSeat=swapped.state.activeSeat;
 assert.equal(activeSeat,1);
 assert.deepEqual(swapped.state.ruleset,started.state.ruleset);
 assert.equal(swapped.state.ruleset.configDigest,match.version.digest);
 assert.equal(swapped.state.turnTimeoutMs,15_000);
 assert.equal(swapped.state.maxRounds,null);
 assert.ok(swapped.state.turnRemainingMs>0);
 assert.equal(swapped.state.turnDeadlineUnixMs-swapped.state.serverUnixMs,swapped.state.turnRemainingMs);
 const before=await journal(pool,matchId);
 assert.equal(before.version,swapped.version);
 assert.deepEqual(before.receipts.map(([version,actor])=>[version,actor]),[
  [started.version,members[0].accountId],[swapped.version,members[0].accountId],
 ]);
 assert.ok(before.events.length>=2);
 assert.equal(before.settlements,0);
 assert.equal(before.outbox,0);

 await restart();
 const restored=await native(match,activeSeat,0);
 assert.equal(restored.version,swapped.version,'The restarted runtime must return the committed turn before it expires');
 assert.equal(restored.state.you,activeSeat);
 for(const field of ['board','boss','ruleset','turn','round','activeSeat','pending','chillReductionPm','turnDeadlineUnixMs','turnTimeoutMs','maxRounds']){
  assert.deepEqual(restored.state[field],swapped.state[field],field);
 }
 assert.ok(restored.state.turnRemainingMs>0);
 assert.equal(restored.state.turnDeadlineUnixMs-restored.state.serverUnixMs,restored.state.turnRemainingMs);
 assert.ok(!Object.hasOwn(restored.state,'jewelFeedback'),'A state read must not emit committed jewel feedback again');
 assert.deepEqual(await journal(pool,matchId),before);

 // Use the original actor, version, action and command id on a fresh ticket.
 // The WSS receipt has the same version, committed flag and projection bytes.
 const replay=await native(match,0,started.version,action,commandId);
 assert.match(swapped.projectionHash,/^[0-9a-f]{64}$/);
 assert.deepEqual(replay,swapped);
 assert.ok(Buffer.isBuffer(swapped.projectionBytes));
 assert.deepEqual(replay.projectionBytes,swapped.projectionBytes);
 assert.deepEqual(await journal(pool,matchId),before);

 const continued=await native(match,activeSeat,swapped.version,{kind:'endTurn'});
 assert.equal(continued.committed,true);
 assert.equal(continued.version,swapped.version+1);
 assert.equal(continued.state.activeSeat,2);
 assert.deepEqual(continued.state.ruleset,swapped.state.ruleset);
 const after=await journal(pool,matchId);
 assert.equal(after.version,continued.version);
 assert.equal(after.receipts.length,before.receipts.length+1);
 assert.deepEqual(after.receipts.slice(0,-1),before.receipts);
 assert.deepEqual(after.receipts.at(-1).slice(0,2),[continued.version,members[activeSeat].accountId]);
 assert.deepEqual(after.events.slice(0,before.events.length),before.events);
 assert.ok(after.events.length>before.events.length);
 assert.equal(after.settlements,0);
 assert.equal(after.outbox,0);

 const pin=await allocationRow(match.room);
 assert.equal(pin.status,'ACTIVE');
 assert.equal(pin.config_version,match.version.version);
 assert.equal(pin.config_digest,match.version.digest);
 assert.equal(pin.content_hash,match.version.hash);
 assert.ok(Number(pin.generation)>Number(match.row.generation));
 assert.equal((await dbActive()).version,replacement.version);
 mark('schema 6 WSS recovered the original board, deadline and sealed receipt after replacement publication and restart',{
  matchId,pinnedVersion:pin.config_version,activeVersion:replacement.version,
  pinnedDigest:pin.config_digest,activeDigest:replacement.digest,restartedGeneration:pin.generation,
  restoredVersion:restored.version,absoluteDeadlineUnixMs:restored.state.turnDeadlineUnixMs,
  boardCells:restored.state.board.length,retainedReceiptProjectionSha256:replay.projectionHash,
  unchangedReceipts:before.receipts.length,unchangedEvents:before.events.length,
  nextActorSeat:activeSeat,nextCommittedVersion:continued.version,
 });
}
