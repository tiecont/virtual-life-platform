import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {PetContentManifestV3Schema,PetMatchContentPinV3Schema,PetContentHashSchema,type PetContentManifestV3,type PetMatchContentPinV3} from '@aetheria/contracts';

function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
 return value;
}
export function petManifestHash(input:unknown):string{
 const value=PetContentManifestV3Schema.parse(input);
 for(const key of ['elements','profiles','growth','skills','species','cards','combinations','loadouts','maps','encounters','assets'] as const)value[key].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 value.effectiveness.sort((a,b)=>{const left=a.attacker+':'+a.defender,right=b.attacker+':'+b.defender;return left<right?-1:left>right?1:0;});
 return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
type Version={manifest:unknown;state:'sealed'|'retired';rules_hash:string};
export type PetContentSelection={hash:string|null;revision:number};
// Trusted control-plane persistence port, intentionally not wired to HTTP or
// runtime allocation. Operator authorization/publication belongs to VL-120.
export class PetManifestStore{
 constructor(private db:Pick<Pool,'connect'|'query'>){}
 private async transaction<T>(work:(tx:PoolClient)=>Promise<T>):Promise<T>{
  const tx=await this.db.connect();try{await tx.query('BEGIN');await tx.query("SET LOCAL statement_timeout='5000ms'");await tx.query("SET LOCAL lock_timeout='2000ms'");const result=await work(tx);await tx.query('COMMIT');return result;}catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
 }
 async seal(input:unknown){
  const value=PetContentManifestV3Schema.parse(input),hash=petManifestHash(value);
  if(Buffer.byteLength(JSON.stringify(value))>3000000)throw Error('Manifest too large');
  return this.transaction(async tx=>{
   const result=await tx.query("INSERT INTO pet_content_versions(content_hash,rules_hash,ruleset,schema_version,release,manifest) VALUES($1,$2,$3,3,'OFFLINE_ONLY',$4) ON CONFLICT DO NOTHING",[hash,value.rulesHash,value.ruleset,JSON.stringify(value)]);
   await this.readVersion(tx,hash);return {hash,created:result.rowCount===1};
  });
 }
 private async readVersion(tx:Pick<PoolClient,'query'>,hash:string):Promise<{manifest:PetContentManifestV3;state:'sealed'|'retired'}>{
  PetContentHashSchema.parse(hash);
  const row=(await tx.query<Version>('SELECT manifest,state,rules_hash FROM pet_content_versions WHERE content_hash=$1',[hash])).rows[0];
  if(!row)throw Error('Content version unavailable');
  const manifest=PetContentManifestV3Schema.parse(row.manifest);
  if(petManifestHash(manifest)!==hash||manifest.rulesHash!==row.rules_hash)throw Error('Manifest integrity mismatch');
  return {manifest,state:row.state};
 }
 async read(hash:string){return this.readVersion(this.db,hash);}
 async selection():Promise<PetContentSelection>{return this.readSelection(this.db,false);}
 private async readSelection(tx:Pick<PoolClient,'query'>,lock:boolean):Promise<PetContentSelection>{
  const row=(await tx.query<{content_hash:string|null;revision:string}>("SELECT content_hash,revision FROM pet_content_selection WHERE channel='offline-v3'"+(lock?' FOR UPDATE':''))).rows[0];
  if(!row)throw Error('Content selection unavailable');
  return {hash:row.content_hash,revision:Number(row.revision)};
 }
 async transition(action:'select'|'rollback'|'retire',hash:string,expectedRevision:number):Promise<PetContentSelection>{
  PetContentHashSchema.parse(hash);
  if(!['select','rollback','retire'].includes(action)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision>=Number.MAX_SAFE_INTEGER)throw Error('Invalid content transition');
  return this.transaction(async tx=>{
   const previous=await this.readSelection(tx,true);if(previous.revision!==expectedRevision)throw Error('Stale content selection');
   const version=await this.readVersion(tx,hash);if(version.state!=='sealed')throw Error('Content retired');
   if(action==='rollback'){
    if(!previous.hash||previous.hash===hash)throw Error('No rollback target');
    const current=await this.readVersion(tx,previous.hash);
    if(current.manifest.rulesHash!==version.manifest.rulesHash)throw Error('Incompatible rollback rules');
    if(!(await tx.query("SELECT 1 FROM pet_content_transitions WHERE content_hash=$1 AND action IN ('select','rollback') LIMIT 1",[hash])).rowCount)throw Error('Rollback target never selected');
   }
   if(action==='retire')await tx.query("UPDATE pet_content_versions SET state='retired' WHERE content_hash=$1",[hash]);
   const next={hash:action==='retire'?(previous.hash===hash?null:previous.hash):hash,revision:previous.revision+1};
   await tx.query("UPDATE pet_content_selection SET content_hash=$1,revision=$2 WHERE channel='offline-v3'",[next.hash,next.revision]);
   await tx.query('INSERT INTO pet_content_transitions(revision,action,content_hash,previous_hash) VALUES($1,$2,$3,$4)',[next.revision,action,hash,previous.hash]);return next;
  });
 }
 // The allocator must call inside the SAME transaction as native match insertion.
 // The selection row serializes allocation with retirement and rollback. The
 // deferred SQL constraint refuses a native v3 match committed without a pin.
 async pin(tx:PoolClient,matchId:string,input:unknown,expectedRevision:number):Promise<PetMatchContentPinV3>{
  const pin=PetMatchContentPinV3Schema.parse(input),selection=await this.readSelection(tx,true);
  if(selection.revision!==expectedRevision||selection.hash!==pin.contentHash)throw Error('Stale content selection');
  const {manifest,state}=await this.readVersion(tx,pin.contentHash);
  const encounter=manifest.encounters.find(e=>e.id===pin.encounter),loadout=manifest.loadouts.find(l=>l.id===pin.loadout);
  if(state!=='sealed'||pin.rulesHash!==manifest.rulesHash||!encounter||encounter.revision!==pin.encounterRevision||!loadout)throw Error('Invalid match content binding');
  await tx.query('INSERT INTO pet_content_match_pins(match_id,content_hash,rules_hash,binding) VALUES($1,$2,$3,$4)',[matchId,pin.contentHash,pin.rulesHash,JSON.stringify(pin)]);return pin;
 }
 async readPin(matchId:string):Promise<{pin:PetMatchContentPinV3;manifest:PetContentManifestV3}>{
  const row=(await this.db.query<{binding:unknown;content_hash:string;rules_hash:string}>('SELECT binding,content_hash,rules_hash FROM pet_content_match_pins WHERE match_id=$1',[matchId])).rows[0];
  if(!row)throw Error('Match content pin unavailable');
  const pin=PetMatchContentPinV3Schema.parse(row.binding),{manifest}=await this.read(row.content_hash);
  if(pin.contentHash!==row.content_hash||pin.rulesHash!==row.rules_hash||pin.rulesHash!==manifest.rulesHash||!manifest.loadouts.some(l=>l.id===pin.loadout)||!manifest.encounters.some(e=>e.id===pin.encounter&&e.revision===pin.encounterRevision))throw Error('Match content pin integrity mismatch');
  return {pin,manifest};
 }
}
