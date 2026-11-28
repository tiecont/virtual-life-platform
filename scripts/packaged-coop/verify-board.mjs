import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const [root,requestedSize,mode]=process.argv.slice(2);
const read=async file=>JSON.parse(await readFile(join(root,file),'utf8'));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceRevision=(await readFile(join(root,'source-sha.txt'),'utf8')).trim();
const build=await read('build-receipt.json');
assert.match(sourceRevision,/^[0-9a-f]{40}$/);
assert.equal(build.sourceRevision,sourceRevision);

async function verifyScreenshots(filenames){
 const screenshots=await Promise.all(filenames.map(async name=>{
  const bytes=await readFile(join(root,name));
  assert.ok(bytes.length>32&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&
   bytes.toString('ascii',12,16)==='IHDR'&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND',name);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  assert.equal(width+'x'+height,requestedSize,name);
  return {name,width,height,sha256:sha256(bytes)};
 }));
 const verifier=fileURLToPath(new URL('./board_capture.py',import.meta.url));
 execFileSync('python3',[verifier,...filenames.map(name=>join(root,name))],{stdio:'inherit'});
 return screenshots;
}
function verifyPerformance(performance){
 assert.equal(performance.status,'measured');
 assert.equal(performance.requestedResolution,requestedSize);
 assert.ok(performance.snapshotCount>1);
}
async function verifySharedRng(){
 const [started,swapped,run,clicks,performance]=await Promise.all([
  'shared-started.json','shared-swapped.json','shared-board-run.json','shared-input.json','player-performance.json',
 ].map(read));
 assert.equal(run.authenticated,4);
 assert.equal(run.packagedClients,1);
 assert.equal(run.protocolPeers,3);
 assert.match(run.digest,/^[0-9a-f]{64}$/);
 assert.match(run.contentHash,/^[0-9a-f]{64}$/);
 assert.deepEqual([started.version,swapped.version],[1,2]);
 assert.deepEqual([started.state.turn,swapped.state.turn],[0,1]);
 assert.deepEqual([started.state.activeSeat,swapped.state.activeSeat],[0,1]);
 assert.equal(started.state.turnDeadlineUnixMs-started.state.serverUnixMs,started.state.turnRemainingMs);
 assert.equal(started.state.turnTimeoutMs,15_000);
 assert.equal(swapped.state.turnTimeoutMs,15_000);
 assert.notDeepEqual(swapped.state.board,started.state.board);
 assert.deepEqual(swapped.receipts.map(({version,actor,action})=>({version,actor,action})),[
  {version:1,actor:'host',action:{kind:'start'}},
  {version:2,actor:'host',action:started.move},
 ]);
 for(const receipt of swapped.receipts){
  assert.match(receipt.fingerprint,/^[0-9a-f]{64}$/);
  assert.match(receipt.receiptHash,/^[0-9a-f]{64}$/);
 }
 const swapClicks=clicks.filter(click=>click.action==='swap-cell');
 assert.deepEqual(swapClicks.map(click=>click.cell),[started.move.first,started.move.second]);
 assert.equal(swapClicks.length,2);
 const startClicks=clicks.filter(click=>click.action==='start');
 assert.ok(startClicks.length>0);
 assert.ok(startClicks.every(click=>click.unixMs<=started.observedUnixMs));
 assert.ok(swapClicks.every(click=>click.unixMs>=started.observedUnixMs&&click.unixMs<=swapped.observedUnixMs));
 assert.ok(swapClicks[1].unixMs<started.state.turnDeadlineUnixMs);
 const kinds=['sword','mana','rage','heart','shield','special','nature','frost','astral'];
 const counts=[started,swapped].map(({state})=>{
  assert.equal(state.phase,'playing');
  assert.equal(state.bossId,'cinder-terraces-warden');
  assert.equal(state.participants.length,4);
  assert.deepEqual(state.ruleset,{
   id:'arena8-coop-pve',version:5,contentHash:run.contentHash,configDigest:run.digest,
  });
  assert.equal(state.board.length,64);
  const found={};
  for(const tile of state.board){
   assert.ok(tile&&kinds.includes(tile.kind)&&!Object.hasOwn(tile,'element'));
   assert.ok(Number.isInteger(tile.multiplier)&&tile.multiplier>=1&&tile.multiplier<=8);
   found[tile.kind]=(found[tile.kind]??0)+1;
  }
  return found;
 });
 const screenshots=await verifyScreenshots(['06-shared-board-start.png','07-shared-board-host-swap.png']);
 verifyPerformance(performance);
 return {
  result:'PASS',scope:'packaged-shared-rng-board',sourceRevision,playerSize:requestedSize,
  boardContract:'shared-rng-fire',boardTiles:64,
  fixture:run,ruleset:started.state.ruleset,startedVersion:started.version,hostSwapVersion:swapped.version,
  observedTileCounts:{start:counts[0],afterHostSwap:counts[1]},
  timing:{startObservedUnixMs:started.observedUnixMs,swapObservedUnixMs:swapped.observedUnixMs,
   openingDeadlineUnixMs:started.state.turnDeadlineUnixMs,msToOpeningDeadlineAtSecondClick:started.state.turnDeadlineUnixMs-swapClicks[1].unixMs},
  receipts:swapped.receipts,clicks,screenshots,performance,
 };
}

if(mode==='shared-rng'){
 console.log(JSON.stringify(await verifySharedRng(),null,2));
}else{
const [started,swapped,before,after,renewed,actions,performance]=await Promise.all([
 'state-001.json','state-002.json','before-restart.json','after-restart.json','host-renewed.json',
 'player-actions.json','player-performance.json',
].map(read));
assert.equal(started.version,1);
assert.equal(started.state.turn,0);
assert.equal(started.state.activeSeat,0);
assert.equal(swapped.version,2);
assert.equal(swapped.state.turn,1);
assert.notDeepEqual(swapped.state.board,started.state.board);
const hostMoves=actions.filter(action=>action.preActionTurn===0);
assert.equal(hostMoves.length,1);
assert.equal(hostMoves[0].expectedCtrl,'swap');
assert.equal(hostMoves[0].version,swapped.version);
assert.deepEqual(hostMoves[0].localCombatant,swapped.state.participants[0]);

assert.ok(before.version>=swapped.version);
assert.equal(before.version,after.version);
assert.deepEqual(before.state,after.state);
assert.equal(after.generation,renewed.generation);
assert.ok(renewed.hostTickets>after.hostTickets);
const ruleset=before.state.ruleset;
const elemental=ruleset.version===1;
assert.ok(elemental||ruleset.version===2);
const field=elemental?'element':'kind';
const otherField=elemental?'kind':'element';
const jewels=elemental?['fire','water','electric','ghost','ground','light']:['sword','mana','rage','heart','shield','special'];
for(const {state} of [started,swapped,before,after]){
 assert.equal(state.phase,'playing');
 assert.equal(state.bossId,'cinder-terraces-warden');
 assert.equal(state.participants.length,4);
 assert.deepEqual(state.ruleset,ruleset);
 assert.equal(state.board.length,64);
 assert.ok(state.board.every(tile=>tile&&jewels.includes(tile[field])&&!Object.hasOwn(tile,otherField)));
}
const multipliers=before.state.board.filter(tile=>tile.multiplier>1).length;
assert.ok(multipliers>0);

const screenshots=await verifyScreenshots([
 'player-turn-00-swap.png','07-multiplier-board-before-restart.png','09-same-multiplier-board-after-reconnect.png',
]);
verifyPerformance(performance);

console.log(JSON.stringify({
 result:'PASS',scope:'packaged-board-smoke',sourceRevision,playerSize:requestedSize,
 boardContract:elemental?'elemental-fire':'functional-fire',ruleset,boardTiles:64,multiplierTiles:multipliers,
 startedVersion:started.version,hostSwapVersion:swapped.version,restartedVersion:before.version,
 resumedGeneration:after.generation,extraHostAdmissions:renewed.hostTickets-after.hostTickets,
 screenshots,performance,
},null,2));
}
