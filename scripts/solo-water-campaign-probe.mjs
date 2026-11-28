import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

export async function verifySoloWaterCampaign({
  pool, published, seedBytes, engineHash, host, otherAccount, mark,
  dbConfig, post, soloAdmission, native, connections, closeMatch, restart, legalSwap,
}) {
  const electric='pet-v31-electric-quorion';
  const level=Number(process.env.WATER_CAMPAIGN_LEVEL??'1');
  assert.ok(Number.isInteger(level)&&level>=1&&level<=60);
  assert.deepEqual((await dbConfig(published.version)).bundle,JSON.parse(seedBytes));
  mark('published the unchanged candidate through engine validation in disposable PostgreSQL',{
   version:published.version,digest:published.digest,sourceSha256:createHash('sha256').update(seedBytes).digest('hex'),engineSha256:engineHash,
  });
  await pool.query('UPDATE pet_wave_one_owned SET level=$2 WHERE account_id=$1',[host.accountId,level]);
  await pool.query("INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,$2,$3,0,'gacha')",[host.accountId,electric,level]);
  mark('fixture owns two manually provisioned solo Pet instances, with no artifacts or clear rows',{
   firePet:host.petId,waterPet:electric,level,artifacts:[],partySize:1,
  });
  const allocateUrl='/v1/pets/wave-a/arena8/native/allocate';
  const waterId='tideglass-lagoon';
  const nextMapId='stormcoil-fields';
  const fireId='cinder-terraces';
  const input=(mapId,kind,petId)=>({mapId,encounterId:mapId+'-'+kind,petId,boardRuleset:'functional',requestId:randomUUID()});
  async function checkLocked(mapId,kind,petId){
   const response=await post(host,allocateUrl,input(mapId,kind,petId));
   assert.equal(response.statusCode,403,JSON.stringify(response.json()));
   assert.equal(response.json().error?.message,'Map is locked');
   mark('authenticated next map admission denied until both previous encounters settle',{mapId,status:403});
  }
  // Rank only visible matches and currently affordable skills. The Rust
  // runtime owns cascades, random outcomes and every state transition.
  function chooseAction(state,pet){
   const actor=state.participants[0];
   for(const [slot,kind] of [[3,'ultimate'],[2,'signature'],[1,'skill']]){
    const skill=published.bundle.skills.find(value=>value.id===pet[kind]);
    if(actor.cooldowns[slot]||actor.mana<skill.manaCost||actor.rage<skill.rageCost)continue;
    if(skill.effect.kind==='heal'&&actor.maxHp-actor.hp<65)continue;
    return {kind};
   }
   const weights={sword:4,mana:actor.mana<65?2.7:0.4,rage:actor.rage<65?2:0.5,
    heart:actor.maxHp-actor.hp>=35?3.7:0.1,shield:state.pending?.remaining===1?3:0.3,special:1.8};
   const tiles=state.board.map(tile=>({...tile}));
   let best,maximum=0;
   for(let first=0;first<tiles.length;first++){
    for(const second of [first%8<7?first+1:-1,first<56?first+8:-1]){
     if(second<0||tiles[first].kind===tiles[second].kind)continue;
     [tiles[first],tiles[second]]=[tiles[second],tiles[first]];
     const indices=new Set();
     for(let cell=0;cell<tiles.length;cell++){
      for(const step of [1,8]){
       if(step===1?cell%8>=6:cell>=48)continue;
       const kind=tiles[cell].kind;
       if(tiles[cell+step].kind===kind&&tiles[cell+step*2].kind===kind)
        for(const index of [cell,cell+step,cell+step*2])indices.add(index);
      }
     }
     const score=[...indices].reduce((sum,index)=>sum+weights[tiles[index].kind]*tiles[index].multiplier,0);
     [tiles[first],tiles[second]]=[tiles[second],tiles[first]];
     if(score>maximum){best={kind:'swap',first,second};maximum=score;}
    }
   }
   return best??legalSwap(state.board);
  }
  async function progression(){
   const {rows:[wallet]}=await pool.query(
    `SELECT w.coins,COALESCE(a.materials,0) AS materials
       FROM pet_wave_one_players w LEFT JOIN pet_artifact_players a USING(account_id)
      WHERE w.account_id=$1`,[host.accountId],
   );
   const {rows:pets}=await pool.query(
    'SELECT pet_id,level,exp,source FROM pet_wave_one_owned WHERE account_id=$1 ORDER BY pet_id',[host.accountId],
   );
   const {rows:clears}=await pool.query(
    'SELECT map_id FROM pet_wave_one_map_clears WHERE account_id=$1 ORDER BY cleared_at',[host.accountId],
   );
   return {wallet,pets,maps:clears.map(row=>row.map_id)};
  }
  const initial=await progression();
  assert.deepEqual(initial.maps,[]);
  assert.deepEqual(initial.pets.map(row=>row.pet_id).sort(),[electric,host.petId].sort());

  async function playAndSettle(mapId,kind,petId,{firstClear=true,restartOnFirstMove=false}={}){
   const request=input(mapId,kind,petId);
   const authored=published.bundle.bosses.find(value=>value.mapId===mapId);
   const regular=kind==='regular';
   const pet=published.bundle.pets.find(value=>value.id===petId);
   const before=await progression();
   const admitted=await soloAdmission(request);
   const match={input:request,row:{match_id:admitted.matchId,content_hash:admitted.contentHash},version:published};
   connections.push(match);
   let cursor=await native(match,0,0,{kind:'start'});
   assert.equal(cursor.committed,true);
   assert.equal(cursor.state.ruleset.configDigest,published.digest);
   assert.equal(cursor.state.participants.length,1);
   assert.equal(cursor.state.participants[0].petId,petId);
   assert.equal(cursor.state.bossId,regular?authored.regular.id:authored.id);
   assert.equal(cursor.state.boss.maxHp,regular?authored.regular.maxHp:authored.solo.maxHp);
   const startingPet=cursor.state.participants[0];
   assert.equal(startingPet.level,before.pets.find(row=>row.pet_id===petId).level);
   const phases=new Set([cursor.state.boss.phase]);
   const moves=[];
   while(cursor.state.phase==='playing'){
    const action=chooseAction(cursor.state,pet);
    const result=await native(match,0,cursor.version,action);
    assert.equal(result.committed,true,JSON.stringify({action,result}));
    cursor=result;
    phases.add(cursor.state.boss.phase);
    moves.push({action,petHp:cursor.state.participants[0].hp,bossHp:cursor.state.boss.hp,bossPhase:cursor.state.boss.phase});
    if(restartOnFirstMove&&moves.length===1){
     await restart();
     const restored=await native(match,0,0);
     assert.equal(restored.version,cursor.version);
     assert.deepEqual(restored.state,cursor.state);
     mark('active Water Warden restored exactly after Nest and Rust restart',{version:restored.version,digest:restored.state.ruleset.configDigest});
    }
   }
   mark('authoritative Rust terminal projection',{
    mapId,encounter:cursor.state.bossId,phase:cursor.state.phase,phases:[...phases],petId,level:startingPet.level,startingHp:startingPet.maxHp,startingAttack:startingPet.attack,
    turns:moves.length,finalHp:cursor.state.participants[0].hp,finalBossHp:cursor.state.boss.hp,moves,
   });
   const settlementUrl='/v1/pets/wave-a/arena8/native/matches/'+admitted.matchId+'/settle';
   const denied=await post(otherAccount,settlementUrl,{requestId:randomUUID()});
   assert.equal(denied.statusCode,403);
   const receipt=await post(host,settlementUrl,{requestId:randomUUID()});
   assert.equal(receipt.statusCode,200,JSON.stringify(receipt.json()));
   const value=receipt.json();
   const retry=await post(host,settlementUrl,{requestId:randomUUID()});
   assert.equal(retry.statusCode,200);
   assert.deepEqual(retry.json(),value);
   closeMatch(match);
   const won=cursor.state.phase==='won';
   if(won&&!regular)assert.deepEqual([...phases],[1,2]);
   const earnedFirstClear=won&&firstClear;
   const earnedMap=earnedFirstClear&&!regular;
   const policy=regular?authored.regular.rewardPolicy:authored.rewardPolicy;
   const expected=policy[won?(earnedFirstClear?'firstClear':'repeatClear'):'defeat'];
   const recruited=earnedMap
    ? policy.recruitmentPetIds?.find(candidate=>before.pets.every(row=>row.pet_id!==candidate))??null
    : null;
   assert.deepEqual({won:value.won,firstClear:value.firstClear,coins:value.coins,exp:value.exp,materials:value.materials},
    {won,firstClear:earnedFirstClear,coins:expected.coins,exp:expected.exp,materials:expected.materials});
   assert.equal(value.recruitedPetId,recruited);
   assert.deepEqual(value.clearedMaps,earnedMap?[...before.maps,mapId]:before.maps);
   const {rows:settlement}=await pool.query(
    `SELECT n.status,a.status AS platform_status,a.functional_config_version::int,
            a.encounter_id,s.proposal,o.delivery_outcome
       FROM game_native_matches n
       JOIN game_native_settlements s ON s.match_id=n.id
       JOIN game_native_outbox o ON o.match_id=n.id
       JOIN platform_native_arena8_matches a ON a.match_id=n.id
      WHERE n.id=$1`,[admitted.matchId],
   );
   assert.equal(settlement.length,1);
   assert.equal(settlement[0].status,'FINISHED');
   assert.equal(settlement[0].platform_status,'CLOSED');
   assert.equal(settlement[0].delivery_outcome,'granted');
   assert.equal(settlement[0].functional_config_version,published.version);
   assert.equal(settlement[0].encounter_id,request.encounterId);
   assert.equal(settlement[0].proposal.configDigest,published.digest);
   assert.equal(settlement[0].proposal.contentHash,admitted.contentHash);
   assert.equal(settlement[0].proposal.outcome,cursor.state.phase);
   const after=await progression();
   assert.equal(after.wallet.coins-before.wallet.coins,expected.coins);
   assert.equal(after.wallet.materials-before.wallet.materials,expected.materials);
   assert.deepEqual(after.maps,value.clearedMaps);
   assert.deepEqual(after.pets.filter(row=>before.pets.every(pet=>pet.pet_id!==row.pet_id)),
    recruited?[{pet_id:recruited,level:1,exp:0,source:'campaign'}]:[]);
   const persistedPet=after.pets.find(row=>row.pet_id===petId);
   assert.deepEqual([persistedPet.level,persistedPet.exp],[value.petLevel,value.petExp]);
   mark('authenticated Nest settled the exact Rust proposal once',{
    mapId,encounterId:request.encounterId,publishedDigest:published.digest,terminalVersion:cursor.version,
    won,firstClear:value.firstClear,coins:value.coins,exp:value.exp,materials:value.materials,recruitedPetId:value.recruitedPetId,
    clearedMaps:value.clearedMaps,replayMatches:true,nonOwnerStatus:denied.statusCode,delivery:settlement[0].delivery_outcome,
   });
   return won;
  }
  async function win(mapId,kind,petId,options){
   for(let attempt=0;attempt<4;attempt++)if(await playAndSettle(mapId,kind,petId,{...options,restartOnFirstMove:options?.restartOnFirstMove&&attempt===0}))return;
   throw Error('No native win for '+mapId+' '+kind+' in four attempts');
  }
  await checkLocked(waterId,'regular',electric);
  await win(fireId,'regular',host.petId);
  await checkLocked(waterId,'regular',electric);
  await win(fireId,'boss',host.petId);
  await checkLocked(nextMapId,'regular',electric);
  await win(waterId,'regular',electric);
  await checkLocked(nextMapId,'regular',electric);
  await win(waterId,'boss',electric,{restartOnFirstMove:true});
  await win(waterId,'regular',electric,{firstClear:false});
  const {rows:encounters}=await pool.query(
   `SELECT encounter_id,coop_recruitment_pet_ids FROM pet_wave_one_encounters
     WHERE account_id=$1 AND map_id=$2 ORDER BY encounter_id`,[host.accountId,waterId],
  );
  const water=published.bundle.bosses.find(boss=>boss.mapId===waterId);
  assert.deepEqual(encounters,[
   {encounter_id:waterId+'-boss',coop_recruitment_pet_ids:water.rewardPolicy.recruitmentPetIds??null},
   {encounter_id:waterId+'-regular',coop_recruitment_pet_ids:water.regular.rewardPolicy.recruitmentPetIds??null},
  ]);
  const {maps}=await progression();
  assert.deepEqual(maps,[fireId,waterId]);

  const nextRequest=input(nextMapId,'regular',electric);
  const nextProfile=published.bundle.bosses.find(boss=>boss.mapId===nextMapId)?.regular;
  const next=await post(host,allocateUrl,nextRequest);
  const playable=nextProfile?.id===nextRequest.encounterId&&nextProfile.rewardPolicy;
  assert.equal(next.statusCode,playable?200:503,JSON.stringify(next.json()));
  if(playable){
   const admitted=next.json();
   const match={input:nextRequest,row:{match_id:admitted.matchId,content_hash:admitted.contentHash},version:published};
   connections.push(match);
   const started=await native(match,0,0,{kind:'start'});
   assert.equal(started.committed,true);
   assert.equal(started.state.bossId,nextProfile.id);
   assert.equal(started.state.boss.maxHp,nextProfile.maxHp);
   assert.equal(started.state.ruleset.configDigest,published.digest);
   closeMatch(match);
  }else{
   assert.equal(next.json().error?.message,'This encounter has no published functional solo profile');
  }
  mark('both Water wins persisted exactly once and lifted the Stormcoil prerequisite gate',{
   encounters,clearedMaps:maps,nextRegularStatus:next.statusCode,nextRegularStarted:Boolean(playable),
  });
}
