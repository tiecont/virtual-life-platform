import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

const root=process.argv[2];
const read=async file=>JSON.parse(await readFile(join(root,file+'.json'),'utf8'));
const states=(await Promise.all((await readdir(root)).filter(name=>/^state-\d{3}\.json$/.test(name)).map(name=>read(name.slice(0,-5))))).sort((a,b)=>a.version-b.version);
const stateAt=version=>states.find(s=>s.version===version)?.state;
const before=await read('before-restart'),after=await read('after-restart'),renewed=await read('host-renewed');
assert.equal(before.version,after.version);
assert.deepEqual(after.state,before.state);
assert.equal(before.state.board.length,64);
const version=before.state.ruleset.version;
assert.ok(version===1||version===2);
const field=version===2?'kind':'element';
const vocabulary=version===2?['sword','mana','rage','heart','shield','special']:['fire','water','electric','ghost','ground','light'];
for(const {state} of states.filter(s=>s.state.phase==='playing')){
 assert.equal(state.ruleset.version,version);
 assert.ok(state.board.every(tile=>tile&&vocabulary.includes(tile[field])&&!Object.hasOwn(tile,version===2?'element':'kind')), 'Invalid board contract');
}
const multipliers=before.state.board.filter(tile=>tile.multiplier>1).length;
assert.ok(multipliers>0);
assert.ok(renewed.hostTickets>after.hostTickets);
const actions=await read('player-actions');
const need=[['swap',0],['skill',4],['signature',8],['ultimate',12],['guard',16]];
for(const [kind,turn] of need){
 const receipt=actions.find(a=>a.expectedCtrl===kind&&a.preActionTurn===turn);
 assert.ok(receipt,kind);
 const prior=stateAt(receipt.version-1).participants[0];
 const unit=stateAt(receipt.version).participants[0];
 switch(kind){
  case 'swap': assert.notDeepEqual(stateAt(receipt.version).board,stateAt(receipt.version-1).board);break;
  case 'skill': assert.ok(unit.cooldowns[1]>prior.cooldowns[1]);break;
  case 'signature': assert.ok(unit.cooldowns[2]>prior.cooldowns[2]);break;
  case 'ultimate': assert.ok(unit.cooldowns[3]>prior.cooldowns[3]);break;
  case 'guard': assert.ok(unit.statuses.some(status=>status.kind==='defense-buff'));break;
 }
}
const transformed=states.find(entry=>entry.state.boss.phase===2);
assert.ok(transformed && transformed.state.phase==='playing');
assert.equal(states.at(-1).state.phase,'won');
const rewards=await read('reward-facts');
assert.equal(rewards.count,4);
assert.deepEqual(rewards.rewards,Array.from({length:4},()=>({achievement_points:333,coins:144,exp:105})));
assert.deepEqual(rewards.materialRows,Array.from({length:4},()=>({materials:157})));
const gear=await read('gear-water-facts'),water=await read('water-allocation-facts');
assert.equal(gear.waterRoom.bossId,'tideglass-lagoon-warden');
assert.equal(gear.preUpgrade.upgrade_level,1);
assert.equal(gear.materialsSpent,60);
assert.equal(water.seats,4);
assert.equal(water.petId,'fire-coalwhisk');
assert.equal(water.configDigest,before.state.ruleset.configDigest);
assert.equal(water.entries.length,1);
assert.equal(water.entries[0].artifactId,gear.preUpgrade.artifact_id);
assert.equal(water.entries[0].definitionId,'core-emberglass');
assert.equal(water.entries[0].upgradeLevel,2);
const log=(await readFile(join(root,'backend.log'),'utf8')).split('\n');
const outcome=log.find(line=>line.startsWith('reward rows verified '));
assert.ok(outcome);
const report=JSON.parse(outcome.slice('reward rows verified '.length));
assert.equal(report.result,'PASS');
assert.ok(report.scenarios.includes('packaged-player-consumed-a-native-admission-in-the-equipped-water-allocation'));
console.log(JSON.stringify({result:'PASS',boardContract:version===2?'functional':'elemental',boardTiles:64,multiplierTiles:multipliers,fireVersionBeforeRestart:before.version,
 resumedGeneration:after.generation,extraHostAdmissions:renewed.hostTickets-after.hostTickets,actions:need,
 transformedVersion:transformed.version,fireWonVersion:states.at(-1).version,rewardRows:rewards.count,water},null,2));
