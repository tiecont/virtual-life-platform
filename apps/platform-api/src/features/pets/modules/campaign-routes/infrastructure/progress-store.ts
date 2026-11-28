import type {PoolClient} from 'pg';
import {DomainError} from '../../../../../shared/common/errors';
import type {PublishedCampaignRoute} from '../domain/published-route';

type Queryable=Pick<PoolClient,'query'>;
export type RouteSettlementPin=Readonly<{
  route:PublishedCampaignRoute;
  configVersion:number;
  configDigest:string;
  settlementId:string;
  matchId:string;
}>;

export async function hasCampaignRouteClear(tx:Queryable,accountId:string,routeId:string){
  const {rowCount}=await tx.query(
    'SELECT 1 FROM pet_arena_campaign_route_clears WHERE account_id=$1 AND route_id=$2',[accountId,routeId]);
  return rowCount===1;
}

export async function assertCampaignPrerequisite(tx:Queryable,accountId:string,route:PublishedCampaignRoute){
  if(route.prerequisiteEncounterId&&!await hasCampaignRouteClear(tx,accountId,route.prerequisiteEncounterId))
    throw new DomainError('FORBIDDEN',403,'Clear the required campaign encounter first');
}

// The settlement caller owns the account/Pet locks, payout and journal commit.
// Recruits are granted by the first qualifying clear in that same transaction.
export async function recordCampaignRouteClear(
  tx:Queryable,accountId:string,pin:RouteSettlementPin,recruitmentPetIds:readonly string[]|null|undefined,
){
  const {route,configVersion,configDigest,settlementId,matchId}=pin;
  const recruit=recruitmentPetIds?.[0];
  if(recruitmentPetIds!=null&&(recruitmentPetIds.length!==1||recruit!==route.opponentPetId))
    throw new Error('Route reward may recruit only the configured opponent');
  const clear=await tx.query('INSERT INTO pet_arena_campaign_route_clears '+
    '(account_id,route_id,config_version,config_digest,match_id,settlement_id) VALUES($1,$2,$3,$4,$5,$6) '+
    'ON CONFLICT(account_id,route_id) DO NOTHING RETURNING route_id',
    [accountId,route.id,configVersion,configDigest,matchId,settlementId]);
  if(clear.rowCount!==1)return {firstClear:false,recruitedPetId:null};
  if(!recruit)return {firstClear:true,recruitedPetId:null};
  const granted=await tx.query<{pet_id:string}>(
    "INSERT INTO pet_wave_one_owned(account_id,pet_id,owned_pet_instance_id,level,exp,source) VALUES("+
    "$1::uuid,$2::text,aetheria_pet_instance_id($1::uuid::text || ':' || $2::text || ':v1'),1,0,'campaign') "+
    'ON CONFLICT(account_id,pet_id) DO NOTHING RETURNING pet_id',[accountId,recruit]);
  return {firstClear:true,recruitedPetId:granted.rows[0]?.pet_id??null};
}
