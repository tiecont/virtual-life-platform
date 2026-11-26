import type {PoolClient} from 'pg';
import type {CoopSkillLevelBinding} from '@aetheria/contracts';

type Queryable=Pick<PoolClient,'query'>;

export class CoopSkillStore {
 async active(tx:Queryable,lock=false){
  const result=await tx.query<{version:string;digest:string;bundle:Record<string,unknown>}>(
   `SELECT v.version,v.content_digest AS digest,v.bundle
    FROM gameplay_config_active a JOIN gameplay_config_versions v USING(ruleset,version)
    WHERE a.ruleset='arena8-coop-pve' AND v.state='PUBLISHED' AND v.published_at IS NOT NULL
    ${lock?'FOR SHARE OF a':''}`);
  const row=result.rows[0];
  return row?{...row,version:Number(row.version)}:undefined;
 }

 async pet(tx:Queryable,accountId:string,ownedPetInstanceId:string,lock=false){
  const result=await tx.query<{pet_id:string}>(
   `SELECT p.pet_id FROM pet_wave_one_owned p JOIN identity_accounts a ON a.id=p.account_id
    WHERE p.account_id=$1 AND p.owned_pet_instance_id=$2 AND a.status='active' ${lock?'FOR UPDATE OF p':''}`,
   [accountId,ownedPetInstanceId]);
  return result.rows[0]?.pet_id;
 }

 async levels(tx:Queryable,ownedPetInstanceIds:readonly string[]){
  const result=await tx.query<CoopSkillLevelBinding&{ownedPetInstanceId:string}>(
   `SELECT owned_pet_instance_id AS "ownedPetInstanceId",skill_id AS "skillId",level
    FROM coop_skill_levels WHERE owned_pet_instance_id=ANY($1::uuid[]) ORDER BY skill_id`,[ownedPetInstanceIds]);
  return result.rows;
 }

 async materials(tx:Queryable,accountId:string):Promise<number>{
  const result=await tx.query<{materials:number}>('SELECT materials FROM pet_artifact_players WHERE account_id=$1',[accountId]);
  return result.rows[0]?.materials??0;
 }

 async debit(tx:Queryable,accountId:string,materials:number):Promise<number|undefined>{
  const result=await tx.query<{materials:number}>(
   `UPDATE pet_artifact_players SET materials=materials-$2,revision=revision+1,updated_at=clock_timestamp()
    WHERE account_id=$1 AND materials>=$2 RETURNING materials`,[accountId,materials]);
  return result.rows[0]?.materials;
 }

 async receipt(tx:Queryable,accountId:string,requestId:string){
  const result=await tx.query<{fingerprint:string;receipt:unknown}>(
   'SELECT fingerprint,receipt FROM coop_skill_upgrade_receipts WHERE account_id=$1 AND request_id=$2',[accountId,requestId]);
  return result.rows[0];
 }

 async upgrade(tx:Queryable,input:{accountId:string;requestId:string;ownedPetInstanceId:string;skillId:string;level:number;fingerprint:string;receipt:unknown}){
  await tx.query(
   `INSERT INTO coop_skill_levels(owned_pet_instance_id,skill_id,level)
    VALUES ($1,$2,$3) ON CONFLICT (owned_pet_instance_id,skill_id)
    DO UPDATE SET level=EXCLUDED.level,updated_at=clock_timestamp()`,
   [input.ownedPetInstanceId,input.skillId,input.level]);
  await tx.query(
   'INSERT INTO coop_skill_upgrade_receipts(account_id,request_id,fingerprint,receipt) VALUES($1,$2,$3,$4)',
   [input.accountId,input.requestId,input.fingerprint,JSON.stringify(input.receipt)]);
 }

 async exportAccount(tx:Queryable,accountId:string){
  const levels=await tx.query(
   `SELECT s.owned_pet_instance_id AS "ownedPetInstanceId",s.skill_id AS "skillId",s.level
    FROM coop_skill_levels s JOIN pet_wave_one_owned p USING(owned_pet_instance_id)
    WHERE p.account_id=$1 ORDER BY s.owned_pet_instance_id,s.skill_id`,[accountId]);
  const receipts=await tx.query(
   'SELECT receipt FROM coop_skill_upgrade_receipts WHERE account_id=$1 ORDER BY created_at,request_id',[accountId]);
  return {levels:levels.rows,receipts:receipts.rows.map(row=>row.receipt)};
 }
}
