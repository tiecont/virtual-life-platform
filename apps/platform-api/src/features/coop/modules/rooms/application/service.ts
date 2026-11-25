import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {
 CoopEligibilitySchema,CoopRoomViewSchema,CoopCreateRoomSchema,CoopReadySchema,CoopSelectPetSchema,
} from '@aetheria/contracts';
import type {z} from 'zod';
import {DomainError} from '../../../../../shared/common/errors';
import {CoopRoomStore,type CoopRoomRow,type CoopSeatRow} from '../infrastructure/store';

type Queryable=Pick<PoolClient,'query'>;
const missing=()=>new DomainError('NOT_FOUND',404,'Cooperative room not found');
const conflict=(message:string)=>new DomainError('REQUEST_CONFLICT',409,message);
const forbidden=(message:string)=>new DomainError('FORBIDDEN',403,message);
const unavailable=(message='Published cooperative configuration is unavailable')=>new DomainError('NOT_AVAILABLE',503,message);
const ROOM_LIMIT=4;

// Authoritative cooperative room lifecycle. Achievement Points gate room
// creation only; they are never spent. The room pins the published gameplay
// version that authored its Boss and threshold, exactly like a match pin.
export class CoopRoomService{
 constructor(private readonly db:Pick<Pool,'query'|'connect'>,private readonly store=new CoopRoomStore()){}

 private async transaction<T>(accountId:string,requestId:string,work:(tx:PoolClient)=>Promise<T>):Promise<T>{
  const client=await this.db.connect();
  try{
   await client.query('BEGIN');
   await client.query("SET LOCAL statement_timeout='5000ms'");
   await client.query("SET LOCAL lock_timeout='2000ms'");
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['coop-room:'+accountId+':'+requestId]);
   const result=await work(client);
   await client.query('COMMIT');
   return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 private fingerprint(action:string,requestId:string,input:unknown){
  return createHash('sha256').update(JSON.stringify({action,requestId,input})).digest('hex');
 }
 private async replay<T>(tx:Queryable,accountId:string,requestId:string,fingerprint:string,parse:(value:unknown)=>T):Promise<T|undefined>{
  const prior=await this.store.findRequest(tx,accountId,requestId);
  if(!prior)return undefined;
  if(prior.fingerprint!==fingerprint)throw conflict('Request key was used with different input');
  return parse(prior.response);
 }
 private async configuration(tx:Queryable){
  const active=await this.store.activeConfiguration(tx);
  const boss=active.bundle.boss;
  if(!boss||typeof boss!=='object'||Array.isArray(boss))throw unavailable();
  const value=boss as Record<string,unknown>,bossId=value.id,required=value.requiredRoomPoints;
  if(typeof bossId!=='string'||!/^[a-z][a-z0-9-]{2,63}$/.test(bossId))throw unavailable();
  if(typeof required!=='number'||!Number.isInteger(required)||required<0||required>1_000_000)throw unavailable();
  return Object.freeze({version:active.version,digest:active.digest,bossId,requiredPoints:required});
 }
 private async view(tx:Queryable,room:CoopRoomRow,accountId:string,allowForeign=false){
  const seats=await this.store.seats(tx,room.id);
  const mine=seats.find(seat=>seat.accountId===accountId);
  if(!mine&&!allowForeign&&room.status!=='OPEN'&&room.hostAccountId!==accountId)throw missing();
  const isHost=room.hostAccountId===accountId;
  return CoopRoomViewSchema.parse({
   roomId:room.id,ruleset:room.ruleset,bossId:room.bossId,status:room.status,revision:room.revision,
   configVersion:room.configVersion,requiredPoints:room.requiredPoints,createdAt:room.createdAt.toISOString(),
   you:{seat:mine?.seat??null,isHost},
   seats:seats.map(seat=>({seat:seat.seat,petId:seat.petId,petLevel:seat.petLevel,ready:seat.ready,you:seat.accountId===accountId})),
   canJoin:room.status==='OPEN'&&!mine&&seats.length<ROOM_LIMIT,
   canStart:isHost&&room.status==='OPEN'&&seats.length===ROOM_LIMIT&&seats.every(seat=>seat.ready&&seat.petId!==null&&seat.petLevel!==null),
  });
 }
 private async seatOrFail(tx:Queryable,roomId:string,accountId:string):Promise<CoopSeatRow>{
  const seat=await this.store.seatFor(tx,roomId,accountId);
  if(!seat)throw forbidden('Only a seated participant can do that');
  return seat;
 }

 async eligibility(accountId:string){
  const client=await this.db.connect();
  try{
   await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='3000ms'");
   const config=await this.configuration(client),points=await this.store.achievementPoints(client,accountId);
   await client.query('COMMIT');
   return CoopEligibilitySchema.parse({ruleset:'arena8-coop-pve',bossId:config.bossId,points,requiredPoints:config.requiredPoints,eligible:points>=config.requiredPoints});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }

 async create(accountId:string,requestId:string,input:z.infer<typeof CoopCreateRoomSchema>){
  const fingerprint=this.fingerprint('create',requestId,input);
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const config=await this.configuration(tx),points=await this.store.achievementPoints(tx,accountId);
   if(points<config.requiredPoints)throw forbidden('Achievement Points required to create this room');
   let petLevel:number|null=null;
   if(input.petId){
    const owned=await this.store.ownedPet(tx,accountId,input.petId);
    if(!owned)throw forbidden('Pet is not owned');
    petLevel=owned.level;
   }
   const room=await this.store.createRoom(tx,{id:randomUUID(),bossId:config.bossId,hostAccountId:accountId,configVersion:config.version,configDigest:config.digest,requiredPoints:config.requiredPoints});
   await this.store.addSeat(tx,{roomId:room.id,seat:0,accountId,petId:input.petId??null,petLevel});
   await this.store.event(tx,{roomId:room.id,accountId,action:'create',fromState:null,toState:'OPEN'});
   const view=await this.view(tx,room,accountId);
   await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
   return view;
  });
 }

 async room(accountId:string,roomId:string){
  const client=await this.db.connect();
  try{
   await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='3000ms'");
   const room=await this.store.room(client,roomId);
   if(!room)throw missing();
   const view=await this.view(client,room,accountId);
   await client.query('COMMIT');
   return view;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }

 async join(accountId:string,requestId:string,roomId:string){
  const fingerprint=this.fingerprint('join',requestId,{roomId});
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   const existing=await this.store.seatFor(tx,roomId,accountId);
   if(existing){
    if(room.status!=='OPEN')throw conflict('Room is not open');
    const view=await this.view(tx,room,accountId);
    await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
    return view;
   }
   if(room.status!=='OPEN')throw conflict('Room is not open');
   const seats=await this.store.seats(tx,roomId);
   if(seats.length>=ROOM_LIMIT)throw conflict('Room is full');
   const used=new Set(seats.map(seat=>seat.seat));
   const seat=[0,1,2,3].find(value=>!used.has(value))!;
   await this.store.addSeat(tx,{roomId,seat,accountId,petId:null,petLevel:null});
   const touched=await this.store.touch(tx,{roomId,expectedRevision:room.revision});
   if(!touched)throw conflict('Room changed; refresh before retrying');
   await this.store.event(tx,{roomId,accountId,action:'join',fromState:'OPEN',toState:'OPEN'});
   const view=await this.view(tx,touched,accountId);
   await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
   return view;
  });
 }

 async leave(accountId:string,requestId:string,roomId:string){
  const fingerprint=this.fingerprint('leave',requestId,{roomId});
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   await this.seatOrFail(tx,roomId,accountId);
   if(room.hostAccountId===accountId){
    if(room.status==='CLOSED')throw conflict('Room is already closed');
    const closed=await this.store.setStatus(tx,{roomId,status:'CLOSED',expectedRevision:room.revision});
    if(!closed)throw conflict('Room changed; refresh before retrying');
    await this.store.event(tx,{roomId,accountId,action:'close',fromState:room.status,toState:'CLOSED'});
    const view=await this.view(tx,closed,accountId,true);
    await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
    return view;
   }
   if(room.status!=='OPEN')throw conflict('Room roster is frozen');
   await this.store.removeSeat(tx,roomId,accountId);
   const touched=await this.store.touch(tx,{roomId,expectedRevision:room.revision});
   if(!touched)throw conflict('Room changed; refresh before retrying');
   await this.store.event(tx,{roomId,accountId,action:'leave',fromState:'OPEN',toState:'OPEN'});
   const view=await this.view(tx,touched,accountId,true);
   await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
   return view;
  });
 }

 async selectPet(accountId:string,requestId:string,roomId:string,input:z.infer<typeof CoopSelectPetSchema>){
  const fingerprint=this.fingerprint('select-pet',requestId,{roomId,petId:input.petId});
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   if(room.status!=='OPEN')throw conflict('Room roster is frozen');
   await this.seatOrFail(tx,roomId,accountId);
   const owned=await this.store.ownedPet(tx,accountId,input.petId);
   if(!owned)throw forbidden('Pet is not owned');
   const seats=await this.store.seats(tx,roomId);
   if(seats.some(seat=>seat.accountId!==accountId&&seat.petId===input.petId))throw conflict('Pet is already selected by another participant');
   await this.store.selectPet(tx,{roomId,accountId,petId:input.petId,petLevel:owned.level});
   const touched=await this.store.touch(tx,{roomId,expectedRevision:room.revision});
   if(!touched)throw conflict('Room changed; refresh before retrying');
   await this.store.event(tx,{roomId,accountId,action:'select_pet',fromState:'OPEN',toState:'OPEN'});
   const view=await this.view(tx,touched,accountId);
   await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
   return view;
  });
 }

 async ready(accountId:string,requestId:string,roomId:string,input:z.infer<typeof CoopReadySchema>){
  const fingerprint=this.fingerprint('ready',requestId,{roomId,ready:input.ready});
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   if(room.status!=='OPEN')throw conflict('Room roster is frozen');
   const seat=await this.seatOrFail(tx,roomId,accountId);
   if(input.ready&&seat.petId===null)throw conflict('Select an owned Pet before readying');
   await this.store.setReady(tx,{roomId,accountId,ready:input.ready});
   const touched=await this.store.touch(tx,{roomId,expectedRevision:room.revision});
   if(!touched)throw conflict('Room changed; refresh before retrying');
   await this.store.event(tx,{roomId,accountId,action:'ready',fromState:'OPEN',toState:'OPEN'});
   const view=await this.view(tx,touched,accountId);
   await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
   return view;
  });
 }

 async start(accountId:string,requestId:string,roomId:string){
  const fingerprint=this.fingerprint('start',requestId,{roomId});
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   if(room.hostAccountId!==accountId)throw forbidden('Only the host can start the room');
   if(room.status!=='OPEN')throw conflict('Room is not open');
   const seats=await this.store.seats(tx,roomId);
   if(seats.length!==ROOM_LIMIT)throw conflict('Four participants are required');
   if(!seats.every(seat=>seat.ready&&seat.petId!==null&&seat.petLevel!==null))throw conflict('Every participant must select a Pet and ready up');
   const locked=await this.store.setStatus(tx,{roomId,status:'LOCKED',expectedRevision:room.revision});
   if(!locked)throw conflict('Room changed; refresh before retrying');
   await this.store.event(tx,{roomId,accountId,action:'start',fromState:'OPEN',toState:'LOCKED'});
   const view=await this.view(tx,locked,accountId);
   await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
   return view;
  });
 }

 async close(accountId:string,requestId:string,roomId:string){
  const fingerprint=this.fingerprint('close',requestId,{roomId});
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   if(room.hostAccountId!==accountId)throw forbidden('Only the host can close the room');
   if(room.status==='CLOSED')throw conflict('Room is already closed');
   const closed=await this.store.setStatus(tx,{roomId,status:'CLOSED',expectedRevision:room.revision});
   if(!closed)throw conflict('Room changed; refresh before retrying');
   await this.store.event(tx,{roomId,accountId,action:'close',fromState:room.status,toState:'CLOSED'});
   const view=await this.view(tx,closed,accountId,true);
   await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
   return view;
  });
 }
}
