import type {Pool,PoolClient} from 'pg';
import {STARTING_COINS,STARTER_PET_IDS} from '../domain/catalog';

export type Wave1PlayerRow=Readonly<{
  coins:number;revision:number;gachaMisses:number;gachaGuaranteed:boolean;gachaRevision:number;
}>;
export type Wave1OwnedRow=Readonly<{
  petId:string;ownedPetInstanceId:string;level:number;exp:number;duplicateExp:number;
  source:'starter'|'gacha'|'campaign';acquiredAt:Date;
}>;
export type Wave1ClearRow=Readonly<{mapId:string;replays:number;clearedAt:Date}>;
export type Wave1GachaRow=Readonly<{
  seq:number;petId:string|null;featured:boolean;duplicate:boolean;pityBefore:number;createdAt:Date;
}>;
export type Wave1ReceiptRow=Readonly<{fingerprint:string;response:unknown}>;

const PLAYER_COLUMNS=`coins,revision,gacha_misses AS "gachaMisses",gacha_guaranteed AS "gachaGuaranteed",gacha_revision AS "gachaRevision"`;
const OWNED_COLUMNS=`pet_id AS "petId",owned_pet_instance_id AS "ownedPetInstanceId",level,exp,duplicate_exp AS "duplicateExp",source,acquired_at AS "acquiredAt"`;
const CLEAR_COLUMNS=`map_id AS "mapId",replays,cleared_at AS "clearedAt"`;
const GACHA_COLUMNS=`seq,pet_id AS "petId",featured,duplicate,pity_before AS "pityBefore",created_at AS "createdAt"`;

// Call while holding the Wave 1 player lock, after recording the completed
// encounter. Only the transaction inserting the map clear can grant its
// first missing Pet from the cooperative Boss receipt's pinned order.
export async function recordArena8MapClear(db:Pick<PoolClient,'query'>,accountId:string,mapId:string):Promise<string|null>{
  const grant=await db.query<{pet_id:string}>(
    `WITH first_clear AS (
       INSERT INTO pet_wave_one_map_clears(account_id,map_id)
       SELECT $1,$2 WHERE (
         SELECT count(*) FROM pet_wave_one_encounters
         WHERE account_id=$1 AND map_id=$2 AND encounter_id IN ($2 || '-regular',$2 || '-boss')
       )=2
       ON CONFLICT DO NOTHING RETURNING account_id,map_id
     )
     INSERT INTO pet_wave_one_owned(account_id,pet_id,owned_pet_instance_id,level,exp,source)
     SELECT clear.account_id,candidate.pet_id,aetheria_pet_instance_id(clear.account_id || ':' || candidate.pet_id || ':v1'),1,0,'campaign'
     FROM first_clear clear
     JOIN pet_wave_one_encounters boss ON boss.account_id=clear.account_id
       AND boss.map_id=clear.map_id AND boss.encounter_id=clear.map_id || '-boss'
     CROSS JOIN LATERAL unnest(boss.coop_recruitment_pet_ids) WITH ORDINALITY AS candidate(pet_id,priority)
     WHERE NOT EXISTS(
       SELECT 1 FROM pet_wave_one_owned WHERE account_id=clear.account_id AND pet_id=candidate.pet_id
     )
     ORDER BY candidate.priority LIMIT 1
     ON CONFLICT (account_id,pet_id) DO NOTHING RETURNING pet_id`,[accountId,mapId],
  );
  return grant.rows[0]?.pet_id??null;
}

// One transaction owner for Wave 1 state. The account player row is locked
// before any command work, so idempotency, wallet and Pet updates serialize.
export class Wave1Store {
  constructor(private pool:Pick<Pool,'connect'>){}

  async transact<T>(accountId:string,work:(tx:Wave1Transaction)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const created=await client.query(
        'INSERT INTO pet_wave_one_players(account_id,coins) VALUES($1,$2) ON CONFLICT(account_id) DO NOTHING RETURNING account_id',
        [accountId,STARTING_COINS],
      );
      if((created.rowCount??0)>0){
        for(const petId of STARTER_PET_IDS){
          await client.query("INSERT INTO pet_wave_one_owned(account_id,pet_id,owned_pet_instance_id,level,exp,source) VALUES($1,$2,aetheria_pet_instance_id($1 || ':' || $2 || ':v1'),1,0,'starter')",[accountId,petId]);
        }
        for(const [slot,petId] of STARTER_PET_IDS.entries()){
          await client.query("INSERT INTO pet_wave_one_party(account_id,slot,pet_id,owned_pet_instance_id) VALUES($1,$2,$3,aetheria_pet_instance_id($1 || ':' || $3 || ':v1'))",[accountId,slot,petId]);
        }
      }
      await client.query(`SELECT ${PLAYER_COLUMNS} FROM pet_wave_one_players WHERE account_id=$1 FOR UPDATE`,[accountId]);
      const value=await work(new Wave1Transaction(client,accountId));
      await client.query('COMMIT');
      return value;
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{client.release();}
  }

  async exportAccount(db:Pick<PoolClient,'query'>,accountId:string){
    const player=(await db.query<Wave1PlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM pet_wave_one_players WHERE account_id=$1 FOR SHARE`,[accountId])).rows[0];
    if(!player)return {schemaVersion:1,initialized:false};
    const pets=(await db.query<Wave1OwnedRow>(`SELECT ${OWNED_COLUMNS} FROM pet_wave_one_owned WHERE account_id=$1 ORDER BY acquired_at,pet_id`,[accountId])).rows;
    const party=(await db.query<{petId:string;ownedPetInstanceId:string}>('SELECT pet_id AS "petId",owned_pet_instance_id AS "ownedPetInstanceId" FROM pet_wave_one_party WHERE account_id=$1 ORDER BY slot',[accountId])).rows;
    const clears=(await db.query<Wave1ClearRow>(`SELECT ${CLEAR_COLUMNS} FROM pet_wave_one_map_clears WHERE account_id=$1 ORDER BY cleared_at`,[accountId])).rows;
    const gacha=(await db.query<Wave1GachaRow>(`SELECT ${GACHA_COLUMNS} FROM pet_wave_one_gacha_history WHERE account_id=$1 ORDER BY seq`,[accountId])).rows;
    return {
      schemaVersion:1,initialized:true,revision:player.revision,wallet:{coins:player.coins},
      pets:pets.map(row=>({petId:row.petId,level:row.level,exp:row.exp,duplicateExp:row.duplicateExp,source:row.source,acquiredAt:row.acquiredAt.toISOString()})),
      party:party.map(row=>row.petId),
      clears:clears.map(row=>({mapId:row.mapId,replays:row.replays,clearedAt:row.clearedAt.toISOString()})),
      gacha:{misses:player.gachaMisses,guaranteed:player.gachaGuaranteed,revision:player.gachaRevision,
        history:gacha.map(row=>({seq:row.seq,petId:row.petId,featured:row.featured,duplicate:row.duplicate,pityBefore:row.pityBefore,createdAt:row.createdAt.toISOString()}))},
    };
  }
}

export class Wave1Transaction {
  constructor(private client:PoolClient,private accountId:string){}

  async player():Promise<Wave1PlayerRow>{
    const row=(await this.client.query<Wave1PlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM pet_wave_one_players WHERE account_id=$1`,[this.accountId])).rows[0];
    if(!row)throw new Error('Wave 1 player state is unavailable');
    return row;
  }

  async owned():Promise<Wave1OwnedRow[]>{
    return (await this.client.query<Wave1OwnedRow>(`SELECT ${OWNED_COLUMNS} FROM pet_wave_one_owned WHERE account_id=$1 ORDER BY acquired_at,pet_id`,[this.accountId])).rows;
  }

  async party():Promise<string[]>{
    return (await this.client.query<{petId:string}>('SELECT pet_id AS "petId",owned_pet_instance_id AS "ownedPetInstanceId" FROM pet_wave_one_party WHERE account_id=$1 ORDER BY slot',[this.accountId])).rows.map(row=>row.petId);
  }

  async clears():Promise<Wave1ClearRow[]>{
    return (await this.client.query<Wave1ClearRow>(`SELECT ${CLEAR_COLUMNS} FROM pet_wave_one_map_clears WHERE account_id=$1 ORDER BY cleared_at`,[this.accountId])).rows;
  }

  async gachaHistory():Promise<Wave1GachaRow[]>{
    return (await this.client.query<Wave1GachaRow>(`SELECT ${GACHA_COLUMNS} FROM (SELECT * FROM pet_wave_one_gacha_history WHERE account_id=$1 ORDER BY seq DESC LIMIT 100) AS recent ORDER BY seq`,[this.accountId])).rows;
  }

  async receipt(requestId:string):Promise<Wave1ReceiptRow|undefined>{
    return (await this.client.query<Wave1ReceiptRow>('SELECT fingerprint,response FROM pet_wave_one_requests WHERE account_id=$1 AND request_id=$2',[this.accountId,requestId])).rows[0];
  }

  async saveReceipt(requestId:string,fingerprint:string,response:unknown):Promise<void>{
    await this.client.query('INSERT INTO pet_wave_one_requests(account_id,request_id,fingerprint,response) VALUES($1,$2,$3,$4)',[this.accountId,requestId,fingerprint,JSON.stringify(response)]);
  }

  async replaceParty(petIds:readonly string[]):Promise<void>{
    await this.client.query('DELETE FROM pet_wave_one_party WHERE account_id=$1',[this.accountId]);
    for(const [slot,petId] of petIds.entries()){
      await this.client.query("INSERT INTO pet_wave_one_party(account_id,slot,pet_id,owned_pet_instance_id) VALUES($1,$2,$3,aetheria_pet_instance_id($1 || ':' || $3 || ':v1'))",[this.accountId,slot,petId]);
    }
  }

  async insertOwned(petId:string,source:'starter'|'gacha'|'campaign'):Promise<void>{
    await this.client.query("INSERT INTO pet_wave_one_owned(account_id,pet_id,owned_pet_instance_id,level,exp,source) VALUES($1,$2,aetheria_pet_instance_id($1 || ':' || $2 || ':v1'),1,0,$3)",[this.accountId,petId,source]);
  }

  async setProgress(petId:string,level:number,exp:number,duplicateExpDelta:number):Promise<void>{
    await this.client.query('UPDATE pet_wave_one_owned SET level=$3,exp=$4,duplicate_exp=duplicate_exp+$5 WHERE account_id=$1 AND pet_id=$2',[this.accountId,petId,level,exp,duplicateExpDelta]);
  }

  async credit(coins:number):Promise<void>{
    await this.client.query('UPDATE pet_wave_one_players SET coins=coins+$2,updated_at=clock_timestamp() WHERE account_id=$1',[this.accountId,coins]);
  }

  async debit(coins:number):Promise<void>{
    const result=await this.client.query('UPDATE pet_wave_one_players SET coins=coins-$2,updated_at=clock_timestamp() WHERE account_id=$1 AND coins>=$2',[this.accountId,coins]);
    if(!result.rowCount)throw new Error('Wave 1 wallet debit was rejected');
  }

  async insertClear(mapId:string):Promise<void>{
    await this.client.query('INSERT INTO pet_wave_one_map_clears(account_id,map_id) VALUES($1,$2)',[this.accountId,mapId]);
  }

  async incrementReplay(mapId:string):Promise<void>{
    await this.client.query('UPDATE pet_wave_one_map_clears SET replays=replays+1 WHERE account_id=$1 AND map_id=$2',[this.accountId,mapId]);
  }

  async insertGachaHistory(row:Readonly<{seq:number;petId:string|null;featured:boolean;duplicate:boolean;pityBefore:number}>):Promise<Date>{
    const inserted=await this.client.query<{createdAt:Date}>(
      'INSERT INTO pet_wave_one_gacha_history(account_id,seq,pet_id,featured,duplicate,pity_before) VALUES($1,$2,$3,$4,$5,$6) RETURNING created_at AS "createdAt"',
      [this.accountId,row.seq,row.petId,row.featured,row.duplicate,row.pityBefore],
    );
    const createdAt=inserted.rows[0]?.createdAt;
    if(!createdAt)throw new Error('Wave 1 gacha history insert failed');
    return createdAt;
  }

  async setBanner(misses:number,guaranteed:boolean,revision:number):Promise<void>{
    await this.client.query('UPDATE pet_wave_one_players SET gacha_misses=$2,gacha_guaranteed=$3,gacha_revision=$4,updated_at=clock_timestamp() WHERE account_id=$1',[this.accountId,misses,guaranteed,revision]);
  }

  async bumpRevision():Promise<number>{
    const row=(await this.client.query<{revision:number}>('UPDATE pet_wave_one_players SET revision=revision+1,updated_at=clock_timestamp() WHERE account_id=$1 RETURNING revision',[this.accountId])).rows[0];
    if(!row)throw new Error('Wave 1 revision update failed');
    return row.revision;
  }
}
