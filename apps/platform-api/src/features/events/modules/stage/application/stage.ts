import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { z } from 'zod';
import { StageReadSchema,StageJoinSchema,StageAcceptSchema,StageEndSchema,StageSlotSchema,StageResultSchema,StageOwnSchema,StageStoppedSchema,StageViewSchema,TravelSourceSchema,type TravelSource } from '@virtual-city/contracts';
import { WorldError,type WorldRegistry } from '@virtual-city/world-sdk';
import type { IdentityService,IdentityContext } from '../../../../identity/modules/accounts/application/service';
import type { SocialService } from '../../../../social/modules/relationships/application/service';
import type { RoomService } from '../../../../rooms/modules/presence/application/service';
import { DomainError } from '../../../../../shared/common/errors';
import type { EventService,EventBookingContext } from '../../calendar/application/service';
import type { EventPermissions } from '../../calendar/application/permissions';
import { createStageRequest,advanceStage,StageTransitionError,type StageState,type StageAction } from './stage-lifecycle';
type Row={id:string;event_id:string;account_id:string;world_slug:string;policy_version:string;epoch:string;room_id:string;membership_id:string;consent_revision:number;offered_by:string|null;host_source:unknown;phase:StageState['phase'];version:number;created_at:Date;changed_at:Date;queue_expires_at:Date;offered_at:Date|null;offer_expires_at:Date|null;started_at:Date|null;ends_at:Date|null;closed_at:Date|null;reason:StageState['reason'];offer_seconds:number;slot_seconds:number;authority_until:Date;organizer_id:string;event_phase:string;event_ends_at:Date;event_world_version:string};
type Visit=(account:string,source:TravelSource)=>string[];
const uuid=z.uuid().transform(value=>value.toLowerCase()),DAY=86400000;
const unavailable=()=>new DomainError('NOT_AVAILABLE',404,'This stage slot is unavailable');
const changed=()=>new DomainError('NOT_AVAILABLE',409,'Refresh the stage before trying again');
const selection="SELECT s.*,e.organizer_id,e.phase AS event_phase,e.ends_at AS event_ends_at,e.world_version AS event_world_version FROM engine_event_stage_slots s JOIN engine_events e ON e.id=s.event_id ";
// Events owns durable logical slots. Room keeps all movement,chairs and admission.
export class StageService {
 #closed=false;#maintenance?:Promise<void>;
 constructor(private pool:Pick<Pool,'query'|'connect'>,private identity:IdentityService,private social:SocialService,private rooms:RoomService,private events:EventService,private permissions:EventPermissions,private registry:WorldRegistry,private now=Date.now){}
 private state(row:Row):StageState{return {phase:row.phase,version:row.version,createdAt:row.created_at.getTime(),changedAt:row.changed_at.getTime(),queueExpiresAt:row.queue_expires_at.getTime(),offeredAt:row.offered_at?.getTime()??null,offerExpiresAt:row.offer_expires_at?.getTime()??null,startedAt:row.started_at?.getTime()??null,endsAt:row.ends_at?.getTime()??null,closedAt:row.closed_at?.getTime()??null,reason:row.reason};}
 private view(row:Row){return StageSlotSchema.parse({id:row.id,eventId:row.event_id,worldSlug:row.world_slug,phase:row.phase,version:row.version,createdAt:row.created_at.toISOString(),queueExpiresAt:row.queue_expires_at.toISOString(),offerExpiresAt:row.offer_expires_at?.toISOString()??null,startedAt:row.started_at?.toISOString()??null,endsAt:row.ends_at?.toISOString()??null,closedAt:row.closed_at?.toISOString()??null,reason:row.reason});}
 private result(row:Row){return StageResultSchema.parse({schemaVersion:1,slot:this.view(row)});}
 private ended(row:Row){return row.phase==='ENDED';}
 private source(row:Row):TravelSource{return {epoch:row.epoch,roomId:row.room_id,membershipId:row.membership_id};}
 private async tx<T>(token:string,targets:string[],work:(db:PoolClient,actor:IdentityContext)=>Promise<T>){
  if(this.#closed)throw new DomainError('WORLD_UNAVAILABLE',503,'Stage unavailable');const initial=await this.identity.authenticate(token),db=await this.pool.connect();
  try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='2000ms'");await db.query("SET LOCAL lock_timeout='1000ms'");await this.identity.lockAccounts(db,[initial.accountId,...targets]);const actor=await this.identity.contextInTransaction(db,token),result=await work(db,actor);if(this.now()>=actor.expiresAt)throw unavailable();await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 private async revision(db:PoolClient,account:string){return (await db.query<{revision:number}>('SELECT revision FROM engine_event_stage_consent WHERE account_id=$1',[account])).rows[0]?.revision??0;}
 private async prior(db:PoolClient,actor:string,key:string,fingerprint:string){const row=(await db.query<{slot_id:string|null;fingerprint:string}>('SELECT slot_id,fingerprint FROM engine_event_stage_mutations WHERE actor_id=$1 AND request_id=$2',[actor,uuid.parse(key)])).rows[0];if(row&&row.fingerprint!==fingerprint)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Request key conflicts with an earlier action');return row;}
 private remember(db:PoolClient,actor:string,key:string,id:string|null,operation:string,fingerprint:string){return db.query('INSERT INTO engine_event_stage_mutations VALUES($1,$2,$3,$4,$5,$6)',[actor,uuid.parse(key),id,operation,fingerprint,new Date(this.now())]);}
 private async quota(db:PoolClient,actor:string){const row=(await db.query<{n:number}>("SELECT count(*)::int AS n FROM engine_event_stage_mutations WHERE actor_id=$1 AND operation IN ('join','offer','accept') AND created_at>$2",[actor,new Date(this.now()-3600000)])).rows[0];if(row.n>=60)throw new DomainError('RATE_LIMITED',429,'Please wait before requesting another stage action');}
 private async transition(db:PoolClient,row:Row,kind:StageAction['kind'],until=row.authority_until.getTime(),negative=false){
  let next:StageState;try{next=advanceStage(this.state(row),{kind},negative?Math.max(this.now(),row.changed_at.getTime()):this.now(),{offerSeconds:row.offer_seconds,slotSeconds:row.slot_seconds,authorityEndsAt:until});}catch(error){if(error instanceof StageTransitionError)throw new DomainError('WORLD_UNAVAILABLE',503,'Stage state unavailable');throw error;}
  if(next.version!==row.version){const date=(value:number|null)=>value===null?null:new Date(value);Object.assign(row,(await db.query<Row>("UPDATE engine_event_stage_slots SET phase=$2,version=$3,changed_at=$4,offered_at=$5,offer_expires_at=$6,started_at=$7,ends_at=$8,closed_at=$9,reason=$10,checked_order=nextval('engine_stage_recovery') WHERE id=$1 RETURNING *",[row.id,next.phase,next.version,date(next.changedAt),date(next.offeredAt),date(next.offerExpiresAt),date(next.startedAt),date(next.endsAt),date(next.closedAt),next.reason])).rows[0]);}return row;
 }
 private async hostUntil(db:PoolClient,account:string,context:Pick<EventBookingContext,'id'|'organizerId'|'worldSlug'>){return Math.max(context.organizerId===account?await this.permissions.stageUntil(db,account,context.worldSlug,context.id,'organizer'):0,await this.permissions.stageUntil(db,account,context.worldSlug,context.id,'moderator'));}
 private async authority(db:PoolClient,row:Row,visit:Visit){
  if(row.phase==='ENDED')return 0;
  if(['ENDED','CANCELLED'].includes(row.event_phase)||this.now()>=row.event_ends_at.getTime()){await this.transition(db,row,'event-end');return 0;}
  let context:ReturnType<WorldRegistry['projectionContext']>;try{context=this.registry.projectionContext(row.world_slug);}catch(error){if(!(error instanceof WorldError))throw error;await this.transition(db,row,'authority-lost');return 0;}
  const policy=context.definition.stagePolicy;
  let until=Math.min(row.authority_until.getTime(),row.event_ends_at.getTime(),await this.identity.connectedAuthority(db,row.account_id,visit(row.account_id,this.source(row))),await this.permissions.stageUntil(db,row.account_id,row.world_slug,row.event_id,'performer'));
  let allowed=!!policy&&policy.version===row.policy_version&&context.definition.version===row.event_world_version&&context.valid()&&await this.revision(db,row.account_id)===row.consent_revision&&await this.events.eligible(db,row.account_id,row.world_slug)&&await this.events.eligible(db,row.organizer_id,row.world_slug)&&await this.rooms.activityAllowed(row.account_id,row.world_slug,row.room_id)&&!await this.social.isBlocked(row.account_id,row.organizer_id,db);
  if(row.phase!=='QUEUED'){
   const source=TravelSourceSchema.safeParse(row.host_source),host=row.offered_by;
   if(!source.success||!host)allowed=false;
   else{until=Math.min(until,await this.identity.connectedAuthority(db,host,visit(host,source.data)),await this.hostUntil(db,host,{id:row.event_id,organizerId:row.organizer_id,worldSlug:row.world_slug}));allowed=allowed&&await this.events.eligible(db,host,row.world_slug)&&await this.rooms.activityAllowed(host,row.world_slug,row.room_id)&&!await this.social.isBlocked(row.account_id,host,db);}
  }
  if(until===0)allowed=false;
  await this.transition(db,row,allowed?'observe':'authority-lost',until||row.authority_until.getTime());return this.ended(row)?0:until;
 }
 private async known(id:string){const row=(await this.pool.query<Row>(selection+'WHERE s.id=$1',[uuid.parse(id)])).rows[0];if(!row)throw unavailable();return row;}
 private async ownReplay(token:string,key:string,fingerprint:string){return this.tx(token,[],async(db,actor)=>{const prior=await this.prior(db,actor.accountId,key,fingerprint);if(!prior?.slot_id)return null;const row=(await db.query<Row>(selection+'WHERE s.id=$1 AND s.account_id=$2',[prior.slot_id,actor.accountId])).rows[0];return row?.phase==='ENDED'?this.result(row):null;});}
 private async inRoom<T>(token:string,eventId:string,source:TravelSource,work:(db:PoolClient,actor:IdentityContext,context:EventBookingContext,rows:Row[],visit:Visit)=>Promise<T>){
  await this.identity.authenticate(token);const event=(await this.pool.query<{world_slug:string}>('SELECT world_slug FROM engine_events WHERE id=$1',[eventId])).rows[0];if(!event)throw unavailable();
  return this.rooms.reservationCheckIn(token,source,event.world_slug,async(valid,visit)=>{
   const refs=(await this.pool.query<{account_id:string;offered_by:string|null}>("SELECT account_id,offered_by FROM engine_event_stage_slots WHERE room_id=$1 AND phase<>'ENDED'",[source.roomId])).rows,targets=[...new Set(refs.flatMap(row=>[row.account_id,...row.offered_by?[row.offered_by]:[]]))];
   return this.events.withBooking(token,eventId,async(db,actor,context)=>{
    if(!context.definition?.stagePolicy||!['OPEN','LIVE'].includes(context.phase)||context.visibility!=='listed')throw unavailable();
    const rows=(await db.query<Row>(selection+"WHERE s.room_id=$1 AND s.phase<>'ENDED' ORDER BY s.creation_order FOR UPDATE OF s",[source.roomId])).rows;
    if(rows.some(row=>!targets.includes(row.account_id)||row.offered_by&&!targets.includes(row.offered_by)))throw new DomainError('WORLD_UNAVAILABLE',503,'Stage queue changed; retry');
    for(const row of rows)await this.authority(db,row,visit);
    return work(db,actor,context,rows,visit);
   },false,valid,targets);
  });
 }
 private clockFence(row:Row,until:number){const deadline=Math.min(until,row.phase==='ACTIVE'?row.ends_at!.getTime():row.phase==='OFFERED'?row.offer_expires_at!.getTime():row.queue_expires_at.getTime());if(this.now()>=deadline)throw changed();}
 async join(token:string,key:string,raw:unknown){
  const input=StageJoinSchema.parse(raw),fingerprint=this.identity.fingerprint({operation:'stage.join',input}),old=await this.ownReplay(token,key,fingerprint);if(old)return old;
  return this.inRoom(token,input.eventId,input.source,async(db,actor,context,rows,visit)=>{
   const prior=await this.prior(db,actor.accountId,key,fingerprint);if(prior?.slot_id){const row=(await db.query<Row>(selection+'WHERE s.id=$1 AND s.account_id=$2',[prior.slot_id,actor.accountId])).rows[0];if(!row)throw unavailable();return this.result(row);}
   if(actor.kind!=='registered'||await this.revision(db,actor.accountId)!==input.expectedRevision)throw unavailable();const policy=context.definition!.stagePolicy!,until=Math.min(Date.parse(context.schedule.endsAt),await this.identity.connectedAuthority(db,actor.accountId,visit(actor.accountId,input.source)),await this.permissions.stageUntil(db,actor.accountId,context.worldSlug,context.id,'performer'));
   if(until<=this.now())throw unavailable();if(rows.filter(row=>row.phase!=='ENDED').length>=policy.maxQueue||(await db.query("SELECT 1 FROM engine_event_stage_slots WHERE account_id=$1 AND phase<>'ENDED'",[actor.accountId])).rowCount)throw changed();await this.quota(db,actor.accountId);
   const at=this.now(),state=createStageRequest(at,Math.min(at+policy.waitSeconds*1000,until));
   const row=(await db.query<Row>("INSERT INTO engine_event_stage_slots(id,event_id,account_id,world_slug,policy_version,epoch,room_id,membership_id,consent_revision,phase,version,created_at,changed_at,queue_expires_at,offer_seconds,slot_seconds,authority_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'QUEUED',0,$10,$10,$11,$12,$13,$14) RETURNING *",[randomUUID(),context.id,actor.accountId,context.worldSlug,policy.version,input.source.epoch,input.source.roomId,input.source.membershipId,input.expectedRevision,new Date(at),new Date(state.queueExpiresAt),policy.offerSeconds,policy.slotSeconds,new Date(until)])).rows[0];
   await this.remember(db,actor.accountId,key,row.id,'join',fingerprint);this.clockFence(row,until);return this.result(row);
  });
 }
 async offer(token:string,key:string,raw:unknown){const input=StageReadSchema.parse(raw),fingerprint=this.identity.fingerprint({operation:'stage.offer',input});return this.inRoom(token,input.eventId,input.source,async(db,actor,context,rows,visit)=>{
  const until=Math.min(Date.parse(context.schedule.endsAt),await this.hostUntil(db,actor.accountId,context),await this.identity.connectedAuthority(db,actor.accountId,visit(actor.accountId,input.source)));if(until<=this.now()||context.phase!=='LIVE')throw unavailable();const previous=await this.prior(db,actor.accountId,key,fingerprint);if(previous?.slot_id){const row=(await db.query<Row>(selection+'WHERE s.id=$1',[previous.slot_id])).rows[0];if(!row)throw unavailable();return this.result(row);}
  if(rows.some(row=>['ACTIVE','OFFERED'].includes(row.phase)))throw changed();const row=rows.find(row=>row.phase==='QUEUED');if(!row||row.event_id!==context.id)throw changed();if(await this.social.isBlocked(actor.accountId,row.account_id,db))throw unavailable();await this.quota(db,actor.accountId);
  row.offered_by=actor.accountId;row.host_source=input.source;row.authority_until=new Date(Math.min(until,row.authority_until.getTime()));await db.query('UPDATE engine_event_stage_slots SET offered_by=$2,host_source=$3,authority_until=$4 WHERE id=$1',[row.id,actor.accountId,input.source,row.authority_until]);await this.transition(db,row,'offer');await this.remember(db,actor.accountId,key,row.id,'offer',fingerprint);this.clockFence(row,row.authority_until.getTime());return this.result(row);
 });}
 async accept(token:string,id:string,key:string,raw:unknown){const input=StageAcceptSchema.parse(raw),fingerprint=this.identity.fingerprint({operation:'stage.accept',id:uuid.parse(id),input}),old=await this.ownReplay(token,key,fingerprint);if(old)return old;const known=await this.known(id);return this.inRoom(token,known.event_id,input.source,async(db,actor,context,rows,visit)=>{
  const row=rows.find(row=>row.id===known.id);if(!row||row.account_id!==actor.accountId)throw unavailable();const previous=await this.prior(db,actor.accountId,key,fingerprint);if(previous)return this.result(row);if(context.phase!=='LIVE'||row.phase!=='OFFERED'||row.version!==input.expectedVersion||row.consent_revision!==input.expectedRevision||await this.revision(db,actor.accountId)!==input.expectedRevision||JSON.stringify(this.source(row))!==JSON.stringify(input.source))throw changed();
  const until=await this.authority(db,row,visit);if(this.ended(row))throw changed();await this.quota(db,actor.accountId);await this.transition(db,row,'accept',until);await this.remember(db,actor.accountId,key,row.id,'accept',fingerprint);this.clockFence(row,Math.min(until,row.offer_expires_at!.getTime()));return this.result(row);
 });}
 async end(token:string,id:string,key:string,operation:'withdraw'|'revoke',raw:unknown){const input=StageEndSchema.parse(raw),known=await this.known(id),fingerprint=this.identity.fingerprint({operation:'stage.'+operation,id:known.id,input});return this.events.withBooking(token,known.event_id,async(db,actor,context)=>{
  const row=(await db.query<Row>(selection+'WHERE s.id=$1 FOR UPDATE OF s',[known.id])).rows[0];if(!row||operation==='withdraw'&&row.account_id!==actor.accountId||operation==='revoke'&&await this.hostUntil(db,actor.accountId,context)<=this.now())throw unavailable();const previous=await this.prior(db,actor.accountId,key,fingerprint);if(!previous){if(row.phase!=='ENDED'&&row.version!==input.expectedVersion)throw changed();await this.transition(db,row,operation,undefined,true);await this.remember(db,actor.accountId,key,row.id,operation,fingerprint);}return this.result(row);
 },true,undefined,[known.account_id,...known.offered_by?[known.offered_by]:[]]);}
 async stop(token:string,key:string){const fingerprint=this.identity.fingerprint({operation:'stage.stop'});return this.tx(token,[],async(db,actor)=>{
  if(!await this.prior(db,actor.accountId,key,fingerprint)){await db.query('INSERT INTO engine_event_stage_consent VALUES($1,1) ON CONFLICT(account_id) DO UPDATE SET revision=engine_event_stage_consent.revision+1',[actor.accountId]);const rows=(await db.query<Row>(selection+"WHERE s.account_id=$1 AND s.phase<>'ENDED' ORDER BY s.creation_order FOR UPDATE OF s",[actor.accountId])).rows;for(const row of rows)await this.transition(db,row,'withdraw',undefined,true);await this.remember(db,actor.accountId,key,null,'stop',fingerprint);}return StageStoppedSchema.parse({schemaVersion:1,stopped:true,revision:await this.revision(db,actor.accountId)});
 });}
 async own(token:string){const actor=await this.identity.authenticate(token);return this.rooms.visitRecovery(async visit=>{
  const refs=(await this.pool.query<Row>(selection+"WHERE s.account_id=$1 AND s.phase<>'ENDED'",[actor.accountId])).rows,targets=[...new Set(refs.flatMap(row=>[row.organizer_id,...row.offered_by?[row.offered_by]:[]]))];
  return this.tx(token,targets,async db=>{const rows=(await db.query<Row>(selection+'WHERE s.account_id=$1 ORDER BY s.creation_order DESC LIMIT 21 FOR UPDATE OF s',[actor.accountId])).rows;
   if(rows.some(row=>row.phase!=='ENDED'&&(!targets.includes(row.organizer_id)||row.offered_by&&!targets.includes(row.offered_by))))throw new DomainError('WORLD_UNAVAILABLE',503,'Stage authority changed; refresh');
   for(const row of rows)if(!this.ended(row))await this.authority(db,row,(account,source)=>visit(account,source).sessionIds);
   return StageOwnSchema.parse({schemaVersion:1,revision:await this.revision(db,actor.accountId),items:rows.slice(0,20).map(row=>this.view(row)),truncated:rows.length>20});
  });
 });}
 async viewStage(token:string,raw:unknown){const input=StageReadSchema.parse(raw);return this.inRoom(token,input.eventId,input.source,async(db,actor,context,rows)=>{
  const performerUntil=await this.permissions.stageUntil(db,actor.accountId,context.worldSlug,context.id,'performer'),hostUntil=context.organizerId===actor.accountId?await this.permissions.stageUntil(db,actor.accountId,context.worldSlug,context.id,'organizer'):0,moderatorUntil=await this.permissions.stageUntil(db,actor.accountId,context.worldSlug,context.id,'moderator');
  const at=this.now(),performer=performerUntil>at,host=hostUntil>at,moderator=moderatorUntil>at,items=rows.filter(row=>row.event_id===context.id&&row.phase!=='ENDED');return StageViewSchema.parse({schemaVersion:1,serverTime:at,occupied:rows.some(row=>row.phase==='ACTIVE'),own:items.find(row=>row.account_id===actor.accountId)?this.view(items.find(row=>row.account_id===actor.accountId)!):null,permissions:{performer,host,moderator},...host||moderator?{controls:{items:items.slice(0,10).map(row=>this.view(row)),truncated:items.length>10}}:{}});
 });}
 async observed(db:PoolClient,context:EventBookingContext,at:number){if(['ENDED','CANCELLED'].includes(context.phase))await db.query("UPDATE engine_event_stage_slots SET phase='ENDED',version=version+1,closed_at=greatest(changed_at,$2),changed_at=greatest(changed_at,$2),reason='event-ended' WHERE event_id=$1 AND phase<>'ENDED'",[context.id,new Date(at)]);}
 async participants(db:Pick<Pool,'query'>,id:string){return (await db.query<{account_id:string}>("SELECT account_id FROM engine_event_stage_slots WHERE event_id=$1 AND phase<>'ENDED'",[id])).rows.map(row=>row.account_id);}
 async withdrawContact(db:PoolClient,a:string,b:string){if(!await this.social.isBlocked(a,b,db))return;await db.query("UPDATE engine_event_stage_slots s SET phase='ENDED',version=s.version+1,closed_at=greatest(s.changed_at,$3),changed_at=greatest(s.changed_at,$3),reason='authority-lost' FROM engine_events e WHERE s.event_id=e.id AND s.phase<>'ENDED' AND ((s.account_id=$1 AND (s.offered_by=$2 OR e.organizer_id=$2)) OR (s.account_id=$2 AND (s.offered_by=$1 OR e.organizer_id=$1)))",[a,b,new Date(this.now())]);}
 async exportAccount(account:string,db:PoolClient){const rows=(await db.query<Row>(selection+'WHERE s.account_id=$1 ORDER BY s.creation_order DESC LIMIT 101',[account])).rows;return {schemaVersion:1,revision:await this.revision(db,account),items:rows.slice(0,100).map(row=>this.view(row)),truncated:rows.length>100};}
 async redactAccount(account:string,db:PoolClient){await db.query("UPDATE engine_event_stage_slots SET phase='ENDED',version=version+CASE WHEN phase='ENDED' THEN 0 ELSE 1 END,closed_at=coalesce(closed_at,greatest(changed_at,$2)),changed_at=greatest(changed_at,$2),reason=coalesce(reason,'authority-lost'),offered_by=NULL,host_source=NULL WHERE offered_by=$1",[account,new Date(this.now())]);}
 maintain(){if(this.#closed)return Promise.resolve();if(!this.#maintenance)this.#maintenance=this.rooms.visitRecovery(async visit=>{
  const refs=(await this.pool.query<Row>(selection+"WHERE s.phase<>'ENDED' ORDER BY s.checked_order,s.creation_order LIMIT 20")).rows;
  for(const ref of refs){const db=await this.pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='2000ms'");await db.query("SET LOCAL lock_timeout='1000ms'");await this.identity.lockAccounts(db,[ref.account_id,ref.organizer_id,...ref.offered_by?[ref.offered_by]:[]]);const row=(await db.query<Row>(selection+'WHERE s.id=$1 FOR UPDATE OF s',[ref.id])).rows[0];if(row){if(row.offered_by!==ref.offered_by)throw new DomainError('WORLD_UNAVAILABLE',503,'Stage authority changed; retry recovery');await this.authority(db,row,(account,source)=>visit(account,source).sessionIds);await db.query("UPDATE engine_event_stage_slots SET checked_order=nextval('engine_stage_recovery') WHERE id=$1",[row.id]);}await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
  await this.pool.query("DELETE FROM engine_event_stage_mutations WHERE (actor_id,request_id) IN(SELECT actor_id,request_id FROM engine_event_stage_mutations WHERE slot_id IS NULL AND created_at<$1 ORDER BY created_at,actor_id,request_id LIMIT 100)",[new Date(this.now()-90*DAY)]);
 }).finally(()=>{this.#maintenance=undefined;});return this.#maintenance;}
 async close(){this.#closed=true;await this.#maintenance;}
}
