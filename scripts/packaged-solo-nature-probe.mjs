import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {access,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

const encounter='lantern-necropolis-regular';

export async function prepareGhostNatureMap(pool,directory,stopped,level){
 const ready=join(directory,'nature-guest-ready');
 const deadline=Date.now()+60_000;
 for(;;){
  try{await access(ready);break;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  assert.ok(!stopped()&&Date.now()<deadline,'The packaged starter did not initialize');
  await pause(125);
 }
 const {rows:accounts}=await pool.query('SELECT account_id FROM pet_wave_one_players');
 assert.equal(accounts.length,1);
 const [account]=accounts;
 const {rows:owned}=await pool.query(
  'SELECT pet_id,level,exp,source FROM pet_wave_one_owned WHERE account_id=$1 ORDER BY pet_id',[account.account_id]);
 assert.deepEqual(owned.map(pet=>[pet.pet_id,pet.level,pet.exp,pet.source]),[
  ['fire-coalwhisk',1,0,'starter'],['ground-clodkin',1,0,'starter'],['water-dewskip',1,0,'starter'],
 ]);
 const {rows:matches}=await pool.query('SELECT match_id FROM platform_native_arena8_matches');
 assert.deepEqual(matches,[]);
 const {rows:clears}=await pool.query('SELECT map_id FROM pet_wave_one_map_clears');
 assert.deepEqual(clears,[]);
 // The prior chapter marker is a disposable access fixture. Rust still
 // receives the unmodified published opponent, allocation and starter stats.
 await pool.query('INSERT INTO pet_wave_one_map_clears(account_id,map_id) VALUES($1,$2)',
  [account.account_id,'stormcoil-fields']);
 if(level!==1){
  assert.equal(level,60);
  const boosted=await pool.query("UPDATE pet_wave_one_owned SET level=$2 WHERE account_id=$1 AND pet_id='fire-coalwhisk'",
   [account.account_id,level]);
  assert.equal(boosted.rowCount,1);
 }
 const fixture={accountId:account.account_id,mapClear:'stormcoil-fields',purpose:'Ghost chapter access only',owned,
  playerLevel:level,levelFixture:level===1?null:'Coalwhisk at supported level 60 with published growth'};

 await writeFile(join(directory,'nature-map-access.json'),JSON.stringify(fixture,null,2)+'\n',{mode:0o600});
 await writeFile(join(directory,'nature-map-access-ready'),'fixture recorded\n',{mode:0o600});
 return fixture;
}

function commandUuid(receipt){
 const bytes=Buffer.from(receipt,'base64');
 assert.equal(bytes.length,16);
 const hex=bytes.toString('hex');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

// Hash the three canonical native event fields used by this probe. The
// stored receipt and event contents remain encrypted and unmodified.
function nativeEventHash(kind,seat,value){
 const name=Buffer.from(kind);
 const prefix=Buffer.alloc(10);
 prefix.writeUInt8(6);
 prefix.writeUInt32BE(3,1);
 prefix.writeUInt8(5,5);
 prefix.writeUInt32BE(name.length,6);
 const count=amount=>{
  if(amount===null)return Buffer.from([0]);
  const bytes=Buffer.alloc(9);
  bytes.writeUInt8(3);
  bytes.writeBigUInt64BE(BigInt(amount),1);
  return bytes;
 };
 return createHash('sha256').update(Buffer.from('VL-CANON\x01')).update(prefix).update(name)
  .update(count(seat)).update(count(value)).digest('hex');
}

async function receiptEvents(pool,matchId,version){
 const {rows}=await pool.query(
  `SELECT event_index,encode(event_hash,'hex') AS hash
     FROM game_native_events WHERE match_id=$1 AND state_version=$2 ORDER BY event_index`,[matchId,version]);
 assert.ok(rows.length>0);
 return rows;
}

export async function verifyGhostNatureReceipt(pool,directory,published,fixture,bundle,candidate){
 const read=async name=>JSON.parse(await readFile(join(directory,name),'utf8'));
 const player=await read('native-facts.json');
 assert.equal(player.status,'ok');
 assert.equal(player.ruleset,'arena8-functional-pve');
 assert.equal(player.participantCount,1);
 const sample=await read('nature-capture.json');
 assert.equal(sample.matchId,player.matchId);
 assert.equal(sample.rulesetVersion,4);
 assert.equal(sample.configDigest,published.digest);
 assert.ok(sample.firstWaveNature>=3);
 assert.deepEqual([sample.eventKind,sample.eventSeat,sample.eventValue],['nature-cleanse',0,1]);
 assert.equal(sample.before.vulnerability,bundle.bosses.find(row=>row.regular?.id===encounter).regular.attackModel.vulnerability.valuePm);
 assert.ok(sample.before.turns>0);
 assert.equal(sample.hudLabel,'−1');
 const events=await receiptEvents(pool,sample.matchId,sample.after.version);
 const cleansed=events.find(row=>row.hash===nativeEventHash('nature-cleanse',0,1));
 assert.ok(cleansed);
 let reapplied=null;
 if(sample.after.vulnerability!==0){
  assert.equal(sample.after.vulnerability,sample.before.vulnerability);
  assert.equal(sample.before.pending,1);
  reapplied=events.find(row=>row.event_index>cleansed.event_index
   &&row.hash===nativeEventHash('vulnerability',0,sample.after.vulnerability));
  assert.ok(reapplied,'A new boss impact must authoritatively reapply any remaining Vulnerability');
 }

 assert.equal(sample.after.version,sample.before.version+1);
 assert.equal(sample.after.version,player.version);
 const kinds=new Set(bundle.board.functionalTiles.spawnWeights.map(row=>row.kind));
 for(const frame of [sample.before,sample.after]){
  assert.equal(frame.board.length,64);
  assert.ok(frame.board.every(kind=>kinds.has(kind)||kind===null&&['won','lost'].includes(frame.phase)));
 }
 const {rows:[match]}=await pool.query(
  `SELECT account_id,content_hash,level::int AS level,functional_config_version::int AS version,functional_config_digest AS digest,
     functional_allocation->>'bossId' AS encounter FROM platform_native_arena8_matches WHERE match_id=$1`,[sample.matchId]);
 assert.deepEqual(match,{
  account_id:fixture.accountId,content_hash:sample.contentHash,level:fixture.playerLevel,
  version:published.version,digest:published.digest,encounter,
 });
 const {rows:receipts}=await pool.query(
  `SELECT committed_version::int AS version,actor_id,command_id,encode(receipt_hash,'hex') AS hash
     FROM game_native_receipts WHERE match_id=$1 ORDER BY committed_version`,[sample.matchId]);
 assert.deepEqual(receipts.map(row=>row.version),Array.from({length:sample.after.version},(_,index)=>index+1));
 assert.ok(receipts.every(row=>row.actor_id===fixture.accountId));
 assert.equal(receipts.at(-1).command_id,commandUuid(sample.receiptId));

 const frames=[];
 for(const name of ['nature-solo-01-started.png','nature-solo-02-before.png','nature-solo-03-cleanse.png']){
  const image=await readFile(join(directory,name));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),1280);
  assert.equal(image.readUInt32BE(20),720);
  frames.push({name,sha256:createHash('sha256').update(image).digest('hex')});
 }
 assert.equal(new Set(frames.map(frame=>frame.sha256)).size,frames.length);
 const verified={candidate,match,mapAccess:fixture.purpose,clearedMapFixture:fixture.mapClear,
  playerLevel:fixture.playerLevel,levelFixture:fixture.levelFixture,sample,journalOrder:{cleansed,reapplied},receipts,frames};
 await writeFile(join(directory,'solo-shared-nature-verification.json'),JSON.stringify(verified,null,2)+'\n',{mode:0o600});
}

export async function verifyGhostAdvancedReceipts(pool,directory,published,fixture,bundle,candidate){
 const read=async name=>JSON.parse(await readFile(join(directory,name),'utf8'));
 const player=await read('native-facts.json');
 assert.equal(player.status,'ok');
 assert.equal(player.ruleset,'arena8-functional-pve');
 assert.equal(player.participantCount,1);
 const {samples}=await read('advanced-samples.json');
 assert.deepEqual(samples.map(sample=>sample.kind),['chill-armed','chill-consumed','astral-upgrade']);
 const [armed,consumed,astral]=samples;
 assert.ok(bundle.advancedJewels.frostReductionPm.includes(armed.value));
 assert.equal(consumed.value,armed.value);
 assert.equal(consumed.afterChill,0);
 const sameReceipt=armed.version===consumed.version;
 if(sameReceipt){
  assert.equal(armed.afterChill,0);
  assert.equal(armed.receiptId,consumed.receiptId);
 }else{
  assert.equal(armed.afterChill,armed.value);
  assert.equal(consumed.beforeChill,armed.value);
  assert.equal(consumed.first,-1);
 }
 const matched=await receiptEvents(pool,player.matchId,armed.version);
 const applied=await receiptEvents(pool,player.matchId,consumed.version);
 const frostSizes=Array.from({length:62},(_,index)=>index+3).filter(size=>
  bundle.advancedJewels.frostReductionPm[Math.min(size,5)-3]===armed.value);
 const possibleArms=new Set(frostSizes.map(size=>nativeEventHash('matched-frost',0,size)));
 const frostMatch=matched.find(row=>possibleArms.has(row.hash));
 const frostConsumed=applied.find(row=>row.hash===nativeEventHash('chill-consumed',null,consumed.value));
 assert.ok(frostMatch&&frostConsumed,'Expected journal commitments to matching and consuming Frost');
 assert.ok(!sameReceipt||frostMatch.event_index<frostConsumed.event_index);
 assert.ok(astral.value>=2&&astral.cell>=0&&astral.cell<64);
 assert.equal(astral.afterMultipliers[astral.cell],astral.value);
 const amplified=await receiptEvents(pool,player.matchId,astral.version);
 const astralGroups=new Set(Array.from({length:62},(_,index)=>nativeEventHash('matched-astral',0,index+3)));
 const astralMatch=amplified.find(row=>astralGroups.has(row.hash));
 const astralUpgrade=amplified.find(row=>row.event_index>astralMatch?.event_index
  &&row.hash===nativeEventHash('astral-upgrade',0,astral.value));
 assert.ok(astralMatch&&astralUpgrade,'Expected journal commitments to matching and upgrading Astral');
 const earlyMax=Math.max(...bundle.multiplier.schedule.filter(stage=>stage.from<=astral.beforeTurn)
  .flatMap(stage=>stage.tiers.map(row=>row.multiplier)));
 assert.ok(astral.value<=earlyMax);
 assert.deepEqual(samples.map(sample=>sample.hudLabel),
  ['−'+armed.value/10+'%','−'+armed.value/10+'%','×'+astral.value]);

 const {rows:[match]}=await pool.query(
  `SELECT account_id,content_hash,level::int AS level,functional_config_version::int AS version,functional_config_digest AS digest,
     functional_allocation->>'bossId' AS encounter FROM platform_native_arena8_matches WHERE match_id=$1`,[player.matchId]);
 assert.deepEqual(match,{
  account_id:fixture.accountId,content_hash:astral.contentHash,level:fixture.playerLevel,
  version:published.version,digest:published.digest,encounter,
 });
 const {rows:receipts}=await pool.query(
  `SELECT committed_version::int AS version,actor_id,command_id,encode(receipt_hash,'hex') AS hash
     FROM game_native_receipts WHERE match_id=$1 ORDER BY committed_version`,[player.matchId]);
 assert.deepEqual(receipts.map(row=>row.version),Array.from({length:astral.version},(_,index)=>index+1));
 assert.ok(receipts.every(row=>row.actor_id===fixture.accountId));
 const known=new Set(bundle.board.functionalTiles.spawnWeights.map(row=>row.kind));
 const frames=[];
 for(const sample of samples){
  assert.equal(sample.matchId,player.matchId);
  assert.equal(sample.configDigest,published.digest);
  assert.equal(sample.contentHash,match.content_hash);
  assert.equal(sample.version,sample.beforeVersion+1);
  assert.equal(receipts[sample.version-1].command_id,commandUuid(sample.receiptId));
  for(const board of [sample.beforeKinds,sample.afterKinds]){
   assert.equal(board.length,64);
   assert.ok(board.every(kind=>known.has(kind)||kind===null&&['won','lost'].includes(sample.phase)));
  }
  for(const multipliers of [sample.beforeMultipliers,sample.afterMultipliers])
   assert.equal(multipliers.length,64);
  const name='advanced-solo-'+sample.kind+'.png';
  const image=await readFile(join(directory,name));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),1280);
  assert.equal(image.readUInt32BE(20),720);
  frames.push({name,sha256:createHash('sha256').update(image).digest('hex')});
 }
 assert.equal(astral.version,player.version);
 const verified={candidate,match,mapAccess:fixture.purpose,clearedMapFixture:fixture.mapClear,
  playerLevel:fixture.playerLevel,levelFixture:fixture.levelFixture,
  samples,journalOrder:{frostMatch,frostConsumed,sameReceipt,astralMatch,astralUpgrade},receipts,frames};
 await writeFile(join(directory,'solo-shared-frost-astral-verification.json'),JSON.stringify(verified,null,2)+'\n',{mode:0o600});
}

export async function verifyGhostUltimateReceipt(pool,directory,published,fixture,bundle,candidate){
 const read=async name=>JSON.parse(await readFile(join(directory,name),'utf8'));
 const player=await read('native-facts.json');
 const sample=await read('ultimate-receipt.json');
 assert.equal(player.status,'ok');
 assert.equal(player.ruleset,'arena8-functional-pve');
 assert.equal(player.participantCount,1);
 assert.equal(sample.matchId,player.matchId);
 assert.equal(sample.version,player.version);
 assert.equal(sample.configDigest,published.digest);
 assert.equal(sample.version,sample.beforeVersion+1);
 assert.equal(sample.guardTurns,sample.beforeVersion-1);
 assert.equal(sample.turnTimeoutMilliseconds,15000);
 assert.equal(sample.refreshSuppressed,true);
 assert.equal(sample.hudLabel,'Ultimate Skill');
 const pet=bundle.pets.find(row=>row.id===sample.pet);
 const ultimate=bundle.skills.find(row=>row.id===pet.ultimate);
 assert.equal(sample.ability,ultimate.id);
 assert.equal(sample.rageBefore,ultimate.rageCost);
 assert.ok(sample.rageAfter<sample.rageBefore);
 assert.equal(sample.cooldownBefore,0);
 assert.ok(sample.cooldownAfter>0&&sample.cooldownAfter<=ultimate.cooldownTurns);
 assert.ok(sample.bossHealthAfter<sample.bossHealthBefore);

 const {rows:[receipt]}=await pool.query(
  `SELECT m.account_id,m.content_hash,m.level::int AS level,m.functional_config_version::int AS version,m.functional_config_digest AS digest,
     m.functional_allocation->>'bossId' AS encounter,r.actor_id,encode(r.receipt_hash,'hex') AS hash,
     (SELECT count(*)::int FROM game_native_receipts all_receipts WHERE all_receipts.match_id=m.match_id) AS receipt_count
   FROM platform_native_arena8_matches m JOIN game_native_receipts r ON r.match_id=m.match_id
   WHERE m.match_id=$1 AND r.command_id=$2 AND r.committed_version=$3`,
  [sample.matchId,commandUuid(sample.receiptId),sample.version]);
 assert.equal(receipt.account_id,fixture.accountId);
 assert.equal(receipt.actor_id,fixture.accountId);
 assert.equal(receipt.content_hash,sample.contentHash);
 assert.equal(receipt.level,fixture.playerLevel);
 assert.equal(receipt.version,published.version);
 assert.equal(receipt.digest,published.digest);
 assert.equal(receipt.encounter,encounter);
 assert.equal(receipt.receipt_count,sample.version);

 const frames=[];
 for(const name of ['ultimate-solo-01-ready.png','ultimate-solo-02-committed.png']){
  const image=await readFile(join(directory,name));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),1280);
  assert.equal(image.readUInt32BE(20),720);
  frames.push({name,sha256:createHash('sha256').update(image).digest('hex')});
 }
 assert.notEqual(frames[0].sha256,frames[1].sha256);
 await writeFile(join(directory,'solo-shared-ultimate-verification.json'),
  JSON.stringify({candidate,receipt,mapAccess:fixture.purpose,playerLevel:fixture.playerLevel,levelFixture:fixture.levelFixture,sample,frames},null,2)+'\n',{mode:0o600});
}
