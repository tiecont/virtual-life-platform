import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {
 CoopRewardReceiptSchema,CoopAdmissionViewSchema,CoopEligibilitySchema,CoopRoomViewSchema,CoopCreateRoomSchema,CoopReadySchema,CoopSelectPetSchema,
} from '@aetheria/contracts';
import type {z} from 'zod';
import {DomainError} from '../../../../../shared/common/errors';
import {CoopRoomStore,type CoopRoomRow,type CoopSeatRow} from '../infrastructure/store';
import type {CoopMatchProvisioner} from '../../match/application/provisioner';
import {bindArtifactLoadout} from '../../match/domain/loadout';
import {readOwnedArtifactLoadouts} from '../../../../pets/modules/wave-a-artifacts/infrastructure/store';

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
 constructor(
  private readonly db:Pick<Pool,'query'|'connect'>,
  private readonly store=new CoopRoomStore(),
  private readonly provisioner?:CoopMatchProvisioner,
 ){}

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
 private async configuration(tx:Queryable,requestedBossId?:string,requestedMapId?:string){
  const active=await this.store.activeConfiguration(tx);
  const catalog=active.bundle.bosses;
  const boss=Array.isArray(catalog)
   ?catalog.find(entry=>entry&&(requestedBossId===undefined||entry.id===requestedBossId)&&(requestedMapId===undefined||entry.mapId===requestedMapId)&&(requestedBossId!==undefined||requestedMapId!==undefined))
   :active.bundle.boss;
  if(!boss&&(requestedBossId!==undefined||Array.isArray(catalog)))
   throw new DomainError('NOT_AVAILABLE',404,'Choose a Boss from the published cooperative catalog');
  if(!boss||typeof boss!=='object'||Array.isArray(boss))throw unavailable();
  const value=boss as Record<string,unknown>,bossId=value.id,required=value.requiredRoomPoints;
  if(requestedMapId!==undefined&&requestedMapId!==value.mapId)throw new DomainError('NOT_AVAILABLE',404,'Cooperative map is unavailable');
  if(requestedBossId!==undefined&&requestedBossId!==bossId)throw new DomainError('NOT_AVAILABLE',404,'Cooperative Boss is unavailable');
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
   roomId:room.id,ruleset:room.ruleset,bossId:room.bossId,mapId:await this.store.pinnedMap(tx,room),status:room.status,revision:room.revision,
   configVersion:room.configVersion,requiredPoints:room.requiredPoints,createdAt:room.createdAt.toISOString(),
   you:{seat:mine?.seat??null,isHost},
   seats:seats.map(seat=>({seat:seat.seat,petId:seat.petId,petLevel:seat.petLevel,ready:seat.ready,you:seat.accountId===accountId,ownedPetInstanceId:seat.accountId===accountId?seat.ownedPetInstanceId:null})),
   canJoin:room.status==='OPEN'&&!mine&&seats.length<ROOM_LIMIT,
   canStart:isHost&&room.status==='OPEN'&&seats.length===ROOM_LIMIT&&seats.every(seat=>seat.ready&&seat.petId!==null&&seat.petLevel!==null&&seat.ownedPetInstanceId!==null),
  });
 }
 private async seatOrFail(tx:Queryable,roomId:string,accountId:string):Promise<CoopSeatRow>{
  const seat=await this.store.seatFor(tx,roomId,accountId);
  if(!seat)throw forbidden('Only a seated participant can do that');
  return seat;
 }

 async reward(accountId:string,roomId:string){
  const receipt=await this.store.rewardFor(this.db,roomId,accountId);
  if(!receipt)throw missing();
  return CoopRewardReceiptSchema.parse(receipt);
 }

 async eligibility(accountId:string,bossId?:string,mapId?:string){
  const client=await this.db.connect();
  try{
   await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='3000ms'");
   const config=await this.configuration(client,bossId,mapId),points=await this.store.achievementPoints(client,accountId);
   await client.query('COMMIT');
   return CoopEligibilitySchema.parse({ruleset:'arena8-coop-pve',bossId:config.bossId,points,requiredPoints:config.requiredPoints,eligible:points>=config.requiredPoints});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }

 async create(accountId:string,requestId:string,input:z.infer<typeof CoopCreateRoomSchema>){
  const fingerprint=this.fingerprint('create',requestId,input);
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const config=await this.configuration(tx,input.bossId,input.mapId),points=await this.store.achievementPoints(tx,accountId);
   if(points<config.requiredPoints)throw forbidden('Achievement Points required to create this room');
   let petLevel:number|null=null,ownedPetInstanceId:string|null=null;
   if(input.ownedPetInstanceId&&!input.petId)throw conflict('Pet species is required with an instance ID');
   if(input.petId){
    const owned=await this.store.ownedPet(tx,accountId,input.petId,input.ownedPetInstanceId);
    if(!owned)throw forbidden('Pet is not owned');
    petLevel=owned.level;
    ownedPetInstanceId=owned.instanceId;
   }
   const room=await this.store.createRoom(tx,{id:randomUUID(),bossId:config.bossId,hostAccountId:accountId,configVersion:config.version,configDigest:config.digest,requiredPoints:config.requiredPoints});
   await this.store.addSeat(tx,{roomId:room.id,seat:0,accountId,petId:input.petId??null,petLevel,ownedPetInstanceId});
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

 async join(accountId:string,requestId:string,roomId:string,mapId?:string){
  const fingerprint=this.fingerprint('join',requestId,{roomId,mapId});
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   if(mapId!==undefined&&mapId!==await this.store.pinnedMap(tx,room))
    throw conflict('This room belongs to a different encounter entrance');
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
   await this.store.addSeat(tx,{roomId,seat,accountId,petId:null,petLevel:null,ownedPetInstanceId:null});
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
  const fingerprint=this.fingerprint('select-pet',requestId,{roomId,petId:input.petId,ownedPetInstanceId:input.ownedPetInstanceId});
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   if(room.status!=='OPEN')throw conflict('Room roster is frozen');
   await this.seatOrFail(tx,roomId,accountId);
   const owned=await this.store.ownedPet(tx,accountId,input.petId,input.ownedPetInstanceId);
   if(!owned)throw forbidden('Pet is not owned');
   const seats=await this.store.seats(tx,roomId);
   if(seats.some(seat=>seat.accountId!==accountId&&seat.ownedPetInstanceId===owned.instanceId))throw conflict('Pet instance is already selected by another participant');
   await this.store.selectPet(tx,{roomId,accountId,petId:input.petId,petLevel:owned.level,ownedPetInstanceId:owned.instanceId});
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
  // Phase one freezes the roster (OPEN -> LOCKED). A retry with the same request
  // either replays a recorded result or resumes a locked room.
  const frozen=await this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return {done:true as const,view:prior};
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   if(room.hostAccountId!==accountId)throw forbidden('Only the host can start the room');
   if(room.status==='STARTED'||room.status==='LOCKED'){
    const view=await this.view(tx,room,accountId);
    if(room.status==='STARTED'){
     await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
     return {done:true as const,view};
    }
    return {done:false as const,view};
   }
   if(room.status!=='OPEN')throw conflict('Room is not open');
   const seats=await this.store.seats(tx,roomId);
   if(seats.length!==ROOM_LIMIT)throw conflict('Four participants are required');
   if(!seats.every(seat=>seat.ready&&seat.petId!==null&&seat.petLevel!==null&&seat.ownedPetInstanceId!==null))throw conflict('Every participant must select a Pet and ready up');
   const locked=await this.store.setStatus(tx,{roomId,status:'LOCKED',expectedRevision:room.revision});
   if(!locked)throw conflict('Room changed; refresh before retrying');
   await this.store.event(tx,{roomId,accountId,action:'start',fromState:'OPEN',toState:'LOCKED'});
   return {done:false as const,view:await this.view(tx,locked,accountId)};
  });
  if(frozen.done)return frozen.view;
  if(this.provisioner){
   const room=await this.store.room(this.db,roomId);
   if(!room||room.status!=='LOCKED')throw conflict('Room changed; refresh before retrying');
   const bundle=await this.store.pinnedBundle(this.db,room.configVersion,room.configDigest);
   if(!bundle)throw unavailable('Pinned cooperative configuration is unavailable');
   try{
    await this.provisioner.start({
     roomId,bossId:room.bossId,configVersion:room.configVersion,configDigest:room.configDigest,bundle,
     readSeats:async()=>{
      const seats=await this.store.seats(this.db,roomId);
      if(seats.length!==ROOM_LIMIT||seats.some(seat=>seat.petId===null||seat.ownedPetInstanceId===null))
       throw conflict('Four prepared participants are required');
      const roster=await readOwnedArtifactLoadouts(this.db,seats.map(seat=>({
       account:seat.accountId,petId:seat.petId!,ownedPetInstanceId:seat.ownedPetInstanceId!,
      })));
      if(roster.length!==ROOM_LIMIT)throw conflict('A selected Pet is no longer owned');
      if(Array.isArray(bundle.artifacts))
       return roster.map(({entries,...seat})=>({...seat,loadout:bindArtifactLoadout(room.configDigest,seat,entries)}));
      if(roster.some(seat=>seat.entries.length>0))
       throw conflict('Equipped Artifacts require a room with a published Artifact catalog');
      return roster.map(({account,petId,ownedPetInstanceId,petLevel},index)=>({
       account,petId,ownedPetInstanceId,petLevel,artifactPowerPm:seats[index]!.artifactPowerPm,
      }));
     },
    });
   }catch(error){
    if(error instanceof DomainError)throw error;
    throw unavailable('Cooperative native runtime is unavailable');
   }
  }
  return this.transaction(accountId,requestId,async tx=>{
   const prior=await this.replay(tx,accountId,requestId,fingerprint,value=>CoopRoomViewSchema.parse(value));
   if(prior)return prior;
   const room=await this.store.room(tx,roomId,true);
   if(!room)throw missing();
   if(room.status==='STARTED'){
    const view=await this.view(tx,room,accountId);
    await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
    return view;
   }
   if(room.status!=='LOCKED')throw conflict('Room changed; refresh before retrying');
   const started=this.provisioner?await this.store.setStatus(tx,{roomId,status:'STARTED',expectedRevision:room.revision}):undefined;
   if(this.provisioner&&!started)throw conflict('Room changed; refresh before retrying');
   if(started)await this.store.event(tx,{roomId,accountId,action:'start',fromState:'LOCKED',toState:'STARTED'});
   const view=await this.view(tx,started??room,accountId);
   await this.store.saveRequest(tx,{accountId,requestId,fingerprint,response:view});
   return view;
  });
 }

 async admission(accountId:string,credential:string,roomId:string){
  if(!this.provisioner)throw unavailable('Cooperative native matches are not enabled');
  const client=await this.db.connect();
  try{
   await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='3000ms'");
   const room=await this.store.room(client,roomId);
   if(!room)throw missing();
   const seat=await this.store.seatFor(client,roomId,accountId);
   if(!seat)throw forbidden('Only a seated participant can join this match');
   if(room.status!=='STARTED')throw conflict('Cooperative match is not active');
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  const view=await this.provisioner.admission(roomId,credential);
  return CoopAdmissionViewSchema.parse(view);
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
