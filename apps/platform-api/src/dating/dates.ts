import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { DatingDateEnterSchema,DatingDateChatSchema,DatingDateViewSchema,DatingDateChatReceiptSchema,type SafetyPolicy } from '@virtual-city/contracts';
import type { IdentityService } from '../identity/service';
import type { SocialService } from '../social/service';
import type { ReportService } from '../safety/reports';
import type { createIdentityGateway } from '../identity/socket';
import { SanctionPolicy } from '../safety/sanctions';
import { IncidentPolicy } from '../safety/incidents';
import { DomainError } from '../common/errors';
import type { DatingMatching,AcceptedDateScope,DatingDateLifecycle } from './matching';
type DateRow={proposal_id:string;owner_epoch:string;version:number;phase:'WAITING'|'ACTIVE'|'ENDED';entered_a:boolean;entered_b:boolean;connection_a:string|null;connection_b:string|null;created_at:Date;changed_at:Date;started_at:Date|null;expires_at:Date};
type Message={id:string;key:'hello'|'thanks'|'need-help'|'bye';actor:string;sentAt:number};
type Command={fingerprint:string;message_id:string|null};
const DAY=86400000,denied=()=>new DomainError('NOT_AVAILABLE',404,'This private conversation is unavailable');
// Restricted native DateRoom owner. It deliberately installs no generic Room,
// world directory,global profile,Socket.IO room or unsolicited channel.
export class DatingDates implements DatingDateLifecycle{
 readonly epoch=randomUUID();
 private sessions=new Map<string,{account:string;generation:string;sockets:Set<string>}>();
 private feeds=new Map<string,{until:number;messages:Message[]}>();
 private pending=new Set<Promise<void>>();
 private maintenance?:Promise<void>;
 private closed=false;
 constructor(private pool:Pick<Pool,'query'|'connect'>,private identity:IdentityService,private social:SocialService,private matching:DatingMatching,private reports:ReportService,private policy:SafetyPolicy,private now=Date.now){}
 attachGateway(gateway:ReturnType<typeof createIdentityGateway>){
  const connected=(socket:Parameters<typeof gateway.withSession>[0])=>{const context=gateway.connectionContext(socket);if(this.closed||!context||context.kind!=='registered')return;const session=context.sessionId;
   const detached=()=>{if(!session)return;const current=this.sessions.get(session);if(!current)return;current.sockets.delete(socket.id);if(current.sockets.size)return;this.sessions.delete(session);const endedSession=session;
    const operation=this.matching.endDateSession(current.account,endedSession,async(db,id,account)=>{const row=(await db.query<{generation:string|null}>('SELECT CASE WHEN p.account_a=$2 THEN d.connection_a ELSE d.connection_b END AS generation FROM restricted_dating_dates d JOIN restricted_dating_proposals p ON p.id=d.proposal_id WHERE d.proposal_id=$1 AND d.phase<>\'ENDED\'',[id,account])).rows[0];return row?.generation===current.generation;}).catch(()=>{/* Persisted connection generations make commands/recovery fail closed. */}).finally(()=>{this.pending.delete(operation);});this.pending.add(operation);
   };
   socket.once('disconnect',detached);
   const current=this.sessions.get(session)??{account:context.accountId,generation:randomUUID(),sockets:new Set<string>()};current.sockets.add(socket.id);this.sessions.set(session,current);
  };
  gateway.io.on('connection',connected);return ()=>gateway.io.off('connection',connected);
 }
 private connected(session:string,generation?:string|null){const current=this.sessions.get(session);return !!current?.sockets.size&&(generation===undefined||current.generation===generation);}
 private row(db:PoolClient,id:string,lock=false){return db.query<DateRow>('SELECT * FROM restricted_dating_dates WHERE proposal_id=$1'+(lock?' FOR UPDATE':''),[id]).then(result=>result.rows[0]);}
 async valid(db:PoolClient,id:string){
  const row=await this.row(db,id);if(!row)return true;
  if(this.closed||!this.reports.available()||row.owner_epoch!==this.epoch||row.phase==='ENDED'||row.expires_at.getTime()<=this.now())return false;
  if(row.changed_at.getTime()>this.now())throw new DomainError('WORLD_UNAVAILABLE',503,'Private conversation clock unavailable');
  const participants=(await db.query<{account_id:string;session_id:string}>('SELECT account_id,session_id FROM restricted_dating_enrollments WHERE proposal_id=$1 ORDER BY account_id',[id])).rows;
  if(participants.length!==2)return false;
  for(const participant of participants)if(!await new SanctionPolicy(db,this.now).permits(participant.account_id,'dating',id))return false;
  return (!row.entered_a||this.connected(participants[0].session_id,row.connection_a))&&(!row.entered_b||this.connected(participants[1].session_id,row.connection_b));
 }
 async end(db:PoolClient,id:string){await db.query("UPDATE restricted_dating_dates SET phase='ENDED',version=version+1,changed_at=greatest(changed_at,$2) WHERE proposal_id=$1 AND phase<>'ENDED'",[id,new Date(this.now())]);this.feeds.delete(id);}
 private available(){if(this.closed||!this.reports.available())throw new DomainError('SAFETY_UNAVAILABLE',503,'Private conversation safety controls are unavailable');}
 private async guard(db:PoolClient,scope:AcceptedDateScope,chat=false){this.available();for(const account of [scope.a,scope.b]){await new IncidentPolicy(db).assert(account,'dating',scope.id,chat);await new SanctionPolicy(db,this.now).assert(account,'dating',scope.id,chat);}}
 private view(row:DateRow|undefined,scope:AcceptedDateScope){const at=this.now(),deadline=Math.min(scope.until,row?.expires_at.getTime()??Infinity),mine=scope.actor.accountId===scope.a,isEntered=!!row&&(mine?row.entered_a:row.entered_b),active=row?.phase==='ACTIVE'&&isEntered;if(deadline<=at||row?.phase==='ENDED')throw denied();const feed=this.feeds.get(scope.id);return DatingDateViewSchema.parse({schemaVersion:1,id:scope.id,version:row?.version??0,state:active?'ACTIVE':'WAITING',consentedByMe:isEntered,serverTime:at,expiresAt:Math.min(at+3000,deadline),deadline,peer:active?{aliasKey:mine?scope.aliasB:scope.aliasA}:null,messages:active&&feed&&feed.until>at?feed.messages.map(message=>({id:message.id,key:message.key,sender:message.actor===scope.actor.accountId?'you':'partner',sentAt:message.sentAt})):[]});}
 async read(token:string,id:string){const result=await this.matching.withAccepted(token,id,async(db,scope)=>{await this.guard(db,scope);const row=await this.row(db,id);return {row,scope};});return this.view(result.row,result.scope);}
 private async prior(db:PoolClient,account:string,key:string,fingerprint:string){const row=(await db.query<Command>('SELECT fingerprint,message_id FROM restricted_dating_date_mutations WHERE account_id=$1 AND request_id=$2',[account,key])).rows[0];if(row&&row.fingerprint!==fingerprint)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Private request key conflicts');return row;}
 async enter(token:string,id:string,key:string,raw:unknown){const input=DatingDateEnterSchema.parse(raw),fingerprint=this.identity.fingerprint({operation:'dating.date.enter',id,input});const result=await this.matching.withAccepted(token,id,async(db,scope)=>{await this.guard(db,scope);if(!this.sessions.get(scope.actor.sessionId)?.sockets.size)throw denied();let row=await this.row(db,id,true);const old=await this.prior(db,scope.actor.accountId,key,fingerprint);if(old)return {row,scope};const mine=scope.actor.accountId===scope.a,column=mine?'entered_a':'entered_b';if(input.expectedVersion!==(row?.version??0)||row?.[column])throw new DomainError('NOT_AVAILABLE',409,'Refresh before choosing private conversation');if(!row){const at=this.now();row=(await db.query<DateRow>("INSERT INTO restricted_dating_dates(proposal_id,owner_epoch,phase,created_at,changed_at,expires_at) VALUES($1,$2,'WAITING',$3,$3,$4) RETURNING *",[id,this.epoch,new Date(at),new Date(scope.until)])).rows[0];}
   const active=mine?row.entered_b:row.entered_a,connection=mine?'connection_a':'connection_b';row=(await db.query<DateRow>(`UPDATE restricted_dating_dates SET ${column}=true,${connection}=$4,phase=$2::text,version=version+1,changed_at=$3::timestamptz,started_at=CASE WHEN $2::text='ACTIVE' THEN $3::timestamptz ELSE NULL::timestamptz END WHERE proposal_id=$1 RETURNING *`,[id,active?'ACTIVE':'WAITING',new Date(this.now()),this.sessions.get(scope.actor.sessionId)!.generation])).rows[0];await db.query("INSERT INTO restricted_dating_date_mutations VALUES($1,$2,$3,'enter',$4,NULL,$5)",[scope.actor.accountId,key,id,fingerprint,new Date(this.now())]);return {row,scope};});return this.view(result.row,result.scope);}
 async send(token:string,id:string,key:string,raw:unknown){const input=DatingDateChatSchema.parse(raw),fingerprint=this.identity.fingerprint({operation:'dating.date.chat',id,input});const result=await this.matching.withAccepted(token,id,async(db,scope)=>{
  await this.guard(db,scope,true);const row=await this.row(db,id,true);
  if(!row||row.phase!=='ACTIVE'||!row.entered_a||!row.entered_b||!this.connected(scope.sessionA)||!this.connected(scope.sessionB)||!this.policy.contexts.dating.cannedIds.includes(input.key))throw denied();
  const old=await this.prior(db,scope.actor.accountId,key,fingerprint);if(old)return {receipt:DatingDateChatReceiptSchema.parse({schemaVersion:1,recorded:true,messageId:old.message_id}),scope,message:null};
  const stats=(await db.query<{total:number;hour:number;last:Date|null}>("SELECT count(*) FILTER(WHERE proposal_id=$2)::int AS total,count(*) FILTER(WHERE created_at>$3)::int AS hour,max(created_at) AS last FROM restricted_dating_date_mutations WHERE account_id=$1 AND operation='chat'",[scope.actor.accountId,id,new Date(this.now()-3600000)])).rows[0];
  if(stats.total>=20||stats.hour>=60||stats.last&&this.now()-stats.last.getTime()<2000)throw new DomainError('RATE_LIMITED',429,'Please wait before another message');
  const message:Message={id:randomUUID(),key:input.key,actor:scope.actor.accountId,sentAt:this.now()};
  await db.query("INSERT INTO restricted_dating_date_mutations VALUES($1,$2,$3,'chat',$4,$5,$6)",[scope.actor.accountId,key,id,fingerprint,message.id,new Date(message.sentAt)]);
  await this.guard(db,scope,true);
  return {receipt:DatingDateChatReceiptSchema.parse({schemaVersion:1,recorded:true,messageId:message.id}),scope,message};});
  // Only committed effects reach the ephemeral bounded feed. A receipt means
  // recorded,not delivery:Stop/expiry can win before the peer next observes it.
  if(result.message&&!this.feeds.has(id)&&this.feeds.size>=100)this.feeds.delete(this.feeds.keys().next().value!);
  if(result.message&&result.scope.until>this.now()){const feed=this.feeds.get(id)??{until:result.scope.until,messages:[]};feed.until=Math.min(feed.until,result.scope.until);if(!feed.messages.some(message=>message.id===result.message!.id))feed.messages.push(result.message);feed.messages=feed.messages.slice(-20);this.feeds.set(id,feed);}return result.receipt;
 }
 // Reporting/blocking uses historical own contact provenance,not current
 // eligibility,global visibility or a supplied peer account identifier.
 // Descriptor only. Continuation owner must capture/lock both accounts and
 // independently validate current proof/profile/safety before a positive choice.
 async continuationSource(db:PoolClient,account:string,id:string){const row=(await db.query<{id:string;account_a:string;account_b:string;phase:DateRow['phase'];created_at:Date;changed_at:Date;started_at:Date|null}>("SELECT p.id,p.account_a,p.account_b,d.phase,d.created_at,d.changed_at,d.started_at FROM restricted_dating_dates d JOIN restricted_dating_proposals p ON p.id=d.proposal_id WHERE p.id=$1 AND (p.account_a=$2 OR p.account_b=$2)",[id,account])).rows[0];if(!row||row.created_at.getTime()>this.now()||row.created_at.getTime()<=this.now()-DAY)throw denied();return row;}
 async recentContinuationSources(db:PoolClient,account:string){return (await db.query<{id:string;account_a:string;account_b:string;changed_at:Date}>("SELECT p.id,p.account_a,p.account_b,d.changed_at FROM restricted_dating_dates d JOIN restricted_dating_proposals p ON p.id=d.proposal_id WHERE (p.account_a=$1 OR p.account_b=$1) AND d.started_at IS NOT NULL AND d.phase='ENDED' AND d.created_at>$2 AND d.created_at<=$3 ORDER BY d.changed_at DESC,p.id LIMIT 20",[account,new Date(this.now()-DAY),new Date(this.now())])).rows;}
 async contact(token:string,id:string,requireStarted=true){const actor=await this.identity.authenticate(token),row=(await this.pool.query<{account_a:string;account_b:string;created_at:Date;started_at:Date|null}>("SELECT p.account_a,p.account_b,d.created_at,d.started_at FROM restricted_dating_dates d JOIN restricted_dating_proposals p ON p.id=d.proposal_id WHERE d.proposal_id=$1 AND (p.account_a=$2 OR p.account_b=$2)",[id,actor.accountId])).rows[0];if(!row||row.created_at.getTime()>this.now()||row.created_at.getTime()<=this.now()-DAY||requireStarted&&!row.started_at)throw denied();return {worldSlug:'dating',subjectId:actor.accountId===row.account_a?row.account_b:row.account_a,dateId:id};}
 async block(token:string,id:string,key:string){const context=await this.contact(token,id,false);await this.social.block(token,key,context.subjectId,true,false);return {schemaVersion:1 as const,blocked:true as const};}
 async exportAccount(account:string,db:PoolClient){const rows=(await db.query<{phase:string;created_at:Date;changed_at:Date}>('SELECT d.phase,d.created_at,d.changed_at FROM restricted_dating_dates d JOIN restricted_dating_proposals p ON p.id=d.proposal_id WHERE p.account_a=$1 OR p.account_b=$1 ORDER BY d.created_at DESC LIMIT 101',[account])).rows;return {schemaVersion:1,items:rows.slice(0,100).map(row=>({state:row.phase,createdAt:row.created_at.toISOString(),changedAt:row.changed_at.toISOString()})),truncated:rows.length>100};}
 maintain(){if(this.closed)return Promise.resolve();if(!this.maintenance)this.maintenance=(async()=>{for(const [id,feed]of this.feeds)if(feed.until<=this.now())this.feeds.delete(id);await this.pool.query('DELETE FROM restricted_dating_date_mutations WHERE (account_id,request_id) IN(SELECT account_id,request_id FROM restricted_dating_date_mutations WHERE created_at<$1 ORDER BY created_at LIMIT 100)',[new Date(this.now()-DAY)]);})().finally(()=>{this.maintenance=undefined;});return this.maintenance;}
 async close(){this.closed=true;await this.maintenance;await Promise.allSettled([...this.pending]);this.sessions.clear();this.feeds.clear();}
}
