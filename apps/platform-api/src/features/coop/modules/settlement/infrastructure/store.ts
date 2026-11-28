import type {PoolClient} from 'pg';
import type {CoopRoomStatus} from '@aetheria/contracts';
import {recordArena8MapClear} from '../../../../pets/modules/wave1/infrastructure/store';
import {initializeArtifactInventory} from '../../../../pets/modules/wave-a-artifacts/infrastructure/store';

type Queryable=Pick<PoolClient,'query'>;
const SEAT_LIMIT=4;

export type CoopSettlementEvent=Readonly<{
 eventId:string;settlementId:string;matchId:string;proposal:Record<string,unknown>;
 proposalHash:Buffer;stateVersion:string;epoch:string;
}>;
export type CoopAllocationBinding=Readonly<{
 roomId:string;bossId:string;worldId:string;configVersion:number;configDigest:string;contentHash:string;
 seats:readonly {account:string;petId:string;petLevel:number;ownedPetInstanceId:string|null}[];
}>;

function seats(value:unknown){
 if(!Array.isArray(value)||value.length!==SEAT_LIMIT)throw new Error('Cooperative settlement seats are invalid');
 return Object.freeze(value.map(entry=>{
  const seat=entry as {account?:unknown;petId?:unknown;petLevel?:unknown;ownedPetInstanceId?:unknown};
  if(typeof seat.account!=='string'||typeof seat.petId!=='string'||typeof seat.petLevel!=='number'||(seat.ownedPetInstanceId!==undefined&&typeof seat.ownedPetInstanceId!=='string'))
   throw new Error('Cooperative settlement seats are invalid');
  return Object.freeze({account:seat.account,petId:seat.petId,petLevel:seat.petLevel,ownedPetInstanceId:seat.ownedPetInstanceId??null});
 }));
}

// Durable settlement reads and writes. All calls receive the worker
// transaction so the outbox claim, rewards, inbox and completion commit once.
export class CoopSettlementStore{
 async next(tx:Queryable,matchId?:string):Promise<CoopSettlementEvent|undefined>{
  const result=await tx.query<{
   event_id:string;settlement_id:string;match_id:string;proposal:Record<string,unknown>;
   proposal_hash:Buffer;state_version:unknown;epoch:unknown;
  }>(`
   SELECT o.event_id,o.settlement_id,s.match_id,s.proposal,s.proposal_hash,s.state_version,s.epoch
   FROM game_native_outbox o
   JOIN game_native_settlements s USING (match_id,settlement_id)
   JOIN game_native_matches m ON m.id=s.match_id
   JOIN coop_allocations a ON a.match_id=s.match_id
   WHERE o.delivered_at IS NULL AND o.available_at<=clock_timestamp()
     AND o.effect_type='game.settlement.v1'
     AND m.ruleset_id='arena8-coop-pve' AND m.status='SETTLING'
     AND m.state_version=s.state_version AND m.epoch=s.epoch
     AND a.status IN ('ACTIVE','SETTLED')
   ${matchId===undefined?'':'AND s.match_id=$1'}
   ORDER BY o.available_at,o.event_id LIMIT 1 FOR UPDATE OF o ${matchId===undefined?'SKIP LOCKED':'NOWAIT'}`,
   matchId===undefined?[]:[matchId]);
  const row=result.rows[0];
  return row?Object.freeze({
   eventId:row.event_id,settlementId:row.settlement_id,matchId:row.match_id,proposal:row.proposal,
   proposalHash:row.proposal_hash,stateVersion:String(row.state_version),epoch:String(row.epoch),
  }):undefined;
 }
 async terminalRooms(tx:Queryable,accountId:string):Promise<readonly {
  roomId:string;roomStatus:CoopRoomStatus;revision:number;matchId:string;matchStatus:'SETTLING'|'FINISHED';
 }[]>{
  const result=await tx.query<{
   roomId:string;roomStatus:CoopRoomStatus;revision:number;matchId:string;matchStatus:'SETTLING'|'FINISHED';
  }>(`
   SELECT r.id AS "roomId",r.status AS "roomStatus",r.revision,m.id AS "matchId",m.status AS "matchStatus"
   FROM coop_rooms r
   JOIN coop_allocations a ON a.room_id=r.id
   JOIN game_native_matches m ON m.id=a.match_id
   WHERE m.ruleset_id='arena8-coop-pve' AND m.status IN ('SETTLING','FINISHED')
     AND (r.host_account_id=$1 OR EXISTS (
       SELECT 1 FROM coop_room_seats s WHERE s.room_id=r.id AND s.account_id=$1
     ))
   ORDER BY r.id FOR UPDATE OF r,m NOWAIT`,[accountId]);
  return result.rows;
 }
 async inbox(tx:Queryable,settlementId:string):Promise<Readonly<{outcome:string}>|undefined>{
  const row=(await tx.query<{outcome:string}>('SELECT outcome FROM coop_settlement_inbox WHERE settlement_id=$1',[settlementId])).rows[0];
  return row?Object.freeze({outcome:row.outcome}):undefined;
 }
 async allocation(tx:Queryable,matchId:string):Promise<CoopAllocationBinding|undefined>{
  const row=(await tx.query<{
   room_id:string;boss_id:string;world_id:string;config_version:unknown;config_digest:string;content_hash:string;seats:unknown;
  }>('SELECT a.room_id,r.boss_id,a.world_id,a.config_version,a.config_digest,a.content_hash,a.seats FROM coop_allocations a JOIN coop_rooms r ON r.id=a.room_id WHERE a.match_id=$1',[matchId])).rows[0];
  return row?Object.freeze({
   roomId:row.room_id,bossId:row.boss_id,worldId:row.world_id,configVersion:Number(row.config_version),
   configDigest:row.config_digest,contentHash:row.content_hash,seats:seats(row.seats),
  }):undefined;
 }
 async bundle(tx:Queryable,version:number,digest:string):Promise<Record<string,unknown>|undefined>{
  const row=(await tx.query<{bundle:Record<string,unknown>}>(
   "SELECT bundle FROM gameplay_config_versions WHERE ruleset='arena8-coop-pve' AND version=$1 AND content_digest=$2 AND published_at IS NOT NULL",
   [version,digest],
  )).rows[0];
  return row?.bundle;
 }
 async participatingAccounts(tx:Queryable,matchId:string,terminalVersion:string,minimumActions:number):Promise<Set<string>>{
  // Each committed version has exactly one receipt, including support moves.
  // Version one starts the board and is not a combat action.
  const {rows}=await tx.query<{actor_id:string}>(
   `SELECT actor_id FROM game_native_receipts WHERE match_id=$1 AND committed_version>1 AND committed_version<=$2
    GROUP BY actor_id HAVING count(*) >= $3`,[matchId,terminalVersion,minimumActions]);
  return new Set(rows.map(row=>row.actor_id));
 }
 async accountActive(tx:Queryable,accountId:string):Promise<boolean>{
  return (await tx.query("SELECT 1 FROM identity_accounts WHERE id=$1 AND status='active'",[accountId])).rowCount===1;
 }
 async clearBoss(tx:Queryable,accountId:string,mapId:string,recruitmentPetIds:readonly string[]|null|undefined):Promise<boolean>{
  // Serialize with the Wave 1 ownership and campaign writers before checking
  // the encounter pair and choosing the first unowned species.
  await tx.query('SELECT 1 FROM pet_wave_one_players WHERE account_id=$1 FOR UPDATE',[accountId]);
  const first=await tx.query(
   `INSERT INTO pet_wave_one_encounters(account_id,map_id,encounter_id,coop_recruitment_pet_ids)
    VALUES ($1,$2,$2 || '-boss',$3) ON CONFLICT DO NOTHING RETURNING encounter_id`,[accountId,mapId,recruitmentPetIds??null]);
  if(first.rowCount!==1)return false;
  await recordArena8MapClear(tx,accountId,mapId);
  return true;
 }
 async materials(tx:Queryable,accountId:string,amount:number):Promise<void>{
  if(amount===0)return;
  await initializeArtifactInventory(tx,accountId);
  await tx.query(
   `UPDATE pet_artifact_players SET materials=materials+$2,revision=revision+1,
    updated_at=clock_timestamp() WHERE account_id=$1`,[accountId,amount]);
 }
 async begin(tx:Queryable,input:Readonly<{
  settlementId:string;matchId:string;roomId:string;outcome:'won'|'lost';points:number;
 }>):Promise<void>{
  await tx.query(
   `INSERT INTO coop_settlement_inbox(settlement_id,match_id,room_id,outcome,achievement_points)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT (settlement_id) DO NOTHING`,
   [input.settlementId,input.matchId,input.roomId,input.outcome,input.points],
  );
 }
 async award(tx:Queryable,input:Readonly<{
  settlementId:string;accountId:string;seat:number;outcome:'won'|'lost';
  points:number;coins:number;exp:number;materials:number;firstClear:boolean;petId:string;ownedPetInstanceId:string|null;petLevel:number;petExp:number;currentLevel:number;currentExp:number;
 }>):Promise<void>{
  if(input.points>0){
   await tx.query(
    "INSERT INTO coop_achievement_ledger(account_id,points,source,source_ref) VALUES($1,$2,'settlement',$3) ON CONFLICT DO NOTHING",
    [input.accountId,input.points,input.settlementId],
   );
  }
  if(input.coins>0){
   await tx.query(
    `INSERT INTO pet_wave_one_players(account_id,coins) VALUES($1,$2)
     ON CONFLICT(account_id) DO UPDATE SET coins=pet_wave_one_players.coins+EXCLUDED.coins,
       revision=pet_wave_one_players.revision+1,updated_at=clock_timestamp()`,
    [input.accountId,input.coins],
   );
  }
  if(input.exp>0){
   await tx.query('UPDATE pet_wave_one_owned SET level=$3,exp=$4 WHERE account_id=$1 AND pet_id=$2 AND ($5::uuid IS NULL OR owned_pet_instance_id=$5)',[
    input.accountId,input.petId,input.petLevel,input.petExp,input.ownedPetInstanceId,
   ]);
  }
  await tx.query(
   `INSERT INTO coop_settlement_rewards(settlement_id,account_id,seat,outcome,achievement_points,coins,exp,pet_id,materials,first_clear)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (settlement_id,account_id) DO NOTHING`,
   [input.settlementId,input.accountId,input.seat,input.outcome,input.points,input.coins,input.exp,input.petId,input.materials,input.firstClear],
  );
 }
 async pet(tx:Queryable,accountId:string,petId:string,ownedPetInstanceId:string|null):Promise<Readonly<{level:number;exp:number}>|undefined>{
  const row=(await tx.query<{level:unknown;exp:unknown}>('SELECT level,exp FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2 AND ($3::uuid IS NULL OR owned_pet_instance_id=$3) FOR UPDATE',[accountId,petId,ownedPetInstanceId])).rows[0];
  return row?Object.freeze({level:Number(row.level),exp:Number(row.exp)}):undefined;
 }
 async finish(tx:Queryable,input:Readonly<{
  eventId:string;settlementId:string;matchId:string;roomId:string;outcome:'won'|'lost';points:number;
 }>):Promise<void>{
  await tx.query(
   `INSERT INTO coop_settlement_inbox(settlement_id,match_id,room_id,outcome,achievement_points)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT (settlement_id) DO NOTHING`,
   [input.settlementId,input.matchId,input.roomId,input.outcome,input.points],
  );
  await tx.query("UPDATE game_native_outbox SET delivered_at=clock_timestamp(),delivery_outcome='granted' WHERE event_id=$1 AND delivered_at IS NULL",[input.eventId]);
  await tx.query("UPDATE coop_allocations SET status='SETTLED',updated_at=clock_timestamp() WHERE match_id=$1 AND status='ACTIVE'",[input.matchId]);
  await tx.query("UPDATE game_native_matches SET status='FINISHED',updated_at=clock_timestamp() WHERE id=$1 AND status='SETTLING'",[input.matchId]);
 }
}
