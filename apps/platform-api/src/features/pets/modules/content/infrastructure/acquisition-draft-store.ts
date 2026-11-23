import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {validatePetAcquisitionCatalogV3,type PetAcquisitionCatalogV3} from '@aetheria/contracts/pet-acquisition-v3';

function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
 return value;
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const byId=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;
export function petAcquisitionHash(value:PetAcquisitionCatalogV3):string{
 return hash({...value,maps:[...value.maps].sort(byId),pets:[...value.pets].sort(byId)});
}
// Trusted offline port only. Baseline comes from repository catalog-v2.json,
// never an upload. Reads and idempotent retries revalidate all durable rows.
export class PetAcquisitionDraftStore{
 private readonly upstream:unknown;
 private readonly upstreamHash:string;
 constructor(private db:Pick<Pool,'connect'|'query'>,trustedUpstream:unknown){
  this.upstream=structuredClone(trustedUpstream);
  if(!Array.isArray(this.upstream))throw Error('Trusted upstream required');
  this.upstreamHash=hash([...this.upstream].sort(byId));
 }
 async seed(id:string,input:unknown){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error('Invalid draft ID');
  const value=validatePetAcquisitionCatalogV3(input,this.upstream),contentHash=petAcquisitionHash(value),tx=await this.db.connect();
  try{
   await tx.query('BEGIN');await tx.query("SET LOCAL statement_timeout='5000ms'");await tx.query("SET LOCAL lock_timeout='2000ms'");
   const inserted=await tx.query('INSERT INTO pet_acquisition_drafts(id,content_version,schema_version,ruleset,source_hash,content_hash,upstream_hash) VALUES($1,$2,3,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[id,value.contentVersion,value.ruleset,value.sourceSha256,contentHash,this.upstreamHash]);
   if(!inserted.rowCount){
    const row=(await tx.query<{content_hash:string;upstream_hash:string}>('SELECT content_hash,upstream_hash FROM pet_acquisition_drafts WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!row||row.content_hash!==contentHash||row.upstream_hash!==this.upstreamHash)throw Error('Acquisition draft seed conflict');
    if(petAcquisitionHash(await this.load(tx,id))!==contentHash)throw Error('Acquisition draft integrity mismatch');
    await tx.query('COMMIT');return {id,hash:contentHash,created:false};
   }
   for(const m of value.maps)await tx.query('INSERT INTO pet_acquisition_maps VALUES($1,$2,$3)',[id,m.id,m.element]);
   for(const p of value.pets){const a=p.acquisition;await tx.query('INSERT INTO pet_acquisition_species VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id,p.id,p.name,p.element,p.race,p.bodyPlan,p.rig,p.sourceRarityLegacy,a.rank,a.source,a.mapId,a.requiredUniqueWins,a.signatureCard,a.awakeningEnabled]);}
   await tx.query('COMMIT');return {id,hash:contentHash,created:true};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
 }
 async read(id:string):Promise<PetAcquisitionCatalogV3|null>{
  const tx=await this.db.connect();try{
   await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await tx.query("SET LOCAL statement_timeout='2000ms'");
   const row=(await tx.query<{content_hash:string;upstream_hash:string}>('SELECT content_hash,upstream_hash FROM pet_acquisition_drafts WHERE id=$1',[id])).rows[0];
   if(!row){await tx.query('COMMIT');return null;}
   if(row.upstream_hash!==this.upstreamHash)throw Error('Acquisition upstream mismatch');
   const value=await this.load(tx,id);if(petAcquisitionHash(value)!==row.content_hash)throw Error('Acquisition draft integrity mismatch');
   await tx.query('COMMIT');return value;
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
 }
 private async load(tx:PoolClient,id:string):Promise<PetAcquisitionCatalogV3>{
  const row=(await tx.query('SELECT schema_version AS "schemaVersion",ruleset,content_version AS "contentVersion",state,enabled,publish_allowed AS "publishAllowed",source_hash AS "sourceSha256" FROM pet_acquisition_drafts WHERE id=$1',[id])).rows[0];
  const maps=(await tx.query('SELECT map_id AS id,element FROM pet_acquisition_maps WHERE draft_id=$1 ORDER BY map_id',[id])).rows;
  const pets=(await tx.query(`SELECT species_id AS id,display_name AS name,element,race,body_plan AS "bodyPlan",rig,legacy_rarity AS "sourceRarityLegacy",jsonb_build_object('rank',rank,'source',source,'mapId',map_id,'requiredUniqueWins',required_unique_wins,'signatureCard',signature_card,'awakeningEnabled',awakening_enabled) AS acquisition FROM pet_acquisition_species WHERE draft_id=$1 ORDER BY species_id`,[id])).rows;
  return validatePetAcquisitionCatalogV3({...row,maps,pets},this.upstream);
 }
}
