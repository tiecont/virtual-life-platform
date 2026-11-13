import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';

export async function movementScenarios({call,store,credential,scope,csrf,origin,record,facts,restart}){
 let link,transportSequence,nextId,snapshot;
 async function connect(){
  await store.allocate(credential,scope);
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
 await connect();assert.equal(snapshot.own.xMm,0);assert.equal(snapshot.own.zMm,-4000);
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
 for(let step=0;step<90;step++){
  if(step>0&&step%25===0){const before=snapshot;await call('close',link);await connect();assert.deepEqual(snapshot.own,before.own);assert.equal(snapshot.epoch,before.epoch);}
  const result=await move();assert.equal(result.result.kind,'snapshot',JSON.stringify({step,kind:result.result.kind,code:result.result.code,closed:result.result.closed,elapsedMs:result.elapsedMs,transportSequence,nextId}));
 }
 assert(snapshot.own.zMm<=2020);assert(snapshot.own.zMm>=2019);
 record('movement-runtime-cannot-pass-through-terminal-capsule-margin');
 const position={x:snapshot.own.xMm,z:snapshot.own.zMm},epoch=snapshot.epoch;
 await call('close',link);await connect();assert.equal(snapshot.epoch,epoch);
 assert.deepEqual({x:snapshot.own.xMm,z:snapshot.own.zMm},position);
 record('movement-reconnect-retains-one-zone-actor-and-reconciles-own-position');
 await restart();await connect();assert.notEqual(snapshot.epoch,epoch);assert.equal(snapshot.own.zMm,-4000);
 assert.equal((await move(input({authorityEpoch:epoch}))).result.code,5);
 record('movement-runtime-restart-issues-new-incarnation-and-safe-spawn-old-epoch-rejected');
 await store.release(credential);await call('send',link,++nextId,++transportSequence,'moveIntent',input());
 assert(await call('closed',link));
 record('movement-permission-revocation-rejects-next-effect-and-private-view');
 await store.allocate(credential,scope);await connect();
 await call('send',link,++nextId,++transportSequence,'moveIntent',input({directionX:1001}));
 assert(await call('closed',link));record('movement-speedhack-direction-packet-rejected');
}
