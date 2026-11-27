import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {canonicalProposalHash} from '../../../../coop/modules/settlement/application/service';
import {DomainError} from '../../../../../shared/common/errors';
import {MAPS} from '../../wave1/domain/manifest';
import {firstClearReward,replayReward,WAVE1_PETS} from '../../wave1/domain/catalog';
import {initializeArtifactInventory} from '../../wave-a-artifacts/infrastructure/store';
import {PVE_ARTIFACT_REWARDS} from '../../wave-a-artifacts/domain/catalog';
import {levelIncrement} from '../../wave1/domain/progression';
import {recordArena8MapClear} from '../../wave1/infrastructure/store';
import {
  assertUuid,conflict,encounterPairComplete,forbidden,
  readOwnedArena8Allocation,type AllocateInput,
} from './allocation';

export type {AllocateInput};
export {encounterPairComplete};
export type ActionInput=Readonly<{
  kind:'start'|'swap'|'guard'|'skill'|'signature'|'fireZone'|'ultimate';
  first?:number;second?:number;
}>;
export type CommandInput=Readonly<{matchId:string;expectedVersion:number;action:ActionInput}>;
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

const notFound=(message:string)=>new DomainError('NOT_FOUND',404,message);
const runtime=(message:string)=>new DomainError('WORLD_UNAVAILABLE',503,message);
const fingerprint=(value:string)=>createHash('sha256').update(value).digest('hex');
const hex=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const counter=z.int().nonnegative();
const soloProposal=z.strictObject({
 configDigest:hex,contentHash:hex,kind:z.literal('solo.completed.v1'),outcome:z.enum(['won','lost']),
 participants:z.tuple([z.strictObject({account:z.uuid(),petId:id,alive:z.boolean(),damage:counter,healing:counter,shielding:counter})]),
 round:counter.max(65535),ruleset:z.literal('arena8-functional-pve'),rulesetVersion:z.literal(1),turn:counter.max(65535),
});
const payout=z.strictObject({achievementPoints:counter.max(1_000_000),coins:counter.max(1_000_000),exp:counter.max(1_000_000),materials:counter.max(1_000_000)});
const policy=z.strictObject({
 minimumActions:z.strictObject({victory:counter.max(4096),defeat:counter.max(4096)}).nullish(),
 recruitmentPetIds:z.array(id).nonempty().nullish(),
 firstClear:payout,repeatClear:payout,defeat:payout,
});
type FunctionalSettlement={
 ownedPetInstanceId:string;settlementId:string;stateVersion:string;qualified:boolean;rewards:z.infer<typeof policy>;
};

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
    const owned=await readOwnedArena8Allocation(this.db,accountId,input);
    const allocation:SupervisorAllocation={
      account:accountId,
      ownedPetId:input.petId,
      petId:input.petId,
      level:owned.level,
      encounterId:input.encounterId,
      artifacts:owned.artifacts.map(artifact=>({
        definitionId:artifact.definitionId,upgradeLevel:artifact.upgradeLevel,
      })),
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

  async settle(accountId:string,requestId:string,matchId:string,supplied?:MatchView,functional?:FunctionalSettlement){
    assertUuid(accountId,'account');assertUuid(requestId,'requestId');assertUuid(matchId,'matchId');
    let match:MatchView;
    if(supplied)match=supplied;
    else{
      await this.assertOwner(accountId,matchId);
      match=await this.call<MatchView>('/matches/'+encodeURIComponent(matchId),'GET');
    }
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
        'SELECT level,exp FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2 AND ($3::uuid IS NULL OR owned_pet_instance_id=$3) FOR UPDATE',
        [accountId,projection.pet.id,functional?.ownedPetInstanceId??null],
      )).rows[0];
      if(!owned)throw forbidden('Pet is no longer owned');
      const encounterId=projection.encounter.id;
      const encounterCompleted=(await client.query(
        'SELECT 1 FROM pet_wave_one_encounters WHERE account_id=$1 AND map_id=$2 AND encounter_id=$3',
        [accountId,mapId,encounterId],
      )).rowCount===1;
      const won=projection.phase==='won';
      const qualified=functional?.qualified??true;
      const firstClear=won&&qualified&&!encounterCompleted;
      let exp=0;let coins=0;let recruitedPetId:string|null=null;
      let artifactId:string|null=null;let materials=0;
      let petLevel=owned.level;let petExp=owned.exp;
      if(functional){
        const {rewards,settlementId,stateVersion}=functional;
        const awarded=won?(firstClear?rewards.firstClear:rewards.repeatClear):rewards.defeat;
        if(qualified){
          exp=awarded.exp;coins=awarded.coins;materials=awarded.materials;
          ({level:petLevel,exp:petExp}=levelIncrement(owned.level,owned.exp+exp));
          if(coins>0)await client.query('UPDATE pet_wave_one_players SET coins=coins+$2,revision=revision+1,updated_at=clock_timestamp() WHERE account_id=$1',[accountId,coins]);
          if(exp>0)await client.query('UPDATE pet_wave_one_owned SET level=$3,exp=$4 WHERE account_id=$1 AND pet_id=$2 AND owned_pet_instance_id=$5',[accountId,projection.pet.id,petLevel,petExp,functional.ownedPetInstanceId]);
          if(materials>0){
            await initializeArtifactInventory(client,accountId);
            await client.query('UPDATE pet_artifact_players SET materials=materials+$2,revision=revision+1,updated_at=clock_timestamp() WHERE account_id=$1',[accountId,materials]);
          }
        }
        if(firstClear){
          await client.query(`INSERT INTO pet_wave_one_encounters(account_id,map_id,encounter_id,coop_recruitment_pet_ids)
            VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[accountId,mapId,encounterId,rewards.recruitmentPetIds??null]);
          recruitedPetId=await recordArena8MapClear(client,accountId,mapId);
        }
        const outbox=await client.query(`UPDATE game_native_outbox SET delivered_at=clock_timestamp(),delivery_outcome='granted'
          WHERE match_id=$1 AND settlement_id=$2 AND effect_type='game.settlement.v1' AND delivered_at IS NULL`,[matchId,settlementId]);
        const finalized=await client.query(`UPDATE game_native_matches SET status='FINISHED',updated_at=clock_timestamp()
          WHERE id=$1 AND status='SETTLING' AND state_version=$2`,[matchId,stateVersion]);
        const released=await client.query(`UPDATE platform_native_arena8_matches SET status='CLOSED',updated_at=clock_timestamp()
          WHERE match_id=$1 AND account_id=$2 AND functional_config_version IS NOT NULL AND status='ACTIVE'`,[matchId,accountId]);
        if(outbox.rowCount!==1||finalized.rowCount!==1||released.rowCount!==1)throw conflict('Functional solo settlement changed');
      }else if(won){
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
          // Preserve the solo encounter grant before applying any pinned
          // cooperative map grant, matching regular-first progression.
          recruitedPetId=(await recordArena8MapClear(client,accountId,mapId))??recruitedPetId;
        }
        const artifactReward=PVE_ARTIFACT_REWARDS.find(value=>value.mapId===mapId);
        if(artifactReward){
          materials=firstClear?artifactReward.materials:5;
          await initializeArtifactInventory(client,accountId);
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

  // Native terminal settlement reads the canonical outbox proposal, never a
  // client-submitted outcome. It then reuses the same durable campaign
  // transaction as the isolated HTTP bridge.
  async settleNative(accountId:string,requestId:string,matchId:string){
    assertUuid(accountId,'account');assertUuid(requestId,'requestId');assertUuid(matchId,'matchId');
    const row=(await this.db.query<{
      account_id:string;pet_id:string;encounter_id:string;map_id:string;
      proposal:Record<string,unknown>;content_hash:string;functional_config_digest:string|null;
      functional_allocation:{bossId:string;seat:{ownedPetInstanceId:string}}|null;
      proposal_hash:Buffer;settlement_id:string;state_version:string;
      ruleset_id:string|null;ruleset_version:number|null;runtime_content_hash:string|null;status:string|null;
      bundle:Record<string,unknown>|null;
    }>(
      `SELECT m.account_id,m.pet_id,m.encounter_id,m.map_id,m.content_hash,m.functional_config_digest,m.functional_allocation,
          s.proposal,s.proposal_hash,s.settlement_id,s.state_version,n.ruleset_id,n.ruleset_version,n.status,
          encode(n.content_hash,'hex') AS runtime_content_hash,v.bundle
         FROM platform_native_arena8_matches m
         JOIN game_native_settlements s ON s.match_id=m.match_id
         LEFT JOIN game_native_matches n ON n.id=s.match_id AND n.state_version=s.state_version AND n.epoch=s.epoch
         LEFT JOIN gameplay_config_versions v ON v.ruleset=m.functional_config_ruleset AND v.version=m.functional_config_version
          AND v.content_digest=m.functional_config_digest AND v.engine_capability='arena8-coop-v2' AND v.published_at IS NOT NULL
        WHERE m.match_id=$1`,
      [matchId],
    )).rows[0];
    if(!row)throw conflict('Native match is not terminal');
    if(row.account_id!==accountId)throw forbidden('Match belongs to another account');
    const proposal=row.proposal;
    let functional:FunctionalSettlement|undefined;
    if(row.functional_config_digest){
      const parsed=soloProposal.safeParse(proposal);
      const pin=row.functional_allocation;
      if(!parsed.success||!pin||!row.bundle||
        row.ruleset_id!=='arena8-functional-pve'||row.ruleset_version!==1||
        (row.status!=='SETTLING'&&row.status!=='FINISHED')||
        parsed.data.contentHash!==row.content_hash||row.runtime_content_hash!==row.content_hash||
        parsed.data.configDigest!==row.functional_config_digest||
        parsed.data.participants[0].account!==accountId||parsed.data.participants[0].petId!==row.pet_id||
        row.proposal_hash.length!==32||!timingSafeEqual(row.proposal_hash,canonicalProposalHash(proposal)))
        throw runtime('Functional solo completion does not match the allocated match');
      const bosses=Array.isArray(row.bundle.bosses)?row.bundle.bosses:[];
      const rewards=policy.safeParse(bosses.find(candidate=>candidate?.id===pin.bossId&&candidate?.mapId===row.map_id)?.rewardPolicy);
      if(!rewards.success)throw runtime('Functional solo reward policy is unavailable');
      const minimum=rewards.data.minimumActions?.[parsed.data.outcome==='won'?'victory':'defeat']??0;
      const receipts=minimum===0?undefined:await this.db.query(
        'SELECT 1 FROM game_native_receipts WHERE match_id=$1 AND actor_id=$2 AND committed_version>1 AND committed_version<=$3 LIMIT $4',
        [matchId,accountId,row.state_version,minimum],
      );
      functional={ownedPetInstanceId:pin.seat.ownedPetInstanceId,settlementId:row.settlement_id,
        stateVersion:row.state_version,qualified:minimum===0||receipts?.rowCount===minimum,rewards:rewards.data};
    }else if(proposal?.ruleset!=='arena8-pve'||(proposal.outcome!=='won'&&proposal.outcome!=='lost')){
      throw runtime('Native completion proposal is invalid');
    }
    const encounterId=row.encounter_id;
    const projection={
      matchId,version:0,terminal:true,phase:proposal.outcome,
      encounter:{id:encounterId,boss:encounterId.endsWith('-boss')},
      pet:{id:row.pet_id,level:0},
      stats:{effective:{health:0,attack:0,defense:0}},
    } as unknown as MatchProjection;
    return this.settle(accountId,requestId,matchId,{matchId,version:0,view:projection,terminal:true},functional);
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
