import type {Pool} from 'pg';
import type {Arena8Artifact} from '../application/allocation';
import type {
  NativeArena8MatchRecord,NativeArena8MatchRegistry,NativeArena8MatchStatus,
} from '../application/native-provisioner';

type Row={
  match_id:string;account_id:string;request_id:string;fingerprint:string;
  world_id:string;boot_id:string;content_hash:string;generation:string;
  pet_id:string;map_id:string;encounter_id:string;level:number;
  artifacts:unknown;status:NativeArena8MatchStatus;
};

const COLUMNS=`match_id,account_id,request_id,fingerprint,world_id,boot_id,content_hash,
  generation,pet_id,map_id,encounter_id,level,artifacts,status`;

function artifacts(value:unknown):readonly Arena8Artifact[]{
  if(!Array.isArray(value))return Object.freeze([]);
  return Object.freeze(value.map(entry=>{
    const artifact=entry as {definitionId?:unknown;upgradeLevel?:unknown};
    return Object.freeze({
      definitionId:String(artifact.definitionId),upgradeLevel:Number(artifact.upgradeLevel),
    });
  }));
}
function map(row:Row):NativeArena8MatchRecord{
  return Object.freeze({
    matchId:row.match_id,accountId:row.account_id,requestId:row.request_id,
    fingerprint:row.fingerprint,worldId:row.world_id,bootId:row.boot_id,
    contentHash:row.content_hash,generation:Number(row.generation),
    petId:row.pet_id,mapId:row.map_id,encounterId:row.encounter_id,
    level:row.level,artifacts:artifacts(row.artifacts),status:row.status,
  });
}

// Platform-owned allocation journal for local native Arena8 matches. It is not
// readable by the restricted runtime role and holds no ticket, key or database
// credential.
export class NativeArena8MatchStore implements NativeArena8MatchRegistry {
  constructor(private readonly db:Pick<Pool,'query'>){}

  async findRequest(accountId:string,requestId:string){
    const row=(await this.db.query<Row>(
      `SELECT ${COLUMNS} FROM platform_native_arena8_matches
        WHERE account_id=$1 AND request_id=$2`,[accountId,requestId],
    )).rows[0];
    return row?map(row):undefined;
  }

  async findActive(accountId:string){
    const row=(await this.db.query<Row>(
      `SELECT ${COLUMNS} FROM platform_native_arena8_matches
        WHERE account_id=$1 AND status IN ('STARTING','ACTIVE')
        ORDER BY created_at DESC LIMIT 1`,[accountId],
    )).rows[0];
    return row?map(row):undefined;
  }

  async create(record:NativeArena8MatchRecord){
    await this.db.query(
      `INSERT INTO platform_native_arena8_matches(
         match_id,account_id,request_id,fingerprint,world_id,boot_id,content_hash,
         generation,pet_id,map_id,encounter_id,level,artifacts,status
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [record.matchId,record.accountId,record.requestId,record.fingerprint,
        record.worldId,record.bootId,record.contentHash,record.generation,
        record.petId,record.mapId,record.encounterId,record.level,
        JSON.stringify(record.artifacts),record.status],
    );
  }

  async activate(matchId:string,generation:number){
    const result=await this.db.query(
      `UPDATE platform_native_arena8_matches
          SET status='ACTIVE',generation=$2,updated_at=clock_timestamp()
        WHERE match_id=$1 AND status='STARTING'`,[matchId,generation],
    );
    if(result.rowCount!==1)throw new Error('Arena8 match activation conflict');
  }

  async fail(matchId:string){
    await this.db.query(
      `UPDATE platform_native_arena8_matches
          SET status='FAILED',updated_at=clock_timestamp()
        WHERE match_id=$1 AND status IN ('STARTING','ACTIVE')`,[matchId],
    );
  }

  async close(matchId:string){
    await this.db.query(
      `UPDATE platform_native_arena8_matches
          SET status='CLOSED',updated_at=clock_timestamp()
        WHERE match_id=$1 AND status IN ('STARTING','ACTIVE')`,[matchId],
    );
  }
}
