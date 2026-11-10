import type {Pool,PoolClient} from 'pg';
import type {IdentityService,IdentityContext} from '../../accounts/application/service';
import {RuntimeTicketError,type RuntimeScope,type RuntimeAdmissionPort} from './runtime-tickets';

type World={world_id:string;boot_id:string;content_hash:string;generation:string;enabled:boolean;capacity:number;lease_until:Date};
type Admission={account_id:string;session_id:string;world_id:string;generation:string;world_generation:string;allowed:boolean;valid_until:Date};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const world=/^native:[a-z0-9][a-z0-9._-]{0,63}$/;
const hash=/^[a-f0-9]{64}$/;
const limit=Number.MAX_SAFE_INTEGER;
function scopeValid(scope:RuntimeScope){return world.test(scope.worldId)&&uuid.test(scope.runtimeBootId)&&hash.test(scope.contentHash)&&scope.protocolVersion===1;}
function next(value:string|undefined){const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0||n>=limit)throw new RuntimeTicketError();return n+1;}

// Internal control plane only. Composition owns world registration/lease; callers
// cannot choose an enabled world through a public route or mutate gameplay here.
export class RuntimeAdmissionStore {
 constructor(private pool:Pool,private identity:IdentityService){}
 private async clock(db:PoolClient){return (await db.query<{at:Date}>('SELECT clock_timestamp() AS at')).rows[0].at;}
 private async transaction<T>(credential:string|undefined,work:(db:PoolClient,actor:IdentityContext|undefined)=>Promise<T>){
  const initial=credential===undefined?undefined:await this.identity.authenticate(credential);
  const db=await this.pool.connect();
  try{
   await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='2000ms'");await db.query("SET LOCAL lock_timeout='1000ms'");
   if(initial)await this.identity.lockAccounts(db,[initial.accountId]);
   const actor=credential===undefined?undefined:await this.identity.contextInTransaction(db,credential);
   if(initial&&(actor?.accountId!==initial.accountId||actor.sessionId!==initial.sessionId))throw new RuntimeTicketError();
   // One bounded allocator lock prevents capacity races and opposite world transfers.
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended('native-admission-v1',0))");
   const result=await work(db,actor);
   if(credential!==undefined)await this.identity.contextInTransaction(db,credential);
   await db.query('COMMIT');return result;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async configure(scope:RuntimeScope,expectedGeneration:number,enabled=false,capacity=0){
  if(!scopeValid(scope)||!Number.isSafeInteger(expectedGeneration)||expectedGeneration<0||!Number.isInteger(capacity)||capacity<0||capacity>10000||enabled&&capacity===0)throw new RuntimeTicketError();
  return this.transaction(undefined,async db=>{
   const prior=(await db.query<World>('SELECT * FROM platform_native_worlds WHERE world_id=$1 FOR UPDATE',[scope.worldId])).rows[0];
   if(Number(prior?.generation??0)!==expectedGeneration)throw new RuntimeTicketError();
   const generation=next(prior?.generation),at=await this.clock(db);
   await db.query(`INSERT INTO platform_native_worlds(world_id,boot_id,content_hash,generation,enabled,capacity,lease_until) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(world_id) DO UPDATE SET boot_id=EXCLUDED.boot_id,content_hash=EXCLUDED.content_hash,generation=EXCLUDED.generation,enabled=EXCLUDED.enabled,capacity=EXCLUDED.capacity,lease_until=EXCLUDED.lease_until`,[scope.worldId,scope.runtimeBootId,scope.contentHash,generation,enabled,capacity,new Date(at.getTime()+5000)]);
   return generation;
  });
 }
 async heartbeat(scope:RuntimeScope,generation:number){
  if(!scopeValid(scope)||!Number.isSafeInteger(generation)||generation<1)throw new RuntimeTicketError();
  return this.transaction(undefined,async db=>{
   const at=await this.clock(db);
   const result=await db.query('UPDATE platform_native_worlds SET lease_until=$5 WHERE world_id=$1 AND boot_id=$2 AND content_hash=$3 AND generation=$4 AND lease_until>$6',[scope.worldId,scope.runtimeBootId,scope.contentHash,generation,new Date(at.getTime()+5000),at]);
   if(result.rowCount!==1)throw new RuntimeTicketError();
  });
 }
 private async currentWorld(db:PoolClient,scope:RuntimeScope,at:Date){
  const row=(await db.query<World>('SELECT * FROM platform_native_worlds WHERE world_id=$1 FOR UPDATE',[scope.worldId])).rows[0];
  if(!row||!row.enabled||row.boot_id!==scope.runtimeBootId||row.content_hash!==scope.contentHash||row.lease_until<=at)throw new RuntimeTicketError();
  return row;
 }
 private async permits(db:PoolClient,account:string,worldId:string,at:Date){
  const active=(await db.query("SELECT 1 FROM identity_accounts WHERE id=$1 AND status='active'",[account])).rowCount;
  const denied=(await db.query("SELECT 1 FROM safety_sanctions WHERE subject_id=$1 AND revoked_at IS NULL AND effective_at<=$3 AND expires_at>$3 AND (kind='platform-ban' OR (kind='world-ban' AND world_slug=$2)) LIMIT 1",[account,worldId,at])).rowCount;
  if(!active||denied)throw new RuntimeTicketError();
 }
 async allocate(credential:string,scope:RuntimeScope){
  if(!scopeValid(scope))throw new RuntimeTicketError();const target=Object.freeze({...scope});
  return this.transaction(credential,async(db,actor)=>{
   if(!actor)throw new RuntimeTicketError();const at=await this.clock(db),destination=await this.currentWorld(db,target,at);
   await this.permits(db,actor.accountId,target.worldId,at);
   const prior=(await db.query<Admission>('SELECT * FROM platform_native_admissions WHERE account_id=$1 FOR UPDATE',[actor.accountId])).rows[0];
   if(prior?.allowed&&prior.valid_until>at&&prior.world_id!==target.worldId)throw new RuntimeTicketError();
   const occupied=(await db.query<{n:number}>('SELECT count(*)::int AS n FROM platform_native_admissions WHERE world_id=$1 AND allowed AND valid_until>$2 AND account_id<>$3',[target.worldId,at,actor.accountId])).rows[0].n;
   if(occupied>=destination.capacity)throw new RuntimeTicketError();
   const generation=next(prior?.generation),validUntilMs=Math.min(at.getTime()+30000,actor.expiresAt,destination.lease_until.getTime());
   if(validUntilMs<=at.getTime())throw new RuntimeTicketError();
   await db.query(`INSERT INTO platform_native_admissions(account_id,session_id,world_id,generation,world_generation,allowed,valid_until) VALUES($1,$2,$3,$4,$5,true,$6)
    ON CONFLICT(account_id) DO UPDATE SET session_id=EXCLUDED.session_id,world_id=EXCLUDED.world_id,generation=EXCLUDED.generation,world_generation=EXCLUDED.world_generation,allowed=true,valid_until=EXCLUDED.valid_until,changed_at=clock_timestamp()`,[actor.accountId,actor.sessionId,target.worldId,generation,destination.generation,new Date(validUntilMs)]);
   return Object.freeze({accountId:actor.accountId,sessionId:actor.sessionId,generation,validUntilMs});
  });
 }
 async release(credential:string){
  return this.transaction(credential,async(db,actor)=>{
   if(!actor)throw new RuntimeTicketError();
   const prior=(await db.query<Admission>('SELECT * FROM platform_native_admissions WHERE account_id=$1 FOR UPDATE',[actor.accountId])).rows[0];
   if(prior)await db.query('UPDATE platform_native_admissions SET allowed=false,generation=$2,valid_until=clock_timestamp(),changed_at=clock_timestamp() WHERE account_id=$1',[actor.accountId,next(prior.generation)]);
  });
 }
 // Caller (issuer) already holds canonical account lock. Same allocator lock
 // serializes registration/revocation with policy reads; no permissive cache.
 readonly admission:RuntimeAdmissionPort=async(db,accountId,sessionId,scope)=>{
  if(!scopeValid(scope)||!uuid.test(accountId)||!uuid.test(sessionId))throw new RuntimeTicketError();
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('native-admission-v1',0))");
  const at=await this.clock(db),destination=await this.currentWorld(db,scope,at);
  await this.permits(db,accountId,scope.worldId,at);
  const row=(await db.query<Admission>('SELECT * FROM platform_native_admissions WHERE account_id=$1 FOR UPDATE',[accountId])).rows[0];
  if(!row||!row.allowed||row.session_id!==sessionId||row.world_id!==scope.worldId||row.world_generation!==destination.generation||row.valid_until<=at)throw new RuntimeTicketError();
  return Object.freeze({accountId,sessionId,generation:Number(row.generation),validUntilMs:Math.min(row.valid_until.getTime(),destination.lease_until.getTime(),at.getTime()+5000)});
 };
}
