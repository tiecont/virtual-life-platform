import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';

export async function movementScenarios({call,store,credential,scope,csrf,origin,record,facts,restart,matchId,pool,admin,role}){
 let link,transportSequence,nextId,snapshot,lastTicketAt=0;
 async function connect(allocate=true){
  // Exercise fresh admission without exceeding the real six-per-ten-second burst budget.
  await delay(Math.max(0,2100-(performance.now()-lastTicketAt)));
  if(allocate)await store.allocate(credential,scope);
  lastTicketAt=performance.now();
  const ticket=await call('ticket',csrf);assert.equal(ticket.status,200);
  link=await call('open',origin.replace('https:','wss:')+'/rt/v1');transportSequence=1;nextId=1;
  await call('send',link,nextId,transportSequence,'hello',{ticket:ticket.body.ticket,clientBuild:'movement-fixture-v1',contentHash:Array.from(Buffer.from(scope.contentHash,'hex'))});
  const result=await call('next',link);assert.equal(result.kind,'hello');snapshot=result.snapshot;
 }
 const input=(patch={})=>({inputSequence:String(BigInt(snapshot.own.lastInputSequence)+1n),directionX:0,directionZ:1000,authorityEpoch:snapshot.epoch,expectedTick:snapshot.tick,sentAtUnixMs:String(Date.now()),...patch});
 async function move(value=input(),lag=0){
  const id=++nextId,seq=++transportSequence,started=performance.now();
  if(lag)await delay(lag);
  await call('send',link,id,seq,'moveIntent',value);
  const result=await call('next',link);
  if(result.kind==='snapshot')snapshot=result.snapshot;
  return {result,id,seq,value,elapsedMs:performance.now()-started};
 }
 const intent=(version,kind='fixture.advance.v1')=>({gameSessionId:Array.from(Buffer.from(matchId.replaceAll('-',''),'hex')),expectedStateVersion:String(version),kind,actionPayload:kind==='fixture.view.v1'?[]:Array.from(Buffer.from(JSON.stringify({epoch:1})))});
 async function game(version,kind='fixture.advance.v1',id=++nextId){
  await call('send',link,id,++transportSequence,'gameIntent',intent(version,kind));
  return call('next',link);
 }
 await connect();assert.equal(snapshot.own.xMm,0);assert.equal(snapshot.own.zMm,-4000);
 assert.equal((await game(0)).code,6);
 const remoteView=await game(0,'fixture.view.v1');assert.equal(remoteView.kind,'receipt');assert.equal(remoteView.version,'0');assert.equal(remoteView.receipt.committed,false);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_native_receipts')).rows[0].n,0);
 record('terminal-remote-command-denied-without-receipt-while-authorized-view-remains-readable');
 const first=await move();assert.equal(first.result.kind,'snapshot');assert.equal(snapshot.own.zMm,-3980);
 await call('send',link,first.id,first.seq,'moveIntent',first.value);
 assert.equal((await call('next',link)).hex,first.result.hex);
 record('movement-own-actor-first-acceleration-and-byte-identical-replay-without-extra-step');
 assert.equal((await move(input({authorityEpoch:'0'}))).result.code,5);
 assert.equal((await move(input({inputSequence:'1'}))).result.code,4);
 assert.equal((await move(input({expectedTick:'18446744073709551615'}))).result.code,4);
 assert.equal((await move(input({sentAtUnixMs:'1'}))).result.code,4);
 record('movement-stale-epoch-sequence-future-tick-and-old-timestamp-rejected');
 const measurements=[];
 for(const lag of [40,80,150])for(const jitter of [-10,0,10]){
  const before=snapshot.own;
  const result=await move(input({directionX:1000,directionZ:1000}),lag+jitter);
  assert.equal(result.result.kind,'snapshot');
  const after=snapshot.own;assert(Math.abs(after.xMm-before.xMm)+Math.abs(after.zMm-before.zMm)<=100);
  assert.deepEqual(Object.keys(snapshot).sort(),['epoch','keys','own','tick']);
  measurements.push({injectedDelayMs:lag,jitterMs:jitter,observedExchangeMs:result.elapsedMs});
 }
 facts.movementLatency={method:'Actual browser-to-Rust WSS exchanges with application-level outbound packet delays; not physical network latency or Windows performance',measurements};
 record('movement-40-80-150ms-injected-delay-and-jitter-return-authoritative-bounded-positions');
 // Return to the center line and drive into the terminal's swept capsule margin.
 while(snapshot.own.xMm>0){const result=await move(input({directionX:-1000,directionZ:0}));assert.equal(result.result.kind,'snapshot');if(snapshot.own.xMm<0)break;}
 await call('close',link);await connect();
 for(let step=0;snapshot.own.zMm<2019&&step<400;step++){
  if(step>0&&step%25===0){const before=snapshot;await call('close',link);await connect();assert.deepEqual(snapshot.own,before.own);assert.equal(snapshot.epoch,before.epoch);}
  const result=await move();assert.equal(result.result.kind,'snapshot',JSON.stringify({step,kind:result.result.kind,code:result.result.code,closed:result.result.closed,elapsedMs:result.elapsedMs,transportSequence,nextId}));
 }
 assert(snapshot.own.zMm<=2020);assert(snapshot.own.zMm>=2019,JSON.stringify({xMm:snapshot.own.xMm,zMm:snapshot.own.zMm}));
 for(let step=0;step<10;step++){
  assert.equal((await move()).result.kind,'snapshot');assert(snapshot.own.zMm<=2020);
 }
 record('movement-runtime-cannot-pass-through-terminal-capsule-margin');
 // A second socket for this account must wait behind the command's spatial gate.
 const saved={link,transportSequence,nextId,snapshot};await connect(false);
 const peer=link,peerSnapshot=snapshot;
 ({link,transportSequence,nextId,snapshot}=saved);
 const blocker=await pool.connect();let committed;
 const committedId=++nextId;
 try{
  await blocker.query('BEGIN');await blocker.query('SELECT id FROM game_native_matches WHERE id=$1 FOR UPDATE',[matchId]);
  await call('send',link,committedId,++transportSequence,'gameIntent',intent(0));
  let waiting=false;
  for(let attempt=0;attempt<50;attempt++){
   waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock' AND query LIKE '%game_native_matches%') AS waiting",[role])).rows[0].waiting;
   if(waiting)break;await delay(10);
  }
  assert(waiting,'Actual command must reach the locked durable match');
  await call('send',peer,2,2,'moveIntent',{...input({directionZ:-1000}),expectedTick:peerSnapshot.tick});
  await delay(100);assert.deepEqual(await call('pending',peer),{messages:0,closed:false});
  await blocker.query('COMMIT');
  committed=await call('next',link);assert.equal(committed.kind,'receipt');assert.equal(committed.version,'1');
  const moved=await call('next',peer);assert.equal(moved.kind,'snapshot');snapshot=moved.snapshot;
 }finally{await blocker.query('ROLLBACK');blocker.release();await call('close',peer);}
 record('terminal-commit-holds-same-account-movement-gate-across-two-wss-sockets');
 await call('close',link);await connect();
 // Moving outside the radius cannot invalidate an already committed immutable ID.
 for(let step=0;snapshot.own.zMm>=500&&step<200;step++){
  if(step>0&&step%25===0){await call('close',link);await connect();}
  const moved=await move(input({directionZ:-1000}));
  assert.equal(moved.result.kind,'snapshot',JSON.stringify({step,code:moved.result.code}));
 }
 assert(snapshot.own.zMm<500);
 await call('close',link);await connect();
 const replay=await game(0,'fixture.advance.v1',committedId);assert.deepEqual(replay.receipt,committed.receipt);assert.equal(replay.version,'1');
 assert.equal((await game(1)).code,6);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_native_receipts')).rows[0].n,1);
 record('terminal-far-reconnect-replays-authenticated-receipt-without-new-effect');
 for(let step=0;snapshot.own.zMm<1000&&step<200;step++){
  if(step>0&&step%25===0){await call('close',link);await connect();}
  assert.equal((await move()).result.kind,'snapshot');
 }
 assert(snapshot.own.zMm>=1000);
 const second=await game(1);assert.equal(second.kind,'receipt');assert.equal(second.version,'2');
 const position={x:snapshot.own.xMm,z:snapshot.own.zMm},epoch=snapshot.epoch;
 await call('close',link);await connect();assert.equal(snapshot.epoch,epoch);
 assert.deepEqual({x:snapshot.own.xMm,z:snapshot.own.zMm},position);
 record('movement-reconnect-retains-one-zone-actor-and-reconciles-own-position');
 await restart();await connect();assert.notEqual(snapshot.epoch,epoch);assert.equal(snapshot.own.zMm,-4000);
 const recovered=await game(0,'fixture.advance.v1',committedId);assert.equal(recovered.version,'1');assert.deepEqual(recovered.receipt,committed.receipt);
 assert.equal((await game(2)).code,6);
 const restoredView=await game(0,'fixture.view.v1');assert.equal(restoredView.version,'2');assert.deepEqual(restoredView.receipt.projection,second.receipt.projection);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_native_receipts')).rows[0].n,2);
 record('terminal-restart-safe-spawn-denies-new-effects-but-recovers-private-view-and-original-receipt');
 assert.equal((await move(input({authorityEpoch:epoch}))).result.code,5);
 record('movement-runtime-restart-issues-new-incarnation-and-safe-spawn-old-epoch-rejected');
 await store.release(credential);await call('send',link,++nextId,++transportSequence,'moveIntent',input());
 assert(await call('closed',link));
 record('movement-permission-revocation-rejects-next-effect-and-private-view');
 await store.allocate(credential,scope);await connect();
 await call('send',link,++nextId,++transportSequence,'moveIntent',input({directionX:1001}));
 assert(await call('closed',link));record('movement-speedhack-direction-packet-rejected');
}
