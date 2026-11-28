import type {PoolClient} from 'pg';
import type {GameplayBundle,GameplayConfigState,GameplayRuleset} from '@aetheria/contracts';

type Queryable=Pick<PoolClient,'query'>;
const COLUMNS='ruleset,version,state,schema_version AS "schemaVersion",engine_capability AS "engineCapability",content_digest AS "contentDigest",revision,parent_version AS "parentVersion",created_by AS "createdBy",updated_by AS "updatedBy",created_at AS "createdAt",validated_at AS "validatedAt",published_at AS "publishedAt"';

export type GameplayVersionSummary=Readonly<{
 ruleset:GameplayRuleset;version:number;state:GameplayConfigState;schemaVersion:1;
 engineCapability:string|null;contentDigest:string|null;revision:number;parentVersion:number|null;
 createdBy:string;updatedBy:string;createdAt:Date;validatedAt:Date|null;publishedAt:Date|null;
}>;
export type GameplayVersion=GameplayVersionSummary&Readonly<{bundle:GameplayBundle}>;
export type ActiveVersion=Readonly<{version:number;revision:number;updatedBy:string;updatedAt:Date}>;
export type EventRow=Readonly<{sequence:string;ruleset:GameplayRuleset;version:number;action:string;actor:string;fromState:GameplayConfigState|null;toState:GameplayConfigState|null;occurredAt:Date;previousHash:string;eventHash:string}>;

const numeric=(value:unknown)=>Number(value as string|number);
function summary(row:Record<string,unknown>):GameplayVersionSummary{
 // Publication row encoding is independent of the engine-validated JSON bundle schema.
 const publicationSchema=row.schemaVersion;
 if(publicationSchema!==1)throw new Error('Unsupported gameplay publication record schema');
 return Object.freeze({
  ruleset:row.ruleset as GameplayRuleset,version:numeric(row.version),state:row.state as GameplayConfigState,
  schemaVersion:publicationSchema,engineCapability:(row.engineCapability??null) as string|null,contentDigest:(row.contentDigest??null) as string|null,
  revision:numeric(row.revision),parentVersion:row.parentVersion===null||row.parentVersion===undefined?null:numeric(row.parentVersion),
  createdBy:String(row.createdBy),updatedBy:String(row.updatedBy),createdAt:row.createdAt as Date,
  validatedAt:(row.validatedAt??null) as Date|null,publishedAt:(row.publishedAt??null) as Date|null,
 });
}
function version(row:Record<string,unknown>):GameplayVersion{return Object.freeze({...summary(row),bundle:row.bundle as GameplayBundle});}

// Single authoritative store for gameplay configuration versions and their
// audit journal. Callers supply the operator transaction so authorization,
// optimistic concurrency, publication and audit commit together.
export class GameplayConfigStore{
 async list(tx:Queryable,ruleset:GameplayRuleset,limit=100):Promise<GameplayVersionSummary[]>{
  const result=await tx.query<Record<string,unknown>>(`SELECT ${COLUMNS} FROM gameplay_config_versions WHERE ruleset=$1 ORDER BY version DESC LIMIT $2`,[ruleset,Math.min(Math.max(limit,1),200)]);
  return result.rows.map(summary);
 }
 async read(tx:Queryable,ruleset:GameplayRuleset,target:number):Promise<GameplayVersion|undefined>{
  const result=await tx.query<Record<string,unknown>>(`SELECT ${COLUMNS},bundle FROM gameplay_config_versions WHERE ruleset=$1 AND version=$2`,[ruleset,target]);
  return result.rows[0]?version(result.rows[0]):undefined;
 }
 async readForUpdate(tx:Queryable,ruleset:GameplayRuleset,target:number):Promise<GameplayVersion|undefined>{
  const result=await tx.query<Record<string,unknown>>(`SELECT ${COLUMNS},bundle FROM gameplay_config_versions WHERE ruleset=$1 AND version=$2 FOR UPDATE`,[ruleset,target]);
  return result.rows[0]?version(result.rows[0]):undefined;
 }
 async nextVersion(tx:Queryable,ruleset:GameplayRuleset):Promise<number>{
  const result=await tx.query<{next:unknown}>('SELECT COALESCE(MAX(version),0)+1 AS next FROM gameplay_config_versions WHERE ruleset=$1',[ruleset]);
  return numeric(result.rows[0]?.next??1);
 }
 async insertDraft(tx:Queryable,input:Readonly<{ruleset:GameplayRuleset;version:number;parentVersion:number|null;bundle:GameplayBundle;actor:string}>):Promise<GameplayVersion>{
  const result=await tx.query<Record<string,unknown>>(`INSERT INTO gameplay_config_versions(ruleset,version,schema_version,state,bundle,parent_version,created_by,updated_by) VALUES($1,$2,1,'DRAFT',$3::jsonb,$4,$5,$5) RETURNING ${COLUMNS},bundle`,
   [input.ruleset,input.version,JSON.stringify(input.bundle),input.parentVersion,input.actor]);
  return version(result.rows[0]!);
 }
 async updateDraft(tx:Queryable,input:Readonly<{ruleset:GameplayRuleset;version:number;expectedRevision:number;bundle:GameplayBundle;actor:string}>):Promise<GameplayVersion|undefined>{
  const result=await tx.query<Record<string,unknown>>(`UPDATE gameplay_config_versions SET bundle=$4::jsonb,state='DRAFT',content_digest=NULL,engine_capability=NULL,validated_at=NULL,published_at=NULL,revision=revision+1,updated_by=$5,updated_at=clock_timestamp() WHERE ruleset=$1 AND version=$2 AND state IN ('DRAFT','VALIDATED') AND revision=$3 RETURNING ${COLUMNS},bundle`,
   [input.ruleset,input.version,input.expectedRevision,JSON.stringify(input.bundle),input.actor]);
  return result.rows[0]?version(result.rows[0]):undefined;
 }
 async markValidated(tx:Queryable,input:Readonly<{ruleset:GameplayRuleset;version:number;expectedRevision:number;digest:string;engineCapability:string;actor:string}>):Promise<GameplayVersionSummary|undefined>{
  const result=await tx.query<Record<string,unknown>>(`UPDATE gameplay_config_versions SET state='VALIDATED',content_digest=$4,engine_capability=$5,validated_at=clock_timestamp(),revision=revision+1,updated_by=$6,updated_at=clock_timestamp() WHERE ruleset=$1 AND version=$2 AND state='DRAFT' AND revision=$3 RETURNING ${COLUMNS}`,
   [input.ruleset,input.version,input.expectedRevision,input.digest,input.engineCapability,input.actor]);
  return result.rows[0]?summary(result.rows[0]):undefined;
 }
 async markPublished(tx:Queryable,input:Readonly<{ruleset:GameplayRuleset;version:number;expectedRevision:number;actor:string}>):Promise<GameplayVersionSummary|undefined>{
  const result=await tx.query<Record<string,unknown>>(`UPDATE gameplay_config_versions SET state='PUBLISHED',published_at=clock_timestamp(),revision=revision+1,updated_by=$4,updated_at=clock_timestamp() WHERE ruleset=$1 AND version=$2 AND state='VALIDATED' AND revision=$3 RETURNING ${COLUMNS}`,
   [input.ruleset,input.version,input.expectedRevision,input.actor]);
  return result.rows[0]?summary(result.rows[0]):undefined;
 }
 async supersede(tx:Queryable,input:Readonly<{ruleset:GameplayRuleset;version:number;actor:string}>):Promise<void>{
  await tx.query("UPDATE gameplay_config_versions SET state='SUPERSEDED',revision=revision+1,updated_by=$3,updated_at=clock_timestamp() WHERE ruleset=$1 AND version=$2 AND state='PUBLISHED'",[input.ruleset,input.version,input.actor]);
 }
 async active(tx:Queryable,ruleset:GameplayRuleset,lock=false):Promise<ActiveVersion|undefined>{
  const result=await tx.query<Record<string,unknown>>(`SELECT version,revision,updated_by AS "updatedBy",updated_at AS "updatedAt" FROM gameplay_config_active WHERE ruleset=$1${lock?' FOR UPDATE':''}`,[ruleset]);
  const row=result.rows[0];
  return row?Object.freeze({version:numeric(row.version),revision:numeric(row.revision),updatedBy:String(row.updatedBy),updatedAt:row.updatedAt as Date}):undefined;
 }
 async setActive(tx:Queryable,input:Readonly<{ruleset:GameplayRuleset;version:number;expectedRevision:number|null;actor:string}>):Promise<number|undefined>{
  if(input.expectedRevision===null){
   const inserted=await tx.query<{revision:unknown}>('INSERT INTO gameplay_config_active(ruleset,version,revision,updated_by) VALUES($1,$2,1,$3) ON CONFLICT (ruleset) DO NOTHING RETURNING revision',[input.ruleset,input.version,input.actor]);
   return inserted.rows[0]?numeric(inserted.rows[0].revision):undefined;
  }
  const updated=await tx.query<{revision:unknown}>('UPDATE gameplay_config_active SET version=$2,revision=revision+1,updated_by=$3,updated_at=clock_timestamp() WHERE ruleset=$1 AND revision=$4 RETURNING revision',[input.ruleset,input.version,input.actor,input.expectedRevision]);
  return updated.rows[0]?numeric(updated.rows[0].revision):undefined;
 }
 async eventByFingerprint(tx:Queryable,fingerprint:string):Promise<Readonly<{actor:string;action:string;detail:Record<string,unknown>}>|undefined>{
  const result=await tx.query<{actor:string;action:string;detail:Record<string,unknown>}>('SELECT actor,action,detail FROM gameplay_config_events WHERE fingerprint=$1',[fingerprint]);
  return result.rows[0];
 }
 async lastEventHash(tx:Queryable):Promise<string>{
  const result=await tx.query<{event_hash:string}>('SELECT event_hash FROM gameplay_config_events ORDER BY sequence DESC LIMIT 1');
  return result.rows[0]?.event_hash??'0'.repeat(64);
 }
 async appendEvent(tx:Queryable,input:Readonly<{
  ruleset:GameplayRuleset;version:number;action:'create'|'update'|'validate'|'publish'|'rollback'|'retire'|'seed';
  actor:string;fingerprint:string;fromState:GameplayConfigState|null;toState:GameplayConfigState|null;
  detail:Record<string,unknown>;seal:(purpose:string,value:unknown)=>string;
 }>):Promise<void>{
  const previous=await this.lastEventHash(tx);
  const at=(await tx.query<{at:Date}>('SELECT clock_timestamp() AS at')).rows[0]!.at;
  const event=[input.ruleset,input.version,input.action,input.actor,input.fingerprint,input.fromState,input.toState,input.detail,at.toISOString(),previous];
  const hash=input.seal('gameplay-config-audit',event);
  await tx.query('INSERT INTO gameplay_config_events(ruleset,version,action,actor,fingerprint,from_state,to_state,detail,occurred_at,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)',
   [input.ruleset,input.version,input.action,input.actor,input.fingerprint,input.fromState,input.toState,JSON.stringify(input.detail),at,previous,hash]);
 }
 async audit(tx:Queryable,ruleset:GameplayRuleset,limit=50):Promise<EventRow[]>{
  const result=await tx.query<Record<string,unknown>>('SELECT sequence,ruleset,version,action,actor,from_state AS "fromState",to_state AS "toState",occurred_at AS "occurredAt",previous_hash AS "previousHash",event_hash AS "eventHash" FROM gameplay_config_events WHERE ruleset=$1 ORDER BY sequence DESC LIMIT $2',[ruleset,Math.min(Math.max(limit,1),100)]);
  return result.rows.map(row=>Object.freeze({sequence:String(row.sequence),ruleset:row.ruleset as GameplayRuleset,version:numeric(row.version),action:String(row.action),actor:String(row.actor),fromState:(row.fromState??null) as GameplayConfigState|null,toState:(row.toState??null) as GameplayConfigState|null,occurredAt:row.occurredAt as Date,previousHash:String(row.previousHash),eventHash:String(row.eventHash)}));
 }
 async pinMatch(tx:Queryable,input:Readonly<{matchId:string;ruleset:GameplayRuleset;version:number;contentDigest:string;engineCapability:string}>):Promise<void>{
  await tx.query('INSERT INTO gameplay_config_match_pins(match_id,ruleset,version,content_digest,engine_capability) VALUES($1,$2,$3,$4,$5)',[input.matchId,input.ruleset,input.version,input.contentDigest,input.engineCapability]);
 }
}
