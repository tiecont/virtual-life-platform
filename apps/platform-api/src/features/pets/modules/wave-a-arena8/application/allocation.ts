import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {DomainError} from '../../../../../shared/common/errors';
import {MAPS} from '../../wave1/domain/manifest';

export type AllocateInput=Readonly<{petId:string;mapId:string;encounterId:string}>;
export type Arena8Artifact=Readonly<{definitionId:string;upgradeLevel:number}>;
export type OwnedArena8Allocation=Readonly<{level:number;artifacts:readonly Arena8Artifact[]}>;

type OwnedRow={level:number;exp:number};
type ArtifactRow={definition_id:string;upgrade_level:number};

export const invalid=(message:string)=>new DomainError('INVALID_REQUEST',400,message);
export const forbidden=(message:string)=>new DomainError('FORBIDDEN',403,message);
export const conflict=(message:string)=>new DomainError('REQUEST_CONFLICT',409,message);
export const unavailable=(message:string)=>new DomainError('WORLD_UNAVAILABLE',503,message);

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAP_IDS:ReadonlySet<string>=new Set(MAPS.map(map=>map.id));

export function assertUuid(value:string,label:string){
  if(!UUID.test(value))throw invalid(label+' must be a UUID');
}

export function encounterPairComplete(encounterIds:readonly string[],mapId:string){
  const present=new Set(encounterIds);
  return present.has(mapId+'-regular')&&present.has(mapId+'-boss');
}

// Authenticated ownership and progression read shared by the loopback supervisor
// allocation and the native provisioner. The caller has already authenticated
// the session; no client-supplied level, loadout or content is trusted here.
export async function readOwnedArena8Allocation(
  db:Pick<Pool,'query'>,accountId:string,input:AllocateInput,
):Promise<OwnedArena8Allocation>{
  assertUuid(accountId,'account');
  if(!MAP_IDS.has(input.mapId))throw invalid('Unknown map');
  const mapIndex=MAPS.findIndex(map=>map.id===input.mapId);
  const encounterSuffix=input.encounterId===input.mapId+'-regular'?'regular'
    :input.encounterId===input.mapId+'-boss'?'boss':null;
  if(!encounterSuffix)throw invalid('Encounter does not belong to the map');
  const owned=(await db.query<OwnedRow>(
    'SELECT level,exp FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2',
    [accountId,input.petId],
  )).rows[0];
  if(!owned)throw forbidden('Pet is not owned');
  const clears=(await db.query<{map_id:string}>(
    'SELECT map_id FROM pet_wave_one_map_clears WHERE account_id=$1',
    [accountId],
  )).rows.map(row=>row.map_id);
  if(mapIndex>0){
    const previous=MAPS[mapIndex-1].id;
    const completed=(await db.query<{encounter_id:string}>(
      `SELECT encounter_id FROM pet_wave_one_encounters
        WHERE account_id=$1 AND map_id=$2 AND encounter_id IN ($3,$4)`,
      [accountId,previous,previous+'-regular',previous+'-boss'],
    )).rows.map(row=>row.encounter_id);
    // Legacy Wave 1 map clears represent the full regular+boss pair. Arena8
    // itself requires both explicit encounter completions.
    if(!clears.includes(previous)&&!encounterPairComplete(completed,previous))
      throw forbidden('Map is locked');
  }
  const artifacts=(await db.query<ArtifactRow>(
    `SELECT owned.definition_id,owned.upgrade_level
       FROM pet_artifact_loadouts loadout
       JOIN pet_artifact_owned owned
         ON owned.account_id=loadout.account_id AND owned.artifact_id=loadout.artifact_id
      WHERE loadout.account_id=$1 AND loadout.pet_id=$2
      ORDER BY loadout.slot`,
    [accountId,input.petId],
  )).rows;
  return Object.freeze({
    level:owned.level,
    artifacts:Object.freeze(artifacts.map(row=>Object.freeze({
      definitionId:row.definition_id,upgradeLevel:row.upgrade_level,
    }))),
  });
}

// Stable identity for a server-owned Pet instance. It is derived only from the
// authenticated account and owned species so consecutive matches and process
// restarts observe the same native allocation identity.
export function ownedPetUuid(accountId:string,petId:string){
  assertUuid(accountId,'account');
  const bytes=createHash('sha256')
    .update('aetheria:arena8-owned-pet:v1:'+accountId+':'+petId)
    .digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x50;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// Immutable canonical request identity. A request id cannot be replayed with a
// different Pet, encounter, level, Artifact loadout or runtime content.
export function arena8AllocationFingerprint(
  accountId:string,contentHash:string,input:AllocateInput,owned:OwnedArena8Allocation,
){
  return createHash('sha256').update(JSON.stringify([
    'aetheria-arena8-native-allocation-v1',
    accountId,contentHash,input.petId,input.mapId,input.encounterId,owned.level,
    owned.artifacts.map(artifact=>[artifact.definitionId,artifact.upgradeLevel]),
  ])).digest('hex');
}
