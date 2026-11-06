import type {PoolClient} from 'pg';
import {OperatorEventCommandSchema,OperatorEventConfigSchema,OperatorEventDraftSchema,OperatorEventRangeSchema,OperatorEventQuerySchema,OperatorEventCalendarSchema,OperatorEventSnapshotSchema,OperatorEventReceiptSchema,OperatorEventAuditSchema} from '@virtual-city/contracts';
import type {IdentityService} from '../identity/service';
import type {OperatorService} from '../identity/operator-service';
import {DomainError} from '../common/errors';
import type {EventService} from './service';
type Seal=(purpose:string,value:unknown)=>string;
type Row={id:string;organizer_id:string;config:unknown;state:'DRAFT'|'PUBLISHED'|'CANCELLED';version:number;event_id:string|null;created_at:Date;changed_at:Date;retain_until:Date;live_id:string|null;live_phase:string|null;live_version:number|null};
const DAY=86400000,select='SELECT d.*,e.id AS live_id,e.phase AS live_phase,e.version AS live_version FROM engine_event_drafts d LEFT JOIN engine_events e ON e.id=d.event_id ';
const conflict=()=>new DomainError('IDEMPOTENCY_CONFLICT',409,'Event changed; refresh before retrying'),missing=()=>new DomainError('NOT_FOUND',404,'Event draft unavailable');
export class OperatorEventCalendar {
 constructor(private identity:IdentityService,private operator:OperatorService,private events:EventService,private now=Date.now){}
 private view(row:Row){return OperatorEventDraftSchema.parse({id:row.id,version:row.version,state:row.state,config:row.config,live:row.live_id?{id:row.live_id,phase:row.live_phase,version:row.live_version}:null,createdAt:row.created_at.toISOString(),changedAt:row.changed_at.toISOString(),retainedUntil:row.retain_until.toISOString()});}
 private snapshot(row:Row,seal:Seal){const v=this.view(row);return OperatorEventSnapshotSchema.parse({version:v.version,state:v.state,organizerRef:seal('event-organizer',v.config.organizerId),titleRef:seal('event-title',v.config.event.title),worldSlug:v.config.event.worldSlug,visibility:v.config.event.visibility,capacity:v.config.event.capacity,schedule:v.config.event.schedule,live:v.live});}
 private async row(db:PoolClient,id:string,lock=false){return (await db.query<Row>(select+'WHERE d.id=$1'+(lock?' FOR UPDATE OF d':''),[id])).rows[0];}
 async calendar(token:string,input:unknown){const value=OperatorEventRangeSchema.parse(input);return this.operator.controlRead(token,async db=>{const rows=(await db.query<Row>(select+"WHERE d.retain_until>$3 AND (d.config->'event'->'schedule'->>'opensAt')::timestamptz<$2 AND (d.config->'event'->'schedule'->>'endsAt')::timestamptz>$1 ORDER BY d.config->'event'->'schedule'->>'startsAt',d.id LIMIT 51 OFFSET $4",[value.from,value.until,new Date(this.now()),value.offset??0])).rows;return OperatorEventCalendarSchema.parse({drafts:rows.slice(0,50).map(row=>this.view(row)),truncated:rows.length>50});});}
 async audit(token:string,input:unknown){const {draftId}=OperatorEventQuerySchema.parse(input);return this.operator.controlRead(token,async(db,_subject,seal)=>{const rows=(await db.query<{request_id:string;action:string;reason:string;before_state:unknown;after_state:unknown;occurred_at:Date;previous_hash:string;event_hash:string}>('SELECT * FROM engine_event_operator_audit WHERE draft_ref=$1 ORDER BY sequence DESC LIMIT 20',[seal('event-draft',draftId)])).rows;return OperatorEventAuditSchema.parse({events:rows.map(row=>({requestId:row.request_id,action:row.action,reason:row.reason,before:row.before_state,after:row.after_state,occurredAt:row.occurred_at.toISOString(),previousHash:row.previous_hash,eventHash:row.event_hash}))});});}
 async command(token:string,csrf:unknown,input:unknown){const value=OperatorEventCommandSchema.parse(input);let cancellation:string|undefined;
  try{const result=await this.operator.controlWrite(token,csrf,async(db,subject,seal)=>{
   const fingerprint=seal('event-command',value),prior=(await db.query<{fingerprint:string;before_state:unknown;after_state:unknown}>('SELECT fingerprint,before_state,after_state FROM engine_event_operator_audit WHERE request_id=$1',[value.requestId])).rows[0];
   if(prior){if(prior.fingerprint!==fingerprint)throw conflict();const receipt=OperatorEventReceiptSchema.parse({requestId:value.requestId,draftId:value.draftId,before:prior.before_state,after:prior.after_state});if(value.action==='cancel')cancellation=receipt.after.live?.id;return receipt;}
   const budget=(await db.query<{n:number;publishes:number}>("SELECT count(*)::int AS n,count(*) FILTER(WHERE action='publish')::int AS publishes FROM engine_event_operator_audit WHERE occurred_at>clock_timestamp()-interval '1 hour'")).rows[0];if(budget.n>=30||value.action==='publish'&&budget.publishes>=12)throw new DomainError('RATE_LIMITED',429,'Please wait before another event command');
   const known=await this.row(db,value.draftId),organizer=value.action==='save'?value.config.organizerId:known?.organizer_id;if(!organizer)throw missing();
   const targets=value.action==='cancel'&&known?.event_id?await this.events.operatorTargets(db,known.event_id):[];
   await this.identity.lockAccounts(db,[organizer,...known?[known.organizer_id]:[],...targets]);
   let row=await this.row(db,value.draftId,true);if(row&&(row.retain_until.getTime()<=this.now()||this.now()<row.changed_at.getTime()))throw conflict();
   if((row?.version??0)!==value.expectedVersion)throw conflict();const before=row?this.snapshot(row,seal):null;
   const remember=async()=>{const after=this.snapshot(row!,seal),at=new Date(this.now()).toISOString(),previous=(await db.query<{event_hash:string}>('SELECT event_hash FROM engine_event_operator_audit ORDER BY sequence DESC LIMIT 1')).rows[0]?.event_hash??'0'.repeat(64),event=[value.requestId,subject,seal('event-draft',value.draftId),fingerprint,value.action,value.reason,before,after,at,previous];await db.query('INSERT INTO engine_event_operator_audit(request_id,subject,draft_ref,fingerprint,action,reason,before_state,after_state,occurred_at,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[...event,seal('event-audit',event)]);return OperatorEventReceiptSchema.parse({requestId:value.requestId,draftId:value.draftId,before,after});};
   if(value.action==='save'){
    if(row&&row.state!=='DRAFT')throw conflict();const actor=(await db.query<{kind:string;status:string}>('SELECT kind,status FROM identity_accounts WHERE id=$1 FOR UPDATE',[organizer])).rows[0];if(!actor||actor.kind!=='registered'||actor.status!=='active')throw missing();
    if(!row&&(await db.query("SELECT count(*)::int AS n FROM engine_event_drafts WHERE state='DRAFT' AND retain_until>$1",[new Date(this.now())])).rows[0].n>=100)throw new DomainError('RATE_LIMITED',429,'The draft calendar is full');
    if(row)await db.query('UPDATE engine_event_drafts SET organizer_id=$2,config=$3,version=version+1,changed_at=$4,retain_until=$5 WHERE id=$1',[row.id,organizer,OperatorEventConfigSchema.parse(value.config),new Date(this.now()),new Date(this.now()+30*DAY)]);
    else await db.query("INSERT INTO engine_event_drafts VALUES($1,$2,$3,'DRAFT',1,NULL,$4,$4,$5)",[value.draftId,organizer,OperatorEventConfigSchema.parse(value.config),new Date(this.now()),new Date(this.now()+30*DAY)]);
    row=await this.row(db,value.draftId,true);return remember();
   }
   if(!row)throw missing();
   if(value.action==='publish'){
    if(row.state!=='DRAFT')throw conflict();const config=OperatorEventConfigSchema.parse(row.config);
    return this.events.withOperatorPublication(db,organizer,config.event,async live=>{await db.query("UPDATE engine_event_drafts SET state='PUBLISHED',event_id=$2,version=version+1,changed_at=$3,retain_until=$4 WHERE id=$1",[row!.id,live.id,new Date(this.now()),new Date(Date.parse(config.event.schedule.endsAt)+90*DAY)]);row=await this.row(db,value.draftId,true);return remember();});
   }
   if(row.state==='CANCELLED')throw conflict();
   const finish=async()=>{await db.query("UPDATE engine_event_drafts SET state='CANCELLED',version=version+1,changed_at=$2,retain_until=$3 WHERE id=$1",[row!.id,new Date(this.now()),new Date(this.now()+90*DAY)]);row=await this.row(db,value.draftId,true);return remember();};
   if(row.state==='DRAFT'){if(value.expectedEventVersion!==null)throw conflict();return finish();}
   if(!row.event_id||value.expectedEventVersion===null)throw conflict();cancellation=row.event_id;return this.events.withOperatorCancellation(db,row.event_id,value.expectedEventVersion,targets,finish);
  });if(cancellation)await this.events.reconcileOperatorCancellation(cancellation);return result;
  }catch(error){if(cancellation){try{await this.events.reconcileOperatorCancellation(cancellation);}catch{/* Unknown acknowledgement never assumes an effect; canonical SQL controls the hint. */}}throw error;}
 }
}
