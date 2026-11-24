import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {
  applyExperience,
  evolutionStage,
  expToNext,
  FIRST_CLEAR_REWARDS,
  GACHA_FEATURED_PET_ID,
  GACHA_OFF_RATE_POOL,
  parseActions,
  replayMap,
  replayReward,
  resolvePulls,
  sProbabilityPpm,
  STARTER_PET_IDS,
  WAVE1_PETS,
  type ArenaAction,
  type Wave1Pet,
} from './catalog';
import {CORE_ELEMENTS,MAPS,type CoreElement} from './manifest';

type FixtureEncounter={won:boolean;turns:number;remainingHp:number;enemyHp:number};
type FixtureVector={
  name:string;mapId:string;element:CoreElement;level:number;
  actions:ArenaAction[];bossActions:ArenaAction[];
  expected:{won:boolean;regular:FixtureEncounter;boss:FixtureEncounter|null};
};
const vectors=(JSON.parse(readFileSync('tests/fixtures/pet-arena-wave1-replay-vectors.json','utf8')) as {vectors:FixtureVector[]}).vectors;

describe('Wave 1 static catalog and reward curve',()=>{
  it('contains exactly the 43-Pet six-element roster with unique identities',()=>{
    expect(WAVE1_PETS).toHaveLength(43);
    expect(new Set(WAVE1_PETS.map(pet=>pet.id)).size).toBe(43);
    const roster=JSON.parse(readFileSync('specs/pet-arena/mvp-wave1-43-pets.json','utf8')) as {pets:Wave1Pet[]};
    expect(WAVE1_PETS).toEqual(roster.pets.map(({id,name,element,rank,category,mapId})=>({id,name,element,rank,category,mapId})));
    expect(WAVE1_PETS.filter(pet=>pet.category==='limited_event_gacha')).toHaveLength(1);
    expect(WAVE1_PETS.filter(pet=>pet.category==='standard_gacha')).toHaveLength(6);
    expect(WAVE1_PETS.filter(pet=>pet.category==='map_legendary')).toHaveLength(6);
    expect(WAVE1_PETS.filter(pet=>pet.category==='map_regular')).toHaveLength(30);
    for(const pet of WAVE1_PETS){
      expect(CORE_ELEMENTS).toContain(pet.element);
      expect(['B','A','S']).toContain(pet.rank);
      expect(pet.id).toMatch(/^[a-z][a-z0-9-]{2,63}$/);
      if(pet.category==='limited_event_gacha'||pet.category==='standard_gacha')expect(pet.mapId).toBeNull();
      else expect(MAPS.map(map=>map.id)).toContain(pet.mapId);
    }
  });
  it('matches the frozen gacha featured and six Standard-S off-rate identities',()=>{
    expect(GACHA_FEATURED_PET_ID).toBe('pet-v3-fire-icarus');
    expect(GACHA_OFF_RATE_POOL).toEqual([
      'pet-v31-fire-cindrelis','pet-v31-water-marivell','pet-v31-electric-quorion',
      'pet-v31-ghost-vesperyn','pet-v31-ground-gravorn','pet-v31-light-aurelune',
    ]);
    for(const petId of [GACHA_FEATURED_PET_ID,...GACHA_OFF_RATE_POOL])expect(WAVE1_PETS.some(pet=>pet.id===petId)).toBe(true);
  });
  it('keeps the three starters at level-one ownership identities',()=>{
    expect(STARTER_PET_IDS).toEqual(['fire-coalwhisk','water-dewskip','ground-clodkin']);
    for(const petId of STARTER_PET_IDS)expect(WAVE1_PETS.find(pet=>pet.id===petId)).toMatchObject({category:'map_regular',rank:'B'});
  });
  it('uses the level 1-59 EXP curve and caps at level 60',()=>{
    expect(expToNext(1)).toBe(30);
    expect(expToNext(12)).toBe(85);
    expect(expToNext(59)).toBe(320);
    expect(expToNext(60)).toBe(0);
    expect(applyExperience(1,0,500)).toEqual({level:10,exp:50,levelsGained:9});
    expect(applyExperience(10,50,120)).toEqual({level:12,exp:15,levelsGained:2});
    expect(applyExperience(59,319,1)).toEqual({level:60,exp:0,levelsGained:1});
    expect(applyExperience(60,0,500)).toEqual({level:60,exp:0,levelsGained:0});
    expect(evolutionStage(19)).toBe(0);
    expect(evolutionStage(20)).toBe(1);
    expect(evolutionStage(40)).toBe(2);
    expect(evolutionStage(60)).toBe(3);
  });
  it('pins first-clear and replay rewards for maps 1-6',()=>{
    expect(FIRST_CLEAR_REWARDS).toEqual([
      {exp:500,coins:200},{exp:750,coins:250},{exp:1100,coins:300},
      {exp:1500,coins:350},{exp:2000,coins:400},{exp:2600,coins:500},
    ]);
    expect(MAPS.map((_,index)=>replayReward(index))).toEqual([
      {exp:120,coins:40},{exp:150,coins:50},{exp:180,coins:60},
      {exp:210,coins:70},{exp:240,coins:80},{exp:270,coins:90},
    ]);
  });
});

describe('Wave 1 deterministic replay parity',()=>{
  it('replays every shared Rust/TypeScript vector to the same encounter result',()=>{
    expect(vectors.length).toBe(10);
    for(const vector of vectors){
      const result=replayMap(vector.mapId,vector.element,vector.level,vector.actions,vector.bossActions);
      expect({won:result.won,regular:result.regular,boss:result.boss}).toEqual(vector.expected);
    }
  });
  it('rejects action lists outside 1-12 and unknown actions',()=>{
    expect(()=>replayMap('cinder-terraces','fire',1,[],[])).toThrow(/1-12/);
    expect(()=>parseActions(['dance'])).toThrow(/Unknown action/);
    expect(()=>parseActions(Array.from({length:13},()=>'strike'))).toThrow(/1-12/);
    expect(replayMap('cinder-terraces','fire',20,['power-skill','strike'],['guard']).regular.won).toBe(true);
    expect(()=>replayMap('cinder-terraces','fire',19,['power-skill'],['strike'])).toThrow(/Lv 20/);
    expect(()=>replayMap('cinder-terraces','fire',39,['guard','guard','guard','fire-zone'],['strike'])).toThrow(/evolution stage/);
    expect(()=>replayMap('cinder-terraces','fire',60,['ultimate'],['strike'])).toThrow(/full Rage/);
    expect(()=>replayMap('missing-map','fire',1,['strike'],['strike'])).toThrow(/Unknown map/);
  });
});

describe('Wave 1 gacha pity and guarantee',()=>{
  it('uses the manifest S probability curve',()=>{
    expect([1,2,58,59,60,61,79,80].map(sProbabilityPpm)).toEqual([8000,8000,8000,8000,57600,107200,1000000,1000000]);
  });
  it('resolves featured, off-rate, guarantee and hard pity exactly',()=>{
    const featured=resolvePulls({misses:12,guaranteed:false,revision:0},[{sRoll:0,featuredRoll:0,offRateTicket:0}]);
    expect(featured.pulls).toEqual([{petId:'pet-v3-fire-icarus',featured:true,pityBefore:12,seq:1}]);
    expect(featured.state).toEqual({misses:0,guaranteed:false,revision:1});
    const offRate=resolvePulls({misses:0,guaranteed:false,revision:0},[{sRoll:0,featuredRoll:500_000,offRateTicket:5}]);
    expect(offRate.pulls[0]).toMatchObject({petId:'pet-v31-light-aurelune',featured:false});
    expect(offRate.state.guaranteed).toBe(true);
    const guaranteed=resolvePulls(offRate.state,[{sRoll:0,featuredRoll:999_999,offRateTicket:0}]);
    expect(guaranteed.pulls[0]).toMatchObject({petId:'pet-v3-fire-icarus',featured:true});
    expect(guaranteed.state.guaranteed).toBe(false);
    const hardPity=resolvePulls({misses:79,guaranteed:false,revision:0},[{sRoll:999_999,featuredRoll:0,offRateTicket:0}]);
    expect(hardPity.pulls).toHaveLength(1);
    expect(hardPity.state.misses).toBe(0);
  });
  it('records misses without granting a Pet and keeps ten-pull order',()=>{
    const entropy=Array.from({length:10},(_,index)=>({sRoll:index%3===0?999_999:0,featuredRoll:index%2===0?500_000:499_999,offRateTicket:index%6}));
    const result=resolvePulls({misses:0,guaranteed:false,revision:0},entropy);
    expect(result.state.revision).toBe(10);
    expect(result.pulls.map(pull=>pull.seq)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(result.pulls.map(pull=>pull.petId)).toEqual([
      null,'pet-v3-fire-icarus','pet-v31-electric-quorion',null,'pet-v3-fire-icarus',
      'pet-v3-fire-icarus',null,'pet-v3-fire-icarus','pet-v31-electric-quorion',null,
    ]);
    expect(()=>resolvePulls({misses:0,guaranteed:false,revision:0},[{sRoll:1_000_000,featuredRoll:0,offRateTicket:0}])).toThrow(/entropy/);
  });
});
