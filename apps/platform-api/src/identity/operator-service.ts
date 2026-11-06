import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {OperatorBootstrapSchema,OperatorLoginSchema,OperatorRecoverySchema,type OperatorSession} from '@virtual-city/contracts';
import {DomainError} from '../common/errors';
import {PasswordHasher} from './passwords';
import {matchTotp,openTotp,sealTotp} from './operator-crypto';

type Operator={subject:string;password_salt:string;password_digest:string;totp_sealed:string;totp_counter:string;auth_version:number;failures:number;locked_until:Date|null};
type Session={token_hash:string;subject:string;auth_version:number;expires_at:Date;last_used_at:Date;step_up_until:Date;revoked_at:Date|null};
type Action='bootstrap'|'login'|'step-up'|'logout'|'revoke-all'|'recover';
const idleMs=15*60000,absoluteMs=8*3600000,stepUpMs=5*60000;
const denied=()=>new DomainError('UNAUTHENTICATED',401,'Operator authentication required');
const limited=()=>new DomainError('RATE_LIMITED',429,'Please wait before authenticating');
export class OperatorService {
 private passwords=new PasswordHasher();
 constructor(private db:Pick<Pool,'query'|'connect'>,private key:string,private now=Date.now){if(!/^[a-f0-9]{64}$/.test(key))throw Error('Invalid operator key');}
 hash(value:string){return createHash('sha256').update('operator:v1:'+value).digest('hex');}
 private keyed(value:string){return createHmac('sha256',Buffer.from(this.key,'hex')).update(value).digest('hex');}
 csrf(token:string){return this.keyed('operator:csrf:v1:'+token);}
 private verifyCsrf(token:string,value:unknown){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||!timingSafeEqual(Buffer.from(value),Buffer.from(this.csrf(token))))throw new DomainError('FORBIDDEN',403,'CSRF validation failed');}
 // One lock order for bootstrap, login, recovery and every operator session use.
 // A deny result commits its rate/audit changes; ordinary thrown errors roll back.
 private async transaction<T>(fn:(tx:PoolClient,operator:Operator|undefined)=>Promise<T|DomainError>):Promise<T>{
  const tx=await this.db.connect();let result:T|DomainError;
  try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(86732419)');const operator=(await tx.query<Operator>('SELECT * FROM identity_operator WHERE singleton=true FOR UPDATE')).rows[0];result=await fn(tx,operator);await tx.query('COMMIT');}
  catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
  if(result instanceof DomainError)throw result;return result;
 }
 private async audit(tx:PoolClient,operator:Operator,action:Action,outcome:'accepted'|'denied'|'rate-limited',after=operator.auth_version){
  const previous=(await tx.query<{event_hash:string}>('SELECT event_hash FROM identity_operator_audit ORDER BY sequence DESC LIMIT 1')).rows[0]?.event_hash??'0'.repeat(64),at=new Date(this.now()).toISOString();
  const event=[operator.subject,action,outcome,at,operator.auth_version,after,previous];
  await tx.query('INSERT INTO identity_operator_audit(subject,action,outcome,occurred_at,before_version,after_version,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[...event,this.keyed('operator:audit:v1:'+JSON.stringify(event))]);
 }
 private async failure(tx:PoolClient,operator:Operator,action:Action){
  const count=operator.failures+1;await tx.query('UPDATE identity_operator SET failures=$1,locked_until=$2 WHERE singleton=true',[count,count>=5?new Date(this.now()+5*60000):null]);await this.audit(tx,operator,action,'denied');return denied();
 }
 private async lockout(tx:PoolClient,operator:Operator,action:Action){
  if(operator.locked_until&&operator.locked_until.getTime()>this.now()){await this.audit(tx,operator,action,'rate-limited');return limited();}
  if(operator.locked_until){operator.failures=0;await tx.query('UPDATE identity_operator SET failures=0,locked_until=NULL WHERE singleton=true');}
 }
 private view(operator:Operator,session:Session,token:string):OperatorSession{return {subject:operator.subject,audience:'operator',expiresAt:session.expires_at.toISOString(),idleExpiresAt:new Date(Math.min(session.expires_at.getTime(),this.now()+idleMs)).toISOString(),stepUpUntil:session.step_up_until.toISOString(),csrfToken:this.csrf(token)};}
 private async issue(tx:PoolClient,operator:Operator,expiresAt=new Date(this.now()+absoluteMs)){
  const token=randomBytes(32).toString('hex'),at=new Date(this.now()),step=new Date(Math.min(expiresAt.getTime(),this.now()+stepUpMs));
  await tx.query('UPDATE identity_operator_sessions SET revoked_at=$1 WHERE revoked_at IS NULL',[at]);
  const row=(await tx.query<Session>('INSERT INTO identity_operator_sessions(token_hash,subject,auth_version,created_at,expires_at,last_used_at,step_up_until) VALUES($1,$2,$3,$4,$5,$4,$6) RETURNING *',[this.hash(token),operator.subject,operator.auth_version,at,expiresAt,step])).rows[0];
  return {token,session:this.view(operator,row,token)};
 }
 private async active(tx:PoolClient,operator:Operator,token:string,csrf?:unknown,fresh=false){
  if(!/^[a-f0-9]{64}$/.test(token))throw denied();
  const session=(await tx.query<Session>('SELECT * FROM identity_operator_sessions WHERE token_hash=$1 AND audience=\'operator\' FOR UPDATE',[this.hash(token)])).rows[0];
  if(!session||session.subject!==operator.subject||session.revoked_at||session.auth_version!==operator.auth_version||session.expires_at.getTime()<=this.now()||session.last_used_at.getTime()+idleMs<=this.now())throw denied();
  if(csrf!==undefined)this.verifyCsrf(token,csrf);
  if(fresh&&session.step_up_until.getTime()<=this.now())throw new DomainError('FORBIDDEN',403,'Fresh operator authentication required');
  await tx.query('UPDATE identity_operator_sessions SET last_used_at=$2 WHERE token_hash=$1',[session.token_hash,new Date(this.now())]);return session;
 }
 private async recoveryCodes(tx:PoolClient,subject:string){
  const codes=Array.from({length:10},()=>randomBytes(32).toString('hex'));await tx.query('UPDATE identity_operator_recovery SET used_at=$1 WHERE used_at IS NULL',[new Date(this.now())]);
  for(const code of codes)await tx.query('INSERT INTO identity_operator_recovery(code_hash,subject) VALUES($1,$2)',[this.hash('recovery:'+code),subject]);return codes;
 }
 async bootstrap(input:unknown){
  const value=OperatorBootstrapSchema.parse(input),counter=matchTotp(value.totpSecret,value.code,this.now(),-1);if(counter===null)throw denied();const password=await this.passwords.hash(value.password);
  return this.transaction(async(tx,existing)=>{if(existing)throw new DomainError('NOT_AVAILABLE',409,'Operator already provisioned');const subject=randomUUID();
   const operator=(await tx.query<Operator>('INSERT INTO identity_operator(singleton,subject,password_salt,password_digest,totp_sealed,totp_counter,created_at) VALUES(true,$1,$2,$3,$4,$5,$6) RETURNING *',[subject,password.salt,password.digest,sealTotp(value.totpSecret,this.key,subject),counter,new Date(this.now())])).rows[0];
   const recoveryCodes=await this.recoveryCodes(tx,subject);await this.audit(tx,operator,'bootstrap','accepted');return {subject,recoveryCodes};
  });
 }
 async login(input:unknown){const value=OperatorLoginSchema.parse(input);return this.transaction(async(tx,operator)=>{
  if(!operator){await this.passwords.verify(value.password);return denied();}const lock=await this.lockout(tx,operator,'login');if(lock)return lock;
  const valid=await this.passwords.verify(value.password,{salt:operator.password_salt,digest:operator.password_digest}),counter=matchTotp(openTotp(operator.totp_sealed,this.key,operator.subject),value.code,this.now(),Number(operator.totp_counter));
  if(!valid||counter===null)return this.failure(tx,operator,'login');await tx.query('UPDATE identity_operator SET totp_counter=$1,failures=0,locked_until=NULL WHERE singleton=true',[counter]);await this.audit(tx,operator,'login','accepted');return this.issue(tx,operator);
 });}
 async session(token:string){return this.transaction(async(tx,operator)=>{if(!operator)throw denied();const session=await this.active(tx,operator,token);return this.view(operator,session,token);});}
 async stepUp(token:string,csrf:unknown,input:unknown){const value=OperatorLoginSchema.parse(input);this.verifyCsrf(token,csrf);return this.transaction(async(tx,operator)=>{
  if(!operator)throw denied();const session=await this.active(tx,operator,token),lock=await this.lockout(tx,operator,'step-up');if(lock)return lock;
  const valid=await this.passwords.verify(value.password,{salt:operator.password_salt,digest:operator.password_digest}),counter=matchTotp(openTotp(operator.totp_sealed,this.key,operator.subject),value.code,this.now(),Number(operator.totp_counter));
  if(!valid||counter===null)return this.failure(tx,operator,'step-up');await tx.query('UPDATE identity_operator SET totp_counter=$1,failures=0,locked_until=NULL WHERE singleton=true',[counter]);await this.audit(tx,operator,'step-up','accepted');return this.issue(tx,operator,session.expires_at);
 });}
 async logout(token:string,csrf:unknown,all=false){this.verifyCsrf(token,csrf);return this.transaction(async(tx,operator)=>{
  if(!operator)throw denied();const session=await this.active(tx,operator,token,csrf,all);const at=new Date(this.now());
  if(all){await tx.query('UPDATE identity_operator SET auth_version=auth_version+1 WHERE singleton=true');await tx.query('UPDATE identity_operator_sessions SET revoked_at=$1 WHERE revoked_at IS NULL',[at]);}
  else await tx.query('UPDATE identity_operator_sessions SET revoked_at=$2 WHERE token_hash=$1',[session.token_hash,at]);
  await this.audit(tx,operator,all?'revoke-all':'logout','accepted',operator.auth_version+(all?1:0));return {revoked:true};
 });}
 async recover(input:unknown){const value=OperatorRecoverySchema.parse(input);return this.transaction(async(tx,operator)=>{
  if(!operator){await this.passwords.verify(value.password);return denied();}const lock=await this.lockout(tx,operator,'recover');if(lock)return lock;
  const recovery=(await tx.query('SELECT code_hash FROM identity_operator_recovery WHERE code_hash=$1 AND subject=$2 AND used_at IS NULL FOR UPDATE',[this.hash('recovery:'+value.recoveryCode),operator.subject])).rows[0];
  const valid=await this.passwords.verify(value.password,{salt:operator.password_salt,digest:operator.password_digest}),counter=matchTotp(value.newTotpSecret,value.code,this.now(),-1);
  if(!recovery||!valid||counter===null||value.newTotpSecret===openTotp(operator.totp_sealed,this.key,operator.subject))return this.failure(tx,operator,'recover');
  await tx.query('UPDATE identity_operator SET totp_sealed=$1,totp_counter=$2,auth_version=auth_version+1,failures=0,locked_until=NULL WHERE singleton=true',[sealTotp(value.newTotpSecret,this.key,operator.subject),counter]);
  await tx.query('UPDATE identity_operator_sessions SET revoked_at=$1 WHERE revoked_at IS NULL',[new Date(this.now())]);const recoveryCodes=await this.recoveryCodes(tx,operator.subject);await this.audit(tx,operator,'recover','accepted',operator.auth_version+1);return {subject:operator.subject,recoveryCodes};
 });}
 async auditEvents(token:string){return this.transaction(async(tx,operator)=>{if(!operator)throw denied();await this.active(tx,operator,token,undefined,true);return {events:(await tx.query('SELECT sequence,action,outcome,occurred_at,before_version,after_version,previous_hash,event_hash FROM identity_operator_audit ORDER BY sequence DESC LIMIT 100')).rows};});}
}
