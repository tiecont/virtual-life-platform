import type {PoolClient} from 'pg';
import type {CoopRoomStatus} from '@aetheria/contracts';

type Queryable=Pick<PoolClient,'query'>;
const ROOM_COLUMNS='id,ruleset,boss_id AS "bossId",host_account_id AS "hostAccountId",config_version AS "configVersion",config_digest AS "configDigest",required_points AS "requiredPoints",status,revision,created_at AS "createdAt"';
const SEAT_COLUMNS='room_id AS "roomId",seat,account_id AS "accountId",pet_id AS "petId",pet_level AS "petLevel",artifact_power_pm AS "artifactPowerPm",ready';
const numeric=(value:unknown)=>Number(value as string|number);

export type CoopPublishedConfig=Readonly<{version:number;digest:string;bossId:string;requiredPoints:number}>;
export type CoopRoomRow=Readonly<{
 id:string;ruleset:string;bossId:string;hostAccountId:string;configVersion:number;
 configDigest:string;requiredPoints:number;status:CoopRoomStatus;revision:number;createdAt:Date;
}>;
export type CoopSeatRow=Readonly<{
 roomId:string;seat:number;accountId:string;petId:string|null;petLevel:number|null;artifactPowerPm:number;ready:boolean;
}>;

function room(row:Record<string,unknown>):CoopRoomRow{
 return Object.freeze({
  id:String(row.id),ruleset:String(row.ruleset),bossId:String(row.bossId),hostAccountId:String(row.hostAccountId),
  configVersion:numeric(row.configVersion),configDigest:String(row.configDigest),requiredPoints:numeric(row.requiredPoints),
  status:row.status as CoopRoomStatus,revision:numeric(row.revision),createdAt:row.createdAt as Date,
 });
}
function seat(row:Record<string,unknown>):CoopSeatRow{
 return Object.freeze({
  roomId:String(row.roomId),seat:numeric(row.seat),accountId:String(row.accountId),
  petId:(row.petId??null) as string|null,petLevel:row.petLevel===null||row.petLevel===undefined?null:numeric(row.petLevel),
  artifactPowerPm:numeric(row.artifactPowerPm),ready:Boolean(row.ready),
 });
}

// Durable cooperative room persistence. The service owns authorization and
// transitions; this store owns bounded SQL and the pinned configuration read.
export class CoopRoomStore{
 async activeConfiguration(tx:Queryable):Promise<Readonly<{version:number;digest:string;bundle:Record<string,unknown>}>>{
  const result=await tx.query<{version:unknown;digest:string;bundle:Record<string,unknown>}>('SELECT v.version,v.content_digest AS digest,v.bundle FROM gameplay_config_active a JOIN gameplay_config_versions v ON v.ruleset=a.ruleset AND v.version=a.version WHERE a.ruleset=$1',['arena8-coop-pve']);
  const row=result.rows[0];
  if(!row)throw new Error('No published cooperative configuration');
  return Object.freeze({version:numeric(row.version),digest:String(row.digest),bundle:row.bundle});
 }
 async achievementPoints(tx:Queryable,accountId:string):Promise<number>{
  const result=await tx.query<{points:unknown}>('SELECT COALESCE(SUM(points),0)::int AS points FROM coop_achievement_ledger WHERE account_id=$1',[accountId]);
  return numeric(result.rows[0]?.points??0);
 }
 async ownedPet(tx:Queryable,accountId:string,petId:string):Promise<Readonly<{level:number}>|undefined>{
  const result=await tx.query<{level:unknown}>('SELECT level FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2',[accountId,petId]);
  const row=result.rows[0];
  return row?Object.freeze({level:numeric(row.level)}):undefined;
 }
 async createRoom(tx:Queryable,input:Readonly<{id:string;bossId:string;hostAccountId:string;configVersion:number;configDigest:string;requiredPoints:number}>):Promise<CoopRoomRow>{
  const result=await tx.query<Record<string,unknown>>(`INSERT INTO coop_rooms(id,ruleset,boss_id,host_account_id,config_version,config_digest,required_points,status,revision) VALUES($1,'arena8-coop-pve',$2,$3,$4,$5,$6,'OPEN',1) RETURNING ${ROOM_COLUMNS}`,
   [input.id,input.bossId,input.hostAccountId,input.configVersion,input.configDigest,input.requiredPoints]);
  return room(result.rows[0]!);
 }
 async room(tx:Queryable,roomId:string,lock=false):Promise<CoopRoomRow|undefined>{
  const result=await tx.query<Record<string,unknown>>(`SELECT ${ROOM_COLUMNS} FROM coop_rooms WHERE id=$1${lock?' FOR UPDATE':''}`,[roomId]);
  return result.rows[0]?room(result.rows[0]):undefined;
 }
 async seats(tx:Queryable,roomId:string):Promise<CoopSeatRow[]>{
  const result=await tx.query<Record<string,unknown>>(`SELECT ${SEAT_COLUMNS} FROM coop_room_seats WHERE room_id=$1 ORDER BY seat`,[roomId]);
  return result.rows.map(seat);
 }
 async seatFor(tx:Queryable,roomId:string,accountId:string):Promise<CoopSeatRow|undefined>{
  const result=await tx.query<Record<string,unknown>>(`SELECT ${SEAT_COLUMNS} FROM coop_room_seats WHERE room_id=$1 AND account_id=$2`,[roomId,accountId]);
  return result.rows[0]?seat(result.rows[0]):undefined;
 }
 async addSeat(tx:Queryable,input:Readonly<{roomId:string;seat:number;accountId:string;petId:string|null;petLevel:number|null}>):Promise<void>{
  await tx.query('INSERT INTO coop_room_seats(room_id,seat,account_id,pet_id,pet_level) VALUES($1,$2,$3,$4,$5)',[input.roomId,input.seat,input.accountId,input.petId,input.petLevel]);
 }
 async selectPet(tx:Queryable,input:Readonly<{roomId:string;accountId:string;petId:string;petLevel:number}>):Promise<void>{
  await tx.query('UPDATE coop_room_seats SET pet_id=$3,pet_level=$4,ready=false WHERE room_id=$1 AND account_id=$2',[input.roomId,input.accountId,input.petId,input.petLevel]);
 }
 async setReady(tx:Queryable,input:Readonly<{roomId:string;accountId:string;ready:boolean}>):Promise<void>{
  await tx.query('UPDATE coop_room_seats SET ready=$3 WHERE room_id=$1 AND account_id=$2',[input.roomId,input.accountId,input.ready]);
 }
 async removeSeat(tx:Queryable,roomId:string,accountId:string):Promise<void>{
  await tx.query('DELETE FROM coop_room_seats WHERE room_id=$1 AND account_id=$2',[roomId,accountId]);
 }
 async setStatus(tx:Queryable,input:Readonly<{roomId:string;status:CoopRoomStatus;expectedRevision:number}>):Promise<CoopRoomRow|undefined>{
  const result=await tx.query<Record<string,unknown>>(`UPDATE coop_rooms SET status=$2,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 AND revision=$3 RETURNING ${ROOM_COLUMNS}`,[input.roomId,input.status,input.expectedRevision]);
  return result.rows[0]?room(result.rows[0]):undefined;
 }
 async touch(tx:Queryable,input:Readonly<{roomId:string;expectedRevision:number}>):Promise<CoopRoomRow|undefined>{
  const result=await tx.query<Record<string,unknown>>(`UPDATE coop_rooms SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 AND revision=$2 RETURNING ${ROOM_COLUMNS}`,[input.roomId,input.expectedRevision]);
  return result.rows[0]?room(result.rows[0]):undefined;
 }
 async findRequest(tx:Queryable,accountId:string,requestId:string):Promise<Readonly<{fingerprint:string;response:Record<string,unknown>}>|undefined>{
  const result=await tx.query<{fingerprint:string;response:Record<string,unknown>}>('SELECT fingerprint,response FROM coop_room_requests WHERE account_id=$1 AND request_id=$2',[accountId,requestId]);
  return result.rows[0];
 }
 async saveRequest(tx:Queryable,input:Readonly<{accountId:string;requestId:string;fingerprint:string;response:unknown}>):Promise<void>{
  await tx.query('INSERT INTO coop_room_requests(account_id,request_id,fingerprint,response) VALUES($1,$2,$3,$4::jsonb)',[input.accountId,input.requestId,input.fingerprint,JSON.stringify(input.response)]);
 }
 async event(tx:Queryable,input:Readonly<{roomId:string;accountId:string|null;action:string;fromState:string|null;toState:string|null}>):Promise<void>{
  await tx.query('INSERT INTO coop_room_events(room_id,account_id,action,from_state,to_state) VALUES($1,$2,$3,$4,$5)',[input.roomId,input.accountId,input.action,input.fromState,input.toState]);
 }
}
