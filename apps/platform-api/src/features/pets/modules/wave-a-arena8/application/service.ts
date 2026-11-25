import {createHash,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {DomainError} from '../../../../../shared/common/errors';
import {MAPS} from '../../wave1/domain/manifest';
import {firstClearReward,replayReward,WAVE1_PETS} from '../../wave1/domain/catalog';
import {PVE_ARTIFACT_REWARDS} from '../../wave-a-artifacts/domain/catalog';

export type AllocateInput=Readonly<{petId:string;mapId:string;encounterId:string}>;
export type ActionInput=Readonly<{
  kind:'start'|'swap'|'guard'|'skill'|'signature'|'fireZone'|'ultimate';
  first?:number;second?:number;
}>;
export type CommandInput=Readonly<{matchId:string;expectedVersion:number;action:ActionInput}>;
type ArtifactRow={definition_id:string;upgrade_level:number};
type OwnedRow={level:number;exp:number};
type SupervisorAllocation={
  account:string;ownedPetId:string;petId:string;level:number;
  encounterId:string;artifacts:readonly {definitionId:string;upgradeLevel:number}[];
};
type MatchProjection=Record<string,unknown>&{
  matchId:string;version:number;terminal:boolean;
  phase:string;encounter:{id:string;boss:boolean};
  stats:{effective:{health:number;attack:number;defense:number}};
  pet:{level:number;id:string};
};
type MatchView=Readonly<{matchId:string;version:number;view:MatchProjection;terminal:boolean}>;
type Settlement={
  matchId:string;won:boolean;firstClear:boolean;artifactId:string|null;
  materials:number;recruitedPetId:string|null;exp:number;coins:number;
  petLevel:number;petExp:number;clearedMaps:readonly string[];requestId:string;
};

const forbidden=(message:string)=>new DomainError('FORBIDDEN',403,message);
const invalid=(message:string)=>new DomainError('INVALID_REQUEST',400,message);
const notFound=(message:string)=>new DomainError('NOT_FOUND',404,message);
const conflict=(message:string)=>new DomainError('REQUEST_CONFLICT',409,message);
const runtime=(message:string)=>new DomainError('WORLD_UNAVAILABLE',503,message);
const fingerprint=(value:string)=>createHash('sha256').update(value).digest('hex');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAP_IDS:ReadonlySet<string>=new Set(MAPS.map(map=>map.id));

export function encounterPairComplete(encounterIds:readonly string[],mapId:string){
  const present=new Set(encounterIds);
  return present.has(mapId+'-regular')&&present.has(mapId+'-boss');
}

function assertUuid(value:string,label:string){
  if(!UUID.test(value))throw invalid(label+' must be a UUID');
}
function levelIncrement(level:number,exp:number){
  let nextLevel=level;let nextExp=exp;
  while(nextLevel<60){
    const threshold=25+nextLevel*5;
    if(nextExp<threshold)break;
    nextExp-=threshold;nextLevel+=1;
  }
  if(nextLevel===60)nextExp=0;
  return {level:nextLevel,exp:nextExp};
}

// Authenticated local Arena8 allocation/settlement coordinator. It is default-off
// and only talks to the loopback supervisor with its private bearer token.
export class Arena8Service {
  constructor(
    private readonly db:Pick<Pool,'query'|'connect'>,
    private readonly supervisorUrl:string,
    private readonly supervisorToken:string,
    private readonly fetchImpl:typeof fetch=fetch,
  ){
    if(!supervisorUrl.startsWith('http://127.0.0.1:')&&!supervisorUrl.startsWith('http://[::1]:'))
      throw new Error('Arena8 supervisor must be loopback HTTP');
    if(supervisorToken.length<32)throw new Error('Arena8 supervisor token is too short');
  }

  async allocate(accountId:string,requestId:string,input:AllocateInput){
    assertUuid(accountId,'account');assertUuid(requestId,'requestId');
    if(!MAP_IDS.has(input.mapId))throw invalid('Unknown map');
    const mapIndex=MAPS.findIndex(map=>map.id===input.mapId);
    const encounterSuffix=input.encounterId===input.mapId+'-regular'?'regular'
      :input.encounterId===input.mapId+'-boss'?'boss':null;
    if(!encounterSuffix)throw invalid('Encounter does not belong to the map');
    const owned=(await this.db.query<OwnedRow>(
      'SELECT level,exp FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2',
      [accountId,input.petId],
    )).rows[0];
    if(!owned)throw forbidden('Pet is not owned');
    const clears=(await this.db.query<{map_id:string}>(
      'SELECT map_id FROM pet_wave_one_map_clears WHERE account_id=$1',
      [accountId],
    )).rows.map(row=>row.map_id);
    if(mapIndex>0){
      const previous=MAPS[mapIndex-1].id;
      const completed=(await this.db.query<{encounter_id:string}>(
        `SELECT encounter_id FROM pet_wave_one_encounters
          WHERE account_id=$1 AND map_id=$2 AND encounter_id IN ($3,$4)`,
        [accountId,previous,previous+'-regular',previous+'-boss'],
      )).rows.map(row=>row.encounter_id);
      // Legacy Wave 1 map clears represent the full regular+boss pair. Arena8
      // itself requires both explicit encounter completions.
      if(!clears.includes(previous)&&!encounterPairComplete(completed,previous))
        throw forbidden('Map is locked');
    }
    const artifacts=(await this.db.query<ArtifactRow>(
      `SELECT owned.definition_id,owned.upgrade_level
         FROM pet_artifact_loadouts loadout
         JOIN pet_artifact_owned owned
           ON owned.account_id=loadout.account_id AND owned.artifact_id=loadout.artifact_id
        WHERE loadout.account_id=$1 AND loadout.pet_id=$2
        ORDER BY loadout.slot`,
      [accountId,input.petId],
    )).rows;
    const allocation:SupervisorAllocation={
      account:accountId,
      ownedPetId:input.petId,
      petId:input.petId,
      level:owned.level,
      encounterId:input.encounterId,
      artifacts:artifacts.map(row=>({definitionId:row.definition_id,upgradeLevel:row.upgrade_level})),
    };
    const response=await this.call<Record<string,unknown>>('/allocate','POST',{
      requestId,allocation,
    });
    return {
      ...response,
      allocation:{petId:input.petId,mapId:input.mapId,encounterId:input.encounterId,
        level:owned.level,artifacts:allocation.artifacts},
    };
  }

  async command(accountId:string,requestId:string,input:CommandInput){
    assertUuid(accountId,'account');assertUuid(requestId,'requestId');
    assertUuid(input.matchId,'matchId');
    await this.assertOwner(accountId,input.matchId);
    const response=await this.call<Record<string,unknown>>('/command','POST',{
      account:accountId,matchId:input.matchId,commandId:requestId,
      expectedVersion:input.expectedVersion,action:input.action,
    });
    return response;
  }

  async view(accountId:string,matchId:string){
    assertUuid(accountId,'account');assertUuid(matchId,'matchId');
    await this.assertOwner(accountId,matchId);
    return this.call<MatchView>('/matches/'+encodeURIComponent(matchId),'GET');
  }

  async settle(accountId:string,requestId:string,matchId:string){
    assertUuid(accountId,'account');assertUuid(requestId,'requestId');assertUuid(matchId,'matchId');
    await this.assertOwner(accountId,matchId);
    const match=await this.call<MatchView>('/matches/'+encodeURIComponent(matchId),'GET');
    const projection=match.view;
    if(!match.terminal&&!projection.terminal)throw conflict('Match is not terminal');
    if(projection.phase!=='won'&&projection.phase!=='lost')throw runtime('Match terminal phase is invalid');
    const mapId=projection.encounter.id.endsWith('-regular')||projection.encounter.id.endsWith('-boss')
      ?projection.encounter.id.slice(0,projection.encounter.id.lastIndexOf('-')):'';
    const mapIndex=MAPS.findIndex(map=>map.id===mapId);
    if(!mapId||mapIndex<0)throw runtime('Match map is unknown');
    const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const player=(await client.query<{coins:number}>(
        'SELECT coins FROM pet_wave_one_players WHERE account_id=$1 FOR UPDATE',[accountId],
      )).rows[0];
      if(!player)throw forbidden('Arena8 player state is missing');
      const existing=(await client.query<{response:Settlement}>(
        'SELECT response FROM pet_wave_one_requests WHERE account_id=$1 AND request_id=$2',
        [accountId,matchId],
      )).rows[0];
      if(existing){await client.query('COMMIT');return existing.response;}
      const owned=(await client.query<OwnedRow>(
        'SELECT level,exp FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2 FOR UPDATE',
        [accountId,projection.pet.id],
      )).rows[0];
      if(!owned)throw forbidden('Pet is no longer owned');
      const encounterId=projection.encounter.id;
      const encounterCompleted=(await client.query(
        'SELECT 1 FROM pet_wave_one_encounters WHERE account_id=$1 AND map_id=$2 AND encounter_id=$3',
        [accountId,mapId,encounterId],
      )).rowCount===1;
      const won=projection.phase==='won';
      const firstClear=won&&!encounterCompleted;
      let exp=0;let coins=0;let recruitedPetId:string|null=null;
      let artifactId:string|null=null;let materials=0;
      let petLevel=owned.level;let petExp=owned.exp;
      if(won){
        const reward=firstClear?firstClearReward(mapIndex):replayReward(mapIndex);
        exp=reward.exp;coins=reward.coins;
        ({level:petLevel,exp:petExp}=levelIncrement(owned.level,owned.exp+exp));
        await client.query(
          'UPDATE pet_wave_one_players SET coins=coins+$2,revision=revision+1,updated_at=clock_timestamp() WHERE account_id=$1',
          [accountId,coins],
        );
        await client.query(
          'UPDATE pet_wave_one_owned SET level=$3,exp=$4 WHERE account_id=$1 AND pet_id=$2',
          [accountId,projection.pet.id,petLevel,petExp],
        );
        if(firstClear){
          await client.query(
            `INSERT INTO pet_wave_one_encounters(account_id,map_id,encounter_id)
             VALUES($1,$2,$3) ON CONFLICT(account_id,map_id,encounter_id) DO NOTHING`,
            [accountId,mapId,encounterId],
          );
          // A map clears only after both authored encounters are present,
          // independent of order. A boss-only victory must not unlock the next
          // map. Legacy Wave 1 clears remain a separate compatibility signal.
          const completed=await client.query<{encounter_id:string}>(
            `SELECT encounter_id FROM pet_wave_one_encounters
              WHERE account_id=$1 AND map_id=$2 AND encounter_id IN ($3,$4)`,
            [accountId,mapId,mapId+'-regular',mapId+'-boss'],
          );
          if(encounterPairComplete(completed.rows.map(row=>row.encounter_id),mapId)){
            await client.query(
              'INSERT INTO pet_wave_one_map_clears(account_id,map_id) VALUES($1,$2) ON CONFLICT(account_id,map_id) DO NOTHING',
              [accountId,mapId],
            );
          }
          const ownedIds=new Set((await client.query<{pet_id:string}>(
            'SELECT pet_id FROM pet_wave_one_owned WHERE account_id=$1',[accountId],
          )).rows.map(row=>row.pet_id));
          const candidates=WAVE1_PETS.filter(pet=>pet.mapId===mapId&&pet.category!=='limited_event_gacha');
          const recruit=candidates.find(pet=>pet.category==='map_regular'&&!ownedIds.has(pet.id))
            ??candidates.find(pet=>pet.category==='map_legendary'&&!ownedIds.has(pet.id));
          if(recruit){
            const inserted=await client.query(
              `INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source)
               VALUES($1,$2,1,0,'campaign') ON CONFLICT(account_id,pet_id) DO NOTHING`,
              [accountId,recruit.id],
            );
            if(inserted.rowCount===1)recruitedPetId=recruit.id;
          }
        }
        const artifactReward=PVE_ARTIFACT_REWARDS.find(value=>value.mapId===mapId);
        if(artifactReward){
          materials=firstClear?artifactReward.materials:5;
          await client.query(
            `INSERT INTO pet_artifact_players(account_id,materials)
             VALUES($1,0) ON CONFLICT(account_id) DO NOTHING`,[accountId],
          );
          await client.query(
            'UPDATE pet_artifact_players SET materials=materials+$2,revision=revision+1,updated_at=clock_timestamp() WHERE account_id=$1',
            [accountId,materials],
          );
          const claimed=(await client.query(
            'SELECT 1 FROM pet_artifact_pve_claims WHERE account_id=$1 AND map_id=$2',
            [accountId,mapId],
          )).rowCount===1;
          if(firstClear&&!claimed){
            artifactId=randomUUID();
            await client.query(
              `INSERT INTO pet_artifact_owned(account_id,artifact_id,definition_id,upgrade_level,acquired_from,acquired_map_id)
               VALUES($1,$2,$3,1,'pve',$4)`,
              [accountId,artifactId,artifactReward.definitionId,mapId],
            );
            await client.query(
              `INSERT INTO pet_artifact_pve_claims(account_id,map_id,artifact_id,materials)
               VALUES($1,$2,$3,$4)`,
              [accountId,mapId,artifactId,artifactReward.materials],
            );
          }
        }
      }
      const clearedMaps=(await client.query<{map_id:string}>(
        'SELECT map_id FROM pet_wave_one_map_clears WHERE account_id=$1 ORDER BY cleared_at',[accountId],
      )).rows.map(row=>row.map_id);
      const settlement:Settlement={
        matchId,won,firstClear,artifactId,materials,recruitedPetId,exp,coins,
        petLevel,petExp,clearedMaps,requestId,
      };
      await client.query(
        `INSERT INTO pet_wave_one_requests(account_id,request_id,fingerprint,response)
         VALUES($1,$2,$3,$4)`,
        [accountId,matchId,fingerprint('arena8-settle:'+matchId),settlement],
      );
      await client.query('COMMIT');
      return settlement;
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }

  private async assertOwner(accountId:string,matchId:string){
    const owner=await this.call<{account:string}>(
      '/matches/'+encodeURIComponent(matchId)+'/owner','GET',
    );
    if(owner.account!==accountId)throw forbidden('Match belongs to another account');
  }

  private async call<T>(path:string,method:'GET'|'POST',body?:unknown):Promise<T>{
    let response:Response;
    try{
      response=await this.fetchImpl(this.supervisorUrl+path,{
        method,
        headers:{
          'content-type':'application/json',
          'x-arena8-token':this.supervisorToken,
        },
        body:body===undefined?undefined:JSON.stringify(body),
        signal:AbortSignal.timeout(5_000),
      });
    }catch{throw runtime('Arena8 runtime is unavailable');}
    if(!response.ok){
      if(response.status===404)throw notFound('Arena8 match not found');
      if(response.status===401||response.status===403)throw forbidden('Arena8 runtime denied the request');
      if(response.status===409)throw conflict('Arena8 command conflict');
      throw runtime('Arena8 runtime rejected the request');
    }
    try{return await response.json() as T;}catch{throw runtime('Arena8 runtime returned invalid JSON');}
  }
}
