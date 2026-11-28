import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

// Evaluate only visible runs, projected stats, and published values. Hidden
// refill tiles, future attacks and combat results remain owned by Rust.
function tacticalPolicy(bundle){
 const tileRules=bundle.board.functionalTiles;
 const tiers=new Map(bundle.multiplier.schedule.flatMap(stage=>stage.tiers).map(tier=>[tier.multiplier,tier]));
 const pets=new Map(bundle.pets.map(pet=>[pet.id,pet]));
 const elements=new Map(bundle.elements.map(element=>[element.element,element]));
 const skills=new Map(bundle.skills.map(skill=>[skill.id,skill]));
 function elementalScale(pet,opponent){
  return elements.get(pet.element).effectiveness.find(entry=>entry.element===opponent.element).permille/1000;
 }
 function chooseAction(view,opponent,boss){
  const seat=view.participants[0];
  const effectiveness=elementalScale(pets.get(seat.petId),opponent);
  const isWarden=opponent===boss;
  const phaseEdge=view.boss.phase===1&&isWarden?Math.floor(boss.solo.maxHp*boss.phase.thresholdBp/10000):0;
  const threshold=view.boss.hp-phaseEdge;
  const {defenseDivisor,minimumDamage}=opponent.attackModel;
  const incoming=view.pending?Math.max(view.pending.damage-Math.floor(seat.defense/defenseDivisor),
   opponent.solo?.minimumDamage??minimumDamage):0;
  const risk=incoming>0&&seat.hp+seat.shield-incoming<=25;
  const missingHp=seat.maxHp-seat.hp;
  const survivalValue=seat.hp/seat.maxHp<0.34?2.4:seat.hp/seat.maxHp<0.6?1.6:0.7;
  const rageValue=seat.petId==='ground-clodkin'&&view.boss.armorBreakPm<3250?(effectiveness<1?2.6:2.0):0.7;
  const armorScale=view.boss.armorBreakPm/1000;
  const critExpectation=1+(seat.critRateBp/10000)*(seat.critDamageBp/10000-1);
  const options=[];
  function assess(action,damage,heal,shield,extra,crit=1){
   damage=Math.max(0,damage*armorScale-view.boss.shield);
   const endsPhase=damage>=threshold;
   const preventsHit=endsPhase&&isWarden;
   const survives=seat.hp+heal+shield+seat.shield>(preventsHit?0:incoming);
   const score=Math.min(damage*crit,threshold)+heal*survivalValue+
     (risk?2.8:1.0)*Math.min(Math.max(incoming-seat.shield,0),shield)+extra+
     (endsPhase?150:0)+(survives?0:-10000);
   options.push({action,score});
  }
  const cells=view.board.slice();
  const matched=(index,step)=>cells[index].kind===cells[index+step].kind&&cells[index].kind===cells[index+step*2].kind;
  for(let a=0;a<64;a++)for(const b of [a%8<7?a+1:-1,a<56?a+8:-1]){
   if(b<0||cells[a].kind===cells[b].kind)continue;
   [cells[a],cells[b]]=[cells[b],cells[a]];
   const hits=new Set();
   for(let i=0;i<64;i++){
    if(i%8<6&&matched(i,1))for(const j of [i,i+1,i+2])hits.add(j);
    if(i<48&&matched(i,8))for(const j of [i,i+8,i+16])hits.add(j);
   }
   if(hits.has(a)||hits.has(b)){
    const weights={sword:0,mana:0,rage:0,heart:0,shield:0,special:0};
    for(const i of hits){
     const tile=cells[i],tier=tiers.get(tile.multiplier);
     weights[tile.kind]+=(tile.kind==='sword'?tier.damageWeightPm:tier.resourceWeightPm)/1000;
    }
    const attack=weights.sword===0?0:Math.max(1,seat.attack+weights.sword*tileRules.swordContributionPm*
      bundle.damage.contributionScalePm/1000-Math.floor(opponent.defense/bundle.damage.defenseDivisor))*effectiveness;
    const heal=Math.min(missingHp,weights.heart*tileRules.heart.amount);
    const shield=Math.min(Math.max(0,seat.maxHp*tileRules.shield.shieldCapPm/1000-seat.shield),weights.shield*tileRules.shield.amount);
    const mana=Math.min(bundle.resources.manaCap-seat.mana,weights.mana*tileRules.manaPerTile+weights.special*tileRules.special.mana);
    const rage=Math.min(bundle.resources.rageCap-seat.rage,weights.rage*tileRules.ragePerTile+weights.special*tileRules.special.rage);
    assess({kind:'swap',first:a,second:b},attack,heal,shield,mana*0.3*effectiveness+rage*rageValue+hits.size*9,critExpectation);
   }
   [cells[a],cells[b]]=[cells[b],cells[a]];
  }
  for(const ability of view.abilities.filter(entry=>entry.ready)){
   const skill=skills.get(ability.id),effect=skill.effect;
   const power=skill.powerPm/1000;
   const resourceCost=ability.rage*(ability.kind==='ultimate'?0.2:0.35)+ability.mana*0.2;
   if(effect.kind==='damage'&&effectiveness>0){
    assess({kind:ability.kind},(seat.attack+effect.value)*power*effectiveness,0,0,-resourceCost,skill.critEligible?critExpectation:1);
   } else if(effect.kind==='debuff'){
    const expectedFuture=Math.min(750,view.boss.hp+phaseEdge);
    const payoff=expectedFuture*(effect.value*power/view.boss.armorBreakPm);
    assess({kind:ability.kind},0,0,0,payoff-resourceCost);
   } else if(effect.kind==='heal'){
    assess({kind:ability.kind},0,Math.min(missingHp,effect.value*power),0,-resourceCost);
   } else if(effect.kind==='shield'){
    assess({kind:ability.kind},0,0,effect.value*power,-resourceCost);
   } else if(ability.kind==='guard'&&incoming>0){
    const defenseBonus=Math.floor(seat.defense*(effect.value*power/1000)/opponent.attackModel.defenseDivisor);
    assess({kind:'guard'},0,0,defenseBonus,Math.min(bundle.resources.rageCap-seat.rage,bundle.resources.ragePerGuard)*rageValue);
   }
  }
  assert.ok(options.some(option=>option.action.kind==='swap'),'Expected a legal committed swap');
  return options.sort((a,b)=>b.score-a.score)[0].action;
 }
 function choosePet(roster,boss){
  const ranked=roster.filter(pet=>pets.has(pet.pet_id)).map(pet=>({
   id:pet.pet_id,
   score:elementalScale(pets.get(pet.pet_id),boss)*(40+pet.level)+(pet.pet_id==='ground-clodkin'?8:0),
  }));
  assert.ok(ranked.length>0);
  return ranked.sort((a,b)=>b.score-a.score)[0].id;
 }
 return {chooseAction,choosePet};
}

export async function verifySoloCampaign({
  natural=false,
  pool, published, seedBytes, engineHash, host, otherAccount, mark,
  dbConfig, get, post, soloAdmission, native, connections, closeMatch, restart, replaceActive, legalSwap,
}) {
  const electric='pet-v31-electric-quorion';
  const tactical=natural?tacticalPolicy(published.bundle):null;
  assert.deepEqual((await dbConfig(published.version)).bundle,JSON.parse(seedBytes));
  mark('published the unchanged candidate through engine validation in disposable PostgreSQL',{
   version:published.version,digest:published.digest,sourceSha256:createHash('sha256').update(seedBytes).digest('hex'),engineSha256:engineHash,
  });
  let fixtureLevel;
  if(natural){
   const state=await get(host,'/v1/pets/wave1/state');
   assert.equal(state.statusCode,200,state.body);
  }else{
   fixtureLevel=Number(process.env.WATER_CAMPAIGN_LEVEL??'1');
   assert.ok(Number.isInteger(fixtureLevel)&&fixtureLevel>=1&&fixtureLevel<=60);
   await pool.query('UPDATE pet_wave_one_owned SET level=$2 WHERE account_id=$1',[host.accountId,fixtureLevel]);
   await pool.query("INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,$2,$3,0,'gacha')",[host.accountId,electric,fixtureLevel]);
  }
  // Initialize the ordinary starter wallet before measuring battle grants.
  const artifactResponse=await get(host,'/v1/pets/artifacts/state');
  assert.equal(artifactResponse.statusCode,200,JSON.stringify(artifactResponse.json()));
  const artifacts=artifactResponse.json();
  assert.ok(artifacts.inventory.every(artifact=>artifact.equipped===null));
  if(!natural)mark('fixture owns two manually provisioned solo Pet instances, with no equipped artifacts or clear rows',{
   firePet:host.petId,waterPet:electric,level:fixtureLevel,startingMaterials:artifacts.materials,equippedArtifacts:[],partySize:1,
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
   mark('authenticated next map admission denied until both previous encounters settle',{mapId,kind,status:403});
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
  if(natural){
   assert.deepEqual(initial.pets.map(row=>[row.pet_id,row.level,row.exp,row.source]),[
    ['fire-coalwhisk',1,0,'starter'],['ground-clodkin',1,0,'starter'],['water-dewskip',1,0,'starter'],
   ]);
   mark('guest started with three ordinary level-1 starters and no clear or equipped Artifact',initial);
  }else assert.deepEqual(initial.pets.map(row=>row.pet_id).sort(),[electric,host.petId].sort());

  async function playAndSettle(mapId,kind,petId,{firstClear=true,restartOnFirstMove=false}={}){
   const request=input(mapId,kind,petId);
   const authored=published.bundle.bosses.find(value=>value.mapId===mapId);
   const regular=kind==='regular';
   const pet=published.bundle.pets.find(value=>value.id===petId);
   const before=await progression();
   const admitted=await soloAdmission(request);
   const match={input:request,admission:admitted,row:{match_id:admitted.matchId,content_hash:admitted.contentHash},version:published};
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
   let restoreActive;
   while(cursor.state.phase==='playing'){
    const action=tactical?tactical.chooseAction(cursor.state,regular?authored.regular:authored,authored):chooseAction(cursor.state,pet);
    const result=await native(match,0,cursor.version,action);
    assert.equal(result.committed,true,JSON.stringify({action,result}));
    cursor=result;
    phases.add(cursor.state.boss.phase);
    moves.push({action,petHp:cursor.state.participants[0].hp,bossHp:cursor.state.boss.hp,bossPhase:cursor.state.boss.phase});
    if(restartOnFirstMove&&moves.length===1){
     if(natural)restoreActive=await replaceActive(mapId);
     await restart();
     const restored=await native(match,0,0);
     assert.equal(restored.version,cursor.version);
     assert.deepEqual(restored.state,cursor.state);
     const stage=natural?'active Warden restored after publication replacement and process restart'
      :'active Water Warden restored exactly after Nest and Rust restart';
     mark(stage,{mapId,version:restored.version,digest:restored.state.ruleset.configDigest});
    }
   }
   mark('authoritative Rust terminal projection',{
    mapId,encounter:cursor.state.bossId,phase:cursor.state.phase,phases:[...phases],petId,level:startingPet.level,startingHp:startingPet.maxHp,startingAttack:startingPet.attack,
    turns:moves.length,finalHp:cursor.state.participants[0].hp,finalBossHp:cursor.state.boss.hp,moves,
   });
   const settlementUrl='/v1/pets/wave-a/arena8/native/matches/'+admitted.matchId+'/settle';
   const validateRetry=!natural||(firstClear&&cursor.state.phase==='won');
   const denied=validateRetry?await post(otherAccount,settlementUrl,{requestId:randomUUID()}):null;
   if(denied)assert.equal(denied.statusCode,403);
   const receipt=await post(host,settlementUrl,{requestId:randomUUID()});
   assert.equal(receipt.statusCode,200,JSON.stringify(receipt.json()));
   const value=receipt.json();
   if(validateRetry){
    const retry=await post(host,settlementUrl,{requestId:randomUUID()});
    assert.equal(retry.statusCode,200);
    assert.deepEqual(retry.json(),value);
   }
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
    clearedMaps:value.clearedMaps,replayMatches:validateRetry?true:null,nonOwnerStatus:denied?.statusCode??null,delivery:settlement[0].delivery_outcome,
   });
   await restoreActive?.();
   return won;
  }
  async function win(mapId,kind,petId,options){
   for(let attempt=0;attempt<4;attempt++)if(await playAndSettle(mapId,kind,petId,{...options,restartOnFirstMove:options?.restartOnFirstMove&&attempt===0}))return;
   throw Error('No native win for '+mapId+' '+kind+' in four attempts');
  }
  if(natural){
   const starter=artifacts.inventory.find(item=>item.definitionId==='core-emberglass');
   assert.ok(starter,'Expected the standard starter Core');
   const upgrade=await post(host,'/v1/pets/artifacts/upgrade',{requestId:randomUUID(),artifactId:starter.artifactId});
   assert.equal(upgrade.statusCode,200,upgrade.body);
   mark('upgraded standard starter Core through the authenticated Artifact route',upgrade.json());

   const authored=published.bundle.bosses;
   const maps=authored.map(boss=>boss.mapId);
   const expectedRecruits=['fire-emberloom','water-ripplefin','electric-zipspool','ghost-wickrift','ground-burrowick','light-gleamlet'];
   assert.equal(maps.length,expectedRecruits.length);
   let equippedPet=null;
   for(const [index,boss] of authored.entries()){
    const {mapId}=boss;
    const next=maps[index+1];
    const current=await progression();
    const petId=tactical.choosePet(current.pets,boss);
    if(petId!==equippedPet){
     if(equippedPet){
      const unequip=await post(host,'/v1/pets/artifacts/unequip',{requestId:randomUUID(),petId:equippedPet,slot:'core'});
      assert.equal(unequip.statusCode,200,unequip.body);
      assert.equal(unequip.json().removedArtifactId,starter.artifactId);
     }
     const equip=await post(host,'/v1/pets/artifacts/equip',{requestId:randomUUID(),petId,artifactId:starter.artifactId});
     assert.equal(equip.statusCode,200,equip.body);
     equippedPet=petId;
    }
    mark('selected an owned Pet by matchup and earned level',{mapId,petId,level:current.pets.find(pet=>pet.pet_id===petId).level});
    const checkNextLocked=async()=>{
     if(!next)return;
     for(const kind of ['regular','boss'])await checkLocked(next,kind,petId);
    };
    await checkNextLocked();
    await win(mapId,'regular',petId);
    await checkNextLocked();

    let cleared=false;
    for(let attempt=0;attempt<8&&!cleared;attempt++){
     cleared=await playAndSettle(mapId,'boss',petId,{restartOnFirstMove:mapId==='lantern-necropolis'&&attempt===0});
     if(!cleared&&attempt<5)await win(mapId,'regular',petId,{firstClear:false});
    }
    assert.ok(cleared,'No natural Warden win in '+mapId);
    const state=await progression();
    assert.deepEqual(state.maps,maps.slice(0,index+1));
    assert.deepEqual(state.pets.filter(pet=>pet.source==='campaign').map(pet=>pet.pet_id),expectedRecruits.slice(0,index+1).sort());
   }
   const final=await get(host,'/v1/pets/wave1/state');
   assert.equal(final.statusCode,200,final.body);
   assert.deepEqual(final.json().campaign,{clearedMaps:maps,nextMapId:null});
   mark('one natural starter account completed all six maps and earned six recruits',await progression());
   return;
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
