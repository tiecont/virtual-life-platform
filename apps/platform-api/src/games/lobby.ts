import {randomUUID} from 'node:crypto';
import {GameLobbyInputSchema,GameLobbyLeaveSchema,GameLobbyViewSchema,type GameLobbyView,type GameMode} from '@virtual-city/contracts';
import type {IdentityService} from '../identity/service';
import type {RoomService} from '../rooms/service';
import type {SocialService} from '../social/service';
import {DomainError} from '../common/errors';
import {z} from 'zod';
import {GameIdSchema,TravelSourceSchema} from '@virtual-city/contracts';
import type {GameAdmission} from './journal-host';
type Lease=Awaited<ReturnType<RoomService['gameProjection']>>;
type Player={account:string;seat:number;ready:boolean;lease:Lease};
type Table={id:string;generation:string;room:string;mode:GameMode;version:number;players:Map<string,Player>};
const limits:Record<GameMode,{minimum:number;capacity:number}>={'lantern-colors':{minimum:2,capacity:6},'mask-and-tell':{minimum:3,capacity:6},'mistbound-routes':{minimum:4,capacity:8}};
const unavailable=()=>new DomainError('NOT_AVAILABLE',404,'This table is unavailable');
const conflict=()=>new DomainError('IDEMPOTENCY_CONFLICT',409,'The table changed. Refresh before continuing');
// Visit-scoped, bounded waiting-room only. No deals, game state, rewards or
// persistence guarantee. Restart withdraws all consent. N15-04 owns durable
// active-match claims; this owner cannot start a match or bypass that journal.
export class GameLobbyService{
 #tables=new Map<string,Table>();#claims=new Map<string,Table>();#tail:Promise<unknown>=Promise.resolve();#pending=0;#closed=false;#unsubscribe:(()=>void)[]=[];
 constructor(private identity:IdentityService,private rooms:Pick<RoomService,'gameProjection'|'activityAllowed'>,private social:Pick<SocialService,'isBlocked'>,private enabled:()=>boolean,private now=Date.now){
  this.#unsubscribe.push(identity.onRevoked(event=>this.revoke(event.accountId)),identity.onChanged(id=>this.revoke(id)));
 }
 private remove(table:Table,account:string){if(!table.players.delete(account))return;this.#claims.delete(account);table.version++;for(const player of table.players.values())player.ready=false;if(!table.players.size)this.#tables.delete(table.room);}
 revoke(account:string){const table=this.#claims.get(account);if(table)this.remove(table,account);}
 private prune(){for(const table of this.#tables.values())for(const player of table.players.values())if(!player.lease.valid())this.remove(table,player.account);}
 private view(table:Table|undefined,account:string):GameLobbyView{return GameLobbyViewSchema.parse({schemaVersion:1,ephemeral:true,spectator:false,canStart:false,table:table?{tableId:table.id,generation:table.generation,mode:table.mode,version:table.version,...limits[table.mode],phase:table.players.size>=limits[table.mode].minimum&&[...table.players.values()].every(p=>p.ready)?'READY_CHECK':'WAITING',slots:[...table.players.values()].sort((a,b)=>a.seat-b.seat).map(p=>({seat:p.seat,ready:p.ready,own:p.account===account})),ownSeat:table.players.get(account)?.seat??null}:null});}
 private run<T>(work:()=>Promise<T>){if(this.#closed||!this.enabled())return Promise.reject(unavailable());if(this.#pending>=16)return Promise.reject(new DomainError('RATE_LIMITED',429,'Table busy. Please wait'));this.#pending++;const began=this.now(),job=this.#tail.then(async()=>{if(this.#closed||!this.enabled()||this.now()-began>=5000)throw unavailable();return work();});this.#tail=job.catch(()=>{});return job.finally(()=>{this.#pending--;});}
 async leave(token:string,raw:unknown){const input=GameLobbyLeaveSchema.parse(raw);return this.run(async()=>{const actor=await this.identity.authenticate(token),table=this.#claims.get(actor.accountId);if(table&&(table.id!==input.tableId||table.generation!==input.generation))throw conflict();if(table)this.remove(table,actor.accountId);return this.view(undefined,actor.accountId);});}
 change(token:string,raw:unknown){const input=GameLobbyInputSchema.parse(raw);return this.run(async()=>{
  const began=this.now(),lease=await this.rooms.gameProjection(token,input.source),account=lease.actor.accountId;this.prune();let table=this.#tables.get(input.source.roomId);const version=table?.version;
  // Explicit table consent shares anonymous seat/ready state, never profiles or
  // hidden room presence. Block always hides the whole table, including counts.
  if(table)for(const player of [...table.players.values()]){if(!await this.rooms.activityAllowed(player.account,'lantern-lodge',table.room)){this.remove(table,player.account);throw unavailable();}if(player.account!==account&&await this.social.isBlocked(account,player.account))throw unavailable();}
  // Fresh identity/policy observation after awaited relationship reads. Never
  // hold the RoomService queue across those reads or mutate after a stale lease.
  const fresh=await this.rooms.gameProjection(token,input.source);
  if(this.#closed||!this.enabled()||!lease.valid()||!fresh.valid()||this.now()<began||this.now()-began>=5000||this.#tables.get(input.source.roomId)!==table||table?.version!==version||table&&[...table.players.values()].some(p=>!p.lease.valid()))throw conflict();
  if(input.op==='view')return this.view(table,account);
  if(input.op==='open'){
   if(table){if(table.mode!==input.mode||!table.players.has(account))throw conflict();return this.view(table,account);}
   if(this.#claims.has(account))throw conflict();if(this.#tables.size>=128)throw new DomainError('RATE_LIMITED',429,'Table capacity unavailable');
   table={id:randomUUID(),generation:randomUUID(),room:input.source.roomId,mode:input.mode,version:1,players:new Map([[account,{account,seat:0,ready:false,lease:fresh}]])};this.#tables.set(table.room,table);this.#claims.set(account,table);return this.view(table,account);
  }
  if(!table||input.tableId!==table.id||input.generation!==table.generation)throw conflict();
  if(input.op==='join'){
   if(table.players.has(account))return this.view(table,account);if(this.#claims.has(account))throw conflict();if(table.players.size>=limits[table.mode].capacity)throw new DomainError('ROOM_FULL',409,'This table is full');
   const used=new Set([...table.players.values()].map(p=>p.seat)),seat=Array.from({length:limits[table.mode].capacity},(_,i)=>i).find(i=>!used.has(i))!;table.players.set(account,{account,seat,ready:false,lease:fresh});this.#claims.set(account,table);for(const player of table.players.values())player.ready=false;table.version++;
  }else{const player=table.players.get(account);if(!player||player.lease.source.membershipId!==fresh.source.membershipId)throw unavailable();if(table.version!==input.expectedVersion)throw conflict();player.ready=input.ready;player.lease=fresh;table.version++;}
  return this.view(table,account);
 });}
 exportAccount(account:string){this.prune();const table=this.#claims.get(account);return {schemaVersion:1,ephemeral:true,consented:!!table,...table?{tableId:table.id,mode:table.mode,ready:table.players.get(account)!.ready}:{}};}
 // Trusted server-only admission; no transport can submit members, sessions or
 // a valid() function. The journal consumes this readiness even on an ambiguous
 // COMMIT, so a positive retry can never reuse an old group's consent.
 admit(token:string,raw:unknown):Promise<GameAdmission>{const input=z.strictObject({schemaVersion:z.literal(1),requestId:GameIdSchema,source:TravelSourceSchema,tableId:GameIdSchema,generation:GameIdSchema,expectedVersion:z.number().int().min(1)}).parse(raw);return this.run(async()=>{
  const lease=await this.rooms.gameProjection(token,input.source);this.prune();const table=this.#tables.get(input.source.roomId);if(!table||table.id!==input.tableId||table.generation!==input.generation||table.version!==input.expectedVersion||!table.players.has(lease.actor.accountId)||table.players.size<limits[table.mode].minimum||[...table.players.values()].some(p=>!p.ready||!p.lease.valid()))throw conflict();const version=table.version,valid=()=>!this.#closed&&this.enabled()&&lease.valid()&&this.#tables.get(table.room)===table&&table.version===version&&[...table.players.values()].every(p=>p.ready&&p.lease.valid());
  return {tableId:table.id,generation:table.generation,roomEpoch:input.source.epoch,roomId:table.room,mode:table.mode,members:[...table.players.values()].map(p=>({accountId:p.account,membershipId:p.lease.source.membershipId,sessionId:p.lease.actor.sessionId,seatIndex:p.seat})),valid,consume:()=>{if(!valid())throw conflict();for(const player of table.players.values())player.ready=false;table.version++;}};
 });}
 async close(){this.#closed=true;for(const unsubscribe of this.#unsubscribe)unsubscribe();await this.#tail;this.#tables.clear();this.#claims.clear();}
}
