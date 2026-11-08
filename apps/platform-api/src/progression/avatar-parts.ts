import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {AVATAR_CATALOG_VERSION,AvatarPartsSchema,AvatarSaveInputSchema,AvatarOwnStateSchema,AvatarSaveResultSchema,starterAvatarParts,type AvatarParts,type AvatarOwnState,type PublicProfile} from '@virtual-city/contracts';
import type {IdentityService} from '../identity/service';
import {DomainError} from '../common/errors';
type DB=Pick<Pool,'query'>;
export class AvatarPartsService {
 constructor(private pool:Pick<Pool,'connect'|'query'>,private identity:IdentityService,private refresh:(accounts:string[])=>Promise<unknown>,private now=Date.now){}
 private async state(account:string,db:DB):Promise<AvatarOwnState>{
  const profile=(await db.query<{avatar_key:PublicProfile['avatarKey']}>('SELECT avatar_key FROM identity_profiles WHERE account_id=$1',[account])).rows[0];
  if(!profile)throw new DomainError('UNAUTHENTICATED',401,'Session unavailable');
  const row=(await db.query<{catalog_version:string;revision:number;parts:unknown}>('SELECT catalog_version,revision,parts FROM engine_avatar_parts WHERE account_id=$1',[account])).rows[0];
  if(row&&row.catalog_version!==AVATAR_CATALOG_VERSION)throw new DomainError('WORLD_VERSION_MISMATCH',409,'Character catalog changed;update before editing');
  const selected=row?AvatarPartsSchema.parse(row.parts):starterAvatarParts(profile.avatar_key),canEquipApron=Boolean((await db.query("SELECT 1 FROM engine_progression_entitlements WHERE account_id=$1 AND cosmetic_key='cafe-apron'",[account])).rowCount);
  const effective={...selected,outfit:selected.outfit==='cafe-apron'&&!canEquipApron?'bare' as const:selected.outfit};
  return AvatarOwnStateSchema.parse({schemaVersion:2,catalogVersion:AVATAR_CATALOG_VERSION,accountId:account,revision:row?.revision??0,selected,effective,canEquipApron});
 }
 private async transaction<T>(token:string,work:(db:PoolClient,account:string)=>Promise<T>):Promise<T>{
  const initial=await this.identity.authenticate(token),db=await this.pool.connect();
  try{await db.query('BEGIN');await this.identity.lockAccounts(db,[initial.accountId]);const actor=await this.identity.contextInTransaction(db,token);if(actor.accountId!==initial.accountId)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Account changed;refresh before editing');const result=await work(db,actor.accountId);await this.identity.contextInTransaction(db,token);await db.query('COMMIT');return result;}
  catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 own(token:string){return this.transaction(token,(db,account)=>this.state(account,db));}
 async save(token:string,key:unknown,raw:unknown){
  const request=z.uuid().parse(key).toLowerCase(),input=AvatarSaveInputSchema.parse(raw),fingerprint=this.identity.fingerprint({operation:'avatar.parts.save',input});
  const result=await this.transaction(token,async(db,account)=>{
   if(input.expectedAccountId!==account)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Account changed;refresh before saving');
   const prior=(await db.query<{fingerprint:string;saved_revision:number}>('SELECT fingerprint,saved_revision FROM engine_avatar_part_mutations WHERE account_id=$1 AND request_id=$2',[account,request])).rows[0];
   if(prior&&prior.fingerprint!==fingerprint)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Request key was used with different input');
   // Receipt lookup precedes revision/catalog/entitlement checks. An uncertain
   // successful COMMIT can be acknowledged without reapplying a revoked item or
   // overwriting a later save. Current effective state is always reprojected.
   let current=await this.state(account,db),savedRevision=prior?.saved_revision;
   if(!prior){
    if(input.catalogVersion!==AVATAR_CATALOG_VERSION)throw new DomainError('WORLD_VERSION_MISMATCH',409,'Character catalog changed;refresh before saving');
    if(input.expectedRevision!==current.revision)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Character changed;refresh before saving');
    if(input.parts.outfit==='cafe-apron'&&!current.canEquipApron)throw new DomainError('NOT_AVAILABLE',404,'This outfit is not available');
    const count=(await db.query<{n:number}>('SELECT count(*)::int AS n FROM engine_avatar_part_mutations WHERE account_id=$1 AND created_at>$2',[account,new Date(this.now()-60000)])).rows[0].n;
    if(count>=30)throw new DomainError('RATE_LIMITED',429,'Please wait before changing your character');
    savedRevision=current.revision+1;
    await db.query('INSERT INTO engine_avatar_parts(account_id,catalog_version,revision,parts,changed_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_id) DO UPDATE SET catalog_version=EXCLUDED.catalog_version,revision=EXCLUDED.revision,parts=EXCLUDED.parts,changed_at=EXCLUDED.changed_at',[account,AVATAR_CATALOG_VERSION,savedRevision,JSON.stringify(input.parts),new Date(this.now())]);
    await db.query('INSERT INTO engine_avatar_part_mutations(account_id,request_id,fingerprint,saved_revision,created_at) VALUES($1,$2,$3,$4,$5)',[account,request,fingerprint,savedRevision,new Date(this.now())]);
    current=await this.state(account,db);
   }
   return AvatarSaveResultSchema.parse({schemaVersion:2,requestId:request,savedRevision,state:current});
  });
  await this.refresh([result.state.accountId]);return result;
 }
 // Called only for already privacy-filtered room participants. Current world
 // uniform authority remains with AppearanceService,never with saved cosmetics.
 async project(account:string,palette:PublicProfile['avatarKey'],uniform:'casual'|'cafe-apron'):Promise<AvatarParts>{
  const row=(await this.pool.query('SELECT catalog_version,parts FROM engine_avatar_parts WHERE account_id=$1',[account])).rows[0];
  const parsed=row?.catalog_version===AVATAR_CATALOG_VERSION?AvatarPartsSchema.safeParse(row.parts):undefined;
  const selected=parsed?.success?parsed.data:starterAvatarParts(palette);
  return {...selected,outfit:uniform==='cafe-apron'?'cafe-apron':selected.outfit==='cafe-apron'?'bare':selected.outfit};
 }
 async exportAccount(account:string,db:DB){const row=(await db.query('SELECT catalog_version,revision,parts,changed_at FROM engine_avatar_parts WHERE account_id=$1',[account])).rows[0];return {schemaVersion:2,selected:row?{catalogVersion:row.catalog_version,revision:row.revision,parts:row.parts,changedAt:row.changed_at.toISOString()}:null};}
}
