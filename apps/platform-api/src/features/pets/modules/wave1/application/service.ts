import {createHash,randomInt} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DomainError} from '../../../../../shared/common/errors';
import {
  applyExperience,
  evolutionStage,
  encounterProgress,
  expToNext,
  GACHA_COST,
  GACHA_FEATURED_PET_ID,
  GACHA_DUPLICATE_EXP,
  GACHA_MISS_EXP,
  GACHA_OFF_RATE_POOL,
  firstClearReward,
  mapById,
  parseActions,
  replayMap,
  replayReward,
  resolvePulls,
  STARTER_PET_IDS,
  WAVE1_PET_BY_ID,
  WAVE1_PETS,
  WAVE1_PET_INDEX,
  type ArenaAction,
  type BannerState,
  type PullEntropy,
  type Wave1PetRank,
} from '../domain/catalog';
import {evolutionPreview, MAPS, type CoreElement, type Stats} from '../domain/manifest';
import {Wave1Store, type Wave1Transaction} from '../infrastructure/store';

import {WAVE_A_ACTIVE_PETS,WAVE_A_ROSTER,type WaveAPet} from '../domain/wave-a-catalog';

// Current production catalog annotations are outside the immutable combat bundle.
const starterIds:ReadonlySet<string>=new Set(STARTER_PET_IDS);
const referenceForPet=(pet:WaveAPet)=>({
 id:pet.id,catalogRank:pet.catalogRank,starter:starterIds.has(pet.id),
 sourceCategory:pet.sourceCategory,acquisitionAuthority:pet.acquisitionAuthority,
 gameplayReady:pet.runtime.gameplayReady,modelStatus:pet.runtime.modelStatus,
});
export const canonicalCatalogReference=WAVE_A_ACTIVE_PETS.map(referenceForPet);
export const developmentCatalogReference=WAVE_A_ROSTER.map(referenceForPet);

export type Wave1Entropy={int(maxExclusive:number):number};
export type PartyInput={petIds:string[]};
export type CampaignInput={mapId:string;petId:string;actions:string[];bossActions?:string[]};
export type GachaInput={count:1|10};

export type Wave1PetView=Readonly<{
  petId:string;name:string;element:CoreElement;rank:Wave1PetRank;
  level:number;exp:number;expToNext:number;stage:number;unlocks:string[];
  stats:Stats;duplicateExp:number;ownedPetInstanceId:string;
}>;
export type Wave1GachaHistoryView=Readonly<{
  seq:number;petId:string|null;featured:boolean;duplicate:boolean;pityBefore:number;createdAt:string;
}>;
export type Wave1StateView=Readonly<{
  revision:number;
  wallet:Readonly<{coins:number}>;
  party:string[];
  pets:Wave1PetView[];
  campaign:Readonly<{clearedMaps:string[];nextMapId:string|null}>;
  gacha:Readonly<{misses:number;guaranteed:boolean;revision:number;history:Wave1GachaHistoryView[]}>;
}>;
export type Wave1PullView=Readonly<{petId:string;featured:boolean;duplicate:boolean;pityBefore:number}>;
export type Wave1CampaignResult=Readonly<{
  mapId:string;won:boolean;firstClear:boolean;
  regular:Readonly<{won:boolean;turns:number;remainingHp:number;enemyHp:number}>;
  boss:Readonly<{won:boolean;turns:number;remainingHp:number;enemyHp:number}>|null;
  rewards:Readonly<{exp:number;coins:number;levelsGained:number;stage:number}>;
}>;

const defaultEntropy:Wave1Entropy={int:maxExclusive=>randomInt(maxExclusive)};
const invalid=(message:string)=>new DomainError('INVALID_REQUEST',400,message);
const fingerprint=(route:string,body:unknown)=>createHash('sha256').update(route+'\n'+JSON.stringify(body)).digest('hex');

export class Wave1Service {
  constructor(private store:Wave1Store,private entropy:Wave1Entropy=defaultEntropy){}

  readState(accountId:string):Promise<Wave1StateView>{
    return this.store.transact(accountId,async tx=>this.state(tx));
  }

  async setParty(accountId:string,requestId:string,input:PartyInput){
    const petIds=input.petIds;
    const requestFingerprint=fingerprint('party',{petIds});
    return this.store.transact(accountId,async tx=>{
      const replayed=await this.replayed<{revision:number;party:string[]}>(tx,requestId,requestFingerprint);
      if(replayed)return replayed;
      if(petIds.length<1||petIds.length>4)throw invalid('Party requires 1-4 Pets');
      if(new Set(petIds).size!==petIds.length)throw invalid('Party Pets must be unique');
      const owned=new Set((await tx.owned()).map(row=>row.petId));
      for(const petId of petIds)if(!owned.has(petId))throw invalid('Party Pet is not owned');
      await tx.replaceParty(petIds);
      const bumped=await tx.bumpRevision();
      const response={revision:bumped,party:[...petIds]};
      await tx.saveReceipt(requestId,requestFingerprint,response);
      return response;
    });
  }

  async previewCampaign(accountId:string,input:CampaignInput){
    const map=mapById(input.mapId);
    const actions=input.actions.length?parseActions(input.actions):[];
    const bossActions=input.bossActions?.length?parseActions(input.bossActions):[];
    this.authorizeFireZone(input.petId,actions,bossActions);
    return this.store.transact(accountId,async tx=>{
      const {pet,catalog}=await this.combatPet(tx,input.petId,map.id);
      const {stats,stage}=evolutionPreview({element:catalog.element,level:pet.level});
      const regular=encounterProgress(stats,catalog.element,map.regular,actions,stage);
      if(input.bossActions&&!regular.won)throw invalid('Win the regular encounter to enter the boss fight');
      return input.bossActions?encounterProgress(stats,catalog.element,map.boss,bossActions,stage):regular;
    });
  }

  async playCampaign(accountId:string,requestId:string,input:CampaignInput){
    const map=mapById(input.mapId);
    const actions=parseActions(input.actions);
    const bossActions=parseActions(input.bossActions??input.actions);
    this.authorizeFireZone(input.petId,actions,bossActions);
    const requestFingerprint=fingerprint('campaign/play',{mapId:input.mapId,petId:input.petId,actions,bossActions});
    return this.store.transact(accountId,async tx=>{
      const replayed=await this.replayed<{revision:number;result:Wave1CampaignResult;state:Wave1StateView;acquiredPetId:string|null}>(tx,requestId,requestFingerprint);
      if(replayed)return replayed;
      const {pet,catalog,owned,cleared,mapIndex}=await this.combatPet(tx,input.petId,map.id);
      const replay=replayMap(map.id,catalog.element,pet.level,actions,bossActions);
      const alreadyCleared=cleared.has(map.id);
      let exp=0,coins=0,levelsGained=0,petLevel=pet.level;
      let acquiredPetId:string|null=null;
      if(replay.won){
        const reward=alreadyCleared?replayReward(mapIndex):firstClearReward(mapIndex);
        exp=reward.exp;coins=reward.coins;
        if(alreadyCleared)await tx.incrementReplay(map.id);
        else await tx.insertClear(map.id);
        const progress=applyExperience(pet.level,pet.exp,exp);
        petLevel=progress.level;levelsGained=progress.levelsGained;
        await tx.setProgress(pet.petId,progress.level,progress.exp,0);
        await tx.credit(coins);
        const mapPets=WAVE1_PETS.filter(candidate=>candidate.mapId===map.id);
        const ownedIds=new Set(owned.map(row=>row.petId));
        const recruit=mapPets.find(candidate=>candidate.category==='map_regular'&&!ownedIds.has(candidate.id))
          ??mapPets.find(candidate=>candidate.category==='map_legendary'&&!ownedIds.has(candidate.id));
        if(recruit){
          await tx.insertOwned(recruit.id,'campaign');
          acquiredPetId=recruit.id;
        }
      }
      const revision=await tx.bumpRevision();
      const state=await this.state(tx);
      const result:Wave1CampaignResult={
        mapId:map.id,won:replay.won,firstClear:replay.won&&!alreadyCleared,
        regular:replay.regular,boss:replay.boss,
        rewards:{exp,coins,levelsGained,stage:evolutionStage(petLevel)},
      };
      const response={revision,result,state,acquiredPetId};
      await tx.saveReceipt(requestId,requestFingerprint,response);
      return response;
    });
  }

  async pullGacha(accountId:string,requestId:string,input:GachaInput){
    const count=input.count,cost=count*GACHA_COST;
    const requestFingerprint=fingerprint('gacha/pull',{count});
    return this.store.transact(accountId,async tx=>{
      const replayed=await this.replayed<{revision:number;pulls:Wave1PullView[];cost:number;state:Wave1StateView}>(tx,requestId,requestFingerprint);
      if(replayed)return replayed;
      const player=await tx.player();
      if(player.coins<cost)throw new DomainError('INSUFFICIENT_FUNDS',409,'Not enough coins');
      const before:BannerState={misses:player.gachaMisses,guaranteed:player.gachaGuaranteed,revision:player.gachaRevision};
      const entropy:PullEntropy[]=Array.from({length:count},()=>({
        sRoll:this.entropy.int(1_000_000),
        featuredRoll:this.entropy.int(1_000_000),
        offRateTicket:this.entropy.int(GACHA_OFF_RATE_POOL.length),
      }));
      const resolved=resolvePulls(before,entropy);
      const ownedRows=await tx.owned();
      const progress=new Map(ownedRows.map(row=>[row.petId,{level:row.level,exp:row.exp}]));
      const party=await tx.party();
      const pulls:Wave1PullView[]=[];
      for(const grant of resolved.pulls){
        if(grant.petId===null){
          await tx.insertGachaHistory({...grant,duplicate:false});
          continue;
        }
        const current=progress.get(grant.petId);
        const duplicate=current!==undefined;
        if(current){
          const next=applyExperience(current.level,current.exp,GACHA_DUPLICATE_EXP);
          progress.set(grant.petId,{level:next.level,exp:next.exp});
          await tx.setProgress(grant.petId,next.level,next.exp,GACHA_DUPLICATE_EXP);
        }else{
          await tx.insertOwned(grant.petId,'gacha');
          progress.set(grant.petId,{level:1,exp:0});
        }
        await tx.insertGachaHistory({seq:grant.seq,petId:grant.petId,featured:grant.featured,duplicate,pityBefore:grant.pityBefore});
        pulls.push({petId:grant.petId,featured:grant.featured,duplicate,pityBefore:grant.pityBefore});
      }
      const misses=count-pulls.length;
      const lead=party[0];
      if(misses>0&&lead){
        const current=progress.get(lead);
        if(current){
          const next=applyExperience(current.level,current.exp,GACHA_MISS_EXP*misses);
          progress.set(lead,{level:next.level,exp:next.exp});
          await tx.setProgress(lead,next.level,next.exp,0);
        }
      }
      await tx.debit(cost);
      await tx.setBanner(resolved.state.misses,resolved.state.guaranteed,resolved.state.revision);
      const revision=await tx.bumpRevision();
      const state=await this.state(tx);
      const response={revision,pulls,cost,state};
      await tx.saveReceipt(requestId,requestFingerprint,response);
      return response;
    });
  }

  exportAccount(db:Pick<PoolClient,'query'>,accountId:string){
    return this.store.exportAccount(db,accountId);
  }

  private authorizeFireZone(petId:string,...transcripts:readonly ArenaAction[][]){
    if(petId!==GACHA_FEATURED_PET_ID&&transcripts.some(actions=>actions.includes('fire-zone'))){
      throw invalid('FIRE_ZONE is exclusive to Icarus');
    }
  }

  private async combatPet(tx:Wave1Transaction,petId:string,mapId:string){
    const owned=await tx.owned();
    const pet=owned.find(row=>row.petId===petId);
    if(!pet||!(await tx.party()).includes(petId))throw invalid('Choose a Pet in your party');
    const catalog=WAVE1_PET_BY_ID.get(petId);
    if(!catalog)throw new Error('Owned Pet is absent from the Wave 1 catalog');
    const cleared=new Set((await tx.clears()).map(row=>row.mapId));
    const mapIndex=MAPS.findIndex(value=>value.id===mapId);
    if(mapIndex>0&&!cleared.has(MAPS[mapIndex-1].id))throw invalid('Map is locked');
    return {pet,catalog,owned,cleared,mapIndex};
  }

  private async replayed<T>(tx:Wave1Transaction,requestId:string,requestFingerprint:string):Promise<T|undefined>{
    const receipt=await tx.receipt(requestId);
    if(!receipt)return undefined;
    if(receipt.fingerprint!==requestFingerprint)throw new DomainError('REQUEST_CONFLICT',409,'Request id was used with different input');
    return receipt.response as T;
  }

  private async state(tx:Wave1Transaction):Promise<Wave1StateView>{
    const player=await tx.player();
    const owned=await tx.owned();
    const party=await tx.party();
    const clears=await tx.clears();
    const history=await tx.gachaHistory();
    const pets=owned.map(row=>{
      const catalog=WAVE1_PET_BY_ID.get(row.petId);
      if(!catalog)throw new Error('Owned Pet is absent from the Wave 1 catalog');
      const view=evolutionPreviewFor(catalog.element,row.level);
      return {
        petId:row.petId,name:catalog.name,element:catalog.element,rank:catalog.rank,
        level:row.level,exp:row.exp,expToNext:expToNext(row.level),stage:view.stage,
        unlocks:view.unlocks,stats:view.stats,duplicateExp:row.duplicateExp,ownedPetInstanceId:row.ownedPetInstanceId,
      };
    }).sort((left,right)=>(WAVE1_PET_INDEX.get(left.petId)??0)-(WAVE1_PET_INDEX.get(right.petId)??0));
    const cleared=new Set(clears.map(row=>row.mapId));
    return {
      revision:player.revision,
      wallet:{coins:player.coins},
      party,
      pets,
      campaign:{
        clearedMaps:MAPS.filter(map=>cleared.has(map.id)).map(map=>map.id),
        nextMapId:MAPS.find(map=>!cleared.has(map.id))?.id??null,
      },
      gacha:{
        misses:player.gachaMisses,guaranteed:player.gachaGuaranteed,revision:player.gachaRevision,
        history:history.map(row=>({seq:row.seq,petId:row.petId,featured:row.featured,duplicate:row.duplicate,pityBefore:row.pityBefore,createdAt:row.createdAt.toISOString()})),
      },
    };
  }
}

function evolutionPreviewFor(element:CoreElement,level:number){
  return evolutionPreview({element,level});
}
