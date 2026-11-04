import { z } from 'zod';
import type { Pool,PoolClient } from 'pg';
import { TravelSourceSchema,ReservationPartyReadSchema,ReservationPartyOpenSchema,ReservationPartySourceSchema,ReservationPartyResultSchema,ReservationPartiesSchema,ReservationPartyOwnSchema,ReservationPartyStoppedSchema,type TravelSource } from '@virtual-city/contracts';
import type { IdentityService } from '../identity/service';
import type { SocialService } from '../social/service';
import type { RoomService } from '../rooms/service';
import type { EventService } from './service';
import { DomainError } from '../common/errors';
type Booking={id:string;event_id:string;account_id:string;world_slug:string;resource_key:string;party_size:number;phase:string;party_open:boolean;party_epoch:string|null;party_room_id:string|null;party_membership_id:string|null};
type Member={account_id:string;phase:'IN'|'LEFT'|'REVOKED';epoch:string;room_id:string;membership_id:string;changed_at:Date};
type Visit=(accountId:string,source:TravelSource)=>string[];
const uuid=z.uuid().transform(value=>value.toLowerCase()),absent=()=>new DomainError('NOT_AVAILABLE',404,'This dining party is unavailable'),conflict=()=>new DomainError('NOT_AVAILABLE',409,'Refresh this party before trying again');
// Reservation engine owns the allocation and this optional attendance consent.
// No world module queries these tables; no party command moves or seats anyone.
export class ReservationParties {
 constructor(private pool:Pick<Pool,'query'|'connect'>,private identity:IdentityService,private social:SocialService,private rooms:RoomService,private events:EventService,private now=Date.now){}
 private async revision(db:Pick<Pool,'query'>,account:string){return (await db.query<{revision:number}>('SELECT revision FROM engine_reservation_consent WHERE account_id=$1',[account])).rows[0]?.revision??0;}
 private async revokeRevision(db:PoolClient,account:string){return (await db.query<{revision:number}>('INSERT INTO engine_reservation_consent VALUES($1,1) ON CONFLICT(account_id) DO UPDATE SET revision=engine_reservation_consent.revision+1 RETURNING revision',[account])).rows[0].revision;}
 private async reference(token:string,id:string){await this.identity.authenticate(token);const row=(await this.pool.query<Booking>('SELECT * FROM engine_reservations WHERE id=$1',[uuid.parse(id)])).rows[0];if(!row)throw absent();return row;}
 private async current(db:PoolClient,id:string){const row=(await db.query<Booking>('SELECT * FROM engine_reservations WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw absent();return row;}
 private async members(db:Pick<Pool,'query'>,id:string){return (await db.query<Member>("SELECT * FROM engine_reservation_members WHERE reservation_id=$1 ORDER BY account_id",[id])).rows;}
 private result(row:Booking,actor:string,members:Member[],count:number|null=null){return ReservationPartyResultSchema.parse({schemaVersion:1,party:{id:row.id,worldSlug:row.world_slug,resourceKey:row.resource_key,capacity:row.party_size,mine:actor===row.account_id,joined:members.some(member=>member.account_id===actor&&member.phase==='IN'&&member.epoch===this.rooms.epoch),open:count!==null&&row.party_open,confirmedCount:count}});}
 private async prior(db:PoolClient,actor:string,key:string,fingerprint:string){const row=(await db.query<{fingerprint:string}>('SELECT fingerprint FROM engine_reservation_mutations WHERE actor_id=$1 AND request_id=$2',[actor,key])).rows[0];if(row&&row.fingerprint!==fingerprint)throw conflict();return Boolean(row);}
 private async remember(db:PoolClient,actor:string,key:string,row:Booking,operation:string,fingerprint:string){const counts=(await db.query('SELECT count(*) FILTER(WHERE created_at>$2)::int AS minute,count(*)::int AS hour FROM engine_reservation_mutations WHERE actor_id=$1 AND created_at>$3',[actor,new Date(this.now()-60000),new Date(this.now()-3600000)])).rows[0];if(counts.minute>=30||counts.hour>=60)throw new DomainError('RATE_LIMITED',429,'Please wait before changing another party');await db.query('INSERT INTO engine_reservation_mutations VALUES($1,$2,$3,$4,NULL,$5,$6,$7)',[actor,key,row.event_id,row.id,operation,fingerprint,new Date(this.now())]);}
 private async withdraw(db:PoolClient,row:Booking){await db.query('UPDATE engine_reservations SET party_open=false WHERE id=$1',[row.id]);row.party_open=false;await db.query("UPDATE engine_reservation_members SET phase='REVOKED',changed_at=greatest(changed_at,$2) WHERE reservation_id=$1 AND phase='IN'",[row.id,new Date(this.now())]);}
 private source(row:Booking):TravelSource|null{return row.party_epoch&&row.party_room_id&&row.party_membership_id?{epoch:row.party_epoch,roomId:row.party_room_id,membershipId:row.party_membership_id}:null;}
 private async present(account:string,source:TravelSource,visit:Visit,world:string){const sessions=visit(account,source);return sessions.length>0&&await this.identity.hasConnectedSession(account,sessions)&&await this.rooms.activityAllowed(account,world,source.roomId);}
 private async reconcile(db:PoolClient,row:Booking,visit:Visit){
  const source=this.source(row);if(row.phase!=='CHECKED_IN'||!source||!await this.present(row.account_id,source,visit,row.world_slug)){await this.withdraw(db,row);return [];}
  const members=await this.members(db,row.id);if(!members.some(member=>member.account_id===row.account_id&&member.phase==='IN')){await this.withdraw(db,row);return [];}
  for(const member of members){if(member.phase!=='IN')continue;if(this.now()<member.changed_at.getTime())throw new DomainError('WORLD_UNAVAILABLE',503,'Party clock unavailable');if(!await this.present(member.account_id,{epoch:member.epoch,roomId:member.room_id,membershipId:member.membership_id},visit,row.world_slug)||await this.social.isBlocked(row.account_id,member.account_id,db)){await db.query("UPDATE engine_reservation_members SET phase='REVOKED',changed_at=greatest(changed_at,$3) WHERE reservation_id=$1 AND account_id=$2",[row.id,member.account_id,new Date(this.now())]);member.phase='REVOKED';}}
  return members;
 }
 private async enroll(db:PoolClient,row:Booking,account:string,source:TravelSource){
  if(!(await db.query('SELECT 1 FROM engine_reservation_members WHERE reservation_id=$1 AND account_id=$2',[row.id,account])).rowCount&&(await db.query('SELECT count(*)::int AS n FROM engine_reservation_members WHERE reservation_id=$1',[row.id])).rows[0].n>=64)throw conflict();
  // One current party/account. A new authoritative visit can retire its own old
  // consent; this never admits another account or revives an old receipt.
  await db.query("UPDATE engine_reservation_members SET phase='LEFT',changed_at=greatest(changed_at,$5) WHERE account_id=$1 AND phase='IN' AND (epoch<>$2 OR room_id<>$3 OR membership_id<>$4)",[account,source.epoch,source.roomId,source.membershipId,new Date(this.now())]);
  if((await db.query("SELECT 1 FROM engine_reservation_members WHERE account_id=$1 AND phase='IN' AND reservation_id<>$2",[account,row.id])).rowCount)throw conflict();
  await db.query("INSERT INTO engine_reservation_members(reservation_id,account_id,phase,epoch,room_id,membership_id,created_at,changed_at) VALUES($1,$2,'IN',$3,$4,$5,$6,$6) ON CONFLICT(reservation_id,account_id) DO UPDATE SET phase='IN',epoch=$3,room_id=$4,membership_id=$5,changed_at=greatest(engine_reservation_members.changed_at,$6)",[row.id,account,source.epoch,source.roomId,source.membershipId,new Date(this.now())]);
 }
 async mutate(token:string,id:string,requestKey:string,operation:'party-open'|'party-join'|'party-leave',raw:unknown){
  const input=operation==='party-open'?ReservationPartyOpenSchema.parse(raw):operation==='party-join'?ReservationPartySourceSchema.parse(raw):z.strictObject({schemaVersion:z.literal(1)}).parse(raw),key=uuid.parse(requestKey),known=await this.reference(token,id),fingerprint=this.identity.fingerprint({operation,id:known.id,input});
  const receipt=await this.events.withBooking(token,known.event_id,async(db,actor)=>{if(!await this.prior(db,actor.accountId,key,fingerprint))return null;const row=await this.current(db,known.id),members=await this.members(db,row.id);if(actor.accountId!==row.account_id&&!members.some(member=>member.account_id===actor.accountId))throw absent();return this.result(row,actor.accountId,members);},true,undefined,[known.account_id]);if(receipt)return receipt;
  if(operation==='party-leave')return this.events.withBooking(token,known.event_id,async(db,actor)=>{
   const row=await this.current(db,known.id),members=await this.members(db,row.id);if(actor.accountId!==row.account_id&&!members.some(member=>member.account_id===actor.accountId))throw absent();if(!await this.prior(db,actor.accountId,key,fingerprint)){await this.remember(db,actor.accountId,key,row,operation,fingerprint);await this.revokeRevision(db,actor.accountId);if(actor.accountId===row.account_id)await this.withdraw(db,row);else await db.query("UPDATE engine_reservation_members SET phase='LEFT',changed_at=greatest(changed_at,$3) WHERE reservation_id=$1 AND account_id=$2",[row.id,actor.accountId,new Date(this.now())]);}return this.result(row,actor.accountId,await this.members(db,row.id));
  },true,undefined,[known.account_id]);
  if(!('source'in input))throw absent();const source=TravelSourceSchema.parse(input.source);
  return this.rooms.reservationCheckIn(token,source,known.world_slug,(valid,visit)=>this.events.withBooking(token,known.event_id,async(db,actor,context)=>{
   const row=await this.current(db,known.id);if(await this.prior(db,actor.accountId,key,fingerprint))return this.result(row,actor.accountId,await this.members(db,row.id));
   if(!('expectedRevision'in input)||input.expectedRevision!==await this.revision(db,actor.accountId))throw conflict();
   if(row.phase!=='CHECKED_IN'||context.visibility!=='listed'||!['OPEN','LIVE'].includes(context.phase)||this.now()>=Date.parse(context.schedule.checkInClosesAt)||await this.social.isBlocked(row.account_id,actor.accountId,db))throw absent();
   if(operation==='party-open'){
    if(row.account_id!==actor.accountId)throw absent();const open='open'in input&&input.open===true;if(!open){await this.withdraw(db,row);await this.revokeRevision(db,actor.accountId);}else{
     const previous=this.source(row);if(row.party_open&&previous&&(previous.epoch!==source.epoch||previous.roomId!==source.roomId||previous.membershipId!==source.membershipId))throw conflict();
     await this.enroll(db,row,actor.accountId,source);Object.assign(row,{party_open:true,party_epoch:source.epoch,party_room_id:source.roomId,party_membership_id:source.membershipId});await db.query('UPDATE engine_reservations SET party_open=true,party_epoch=$2,party_room_id=$3,party_membership_id=$4 WHERE id=$1',[row.id,source.epoch,source.roomId,source.membershipId]);
    }
   }else{
    const members=await this.reconcile(db,row,visit);if(!row.party_open||row.account_id===actor.accountId)throw absent();
    if(members.filter(member=>member.phase==='IN').length>=row.party_size&&!members.some(member=>member.account_id===actor.accountId&&member.phase==='IN'))throw conflict();
    for(const member of members)if(member.phase==='IN'&&await this.social.isBlocked(actor.accountId,member.account_id,db))throw absent();await this.enroll(db,row,actor.accountId,source);
   }
   await this.remember(db,actor.accountId,key,row,operation,fingerprint);if(!valid()||this.now()>=Date.parse(context.schedule.checkInClosesAt))throw conflict();const members=await this.reconcile(db,row,visit);return this.result(row,actor.accountId,members,members.filter(member=>member.phase==='IN').length);
  },false,valid,[known.account_id]));
 }
 async view(token:string,raw:unknown){
  const input=ReservationPartyReadSchema.parse(raw);return this.rooms.reservationCheckIn(token,input.source,input.worldSlug,async(valid,visit)=>{
   const candidates=(await this.pool.query<{id:string}>("SELECT id FROM engine_reservations WHERE world_slug=$1 AND party_epoch=$2 AND party_room_id=$3 AND party_open AND phase='CHECKED_IN' ORDER BY creation_order LIMIT 21",[input.worldSlug,input.source.epoch,input.source.roomId])).rows,items=[];
   for(const candidate of candidates.slice(0,20)){const known=await this.reference(token,candidate.id);try{const party=await this.events.withBooking(token,known.event_id,async(db,actor,context)=>{const row=await this.current(db,known.id);if(context.visibility!=='listed'||!['OPEN','LIVE'].includes(context.phase)||this.now()>=Date.parse(context.schedule.checkInClosesAt)||await this.social.isBlocked(row.account_id,actor.accountId,db))return null;const members=await this.reconcile(db,row,visit);if(!row.party_open)return null;for(const member of members)if(member.phase==='IN'&&await this.social.isBlocked(actor.accountId,member.account_id,db))return null;return this.result(row,actor.accountId,members,members.filter(member=>member.phase==='IN').length).party;},false,valid,[known.account_id]);if(party)items.push(party);}catch(error){if(!(error instanceof DomainError&&error.status===404))throw error;}}
   if(!valid())throw conflict();return ReservationPartiesSchema.parse({schemaVersion:1,items,truncated:candidates.length>20});
  });
 }
 async own(token:string){const actor=await this.identity.authenticate(token),rows=(await this.pool.query<Booking>('SELECT r.* FROM engine_reservations r JOIN engine_reservation_members m ON m.reservation_id=r.id WHERE m.account_id=$1 ORDER BY m.changed_at DESC,r.id LIMIT 21',[actor.accountId])).rows,items=[];for(const known of rows.slice(0,20)){try{items.push(await this.events.withBooking(token,known.event_id,async(db,current)=>this.result(await this.current(db,known.id),current.accountId,await this.members(db,known.id)).party,true,undefined,[known.account_id]));}catch(error){if(!(error instanceof DomainError&&error.status===404))throw error;}}return ReservationPartyOwnSchema.parse({schemaVersion:1,revision:await this.revision(this.pool,actor.accountId),items,truncated:rows.length>20});}
 async stop(token:string){const initial=await this.identity.authenticate(token),db=await this.pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='2000ms'");await db.query("SET LOCAL lock_timeout='1000ms'");await this.identity.lockAccounts(db,[initial.accountId]);const actor=await this.identity.contextInTransaction(db,token),revision=await this.revokeRevision(db,actor.accountId);await db.query('UPDATE engine_reservations SET party_open=false WHERE account_id=$1 AND party_open',[actor.accountId]);await db.query("UPDATE engine_reservation_members m SET phase=CASE WHEN account_id=$1 THEN 'LEFT' ELSE 'REVOKED' END,changed_at=greatest(changed_at,$2) WHERE phase='IN' AND (account_id=$1 OR reservation_id IN(SELECT id FROM engine_reservations WHERE account_id=$1))",[actor.accountId,new Date(this.now())]);if(this.now()>=actor.expiresAt)throw absent();await db.query('COMMIT');return ReservationPartyStoppedSchema.parse({schemaVersion:1,stopped:true,revision});}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
}
