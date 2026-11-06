import type {PoolClient} from 'pg';
import {OperatorAccountQuerySchema,OperatorAccountCommandSchema,OperatorAccountStateSchema,OperatorAccountViewSchema,OperatorAccountResultSchema,OperatorAccountAuditSchema,type OperatorAccountState} from '@virtual-city/contracts';
import {DomainError} from '../common/errors';
import type {IdentityService} from './service';
import type {OperatorService} from './operator-service';
type Seal=(purpose:string,value:unknown)=>string;
const unavailable=()=>new DomainError('NOT_FOUND',404,'Account unavailable');
const conflict=()=>new DomainError('IDEMPOTENCY_CONFLICT',409,'Account or request changed; refresh before retrying');
export class AccountControlService {
 constructor(private identity:IdentityService,private operator:OperatorService,private now=Date.now){}
 private async state(tx:PoolClient,id:string):Promise<OperatorAccountState>{
  const row=(await tx.query<{kind:'guest'|'registered';status:'active'|'suspended';control_version:number}>('SELECT kind,status,control_version FROM identity_accounts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw unavailable();
  const sessions=(await tx.query<{n:number}>('SELECT count(*)::int AS n FROM identity_sessions WHERE account_id=$1 AND revoked_at IS NULL AND expires_at>$2',[id,new Date(this.now())])).rows[0].n;
  return OperatorAccountStateSchema.parse({kind:row.kind,status:row.status,version:row.control_version,activeSessions:sessions});
 }
 async account(token:string,input:unknown){const {accountId}=OperatorAccountQuerySchema.parse(input);return this.operator.controlRead(token,async tx=>{
  await this.identity.lockAccounts(tx,[accountId]);const state=await this.state(tx,accountId);
  return OperatorAccountViewSchema.parse({accountId,...state,privacy:{export:'OWNER_SELF_SERVICE',deletion:'OWNER_SELF_SERVICE',receiptTtlSeconds:86400}});
 });}
 async audit(token:string,input:unknown){const {accountId}=OperatorAccountQuerySchema.parse(input);return this.operator.controlRead(token,async(tx,_subject,seal)=>{
  const rows=(await tx.query<{request_id:string;action:string;reason:string;before_state:unknown;after_state:unknown;occurred_at:Date;previous_hash:string;event_hash:string}>('SELECT request_id,action,reason,before_state,after_state,occurred_at,previous_hash,event_hash FROM identity_account_control_audit WHERE account_ref=$1 ORDER BY sequence DESC LIMIT 20',[seal('account-reference',accountId)])).rows;
  return OperatorAccountAuditSchema.parse({events:rows.map(row=>({requestId:row.request_id,action:row.action,reason:row.reason,before:row.before_state,after:row.after_state,occurredAt:row.occurred_at.toISOString(),previousHash:row.previous_hash,eventHash:row.event_hash}))});
 });}
 async command(token:string,csrf:unknown,input:unknown){
  const value=OperatorAccountCommandSchema.parse(input);
  const committed=await this.operator.controlWrite(token,csrf,async(tx,subject,seal:Seal)=>{
   const fingerprint=seal('account-command',value),accountRef=seal('account-reference',value.accountId);
   const previous=(await tx.query<{fingerprint:string;before_state:unknown;after_state:unknown}>('SELECT fingerprint,before_state,after_state FROM identity_account_control_audit WHERE request_id=$1',[value.requestId])).rows[0];
   if(previous){if(previous.fingerprint!==fingerprint)throw conflict();return {result:OperatorAccountResultSchema.parse({requestId:value.requestId,accountId:value.accountId,before:previous.before_state,after:previous.after_state}),revoked:[] as string[],replayed:true};}
   await this.identity.lockAccounts(tx,[value.accountId]);const before=await this.state(tx,value.accountId);if(before.version!==value.expectedVersion)throw conflict();
   const status=value.action==='suspend'?'suspended':value.action==='resume'?'active':before.status;
   await tx.query('UPDATE identity_accounts SET status=$2,control_version=control_version+1 WHERE id=$1',[value.accountId,status]);
   const revoked=value.action==='resume'?[]:(await tx.query<{id:string}>("UPDATE identity_sessions SET revoked_at=$2,revoked_reason='operator' WHERE account_id=$1 AND revoked_at IS NULL RETURNING id",[value.accountId,new Date(this.now())])).rows.map(row=>row.id);
   const after=await this.state(tx,value.accountId),at=new Date(this.now()).toISOString();
   const previousHash=(await tx.query<{event_hash:string}>('SELECT event_hash FROM identity_account_control_audit ORDER BY sequence DESC LIMIT 1')).rows[0]?.event_hash??'0'.repeat(64);
   const event=[value.requestId,subject,accountRef,fingerprint,value.action,value.reason,before,after,at,previousHash];
   await tx.query('INSERT INTO identity_account_control_audit(request_id,subject,account_ref,fingerprint,action,reason,before_state,after_state,occurred_at,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[...event,seal('account-audit',event)]);
   return {result:OperatorAccountResultSchema.parse({requestId:value.requestId,accountId:value.accountId,before,after}),revoked,replayed:false};
  });
  // No socket or room effect is published before successful COMMIT.
  this.identity.afterOperatorControl(value.accountId,committed.revoked,!committed.replayed);return committed.result;
 }
}
