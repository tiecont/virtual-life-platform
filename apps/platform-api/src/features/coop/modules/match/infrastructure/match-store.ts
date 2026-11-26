import type {Pool} from 'pg';
import {CoopSkillLevelBindingSchema} from '@aetheria/contracts';
import type {
 CoopAllocationRecord,CoopAllocationStatus,CoopMatchStorePort,CoopSeat,
} from '../application/provisioner';

type Row={
 match_id:string;room_id:string;world_id:string;boot_id:string;
 config_version:unknown;config_digest:string;content_hash:string;
 bound_seats:unknown;boss_id:string;status:CoopAllocationStatus;generation:unknown;
};
const ALLOCATIONS=`SELECT a.*,r.boss_id,
  (SELECT jsonb_agg(e.seat || jsonb_build_object('ownedPetInstanceId',
    COALESCE(e.seat->>'ownedPetInstanceId',s.owned_pet_instance_id::text,p.owned_pet_instance_id::text)) ORDER BY e.ordinal)
   FROM jsonb_array_elements(a.seats) WITH ORDINALITY e(seat,ordinal)
   LEFT JOIN coop_room_seats s ON s.room_id=a.room_id AND s.seat=e.ordinal-1
    AND s.account_id::text=e.seat->>'account' AND s.pet_id=e.seat->>'petId'
   LEFT JOIN pet_wave_one_owned p ON p.account_id=s.account_id AND p.pet_id=s.pet_id) AS bound_seats
 FROM coop_allocations a JOIN coop_rooms r ON r.id=a.room_id`;

function seats(value:unknown):readonly CoopSeat[]{
 if(!Array.isArray(value)||value.length!==4)throw new Error('Cooperative allocation seats are invalid');
 return Object.freeze(value.map(entry=>{
  const seat=entry as {account?:unknown;petId?:unknown;petLevel?:unknown;artifactPowerPm?:unknown;ownedPetInstanceId?:unknown;skillLevels?:unknown};
  if(typeof seat.account!=='string'||typeof seat.petId!=='string'||
    typeof seat.petLevel!=='number'||typeof seat.artifactPowerPm!=='number'||typeof seat.ownedPetInstanceId!=='string')
   throw new Error('Cooperative allocation seats are invalid');
  const skillLevels=CoopSkillLevelBindingSchema.array().max(5).optional().parse(seat.skillLevels);
  return Object.freeze({
   account:seat.account,petId:seat.petId,petLevel:seat.petLevel,artifactPowerPm:seat.artifactPowerPm,
   ownedPetInstanceId:seat.ownedPetInstanceId,...skillLevels===undefined?{}:{skillLevels},
  });
 }));
}
function map(row:Row):CoopAllocationRecord{
 return Object.freeze({
  matchId:row.match_id,roomId:row.room_id,worldId:row.world_id,bootId:row.boot_id,
  configVersion:Number(row.config_version),configDigest:row.config_digest,contentHash:row.content_hash,
  bossId:row.boss_id,seats:seats(row.bound_seats),status:row.status,generation:Number(row.generation),
 });
}

// Server-owned cooperative allocation journal. The native match row is created
// later by the Rust host, so this table is the pre-commit identity and the only
// source for the frozen seats and the published configuration binding.
export class CoopMatchStore implements CoopMatchStorePort{
 constructor(private readonly db:Pick<Pool,'query'>){}
 async findByRoom(roomId:string){
  const row=(await this.db.query<Row>(`${ALLOCATIONS} WHERE a.room_id=$1`,[roomId])).rows[0];
  return row?map(row):undefined;
 }
 async listRecoverable(){
  const rows=(await this.db.query<Row>(`${ALLOCATIONS} WHERE a.status='ACTIVE' ORDER BY a.created_at`)).rows;
  return Object.freeze(rows.map(map));
 }
 async listStarting(){
  const rows=(await this.db.query<Row>(`${ALLOCATIONS} WHERE a.status='STARTING' ORDER BY a.created_at`)).rows;
  return Object.freeze(rows.map(map));
 }
 async recovered(matchId:string,generation:number){
  const result=await this.db.query("UPDATE coop_allocations SET generation=$2,updated_at=clock_timestamp() WHERE match_id=$1 AND status='ACTIVE'",[matchId,generation]);
  if(result.rowCount!==1)throw new Error('Cooperative allocation recovery conflict');
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
