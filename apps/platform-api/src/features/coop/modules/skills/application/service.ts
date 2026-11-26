import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {
 CoopSkillProgressionSchema,CoopSkillUpgradeReceiptSchema,type CoopSkillUpgrade,
} from '@aetheria/contracts';
import {DomainError} from '../../../../../shared/common/errors';
import {lockAccounts} from '../../../../identity/modules/accounts/application/account-locks';
import {petSkillIds,publishedSkillCosts} from '../domain/published-skills';
import {CoopSkillStore} from '../infrastructure/store';

const notFound=()=>new DomainError('NOT_FOUND',404,'Owned Pet not found');
const unavailable=()=>new DomainError('NOT_AVAILABLE',503,'Published cooperative configuration is unavailable');
const conflict=(message:string)=>new DomainError('REQUEST_CONFLICT',409,message);

export class CoopSkillService {
 constructor(private readonly db:Pick<Pool,'connect'|'query'>,private readonly store=new CoopSkillStore()){}

 async allocationLevels(bundle:Record<string,unknown>,pets:readonly {instanceId:string;petId:string}[],db:Pick<PoolClient,'query'>=this.db){
  const persisted=await this.store.levels(db,pets.map(pet=>pet.instanceId));
  return pets.map(pet=>{
   const skillIds=new Set(petSkillIds(bundle,pet.petId));
   return Object.freeze(persisted
    .filter(row=>row.ownedPetInstanceId===pet.instanceId&&skillIds.has(row.skillId))
    .map(({skillId,level})=>Object.freeze({skillId,level})));
  });
 }

 private async transaction<T>(readOnly:boolean,work:(tx:PoolClient)=>Promise<T>):Promise<T>{
  const tx=await this.db.connect();
  try{
   await tx.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
   await tx.query("SET LOCAL statement_timeout='5000ms'");
   await tx.query("SET LOCAL lock_timeout='2000ms'");
   const result=await work(tx);
   await tx.query('COMMIT');
   return result;
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
 }

 async progression(accountId:string,ownedPetInstanceId:string){
  return this.transaction(true,async tx=>{
   const petId=await this.store.pet(tx,accountId,ownedPetInstanceId);
   if(!petId)throw notFound();
   const config=await this.store.active(tx);
   if(!config)throw unavailable();
   const rows=await this.store.levels(tx,[ownedPetInstanceId]);
   const levels=new Map(rows.map(row=>[row.skillId,row.level]));
   const materials=await this.store.materials(tx,accountId);
   const skills=publishedSkillCosts(config.bundle,petId).map(skill=>{
    const level=levels.get(skill.skillId)??1,maxLevel=skill.materials.length+1;
    return {skillId:skill.skillId,level,maxLevel,effectiveLevel:Math.min(level,maxLevel),nextMaterialCost:skill.materials[level-1]??null};
   });
   return CoopSkillProgressionSchema.parse({ownedPetInstanceId,petId,configVersion:config.version,configDigest:config.digest,materials,skills});
  });
 }

 async upgrade(accountId:string,ownedPetInstanceId:string,input:CoopSkillUpgrade){
  const fingerprint=createHash('sha256').update(JSON.stringify([ownedPetInstanceId,input.skillId,input.expectedLevel,input.expectedConfigVersion])).digest('hex');
  return this.transaction(false,async tx=>{
   // Share the account lock used by settlement and privacy erasure. Receipt
   // replay and mutation are serialized even across different request keys.
   await lockAccounts(tx,[accountId]);
   const prior=await this.store.receipt(tx,accountId,input.requestId);
   if(prior){
    if(prior.fingerprint!==fingerprint)throw conflict('Request key was used with different input');
    return CoopSkillUpgradeReceiptSchema.parse(prior.receipt);
   }
   const petId=await this.store.pet(tx,accountId,ownedPetInstanceId,true);
   if(!petId)throw notFound();
   const config=await this.store.active(tx,true);
   if(!config)throw unavailable();
   if(input.expectedConfigVersion!==config.version)throw conflict('Published skill configuration changed');
   const skill=publishedSkillCosts(config.bundle,petId).find(skill=>skill.skillId===input.skillId);
   if(!skill)throw new DomainError('NOT_FOUND',404,'Skill is unavailable for this Pet');
   const rows=await this.store.levels(tx,[ownedPetInstanceId]);
   const current=rows.find(row=>row.skillId===input.skillId)?.level??1;
   if(current!==input.expectedLevel)throw conflict('Skill level changed');
   const spentMaterials=skill.materials[current-1];
   if(spentMaterials===undefined)throw conflict('Skill has reached its published level cap');
   const remainingMaterials=await this.store.debit(tx,accountId,spentMaterials);
   if(remainingMaterials===undefined)throw new DomainError('INSUFFICIENT_FUNDS',409,'Not enough upgrade materials');
   const level=current+1;
   const receipt=CoopSkillUpgradeReceiptSchema.parse({
    ownedPetInstanceId,skillId:input.skillId,level,maxLevel:skill.materials.length+1,spentMaterials,remainingMaterials,
    configVersion:config.version,configDigest:config.digest,
   });
   await this.store.upgrade(tx,{accountId,requestId:input.requestId,ownedPetInstanceId,skillId:input.skillId,level,fingerprint,receipt});
   return receipt;
  });
 }

 async exportAccount(tx:Pick<PoolClient,'query'>,accountId:string){
  return this.store.exportAccount(tx,accountId);
 }
}
