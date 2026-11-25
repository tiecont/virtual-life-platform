import type {Pool} from 'pg';
import type {
 CoopAllocationRecord,CoopAllocationStatus,CoopMatchStorePort,CoopSeat,
} from '../application/provisioner';

type Row={
 match_id:string;room_id:string;world_id:string;boot_id:string;
 config_version:unknown;config_digest:string;content_hash:string;
 seats:unknown;status:CoopAllocationStatus;generation:unknown;
};
const COLUMNS='match_id,room_id,world_id,boot_id,config_version,config_digest,content_hash,seats,status,generation';

function seats(value:unknown):readonly CoopSeat[]{
 if(!Array.isArray(value)||value.length!==4)throw new Error('Cooperative allocation seats are invalid');
 return Object.freeze(value.map(entry=>{
  const seat=entry as {account?:unknown;petId?:unknown;petLevel?:unknown;artifactPowerPm?:unknown};
  if(typeof seat.account!=='string'||typeof seat.petId!=='string'||
    typeof seat.petLevel!=='number'||typeof seat.artifactPowerPm!=='number')
   throw new Error('Cooperative allocation seats are invalid');
  return Object.freeze({account:seat.account,petId:seat.petId,petLevel:seat.petLevel,artifactPowerPm:seat.artifactPowerPm});
 }));
}
function map(row:Row):CoopAllocationRecord{
 return Object.freeze({
  matchId:row.match_id,roomId:row.room_id,worldId:row.world_id,bootId:row.boot_id,
  configVersion:Number(row.config_version),configDigest:row.config_digest,contentHash:row.content_hash,
  seats:seats(row.seats),status:row.status,generation:Number(row.generation),
 });
}

// Server-owned cooperative allocation journal. The native match row is created
// later by the Rust host, so this table is the pre-commit identity and the only
// source for the frozen seats and the published configuration binding.
export class CoopMatchStore implements CoopMatchStorePort{
 constructor(private readonly db:Pick<Pool,'query'>){}
 async findByRoom(roomId:string){
  const row=(await this.db.query<Row>(`SELECT ${COLUMNS} FROM coop_allocations WHERE room_id=$1`,[roomId])).rows[0];
  return row?map(row):undefined;
 }
 async create(record:CoopAllocationRecord){
  await this.db.query(
   "INSERT INTO coop_allocations(match_id,room_id,ruleset,config_version,config_digest,content_hash,world_id,boot_id,generation,seats,status) VALUES($1,$2,'arena8-coop-pve',$3,$4,$5,$6,$7,$8,$9::jsonb,$10)",
   [record.matchId,record.roomId,record.configVersion,record.configDigest,record.contentHash,record.worldId,record.bootId,record.generation,JSON.stringify(record.seats),record.status],
  );
 }
 async activate(matchId:string,generation:number){
  const result=await this.db.query("UPDATE coop_allocations SET status='ACTIVE',generation=$2,updated_at=clock_timestamp() WHERE match_id=$1 AND status='STARTING'",[matchId,generation]);
  if(result.rowCount!==1)throw new Error('Cooperative allocation activation conflict');
 }
 async fail(matchId:string){
  await this.db.query("UPDATE coop_allocations SET status='FAILED',updated_at=clock_timestamp() WHERE match_id=$1 AND status IN ('STARTING','ACTIVE')",[matchId]);
 }
 async close(matchId:string){
  await this.db.query("UPDATE coop_allocations SET status='CLOSED',updated_at=clock_timestamp() WHERE match_id=$1 AND status IN ('STARTING','ACTIVE')",[matchId]);
 }
}
