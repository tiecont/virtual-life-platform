import type { Pool } from 'pg';
import { z } from 'zod';
import { AvatarOutfitSchema,TravelSourceSchema,type WorldDefinition,type TravelSource,type AvatarAppearance } from '@virtual-city/contracts';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import type { RoomService } from '../../../../rooms/modules/presence/application/service';
import type { HospitalityService } from '../../../../hospitality/modules/service/application/service';
import { DomainError } from '../../../../../shared/common/errors';
const inputSchema=z.strictObject({schemaVersion:z.literal(1),source:TravelSourceSchema,outfit:AvatarOutfitSchema});
export class AppearanceService {
 constructor(private pool:Pick<Pool,'query'|'connect'>,private identity:IdentityService,private rooms:RoomService,private hospitality:HospitalityService,private now=Date.now){}
 private async usable(account:string,world:WorldDefinition,source:TravelSource,connected:boolean){
  if(!world.appearancePolicy||world.appearancePolicy.apron==='forbidden')return false;
  if(world.appearancePolicy.apron==='on-shift'&&(!connected||!world.hospitalityPolicy?.staffing||!await this.hospitality.permitsUniform(account,world.slug,source,world.hospitalityPolicy.version)))return false;
  return true;
 }
 async project(account:string,world:WorldDefinition,source:TravelSource,connected:boolean):Promise<AvatarAppearance['outfit']>{
  const row=(await this.pool.query("SELECT a.outfit,EXISTS(SELECT 1 FROM engine_progression_entitlements e WHERE e.account_id=a.account_id AND e.cosmetic_key='cafe-apron') AS entitled FROM engine_progression_appearance a WHERE a.account_id=$1",[account])).rows[0];
  return row?.outfit==='cafe-apron'&&row.entitled&&await this.usable(account,world,source,connected)?'cafe-apron':'casual';
 }
 async equip(token:string,key:string,raw:unknown){
  const input=inputSchema.parse(raw),request=z.uuid().parse(key),fingerprint=this.identity.fingerprint({operation:'appearance.equip',input});
  const result=await this.rooms.appearanceContext(token,input.source,async(initial,world,valid)=>{
   const db=await this.pool.connect();try{await db.query('BEGIN');await this.identity.lockAccounts(db,[initial.accountId]);const actor=await this.identity.contextInTransaction(db,token);
    const prior=(await db.query('SELECT fingerprint FROM engine_progression_appearance_mutations WHERE account_id=$1 AND request_id=$2',[actor.accountId,request])).rows[0];if(prior&&prior.fingerprint!==fingerprint)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Request key was used with different input');
    const selected=(await db.query('SELECT changed_at FROM engine_progression_appearance WHERE account_id=$1',[actor.accountId])).rows[0];if(selected&&this.now()<selected.changed_at.getTime())throw new DomainError('WORLD_UNAVAILABLE',503,'Appearance clock unavailable');
    if(!prior){
     if(input.outfit==='cafe-apron'&&(!await this.usable(actor.accountId,world,input.source,true)||!(await db.query("SELECT 1 FROM engine_progression_entitlements WHERE account_id=$1 AND cosmetic_key='cafe-apron'",[actor.accountId])).rowCount))throw new DomainError('NOT_AVAILABLE',404,'This outfit is unavailable for your visit');
     if((await db.query('SELECT count(*)::int AS n FROM engine_progression_appearance_mutations WHERE account_id=$1 AND created_at>$2',[actor.accountId,new Date(this.now()-60000)])).rows[0].n>=30)throw new DomainError('RATE_LIMITED',429,'Please wait before changing appearance');
     await db.query('INSERT INTO engine_progression_appearance VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET outfit=$2,changed_at=$3',[actor.accountId,input.outfit,new Date(this.now())]);await db.query('INSERT INTO engine_progression_appearance_mutations VALUES($1,$2,$3,$4)',[actor.accountId,request,fingerprint,new Date(this.now())]);
    }
    if(!valid()||this.now()>=actor.expiresAt||input.outfit==='cafe-apron'&&!prior&&!await this.usable(actor.accountId,world,input.source,true))throw new DomainError('NOT_IN_ROOM',409,'Your current visit changed');
    await db.query('COMMIT');return actor.accountId;
   }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  });await this.rooms.refreshAccounts([result]);return this.rooms.appearanceContext(token,input.source,async(actor,world,valid)=>{const outfit=await this.project(actor.accountId,world,input.source,true);if(!valid())throw new DomainError('NOT_IN_ROOM',409,'Your current visit changed');return {schemaVersion:1 as const,outfit};});
 }
 async exportAccount(id:string,db:Pick<Pool,'query'>){const row=(await db.query('SELECT outfit,changed_at FROM engine_progression_appearance WHERE account_id=$1',[id])).rows[0];return {schemaVersion:1,selected:row?.outfit??'casual',changedAt:row?.changed_at.toISOString()??null};}
}
