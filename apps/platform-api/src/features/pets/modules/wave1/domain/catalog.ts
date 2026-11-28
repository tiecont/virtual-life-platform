import {DomainError} from '../../../../../shared/common/errors';
import {
  EVOLUTION_THRESHOLDS,
  EFFECTIVENESS,
  evolutionPreview,
  GACHA_FEATURED,
  GACHA_ODDS,
  GACHA_STANDARD_POOL,
  MAPS,
  type CoreElement,
  type Stats,
} from './manifest';

// Static Wave 1 roster from specs/pet-arena/mvp-wave1-43-pets.json. Production
// code never reads the specification file; this literal is the runtime catalog.
export type Wave1PetCategory='limited_event_gacha'|'standard_gacha'|'map_legendary'|'map_regular';
export type Wave1PetRank='B'|'A'|'S';
export type Wave1Pet=Readonly<{
  id:string;name:string;element:CoreElement;rank:Wave1PetRank;
  category:Wave1PetCategory;mapId:string|null;
}>;

export const WAVE1_PETS:readonly Wave1Pet[]=Object.freeze([
  {id:'pet-v3-fire-icarus',name:'Icarus',element:'fire',rank:'S',category:'limited_event_gacha',mapId:null},
  {id:'pet-v31-fire-cindrelis',name:'Cindrelis',element:'fire',rank:'S',category:'standard_gacha',mapId:null},
  {id:'pet-v31-water-marivell',name:'Marivell',element:'water',rank:'S',category:'standard_gacha',mapId:null},
  {id:'pet-v31-electric-quorion',name:'Quorion',element:'electric',rank:'S',category:'standard_gacha',mapId:null},
  {id:'pet-v31-ghost-vesperyn',name:'Vesperyn',element:'ghost',rank:'S',category:'standard_gacha',mapId:null},
  {id:'pet-v31-ground-gravorn',name:'Gravorn',element:'ground',rank:'S',category:'standard_gacha',mapId:null},
  {id:'pet-v31-light-aurelune',name:'Aurelune',element:'light',rank:'S',category:'standard_gacha',mapId:null},
  {id:'fire-pyrecrown',name:'Pyrecrown',element:'fire',rank:'S',category:'map_legendary',mapId:'cinder-terraces'},
  {id:'water-lagoonarch',name:'Lagoonarch',element:'water',rank:'S',category:'map_legendary',mapId:'tideglass-lagoon'},
  {id:'electric-stormdiadem',name:'Stormdiadem',element:'electric',rank:'S',category:'map_legendary',mapId:'stormcoil-fields'},
  {id:'ground-faultwarden',name:'Faultwarden',element:'ground',rank:'S',category:'map_legendary',mapId:'ochre-labyrinth'},
  {id:'ghost-lanternwake',name:'Lanternwake',element:'ghost',rank:'S',category:'map_legendary',mapId:'lantern-necropolis'},
  {id:'light-dawnarchon',name:'Dawnarchon',element:'light',rank:'S',category:'map_legendary',mapId:'dawn-prism-sanctum'},
  {id:'fire-coalwhisk',name:'Coalwhisk',element:'fire',rank:'B',category:'map_regular',mapId:'cinder-terraces'},
  {id:'fire-emberloom',name:'Emberloom',element:'fire',rank:'B',category:'map_regular',mapId:'cinder-terraces'},
  {id:'fire-kilnback',name:'Kilnback',element:'fire',rank:'B',category:'map_regular',mapId:'cinder-terraces'},
  {id:'fire-flarequill',name:'Flarequill',element:'fire',rank:'A',category:'map_regular',mapId:'cinder-terraces'},
  {id:'fire-scorchveil',name:'Scorchveil',element:'fire',rank:'A',category:'map_regular',mapId:'cinder-terraces'},
  {id:'water-dewskip',name:'Dewskip',element:'water',rank:'B',category:'map_regular',mapId:'tideglass-lagoon'},
  {id:'water-ripplefin',name:'Ripplefin',element:'water',rank:'B',category:'map_regular',mapId:'tideglass-lagoon'},
  {id:'water-foamcurl',name:'Foamcurl',element:'water',rank:'B',category:'map_regular',mapId:'tideglass-lagoon'},
  {id:'water-tideweft',name:'Tideweft',element:'water',rank:'A',category:'map_regular',mapId:'tideglass-lagoon'},
  {id:'water-abyssail',name:'Abyssail',element:'water',rank:'A',category:'map_regular',mapId:'tideglass-lagoon'},
  {id:'electric-zipspool',name:'Zipspool',element:'electric',rank:'B',category:'map_regular',mapId:'stormcoil-fields'},
  {id:'electric-copperkip',name:'Copperkip',element:'electric',rank:'B',category:'map_regular',mapId:'stormcoil-fields'},
  {id:'electric-arcshell',name:'Arcshell',element:'electric',rank:'B',category:'map_regular',mapId:'stormcoil-fields'},
  {id:'electric-pulsecrest',name:'Pulsecrest',element:'electric',rank:'A',category:'map_regular',mapId:'stormcoil-fields'},
  {id:'electric-thundrel',name:'Thundrel',element:'electric',rank:'A',category:'map_regular',mapId:'stormcoil-fields'},
  {id:'ground-clodkin',name:'Clodkin',element:'ground',rank:'B',category:'map_regular',mapId:'ochre-labyrinth'},
  {id:'ground-burrowick',name:'Burrowick',element:'ground',rank:'B',category:'map_regular',mapId:'ochre-labyrinth'},
  {id:'ground-dunebraid',name:'Dunebraid',element:'ground',rank:'B',category:'map_regular',mapId:'ochre-labyrinth'},
  {id:'ground-siltmaw',name:'Siltmaw',element:'ground',rank:'A',category:'map_regular',mapId:'ochre-labyrinth'},
  {id:'ground-terracrest',name:'Terracrest',element:'ground',rank:'A',category:'map_regular',mapId:'ochre-labyrinth'},
  {id:'ghost-wickrift',name:'Wickrift',element:'ghost',rank:'B',category:'map_regular',mapId:'lantern-necropolis'},
  {id:'ghost-shroudlet',name:'Shroudlet',element:'ghost',rank:'B',category:'map_regular',mapId:'lantern-necropolis'},
  {id:'ghost-bellshade',name:'Bellshade',element:'ghost',rank:'B',category:'map_regular',mapId:'lantern-necropolis'},
  {id:'ghost-echowisp',name:'Echowisp',element:'ghost',rank:'A',category:'map_regular',mapId:'lantern-necropolis'},
  {id:'ghost-veilrelic',name:'Veilrelic',element:'ghost',rank:'A',category:'map_regular',mapId:'lantern-necropolis'},
  {id:'light-gleamlet',name:'Gleamlet',element:'light',rank:'B',category:'map_regular',mapId:'dawn-prism-sanctum'},
  {id:'light-dawnpurl',name:'Dawnpurl',element:'light',rank:'B',category:'map_regular',mapId:'dawn-prism-sanctum'},
  {id:'light-raymantle',name:'Raymantle',element:'light',rank:'B',category:'map_regular',mapId:'dawn-prism-sanctum'},
  {id:'light-solweft',name:'Solweft',element:'light',rank:'A',category:'map_regular',mapId:'dawn-prism-sanctum'},
  {id:'light-prismhalo',name:'Prismhalo',element:'light',rank:'A',category:'map_regular',mapId:'dawn-prism-sanctum'},
]);

export const WAVE1_PET_BY_ID:ReadonlyMap<string,Wave1Pet>=new Map(WAVE1_PETS.map(pet=>[pet.id,pet]));
export const WAVE1_PET_INDEX:ReadonlyMap<string,number>=new Map(WAVE1_PETS.map((pet,index)=>[pet.id,index]));

export const STARTER_PET_IDS=Object.freeze(['fire-coalwhisk','water-dewskip','ground-clodkin'] as const);
export const STARTING_COINS=8000;
export const GACHA_COST=100;
export const GACHA_MISS_EXP=25;
export const GACHA_DUPLICATE_EXP=200;
export const GACHA_FEATURED_PET_ID=GACHA_FEATURED;
export const GACHA_OFF_RATE_POOL=GACHA_STANDARD_POOL;

export const FIRST_CLEAR_REWARDS=Object.freeze([
  {exp:500,coins:200},{exp:750,coins:250},{exp:1100,coins:300},
  {exp:1500,coins:350},{exp:2000,coins:400},{exp:2600,coins:500},
] as const);

export type Reward=Readonly<{exp:number;coins:number}>;
export function firstClearReward(mapIndex:number):Reward{
  const reward=FIRST_CLEAR_REWARDS[mapIndex];
  if(!reward)throw invalid('Unknown map');
  return reward;
}
export function replayReward(mapIndex:number):Reward{
  if(!Number.isInteger(mapIndex)||mapIndex<0||mapIndex>=MAPS.length)throw invalid('Unknown map');
  return {exp:120+30*mapIndex,coins:40+10*mapIndex};
}

function invalid(message:string){return new DomainError('INVALID_REQUEST',400,message);}

export function expToNext(level:number):number{
  if(!Number.isInteger(level)||level<1||level>60)throw invalid('Pet level is outside 1-60');
  return level===60?0:25+level*5;
}

export type LevelProgress=Readonly<{level:number;exp:number;levelsGained:number}>;
export function applyExperience(level:number,exp:number,gain:number):LevelProgress{
  if(!Number.isInteger(level)||level<1||level>60)throw invalid('Pet level is outside 1-60');
  if(!Number.isInteger(exp)||exp<0)throw invalid('Pet EXP is invalid');
  if(level===60?exp!==0:exp>=expToNext(level))throw invalid('Pet EXP is outside the current level');
  if(!Number.isInteger(gain)||gain<0)throw invalid('Pet EXP grant is invalid');
  let nextLevel=level,nextExp=exp,remaining=gain;
  while(remaining>0&&nextLevel<60){
    const need=expToNext(nextLevel)-nextExp;
    if(remaining<need){nextExp+=remaining;remaining=0;}
    else{remaining-=need;nextLevel+=1;nextExp=0;}
  }
  if(nextLevel>=60){nextLevel=60;nextExp=0;}
  return {level:nextLevel,exp:nextExp,levelsGained:nextLevel-level};
}

export function evolutionStage(level:number):number{
  if(!Number.isInteger(level)||level<1||level>60)throw invalid('Pet level is outside 1-60');
  return EVOLUTION_THRESHOLDS.filter(threshold=>level>=threshold.level).length;
}

export type ArenaAction='strike'|'guard'|'skill'|'power-skill'|'signature'|'ultimate'|'fire-zone';
const ARENA_ACTIONS:ReadonlySet<string>=new Set(['strike','guard','skill','power-skill','signature','ultimate','fire-zone']);
export function parseActions(values:readonly string[]):ArenaAction[]{
  if(values.length<1||values.length>12)throw invalid('Each action list must contain 1-12 actions');
  return values.map(value=>{
    if(!ARENA_ACTIONS.has(value))throw invalid('Unknown action');
    return value as ArenaAction;
  });
}

export type EncounterProgress=EncounterView&Readonly<{rage:number;skillReady:boolean;complete:boolean;effectiveness:number;fireZoneTurns:number}>;
export type EncounterView=Readonly<{won:boolean;turns:number;remainingHp:number;enemyHp:number}>;
export type ReplayView=Readonly<{mapId:string;won:boolean;regular:EncounterView;boss:EncounterView|null}>;
export type MapEncounter=(typeof MAPS)[number];
export type Encounter=(typeof MAPS)[number]['regular'];

export function mapById(mapId:string):MapEncounter{
  const map=MAPS.find(value=>value.id===mapId);
  if(!map)throw invalid('Unknown map');
  return map;
}

function damage(attack:number,power:number,multiplier:number,defense:number):number{
  if(multiplier===0)return 0;
  const numerator=attack*power*multiplier*100;
  const denominator=1_000_000*(100+defense);
  return Math.max(1,Math.floor(numerator/denominator));
}

export function simulateEncounter(
  stats:Stats,
  element:CoreElement,
  enemy:Encounter,
  actions:readonly ArenaAction[],
  stage=0,
):EncounterView{
  if(actions.length<1||actions.length>12)throw invalid('Each action list must contain 1-12 actions');
  const {won,turns,remainingHp,enemyHp}=encounterProgress(stats,element,enemy,actions,stage);
  return {won,turns,remainingHp,enemyHp};
}

export function encounterProgress(
  stats:Stats,
  element:CoreElement,
  enemy:Encounter,
  actions:readonly ArenaAction[],
  stage:number,
):EncounterProgress{
  let health=stats.hp,enemyHealth=enemy.hp,cooldown=0,turns=0,rage=0,fireZoneTurns=0;
  const effectiveness=EFFECTIVENESS[element][enemy.element];
  for(const action of actions.slice(0,12)){
    turns+=1;
    cooldown=Math.max(0,cooldown-1);
    let power=1000;
    const shield=action==='guard';
    if(shield)power=0;
    else if(action==='skill'&&cooldown===0){power=1800;cooldown=3;rage=0;}
    else if(action==='power-skill'){
      if(stage<1||cooldown!==0)throw invalid('Power skill requires Lv 20 and a ready skill');
      power=2050;cooldown=3;rage=0;
    }
    else if(action==='signature'||action==='ultimate'||action==='fire-zone'){
      const unlock=action==='ultimate'?3:2;
      if(stage<unlock||rage<100||cooldown!==0||(action==='fire-zone'&&element!=='fire')){
        throw invalid('This move requires its evolution stage, full Rage and a ready skill');
      }
      power=action==='ultimate'?2800:action==='fire-zone'?2100:2300;
      cooldown=3;
      rage=0;
    }
    if(power<=1000)rage=Math.min(100,rage+34);
    if(power>0){
      enemyHealth=Math.max(0,enemyHealth-damage(stats.attack,power,effectiveness,enemy.defense));
    }
    if(fireZoneTurns>0){
      enemyHealth=Math.max(0,enemyHealth-damage(stats.attack,350,effectiveness,enemy.defense));
      fireZoneTurns-=1;
    }
    if(action==='fire-zone')fireZoneTurns=2;
    if(enemyHealth===0)break;
    let retaliation=damage(enemy.attack,1000,EFFECTIVENESS[enemy.element][element],stats.defense);
    if(shield)retaliation=Math.ceil(retaliation/2);
    health=Math.max(0,health-retaliation);
    if(health===0)break;
  }
  return {
    won:enemyHealth===0,turns,remainingHp:health,enemyHp:enemyHealth,rage,effectiveness,fireZoneTurns,
    skillReady:cooldown<=1,complete:enemyHealth===0||health===0||turns===12,
  };
}

export function replayMap(
  mapId:string,
  element:CoreElement,
  level:number,
  actions:readonly ArenaAction[],
  bossActions:readonly ArenaAction[],
):ReplayView{
  const map=mapById(mapId);
  const view=evolutionPreview({element,level});
  const regular=simulateEncounter(view.stats,element,map.regular,actions,view.stage);
  const boss=regular.won?simulateEncounter(view.stats,element,map.boss,bossActions,view.stage):null;
  return {mapId:map.id,won:regular.won&&boss?.won===true,regular,boss};
}

export type BannerState=Readonly<{misses:number;guaranteed:boolean;revision:number}>;
export type PullEntropy=Readonly<{sRoll:number;featuredRoll:number;offRateTicket:number}>;
export type PullOutcome=Readonly<{petId:string|null;featured:boolean;pityBefore:number;seq:number}>;

export function sProbabilityPpm(pullNumber:number):number{
  if(!Number.isInteger(pullNumber)||pullNumber<1||pullNumber>80)throw new Error('Invalid pull number');
  return GACHA_ODDS[pullNumber-1].sProbabilityPpm;
}

export function resolvePulls(
  before:BannerState,
  entropy:readonly PullEntropy[],
):{state:BannerState;pulls:PullOutcome[]}{
  if(!(entropy.length===1||entropy.length===10))throw new Error('Pull batch must be 1 or 10');
  if(!Number.isInteger(before.misses)||before.misses<0||before.misses>79)throw new Error('Invalid banner state');
  let misses=before.misses,guaranteed=before.guaranteed,revision=before.revision;
  const pulls:PullOutcome[]=[];
  for(const draw of entropy){
    if(!Number.isInteger(draw.sRoll)||draw.sRoll<0||draw.sRoll>=1_000_000)throw new Error('Invalid pull entropy');
    if(!Number.isInteger(draw.featuredRoll)||draw.featuredRoll<0||draw.featuredRoll>=1_000_000)throw new Error('Invalid pull entropy');
    if(!Number.isInteger(draw.offRateTicket)||draw.offRateTicket<0||draw.offRateTicket>=GACHA_OFF_RATE_POOL.length)throw new Error('Invalid pull entropy');
    revision+=1;
    const chance=sProbabilityPpm(misses+1);
    if(draw.sRoll>=chance){
      pulls.push({petId:null,featured:false,pityBefore:misses,seq:revision});
      misses+=1;continue;
    }
    const featured=guaranteed||draw.featuredRoll<500_000;
    const petId=featured?GACHA_FEATURED_PET_ID:GACHA_OFF_RATE_POOL[draw.offRateTicket];
    pulls.push({petId,featured,pityBefore:misses,seq:revision});
    misses=0;
    guaranteed=!featured;
  }
  return {state:{misses,guaranteed,revision},pulls};
}
