import {createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import {PrivacyRequestCreateSchema,PrivacyCompleteSchema,PrivacyCompleteResultSchema,PrivacyCloseSchema,PrivacyRequestViewSchema,PrivacyOwnerStateSchema,OperatorPrivacyReviewSchema,OperatorPrivacyRequestsSchema,OperatorAccountQuerySchema,type PrivacyRequestView} from '@virtual-city/contracts';
import {DomainError} from '../common/errors';
import type {IdentityService} from './service';
import type {OperatorService} from './operator-service';
type Row={id:string;account_id:string|null;request_key:string;operation:'export'|'delete';state:'PENDING'|'APPROVED'|'DENIED'|'COMPLETED'|'CANCELLED';version:number;fingerprint:string;credential_fingerprint:string;server_nonce:string;token_hash:string|null;created_at:Date;expires_at:Date;retain_until:Date;approval_until:Date|null;approval_account_version:number|null;receipt_until:Date|null;closed_at:Date|null;current_account_version:number|null;login_name:string|null;salt:string|null;digest:string|null};
const DAY=86400000,retention={requestSeconds:604800 as const,approvalSeconds:900 as const,receiptSeconds:86400 as const,auditDays:30 as const,payloadStored:false as const};
const denied=()=>new DomainError('UNAUTHENTICATED',401,'Privacy request authentication required');
const forbidden=()=>new DomainError('FORBIDDEN',403,'Current owner proof and privacy approval required');
const conflict=()=>new DomainError('IDEMPOTENCY_CONFLICT',409,'Privacy request changed; refresh before retrying');
const limited=()=>new DomainError('RATE_LIMITED',429,'Please wait before trying again',300);
const select='SELECT r.*,a.control_version AS current_account_version,c.login_name,c.salt,c.digest FROM identity_privacy_requests r LEFT JOIN identity_accounts a ON a.id=r.account_id LEFT JOIN identity_credentials c ON c.account_id=r.account_id ';
export class PrivacyRequestService {
 constructor(private identity:IdentityService,private key:string,private operator:OperatorService|undefined,private now=Date.now){}
 private seal(purpose:string,value:unknown){return createHmac('sha256',this.key).update('privacy:'+purpose+':v1:'+JSON.stringify(value)).digest('hex');}
 private token(row:Pick<Row,'id'|'server_nonce'>){return this.seal('request-token',[row.id,row.server_nonce]);}
 private tokenHash(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw denied();return this.seal('token-hash',token);}
 csrf(token:string){return this.seal('csrf',token);}
 private verifyCsrf(token:string,csrf:unknown){if(typeof csrf!=='string'||!/^[a-f0-9]{64}$/.test(csrf)||!timingSafeEqual(Buffer.from(csrf),Buffer.from(this.csrf(token))))throw forbidden();}
 private credential(row:{account_id:string|null;salt:string|null;digest:string|null}){return this.seal('credential',[row.account_id,row.salt,row.digest]);}
 private async tx<T>(work:(db:PoolClient)=>Promise<T|DomainError>):Promise<T>{const db=await this.identity.pool.connect();let result:T|DomainError;try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='2000ms'");await db.query("SET LOCAL lock_timeout='1000ms'");result=await work(db);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}if(result instanceof DomainError)throw result;return result;}
 private async row(token:string,db:Pick<PoolClient,'query'>=this.identity.pool,lock=false){const row=(await db.query<Row>(select+'WHERE r.token_hash=$1'+(lock?' FOR UPDATE OF r':''),[this.tokenHash(token)])).rows[0];if(!row||row.closed_at||row.retain_until.getTime()<=this.now())throw denied();return row;}
 private view(row:Row):PrivacyRequestView{
  let status:PrivacyRequestView['status']=row.state;
  if(!['COMPLETED','DENIED','CANCELLED'].includes(row.state)){
   if(!row.account_id)status='CANCELLED';else if(row.expires_at.getTime()<=this.now())status='EXPIRED';
   else if(row.state==='APPROVED'&&(!row.approval_until||row.approval_until.getTime()<=this.now()||row.approval_account_version!==row.current_account_version||row.credential_fingerprint!==this.credential(row)))status='REVIEW_REQUIRED';
  }
  const canConfirm=!!row.account_id&&!!row.approval_until&&row.approval_until.getTime()>this.now()&&row.expires_at.getTime()>this.now()&&row.approval_account_version===row.current_account_version&&row.credential_fingerprint===this.credential(row)&&(row.state==='APPROVED'||row.state==='COMPLETED'&&row.operation==='export');
  return PrivacyRequestViewSchema.parse({id:row.id,operation:row.operation,status,canConfirm,version:row.version,createdAt:row.created_at.toISOString(),expiresAt:row.expires_at.toISOString(),approvalExpiresAt:row.approval_until?.toISOString()??null,receiptExpiresAt:row.receipt_until?.toISOString()??null,retention});
 }
 private snapshot(row:Row){return Object.fromEntries(Object.entries(this.view(row)).filter(([key])=>key!=='id'));}
 private async audit(db:PoolClient,row:Row,action:string,reason:string,before:unknown,actor:'owner'|'operator'='owner',subject:string|null=null,commandId:string|null=null,fingerprint:string|null=null,verificationRef:string|null=null){
  await db.query('SELECT pg_advisory_xact_lock(86732428)');
  const previous=(await db.query<{event_hash:string}>('SELECT event_hash FROM identity_privacy_audit_head WHERE singleton=true FOR UPDATE')).rows[0].event_hash;
  // Retention uses the database clock, independently of an injected test/app clock.
  const at=(await db.query<{at:Date}>('SELECT clock_timestamp() AS at')).rows[0].at;
  const after=this.snapshot(row),event=[commandId,fingerprint,this.seal('audit-request',row.id),actor,subject,action,reason,before,after,at.toISOString(),previous,verificationRef],hash=this.seal('audit',event);
  await db.query("INSERT INTO identity_privacy_audit(command_id,fingerprint,request_ref,actor,operator_subject,action,reason,before_state,after_state,occurred_at,retain_until,previous_hash,event_hash,verification_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10::timestamptz+interval '30 days',$11,$12,$13)",[commandId,fingerprint,event[2],actor,subject,action,reason,before,after,at,previous,hash,verificationRef]);
  await db.query('UPDATE identity_privacy_audit_head SET event_hash=$1 WHERE singleton=true',[hash]);
 }
 private async proof(loginName:string,password:string){const bucket=this.seal('auth-bucket',loginName),lock=(await this.identity.pool.query<{locked_until:Date|null}>('SELECT locked_until FROM identity_privacy_auth WHERE bucket=$1',[bucket])).rows[0];if(lock?.locked_until&&lock.locked_until.getTime()>this.now())throw limited();return {bucket,credential:await this.identity.verifyPrivacyOwner(loginName,password)};}
 private async authenticated<T>(proof:Awaited<ReturnType<PrivacyRequestService['proof']>>,work:(db:PoolClient,accountId:string)=>Promise<T>):Promise<T>{return this.tx(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['privacy-auth:'+proof.bucket]);
  await db.query('INSERT INTO identity_privacy_auth(bucket,touched_at) VALUES($1,$2) ON CONFLICT DO NOTHING',[proof.bucket,new Date(this.now())]);
  const bucket=(await db.query<{failures:number;locked_until:Date|null}>('SELECT failures,locked_until FROM identity_privacy_auth WHERE bucket=$1 FOR UPDATE',[proof.bucket])).rows[0];
  if(bucket.locked_until&&bucket.locked_until.getTime()>this.now())return limited();
  if(!proof.credential){const count=(bucket.locked_until?0:bucket.failures)+1;await db.query('UPDATE identity_privacy_auth SET failures=$2,locked_until=$3,touched_at=$4 WHERE bucket=$1',[proof.bucket,count,count>=5?new Date(this.now()+300000):null,new Date(this.now())]);return denied();}
  const accountId=proof.credential.account_id;await this.identity.lockAccounts(db,[accountId]);
  const current=(await db.query<{salt:string;digest:string}>('SELECT c.salt,c.digest FROM identity_accounts a JOIN identity_credentials c ON c.account_id=a.id WHERE a.id=$1 FOR UPDATE OF a,c',[accountId])).rows[0];
  if(!current||current.salt!==proof.credential.salt||current.digest!==proof.credential.digest)throw denied();
  await db.query('UPDATE identity_privacy_auth SET failures=0,locked_until=NULL,touched_at=$2 WHERE bucket=$1',[proof.bucket,new Date(this.now())]);
  return work(db,accountId);
 });}
 async create(input:unknown){const value=PrivacyRequestCreateSchema.parse(input),proof=await this.proof(value.loginName,value.password);return this.authenticated(proof,async(db,accountId)=>{
  const account=(await db.query<{status:string}>('SELECT status FROM identity_accounts WHERE id=$1',[accountId])).rows[0];if(account.status!=='suspended')throw new DomainError('NOT_AVAILABLE',409,'Use your signed-in account privacy controls');
  const fingerprint=this.seal('create',[accountId,value.requestId,value.operation,this.credential({...proof.credential!,account_id:accountId})]);
  let row=(await db.query<Row>(select+'WHERE r.account_id=$1 AND r.request_key=$2 FOR UPDATE OF r',[accountId,value.requestId])).rows[0];
  if(row){if(row.fingerprint!==fingerprint)throw conflict();if(row.closed_at||row.retain_until.getTime()<=this.now())throw denied();return {token:this.token(row),state:PrivacyOwnerStateSchema.parse({...this.view(row),csrfToken:this.csrf(this.token(row))}),created:false};}
  if((await db.query<{n:number}>('SELECT count(*)::int AS n FROM identity_privacy_requests WHERE account_id=$1 AND created_at>$2',[accountId,new Date(this.now()-DAY)])).rows[0].n>=3)throw limited();
  const id=randomUUID(),nonce=randomBytes(16).toString('hex'),token=this.token({id,server_nonce:nonce}),at=new Date(this.now()),until=new Date(this.now()+7*DAY);
  await db.query("INSERT INTO identity_privacy_requests(id,account_id,request_key,operation,state,fingerprint,credential_fingerprint,server_nonce,token_hash,created_at,expires_at,retain_until) VALUES($1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9,$10,$10)",[id,accountId,value.requestId,value.operation,fingerprint,this.credential({...proof.credential!,account_id:accountId}),nonce,this.tokenHash(token),at,until]);
  row=await this.row(token,db,true);await this.audit(db,row,'create','OWNER_REQUEST',null);return {token,state:PrivacyOwnerStateSchema.parse({...this.view(row),csrfToken:this.csrf(token)}),created:true};
 });}
 async status(token:string){const row=await this.row(token);return PrivacyOwnerStateSchema.parse({...this.view(row),csrfToken:this.csrf(token)});}
 private allowed(row:Row){if(!row.account_id||!row.approval_until||row.approval_until.getTime()<=this.now()||row.expires_at.getTime()<=this.now()||row.approval_account_version!==row.current_account_version||row.credential_fingerprint!==this.credential(row)||!(row.state==='APPROVED'||row.state==='COMPLETED'&&row.operation==='export'))throw forbidden();}
 async complete(token:string,csrf:unknown,input:unknown){const value=PrivacyCompleteSchema.parse(input);this.verifyCsrf(token,csrf);const initial=await this.row(token);if(initial.id!==value.privacyRequestId)throw conflict();
  if(initial.operation==='delete'&&!value.confirmDelete)throw forbidden();
  if(initial.state==='COMPLETED'&&initial.operation==='delete'&&!initial.account_id)return this.tx(async db=>{const row=await this.row(token,db,true);if(row.state!=='COMPLETED'||row.account_id)throw denied();return {operation:'delete' as const,state:PrivacyOwnerStateSchema.parse({...this.view(row),csrfToken:this.csrf(token)}),deleted:true as const};});
  if(!initial.account_id||!initial.login_name)throw denied();const accountId=initial.account_id,proof=await this.proof(initial.login_name,value.password);
  let committed;try{committed=await this.authenticated(proof,async(db,id)=>{
   if(id!==accountId)throw denied();let row=await this.row(token,db,true);this.allowed(row);const before=this.snapshot(row),deadline=row.approval_until!.getTime(),first=row.state!=='COMPLETED';
   const payload=row.operation==='export'?await this.identity.exportForPrivacy(db,id):undefined;
   const revoked=row.operation==='delete'?await this.identity.eraseForPrivacy(db,id):[];
   if(first){const until=new Date(this.now()+DAY);await db.query("UPDATE identity_privacy_requests SET state='COMPLETED',version=version+1,receipt_until=$2,retain_until=$2 WHERE id=$1",[row.id,until]);row=await this.row(token,db,true);await this.audit(db,row,'complete','OWNER_AUTHENTICATED',before);}
   if(this.now()>=deadline||this.now()>=row.expires_at.getTime())throw forbidden();
   if(row.operation==='export')this.allowed(await this.row(token,db,true));
   return {operation:row.operation,state:PrivacyOwnerStateSchema.parse({...this.view(row),csrfToken:this.csrf(token)}),...row.operation==='export'?{payload}:{deleted:true as const},revoked};
  });}catch(error){this.identity.afterOperatorControl(accountId,[],false);throw error;}
  if(committed.operation==='delete')this.identity.afterOperatorControl(accountId,committed.revoked);
  return PrivacyCompleteResultSchema.parse({operation:committed.operation,state:committed.state,...('payload' in committed?{payload:committed.payload}:{deleted:true})});
 }
 async close(token:string,csrf:unknown,input:unknown){const value=PrivacyCloseSchema.parse(input);this.verifyCsrf(token,csrf);const known=await this.row(token);if(known.id!==value.privacyRequestId)throw conflict();return this.tx(async db=>{
  if(known.account_id)await this.identity.lockAccounts(db,[known.account_id]);let row=await this.row(token,db,true);const before=this.snapshot(row),at=new Date(this.now());
  await db.query("UPDATE identity_privacy_requests SET state=CASE WHEN state='COMPLETED' THEN state ELSE 'CANCELLED' END,version=version+1,token_hash=NULL,closed_at=$2,receipt_until=$3,retain_until=$3 WHERE id=$1",[row.id,at,new Date(this.now()+DAY)]);
  row=(await db.query<Row>(select+'WHERE r.id=$1',[row.id])).rows[0];await this.audit(db,row,'close','OWNER_REQUEST',before);return {closed:true};
 });}
 async list(operatorToken:string,input:unknown){if(!this.operator)throw denied();const {accountId}=OperatorAccountQuerySchema.parse(input);return this.operator.controlRead(operatorToken,async db=>{
  const rows=(await db.query<Row>(select+'WHERE r.account_id=$1 AND r.retain_until>$2 ORDER BY r.created_at DESC,r.id LIMIT 21',[accountId,new Date(this.now())])).rows;
  return OperatorPrivacyRequestsSchema.parse({requests:rows.slice(0,20).map(row=>this.view(row)),truncated:rows.length>20,retention});
 });}
 async review(operatorToken:string,csrf:unknown,input:unknown){if(!this.operator)throw denied();const value=OperatorPrivacyReviewSchema.parse(input);return this.operator.controlWrite(operatorToken,csrf,async(db,subject)=>{
  const fingerprint=this.seal('review',value),prior=(await db.query<{fingerprint:string;after_state:object}>('SELECT fingerprint,after_state FROM identity_privacy_audit WHERE command_id=$1',[value.requestId])).rows[0];
  if(prior){if(prior.fingerprint!==fingerprint)throw conflict();return PrivacyRequestViewSchema.parse({id:value.privacyRequestId,...prior.after_state});}
  if((await db.query<{n:number}>("SELECT count(*)::int AS n FROM identity_privacy_audit WHERE actor='operator' AND occurred_at>clock_timestamp()-interval '1 hour'")).rows[0].n>=30)throw limited();
  await this.identity.lockAccounts(db,[value.accountId]);const row=(await db.query<Row>(select+'WHERE r.id=$1 AND r.account_id=$2 FOR UPDATE OF r',[value.privacyRequestId,value.accountId])).rows[0];
  if(!row||row.closed_at||row.retain_until.getTime()<=this.now())throw new DomainError('NOT_FOUND',404,'Privacy request unavailable');
  if(row.version!==value.expectedVersion)throw conflict();if(!['PENDING','APPROVED'].includes(row.state)||row.expires_at.getTime()<=this.now()||row.credential_fingerprint!==this.credential(row))throw conflict();
  if(value.decision==='approve'&&this.view(row).status==='APPROVED')throw conflict();
  const before=this.snapshot(row),approved=value.decision==='approve',until=new Date(Math.min(row.expires_at.getTime(),this.now()+900000));
  await db.query('UPDATE identity_privacy_requests SET state=$2,version=version+1,approval_until=$3,approval_account_version=$4,receipt_until=$5,retain_until=$6 WHERE id=$1',[row.id,approved?'APPROVED':'DENIED',approved?until:null,approved?row.current_account_version:null,approved?null:new Date(this.now()+DAY),approved?row.expires_at:new Date(this.now()+DAY)]);
  const next=(await db.query<Row>(select+'WHERE r.id=$1',[row.id])).rows[0];await this.audit(db,next,approved?'approve':'deny',value.reason,before,'operator',subject,value.requestId,fingerprint,value.decision==='approve'?value.verificationRef:null);return this.view(next);
 });}
 async maintain(){return this.tx(async db=>{
  const requests=await db.query('DELETE FROM identity_privacy_requests WHERE id IN (SELECT id FROM identity_privacy_requests WHERE retain_until<=$1 ORDER BY retain_until LIMIT 100 FOR UPDATE SKIP LOCKED)',[new Date(this.now())]);
  const auth=await db.query("DELETE FROM identity_privacy_auth WHERE bucket IN (SELECT bucket FROM identity_privacy_auth WHERE touched_at<clock_timestamp()-interval '1 day' ORDER BY touched_at LIMIT 100 FOR UPDATE SKIP LOCKED)");
  const audit=await db.query('DELETE FROM identity_privacy_audit WHERE sequence IN (SELECT sequence FROM identity_privacy_audit WHERE retain_until<=clock_timestamp() ORDER BY sequence LIMIT 100 FOR UPDATE SKIP LOCKED)');
  return {requests:requests.rowCount??0,auth:auth.rowCount??0,audit:audit.rowCount??0};
 });}
}
