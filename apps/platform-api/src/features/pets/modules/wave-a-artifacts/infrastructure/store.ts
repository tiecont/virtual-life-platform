import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {STARTER_ARTIFACT_DEFINITION_ID,STARTING_MATERIALS,type ArtifactSlot} from '../domain/catalog';

export type ArtifactPlayerRow=Readonly<{materials:number;revision:number}>;
export type ArtifactOwnedRow=Readonly<{
  artifactId:string;definitionId:string;upgradeLevel:number;
  acquiredFrom:'starter'|'pve';acquiredMapId:string|null;acquiredAt:Date;
}>;
export type ArtifactLoadoutRow=Readonly<{petId:string;slot:ArtifactSlot;artifactId:string;equippedAt:Date}>;
export type ArtifactSnapshotRow=Readonly<{
  snapshotId:string;petId:string;petLevel:number;digest:string;loadout:unknown;createdAt:Date;
}>;
export type ArtifactClaimRow=Readonly<{mapId:string;artifactId:string;materials:number;claimedAt:Date}>;
export type ArtifactPetRow=Readonly<{petId:string;level:number}>;
export type ArtifactReceiptRow=Readonly<{fingerprint:string;response:unknown}>;

const PLAYER_COLUMNS='materials,revision';
const OWNED_COLUMNS=`artifact_id AS "artifactId",definition_id AS "definitionId",upgrade_level AS "upgradeLevel",acquired_from AS "acquiredFrom",acquired_map_id AS "acquiredMapId",acquired_at AS "acquiredAt"`;
const LOADOUT_COLUMNS=`pet_id AS "petId",slot,artifact_id AS "artifactId",equipped_at AS "equippedAt"`;
const SNAPSHOT_COLUMNS=`snapshot_id AS "snapshotId",pet_id AS "petId",pet_level AS "petLevel",digest,loadout,created_at AS "createdAt"`;
const CLAIM_COLUMNS=`map_id AS "mapId",artifact_id AS "artifactId",materials,claimed_at AS "claimedAt"`;
const RECENT_SNAPSHOTS=10;

export async function initializeArtifactInventory(client:Pick<PoolClient,'query'>,accountId:string):Promise<void>{
  const created=await client.query(
    'INSERT INTO pet_artifact_players(account_id,materials) VALUES($1,$2) ON CONFLICT(account_id) DO NOTHING RETURNING account_id',
    [accountId,STARTING_MATERIALS],
  );
  if(!created.rowCount){
    await client.query('SELECT 1 FROM pet_artifact_players WHERE account_id=$1 FOR UPDATE',[accountId]);
    // Earlier solo-first settlements created the wallet and campaign claim
    // before the starter grant. The claim and absent Core identify that state.
    const repair=await client.query(
      `UPDATE pet_artifact_players SET materials=materials+$2,revision=revision+1,updated_at=clock_timestamp()
       WHERE account_id=$1
       AND EXISTS(SELECT 1 FROM pet_artifact_pve_claims WHERE account_id=$1)
       AND NOT EXISTS(SELECT 1 FROM pet_artifact_owned WHERE account_id=$1 AND acquired_from='starter' AND definition_id=$3)
       RETURNING account_id`,[accountId,STARTING_MATERIALS,STARTER_ARTIFACT_DEFINITION_ID]);
    if(!repair.rowCount)return;
  }
  await client.query(
    "INSERT INTO pet_artifact_owned(account_id,artifact_id,definition_id,upgrade_level,acquired_from) VALUES($1,$2,$3,1,'starter')",
    [accountId,randomUUID(),STARTER_ARTIFACT_DEFINITION_ID],
  );
}

// One transaction owner for Wave A artifact state. The account artifact row is
// locked before any command work, so receipts, materials, equipment and
// snapshots serialize per account. Pet ownership and level are read from the
// Wave 1 journal; this module never writes Wave 1 tables.
export class ArtifactStore {
  constructor(private pool:Pick<Pool,'connect'>){}

  async transact<T>(accountId:string,work:(tx:ArtifactTransaction)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      await initializeArtifactInventory(client,accountId);
      const value=await work(new ArtifactTransaction(client,accountId));
      await client.query('COMMIT');
      return value;
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{client.release();}
  }

  async exportAccount(db:Pick<PoolClient,'query'>,accountId:string){
    const player=(await db.query<ArtifactPlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM pet_artifact_players WHERE account_id=$1 FOR SHARE`,[accountId])).rows[0];
    if(!player)return {schemaVersion:1,initialized:false};
    const inventory=(await db.query<ArtifactOwnedRow>(`SELECT ${OWNED_COLUMNS} FROM pet_artifact_owned WHERE account_id=$1 ORDER BY acquired_at,artifact_id`,[accountId])).rows;
    const loadouts=(await db.query<ArtifactLoadoutRow>(`SELECT ${LOADOUT_COLUMNS} FROM pet_artifact_loadouts WHERE account_id=$1 ORDER BY pet_id,slot`,[accountId])).rows;
    const claims=(await db.query<ArtifactClaimRow>(`SELECT ${CLAIM_COLUMNS} FROM pet_artifact_pve_claims WHERE account_id=$1 ORDER BY claimed_at,map_id`,[accountId])).rows;
    const snapshots=(await db.query<ArtifactSnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM pet_artifact_snapshots WHERE account_id=$1 ORDER BY created_at DESC,snapshot_id`,[accountId])).rows;
    return {
      schemaVersion:1,initialized:true,revision:player.revision,materials:player.materials,
      inventory:inventory.map(row=>({
        artifactId:row.artifactId,definitionId:row.definitionId,upgradeLevel:row.upgradeLevel,
        acquiredFrom:row.acquiredFrom,acquiredMapId:row.acquiredMapId,acquiredAt:row.acquiredAt.toISOString(),
      })),
      loadouts:loadouts.map(row=>({petId:row.petId,slot:row.slot,artifactId:row.artifactId,equippedAt:row.equippedAt.toISOString()})),
      pveClaims:claims.map(row=>({mapId:row.mapId,artifactId:row.artifactId,materials:row.materials,claimedAt:row.claimedAt.toISOString()})),
      snapshots:snapshots.map(row=>({
        snapshotId:row.snapshotId,petId:row.petId,petLevel:row.petLevel,digest:row.digest,
        loadout:row.loadout,createdAt:row.createdAt.toISOString(),
      })),
    };
  }
}

export class ArtifactTransaction {
  constructor(private client:PoolClient,private accountId:string){}

  async player():Promise<ArtifactPlayerRow>{
    const row=(await this.client.query<ArtifactPlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM pet_artifact_players WHERE account_id=$1`,[this.accountId])).rows[0];
    if(!row)throw new Error('Wave A artifact player state is unavailable');
    return row;
  }

  async owned():Promise<ArtifactOwnedRow[]>{
    return (await this.client.query<ArtifactOwnedRow>(`SELECT ${OWNED_COLUMNS} FROM pet_artifact_owned WHERE account_id=$1 ORDER BY acquired_at,artifact_id`,[this.accountId])).rows;
  }

  async artifact(artifactId:string):Promise<ArtifactOwnedRow|undefined>{
    return (await this.client.query<ArtifactOwnedRow>(`SELECT ${OWNED_COLUMNS} FROM pet_artifact_owned WHERE account_id=$1 AND artifact_id=$2`,[this.accountId,artifactId])).rows[0];
  }

  async loadouts():Promise<ArtifactLoadoutRow[]>{
    return (await this.client.query<ArtifactLoadoutRow>(`SELECT ${LOADOUT_COLUMNS} FROM pet_artifact_loadouts WHERE account_id=$1 ORDER BY pet_id,slot`,[this.accountId])).rows;
  }

  async loadoutForArtifact(artifactId:string):Promise<ArtifactLoadoutRow|undefined>{
    return (await this.client.query<ArtifactLoadoutRow>(`SELECT ${LOADOUT_COLUMNS} FROM pet_artifact_loadouts WHERE account_id=$1 AND artifact_id=$2`,[this.accountId,artifactId])).rows[0];
  }

  async pets():Promise<ArtifactPetRow[]>{
    return (await this.client.query<ArtifactPetRow>('SELECT pet_id AS "petId",level FROM pet_wave_one_owned WHERE account_id=$1 ORDER BY acquired_at,pet_id',[this.accountId])).rows;
  }

  async petLevel(petId:string):Promise<number|undefined>{
    return (await this.client.query<{level:number}>('SELECT level FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2',[this.accountId,petId])).rows[0]?.level;
  }

  async clears():Promise<string[]>{
    return (await this.client.query<{mapId:string}>('SELECT map_id AS "mapId" FROM pet_wave_one_map_clears WHERE account_id=$1 ORDER BY cleared_at,map_id',[this.accountId])).rows.map(row=>row.mapId);
  }

  async claims():Promise<ArtifactClaimRow[]>{
    return (await this.client.query<ArtifactClaimRow>(`SELECT ${CLAIM_COLUMNS} FROM pet_artifact_pve_claims WHERE account_id=$1 ORDER BY claimed_at,map_id`,[this.accountId])).rows;
  }

  async snapshots():Promise<ArtifactSnapshotRow[]>{
    return (await this.client.query<ArtifactSnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM pet_artifact_snapshots WHERE account_id=$1 ORDER BY created_at DESC,snapshot_id LIMIT ${RECENT_SNAPSHOTS}`,[this.accountId])).rows;
  }

  async snapshot(snapshotId:string):Promise<ArtifactSnapshotRow|undefined>{
    return (await this.client.query<ArtifactSnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM pet_artifact_snapshots WHERE account_id=$1 AND snapshot_id=$2`,[this.accountId,snapshotId])).rows[0];
  }

  async receipt(requestId:string):Promise<ArtifactReceiptRow|undefined>{
    return (await this.client.query<ArtifactReceiptRow>('SELECT fingerprint,response FROM pet_artifact_requests WHERE account_id=$1 AND request_id=$2',[this.accountId,requestId])).rows[0];
  }

  async saveReceipt(requestId:string,fingerprint:string,response:unknown):Promise<void>{
    await this.client.query('INSERT INTO pet_artifact_requests(account_id,request_id,fingerprint,response) VALUES($1,$2,$3,$4)',[this.accountId,requestId,fingerprint,JSON.stringify(response)]);
  }

  async insertOwned(row:Readonly<{artifactId:string;definitionId:string;acquiredFrom:'starter'|'pve';acquiredMapId:string|null}>):Promise<void>{
    await this.client.query(
      'INSERT INTO pet_artifact_owned(account_id,artifact_id,definition_id,upgrade_level,acquired_from,acquired_map_id) VALUES($1,$2,$3,1,$4,$5)',
      [this.accountId,row.artifactId,row.definitionId,row.acquiredFrom,row.acquiredMapId],
    );
  }

  async setUpgradeLevel(artifactId:string,upgradeLevel:number):Promise<void>{
    await this.client.query('UPDATE pet_artifact_owned SET upgrade_level=$3 WHERE account_id=$1 AND artifact_id=$2',[this.accountId,artifactId,upgradeLevel]);
  }

  async setLoadout(petId:string,slot:ArtifactSlot,artifactId:string):Promise<void>{
    await this.client.query(
      `INSERT INTO pet_artifact_loadouts(account_id,pet_id,slot,artifact_id) VALUES($1,$2,$3,$4)
       ON CONFLICT(account_id,pet_id,slot) DO UPDATE SET artifact_id=EXCLUDED.artifact_id,equipped_at=clock_timestamp()`,
      [this.accountId,petId,slot,artifactId],
    );
  }

  async deleteLoadout(petId:string,slot:ArtifactSlot):Promise<void>{
    await this.client.query('DELETE FROM pet_artifact_loadouts WHERE account_id=$1 AND pet_id=$2 AND slot=$3',[this.accountId,petId,slot]);
  }

  async insertClaim(row:Readonly<{mapId:string;artifactId:string;materials:number}>):Promise<void>{
    await this.client.query('INSERT INTO pet_artifact_pve_claims(account_id,map_id,artifact_id,materials) VALUES($1,$2,$3,$4)',[this.accountId,row.mapId,row.artifactId,row.materials]);
  }

  async creditMaterials(materials:number):Promise<void>{
    await this.client.query('UPDATE pet_artifact_players SET materials=materials+$2,updated_at=clock_timestamp() WHERE account_id=$1',[this.accountId,materials]);
  }

  async debitMaterials(materials:number):Promise<void>{
    const result=await this.client.query('UPDATE pet_artifact_players SET materials=materials-$2,updated_at=clock_timestamp() WHERE account_id=$1 AND materials>=$2',[this.accountId,materials]);
    if(!result.rowCount)throw new Error('Wave A artifact material debit was rejected');
  }

  async insertSnapshot(row:Readonly<{snapshotId:string;petId:string;petLevel:number;digest:string;loadout:unknown}>):Promise<ArtifactSnapshotRow>{
    const inserted=await this.client.query<ArtifactSnapshotRow>(
      `INSERT INTO pet_artifact_snapshots(account_id,snapshot_id,pet_id,pet_level,digest,loadout)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(account_id,pet_id,digest) DO NOTHING
       RETURNING ${SNAPSHOT_COLUMNS}`,
      [this.accountId,row.snapshotId,row.petId,row.petLevel,row.digest,JSON.stringify(row.loadout)],
    );
    const created=inserted.rows[0];
    if(created)return created;
    const existing=(await this.client.query<ArtifactSnapshotRow>(
      `SELECT ${SNAPSHOT_COLUMNS} FROM pet_artifact_snapshots WHERE account_id=$1 AND pet_id=$2 AND digest=$3`,
      [this.accountId,row.petId,row.digest],
    )).rows[0];
    if(!existing)throw new Error('Wave A artifact snapshot insert failed');
    return existing;
  }

  async bumpRevision():Promise<number>{
    const row=(await this.client.query<{revision:number}>('UPDATE pet_artifact_players SET revision=revision+1,updated_at=clock_timestamp() WHERE account_id=$1 RETURNING revision',[this.accountId])).rows[0];
    if(!row)throw new Error('Wave A artifact revision update failed');
    return row.revision;
  }
}

// The whole roster is read in one PostgreSQL statement snapshot. Recheck the
// owned Pet identity and join equipped rows to inventory by account as well as
// Artifact id. A different account's copy of a species cannot contribute gear.
export async function readOwnedArtifactLoadouts(
  db:Pick<PoolClient,'query'>,
  pets:readonly Readonly<{account:string;petId:string;ownedPetInstanceId:string}>[],
){
  return (await db.query<{
    account:string;petId:string;ownedPetInstanceId:string;petLevel:number;
    entries:readonly {slot:ArtifactSlot;artifactId:string;definitionId:string;upgradeLevel:number}[];
  }>(`
    SELECT owned.account_id AS account,owned.pet_id AS "petId",owned.owned_pet_instance_id AS "ownedPetInstanceId",
           owned.level AS "petLevel",COALESCE(gear.entries,'[]'::jsonb) AS entries
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS seat(pet,position)
    JOIN pet_wave_one_owned owned ON owned.account_id=(seat.pet->>'account')::uuid
     AND owned.pet_id=seat.pet->>'petId' AND owned.owned_pet_instance_id=(seat.pet->>'ownedPetInstanceId')::uuid
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('slot',equipped.slot,'artifactId',item.artifact_id,
             'definitionId',item.definition_id,'upgradeLevel',item.upgrade_level)) AS entries
      FROM pet_artifact_loadouts equipped
      JOIN pet_artifact_owned item ON item.account_id=equipped.account_id AND item.artifact_id=equipped.artifact_id
      WHERE equipped.account_id=owned.account_id AND equipped.pet_id=owned.pet_id
    ) gear ON true
    ORDER BY seat.position
  `,[JSON.stringify(pets)])).rows;
}
