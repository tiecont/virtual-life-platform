import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { StudySharingInputSchema,StudySharingStateSchema,StudyViewInputSchema,StudyViewSchema,type StudySharingState,type TravelSource } from '@virtual-city/contracts';
import type { IdentityContext,IdentityService } from '../../../../identity/modules/accounts/application/service';
import type { RoomService } from '../../../../rooms/modules/presence/application/service';
import type { EventService } from '../../../../events/modules/calendar/application/service';
import type { FocusService } from '../../../../focus/modules/timers/application/service';
import { DomainError } from '../../../../../shared/common/errors';
import { WindowLimiter } from '../../../../identity/modules/accounts/domain/limits';
type Consent={source:TravelSource;eventId:string;createdAt:number;until:number;exists:()=>boolean;valid:()=>boolean};
type State={revision:string;lastAt:number;consent?:Consent;receipts:Map<string,{fingerprint:string;session:string;until:number}>};
const unavailable=()=>new DomainError('NOT_AVAILABLE',404,'Study progress unavailable');
const changed=()=>new DomainError('IDEMPOTENCY_CONFLICT',409,'Study consent changed. Refresh before sharing');
// Ephemeral consent belongs to this process/visit. It is never a persisted
// privacy preference or another focus/session repository.
export class LibraryStudyService{
 #states=new Map<string,State>();#closed=false;#active=0;#accounts=new Map<string,number>();#last=0;#limits:WindowLimiter;#cleanup:ReturnType<typeof setInterval>;#unsubscribe:(()=>void)[]=[];
 constructor(private identity:IdentityService,private rooms:Pick<RoomService,'studyProjection'>,private events:Pick<EventService,'studyParticipants'|'onParticipationEnded'>,private focus:Pick<FocusService,'studyPhases'>,private now=Date.now){
  this.#limits=new WindowLimiter(now);this.#unsubscribe.push(identity.onRevoked(event=>this.revoke(event.accountId)),identity.onChanged(id=>this.revoke(id)),events.onParticipationEnded((eventId,accounts)=>{for(const id of accounts)if(this.#states.get(id)?.consent?.eventId===eventId)this.revoke(id);}));
  this.#cleanup=setInterval(()=>this.prune(),10000);this.#cleanup.unref();
 }
 private time(){const at=this.now();if(!Number.isSafeInteger(at)||at<this.#last)throw new DomainError('WORLD_UNAVAILABLE',503,'Study clock unavailable');this.#last=at;return at;}
 private prune(){const at=this.now();for(const [id,state]of this.#states){for(const [key,receipt]of state.receipts)if(receipt.until<=at)state.receipts.delete(key);if(state.consent&&(at>=state.consent.until||!state.consent.exists()))this.clear(state);if(at-state.lastAt>600000&&!state.consent)this.#states.delete(id);}}
 private clear(state:State){state.revision=randomUUID();state.consent=undefined;}
 revoke(account:string){this.#states.delete(account);}
 private active(state:State|undefined){if(!state?.consent)return false;const c=state.consent,at=this.now();if(at<c.createdAt||at>=c.until||!c.exists()){this.clear(state);return false;}return c.valid();}
 private own(state:State|undefined):StudySharingState{return StudySharingStateSchema.parse({schemaVersion:1,sharing:this.active(state),revision:state?.revision??null});}
 private ensure(account:string){let state=this.#states.get(account);if(!state){this.prune();if(this.#states.size>=512)throw new DomainError('RATE_LIMITED',429,'Study sharing is busy');state={revision:randomUUID(),lastAt:this.time(),receipts:new Map()};this.#states.set(account,state);}state.lastAt=this.time();return state;}
 private matches(consent:Consent|undefined,source:TravelSource,event:string){return !!consent&&consent.eventId===event&&consent.source.epoch===source.epoch&&consent.source.roomId===source.roomId&&consent.source.membershipId===source.membershipId;}
 private finish(began:number){if(this.#closed||this.time()-began>=5000)throw new DomainError('WORLD_UNAVAILABLE',503,'Study observation expired');}
 private async job<T>(token:string,work:(actor:IdentityContext,began:number)=>Promise<T>){
  if(this.#closed)throw unavailable();if(this.#active>=8)throw new DomainError('RATE_LIMITED',429,'Study progress is busy');this.#active++;let account:string|undefined;
  try{const began=this.time(),actor=await this.identity.authenticate(token);if((this.#accounts.get(actor.accountId)??0)>=2)throw new DomainError('RATE_LIMITED',429,'Study progress is busy');account=actor.accountId;this.#accounts.set(account,(this.#accounts.get(account)??0)+1);this.finish(began);return await work(actor,began);}
  finally{this.#active--;if(account){const count=(this.#accounts.get(account)??1)-1;if(count)this.#accounts.set(account,count);else this.#accounts.delete(account);}}
 }
 private async context(token:string,input:{source:TravelSource;eventId:string}){
  const room=await this.rooms.studyProjection(token,input.source);if(room.worldSlug!=='library'||room.capacity!==8)throw unavailable();
  const event=await this.events.studyParticipants(token,input.eventId,'library',room.members.map(member=>member.accountId));if(!room.valid())throw unavailable();return {room,event};
 }
 async state(token:string){if(this.#closed)throw unavailable();const actor=await this.identity.authenticate(token);this.prune();return this.own(this.#states.get(actor.accountId));}
 exportAccount(account:string){const state=this.#states.get(account),own=this.own(state);return {schemaVersion:1,ephemeral:true,sharing:own.sharing,...own.sharing&&state?.consent?{eventId:state.consent.eventId,expiresAt:new Date(state.consent.until).toISOString()}: {}};}
 async change(token:string,key:string,raw:unknown){
  const input=StudySharingInputSchema.parse(raw),request=z.uuid().parse(key),fingerprint=this.identity.fingerprint(input);
  const prior=(state:State|undefined,actor:IdentityContext)=>{const receipt=state?.receipts.get(request);if(receipt&&receipt.until>this.now()){if(receipt.session!==actor.sessionId||receipt.fingerprint!==fingerprint)throw changed();return this.own(state);}return null;};
  const remember=(state:State,actor:IdentityContext)=>{while(state.receipts.size>=64)state.receipts.delete(state.receipts.keys().next().value!);state.receipts.set(request,{session:actor.sessionId,fingerprint,until:Math.max(this.#last,this.now())+600000});state.lastAt=Math.max(this.#last,this.now());};
  if(!input.sharing){if(this.#closed)throw unavailable();const actor=await this.identity.authenticate(token),state=this.#states.get(actor.accountId),old=prior(state,actor);if(old)return old;if(state){this.clear(state);remember(state,actor);}return this.own(state);}
  return this.job(token,async(actor,began)=>{const state=this.#states.get(actor.accountId),old=prior(state,actor);if(old)return old;if(!state||state.revision!==input.expectedRevision)throw changed();if(!this.#limits.take(actor.accountId,24,3600000))throw new DomainError('RATE_LIMITED',429,'Please wait before sharing again');
   const {event}=await this.context(token,input),room=await this.rooms.studyProjection(token,input.source);this.finish(began);const completed=prior(this.#states.get(actor.accountId),actor);if(completed)return completed;if(!room.valid()||room.worldSlug!=='library'||this.#states.get(actor.accountId)!==state||state.revision!==input.expectedRevision)throw changed();
   const at=this.time();if(at>=Date.parse(event.endsAt))throw unavailable();state.consent={source:room.source,eventId:input.eventId,createdAt:at,until:Math.min(Date.parse(event.endsAt),at+14400000),exists:room.exists,valid:room.valid};state.revision=randomUUID();remember(state,actor);return this.own(state);
  });
 }
 view(token:string,raw:unknown){const input=StudyViewInputSchema.parse(raw);return this.job(token,async(actor,began)=>{
  const {room,event}=await this.context(token,input),state=this.ensure(actor.accountId);const result=(sharing:boolean,counts:{active:number;paused:number;completed:number;idle:number}|null)=>{this.finish(began);if(this.now()>=Date.parse(event.endsAt))throw unavailable();return StudyViewSchema.parse({schemaVersion:1,sharing,revision:state.revision,observedAt:new Date(began).toISOString(),expiresAt:new Date(Math.min(began+5000,Date.parse(event.endsAt))).toISOString(),counts});};
  if(!this.active(state)||!this.matches(state.consent,input.source,input.eventId))return result(false,null);const revision=state.revision;
  const candidates=room.members.flatMap(member=>{const consent=this.#states.get(member.accountId)?.consent;return event.confirmed.has(member.accountId)&&this.active(this.#states.get(member.accountId))&&this.matches(consent,{...input.source,membershipId:member.membershipId},input.eventId)?[{...member,consent:consent!}]:[];});
  const phases=await this.focus.studyPhases({worldSlug:'library',roomId:room.source.roomId,epoch:room.source.epoch,opensAt:event.opensAt,endsAt:event.endsAt},candidates);
  const final=await this.rooms.studyProjection(token,input.source),allowed=new Set<string>();for(const member of final.members)if(member.valid()&&await member.allowed())allowed.add(member.accountId);
  if(!final.valid()||this.#states.get(actor.accountId)!==state||state.revision!==revision)throw changed();const counts={active:0,paused:0,completed:0,idle:0};
  for(const member of candidates){const current=this.#states.get(member.accountId),phase=phases.get(member.accountId);if(phase&&allowed.has(member.accountId)&&member.valid()&&current?.consent===member.consent&&this.active(current)&&event.confirmed.has(member.accountId))counts[phase]++;}
  return result(true,counts);
 });}
 close(){this.#closed=true;clearInterval(this.#cleanup);for(const unsubscribe of this.#unsubscribe)unsubscribe();this.#states.clear();}
}
