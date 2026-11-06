import {RuntimeControlContextSchema,RuntimeControlViewSchema,RuntimeControlSnapshotSchema,RuntimeControlCommandSchema,RuntimeControlResultSchema,RuntimeControlAuditSchema} from '@virtual-city/contracts';
import type {OperatorService} from '../identity/operator-service';
import {DomainError} from '../common/errors';
import {RuntimePolicyStore,type RuntimeControlPort} from './runtime-policy-store';
const missing=()=>new DomainError('NOT_FOUND',404,'Versioned runtime controls unavailable');
const conflict=()=>new DomainError('IDEMPOTENCY_CONFLICT',409,'Runtime or release changed; refresh before retrying');
export class OperatorRuntimeControls {
 constructor(private store:RuntimePolicyStore,private operator:OperatorService|undefined,private port:RuntimeControlPort|undefined){}
 async state(token:string){if(!this.operator)throw missing();return this.operator.controlRead(token,async db=>{
  if(!this.port)return {supported:false as const};const context=RuntimeControlContextSchema.parse(this.port.context()),desired=await this.store.read(context.environment,context.releaseHash,db);
  const projection=desired.releaseHash!==context.releaseHash?'STALE':desired.revision!==context.appliedRevision&&context.projection==='APPLIED'?'PENDING':context.projection;
  return RuntimeControlViewSchema.parse({supported:true,...context,projection,desired,worlds:context.worlds.map(world=>({...world,available:projection==='APPLIED'&&world.available}))});
 });}
 async audit(token:string){if(!this.operator)throw missing();return this.operator.controlRead(token,async db=>{
  if(!this.port)throw missing();const {environment}=RuntimeControlContextSchema.parse(this.port.context());const rows=(await db.query<{request_id:string;action:string;reason:string;before_state:unknown;after_state:unknown;occurred_at:Date;previous_hash:string;event_hash:string}>('SELECT * FROM operator_runtime_audit WHERE environment=$1 ORDER BY sequence DESC LIMIT 20',[environment])).rows;
  return RuntimeControlAuditSchema.parse({events:rows.map(row=>({requestId:row.request_id,action:row.action,reason:row.reason,before:row.before_state,after:row.after_state,occurredAt:row.occurred_at.toISOString(),previousHash:row.previous_hash,eventHash:row.event_hash}))});
 });}
 async command(token:string,csrf:unknown,input:unknown){if(!this.operator||!this.port)throw missing();const value=RuntimeControlCommandSchema.parse(input),port=this.port;let unfence:(()=>void)|undefined,reconcile=false;
  try{const receipt=await this.operator.controlWrite(token,csrf,async(db,subject,seal)=>{
   const context=RuntimeControlContextSchema.parse(port.context());if(value.expectedReleaseHash!==context.releaseHash)throw conflict();const fingerprint=seal('runtime-command',value);
   const prior=(await db.query<{fingerprint:string;before_state:unknown;after_state:unknown}>('SELECT fingerprint,before_state,after_state FROM operator_runtime_audit WHERE request_id=$1',[value.requestId])).rows[0];
   if(prior){if(prior.fingerprint!==fingerprint)throw conflict();reconcile=true;return RuntimeControlResultSchema.parse({requestId:value.requestId,before:prior.before_state,after:prior.after_state});}
   const before=await this.store.read(context.environment,context.releaseHash,db);if(before.revision!==value.expectedRevision)throw conflict();
   if((await db.query<{n:number}>("SELECT count(*)::int AS n FROM operator_runtime_audit WHERE environment=$1 AND occurred_at>clock_timestamp()-interval '1 hour'",[context.environment])).rows[0].n>=30)throw new DomainError('RATE_LIMITED',429,'Please wait before another runtime change');
   const after=RuntimeControlSnapshotSchema.parse({...before,revision:before.revision+1,paused:{...before.paused}}),stale=before.releaseHash!==context.releaseHash;
   if(value.action==='adopt'){if(!stale)throw conflict();after.releaseHash=context.releaseHash;after.maintenance=true;}
   else {if(stale)throw conflict();if(value.action==='maintenance'){if(after.maintenance===value.paused)throw conflict();after.maintenance=value.paused;}
    else {const world=context.worlds.find(world=>world.slug===value.worldSlug)!;if(!value.paused&&(!world.installed||!world.entitled))throw new DomainError('FORBIDDEN',403,'Git release entitlement does not permit this world');if(after.paused[value.worldSlug]===value.paused)throw conflict();after.paused[value.worldSlug]=value.paused;}
   }
   const at=(await db.query<{at:Date}>('SELECT clock_timestamp() AS at')).rows[0].at.toISOString();
   const changed=await db.query('INSERT INTO operator_runtime_controls VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(environment) DO UPDATE SET revision=EXCLUDED.revision,release_hash=EXCLUDED.release_hash,maintenance=EXCLUDED.maintenance,paused=EXCLUDED.paused,changed_at=EXCLUDED.changed_at WHERE operator_runtime_controls.revision=$7',[context.environment,after.revision,after.releaseHash,after.maintenance,after.paused,at,before.revision]);if(changed.rowCount!==1)throw conflict();
   const previous=(await db.query<{event_hash:string}>('SELECT event_hash FROM operator_runtime_audit ORDER BY sequence DESC LIMIT 1')).rows[0]?.event_hash??'0'.repeat(64),event=[value.requestId,subject,context.environment,fingerprint,value.action,value.reason,before,after,at,previous];
   await db.query('INSERT INTO operator_runtime_audit(request_id,subject,environment,fingerprint,action,reason,before_state,after_state,occurred_at,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[...event,seal('runtime-audit',event)]);
   unfence=port.fence();reconcile=true;return RuntimeControlResultSchema.parse({requestId:value.requestId,before,after});
  });unfence?.();unfence=undefined;if(reconcile){try{await port.reconcile();}catch{/* Desired commit is recorded; projection remains visibly FAILED and retries through maintenance. */}}return receipt;
  }catch(error){unfence?.();if(reconcile){try{await port.reconcile();}catch{/* Canonical state controls unknown acknowledgements; never assume a mutation. */}}throw error;}
 }
 maintain(){return this.port?.maintain()??Promise.resolve();}
}
