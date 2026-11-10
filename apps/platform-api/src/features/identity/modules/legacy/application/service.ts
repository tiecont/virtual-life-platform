import type { Pool,PoolClient } from 'pg';
import { LegacyIdentityLinkInputSchema,LegacyIdentityUnlinkInputSchema,LegacyIdentityViewSchema,type LegacyIdentityView } from '@virtual-city/contracts';
import type { IdentityService } from '../../accounts/application/service';
import { DomainError } from '../../../../../shared/common/errors';
import { WindowLimiter } from '../../accounts/domain/limits';
import { DeadlinePrincipalSchema,type DeadlineIdentityPort,type DeadlinePrincipal } from './deadline-port';
type Row={source_subject:string|null;active:boolean;revision:number;linked_at:Date|null;changed_at:Date;link_window_at:Date;link_count:number};
export class DeadlineIdentityLinks {
 #closed=false;#workers=new Set<AbortController>();#limits:WindowLimiter;
 #pending=new Map<string,{fingerprint:string;promise:Promise<LegacyIdentityView>}>();
 constructor(private db:Pick<Pool,'query'|'connect'>,private identity:IdentityService,private port?:DeadlineIdentityPort,private now=Date.now){this.#limits=new WindowLimiter(now);}
 get available(){return !!this.port&&!this.#closed;}
 close(){this.#closed=true;for(const controller of this.#workers)controller.abort();}
 async #proof(token:string):Promise<DeadlinePrincipal>{
  if(!this.available)throw new DomainError('NOT_FOUND',404,'Deadline linking is unavailable');
  if(this.#workers.size>=4)throw new DomainError('RATE_LIMITED',429,'Deadline identity is busy',1);
  const controller=new AbortController();this.#workers.add(controller);const work=Promise.resolve().then(()=>this.port!.authenticate(token,controller.signal));
  void work.then(()=>this.#workers.delete(controller),()=>this.#workers.delete(controller));let timer:ReturnType<typeof setTimeout>|undefined;let abort:(()=>void)|undefined;
  try{const timeout=new Promise<never>((_ok,reject)=>{abort=()=>reject(new DomainError('WORLD_UNAVAILABLE',503,'Deadline identity is unavailable'));controller.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>controller.abort(),2000);timer.unref();});const principal=DeadlinePrincipalSchema.parse(await Promise.race([work,timeout]));if(Date.parse(principal.expiresAt)<=this.now()||controller.signal.aborted||this.#closed)throw new DomainError('UNAUTHENTICATED',401,'The Deadline session has expired');return principal;}
  catch(error){if(error instanceof DomainError)throw error;throw new DomainError('WORLD_UNAVAILABLE',503,'Deadline identity is unavailable');}
  finally{if(timer)clearTimeout(timer);if(abort)controller.signal.removeEventListener('abort',abort);}
 }
 async #row(db:Pick<Pool,'query'>|PoolClient,account:string){return (await db.query<Row>("SELECT source_subject,active,revision,linked_at,changed_at,link_window_at,link_count FROM identity_legacy_links WHERE provider='deadline' AND account_id=$1",[account])).rows[0];}
 #view(row?:Row){return LegacyIdentityViewSchema.parse({schemaVersion:1,source:'deadline',available:this.available,linked:row?.active??false,revision:row?.revision??0,linkedAt:row?.linked_at?.toISOString()??null,changedAt:row?.changed_at.toISOString()??null});}
 async view(token:string){const actor=await this.identity.authenticate(token);return this.#view(await this.#row(this.db,actor.accountId));}
 async #transaction<T>(token:string,work:(db:PoolClient,account:string)=>Promise<T>,assertCurrent?:()=>void){const initial=await this.identity.authenticate(token),db=await this.db.connect();try{await db.query('BEGIN');await this.identity.lockAccounts(db,[initial.accountId]);const actor=await this.identity.contextInTransaction(db,token);const value=await work(db,actor.accountId);await this.identity.contextInTransaction(db,token);assertCurrent?.();await db.query('COMMIT');return value;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
 async #previous(db:PoolClient,account:string,key:string,fingerprint:string){const old=(await db.query<{fingerprint:string}>("SELECT fingerprint FROM identity_legacy_mutations WHERE provider='deadline' AND account_id=$1 AND request_id=$2",[account,key])).rows[0];if(old&&old.fingerprint!==fingerprint)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Request key conflicts with another link command');return !!old;}
 async #remember(db:PoolClient,account:string,key:string,operation:string,fingerprint:string){const row=await this.#row(db,account);await db.query("INSERT INTO identity_legacy_mutations(provider,account_id,request_id,operation,fingerprint,created_at) VALUES('deadline',$1,$2,$3,$4,$5)",[account,key,operation,fingerprint,new Date(Math.max(this.now(),row?.changed_at.getTime()??0))]);await db.query("DELETE FROM identity_legacy_mutations WHERE provider='deadline' AND account_id=$1 AND request_id IN (SELECT request_id FROM identity_legacy_mutations WHERE provider='deadline' AND account_id=$1 ORDER BY created_order DESC OFFSET 100)",[account]);}
 async link(token:string,sourceToken:string,key:string,raw:unknown){
  const input=LegacyIdentityLinkInputSchema.parse(raw),actor=await this.identity.authenticate(token);if(!this.available)throw new DomainError('NOT_FOUND',404,'Deadline linking is unavailable');
  const pendingKey=actor.accountId+':'+key,fingerprint=this.identity.fingerprint({input,sourceToken,session:actor.sessionId}),pending=this.#pending.get(pendingKey);
  if(pending){if(pending.fingerprint!==fingerprint)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Request key conflicts with another link command');await pending.promise;return this.view(token);}
  if(this.#pending.size>=64||!this.#limits.take(actor.accountId,20))throw new DomainError('RATE_LIMITED',429,'Please wait before linking again');
  const promise=this.#link(token,sourceToken,key,input);this.#pending.set(pendingKey,{fingerprint,promise});try{return await promise;}finally{this.#pending.delete(pendingKey);}
 }
 async #link(token:string,sourceToken:string,key:string,input:ReturnType<typeof LegacyIdentityLinkInputSchema.parse>){
  const principal=await this.#proof(sourceToken),fingerprint=this.identity.fingerprint({operation:'legacy.deadline.link',input,subject:principal.subject});
  let validUntil=Date.parse(principal.expiresAt);return this.#transaction(token,async(db,account)=>{
   if(await this.#previous(db,account,key,fingerprint))return this.#view(await this.#row(db,account));
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['legacy.deadline:'+principal.subject]);
   const row=await this.#row(db,account);if((row?.revision??0)!==input.expectedRevision)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Link state changed;refresh before linking');
   if(row?.source_subject&&row.source_subject!==principal.subject)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'A different Deadline guest is already associated');
   if((await db.query("SELECT 1 FROM identity_legacy_links WHERE provider='deadline' AND source_subject=$1 AND account_id<>$2",[principal.subject,account])).rowCount)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'This Deadline guest cannot be associated with this city account');
   const window=row&&this.now()<row.link_window_at.getTime()+86400000?{at:row.link_window_at,count:row.link_count}:{at:new Date(this.now()),count:0};if(window.count>=24)throw new DomainError('RATE_LIMITED',429,'Daily link command limit reached');
   const current=await this.#proof(sourceToken);if(current.subject!==principal.subject||row&&this.now()<row.changed_at.getTime())throw new DomainError('WORLD_UNAVAILABLE',503,'Deadline identity changed;try again');
   validUntil=Date.parse(current.expiresAt);await this.identity.contextInTransaction(db,token);const at=new Date(this.now());
   if(!row)await db.query("INSERT INTO identity_legacy_links VALUES('deadline',$1,$2,true,1,$3,$3,$3,1)",[account,principal.subject,at]);
   else if(!row.active)await db.query("UPDATE identity_legacy_links SET source_subject=$2,active=true,revision=revision+1,linked_at=$3,changed_at=$3,link_window_at=$4,link_count=$5 WHERE provider='deadline' AND account_id=$1",[account,principal.subject,at,window.at,window.count+1]);
   else await db.query("UPDATE identity_legacy_links SET link_window_at=$2,link_count=$3 WHERE provider='deadline' AND account_id=$1",[account,window.at,window.count+1]);
   await this.#remember(db,account,key,'link',fingerprint);return this.#view(await this.#row(db,account));
  },()=>{if(!this.available||validUntil<=this.now())throw new DomainError('UNAUTHENTICATED',401,'The Deadline proof has expired');});
 }
 async unlink(token:string,key:string,raw:unknown){const input=LegacyIdentityUnlinkInputSchema.parse(raw),fingerprint=this.identity.fingerprint({operation:'legacy.deadline.unlink',input});return this.#transaction(token,async(db,account)=>{
  if(await this.#previous(db,account,key,fingerprint))return this.#view(await this.#row(db,account));const row=await this.#row(db,account),revision=row?.revision??0;
  // A withdrawal can beat one positive command issued from the same observed revision.
  if(input.expectedRevision>revision||revision>input.expectedRevision+1)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Link state changed;refresh before withdrawing');
  const at=new Date(Math.max(this.now(),row?.changed_at.getTime()??0));if(row)await db.query("UPDATE identity_legacy_links SET active=false,revision=LEAST(revision::bigint+1,2147483647),changed_at=$2 WHERE provider='deadline' AND account_id=$1",[account,at]);else await db.query("INSERT INTO identity_legacy_links VALUES('deadline',$1,NULL,false,1,NULL,$2,$2,0)",[account,at]);
  await this.#remember(db,account,key,'unlink',fingerprint);return this.#view(await this.#row(db,account));
 });}
 async exportAccount(account:string,db:PoolClient){const row=await this.#row(db,account);return {schemaVersion:1,source:'deadline',linked:row?.active??false,revision:row?.revision??0,sourceSubject:row?.source_subject??null,linkedAt:row?.linked_at?.toISOString()??null,changedAt:row?.changed_at.toISOString()??null};}
 async maintain(){await this.db.query("DELETE FROM identity_legacy_mutations WHERE (provider,account_id,request_id) IN (SELECT provider,account_id,request_id FROM identity_legacy_mutations WHERE provider='deadline' AND created_at<=$1 ORDER BY created_at,account_id,request_id LIMIT 100)",[new Date(this.now()-30*86400000)]);}
}
