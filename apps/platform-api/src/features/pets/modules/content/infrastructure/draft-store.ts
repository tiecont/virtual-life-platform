import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {PetContentDraftSchema,type PetContentDraft} from '@aetheria/contracts';

function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
 return value;
}
export function petDraftHash(input:unknown){
 const value=PetContentDraftSchema.parse(input);
 for(const key of ['elements','profiles','growth','skills','species'] as const)value[key].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 value.effectiveness.sort((a,b)=>{const left=a.attacker+':'+a.defender,right=b.attacker+':'+b.defender;return left<right?-1:left>right?1:0;});
 return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

// Trusted offline seed port. Operator editing/publication is a separate use case.
export class PetDraftStore{
 constructor(private db:Pick<Pool,'connect'|'query'>){}
 async seed(id:string,input:unknown){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error('Invalid draft ID');
  const value=PetContentDraftSchema.parse(input),hash=petDraftHash(value),tx=await this.db.connect();
  try{
   await tx.query('BEGIN');await tx.query("SET LOCAL statement_timeout='5000ms'");await tx.query("SET LOCAL lock_timeout='2000ms'");
   const inserted=await tx.query('INSERT INTO pet_content_drafts(id,source_hash,schema_version,ruleset) VALUES($1,$2,2,$3) ON CONFLICT(id) DO NOTHING',[id,hash,value.ruleset]);
   if(!inserted.rowCount){
    const prior=(await tx.query<{source_hash:string;revision:string}>('SELECT source_hash,revision FROM pet_content_drafts WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!prior||prior.source_hash!==hash||prior.revision!=='1')throw Error('Draft seed conflict');
    if(petDraftHash(await this.load(tx,id))!==hash)throw Error('Draft integrity mismatch');
    await tx.query('COMMIT');return {id,hash,created:false};
   }
   for(const e of value.elements)await tx.query('INSERT INTO pet_content_elements VALUES($1,$2,$3)',[id,e.id,e.displayName]);
   for(const e of value.effectiveness)await tx.query('INSERT INTO pet_content_effectiveness VALUES($1,$2,$3,$4)',[id,e.attacker,e.defender,e.permille]);
   for(const p of value.profiles)await tx.query('INSERT INTO pet_content_profiles VALUES($1,$2,$3,$4,$5,$6)',[id,p.id,p.hp,p.attack,p.defense,p.speed]);
   for(const g of value.growth)await tx.query('INSERT INTO pet_content_growth VALUES($1,$2,$3,$4)',[id,g.id,g.perLevelPermille,g.maxLevel]);
   for(const s of value.skills)await tx.query('INSERT INTO pet_content_skills VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,s.id,s.opcode,s.powerPermille,s.manaCost,s.cooldown,s.target,s.stackCap,s.durationTurns??null]);
   for(const p of value.species){
    await tx.query('INSERT INTO pet_content_species VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,p.id,p.displayName,p.element,p.rarity,p.statProfile,p.growthProfile,p.levelCap,p.assetState,p.productionReady]);
    for(const [slot,skill] of p.skills.entries())await tx.query('INSERT INTO pet_content_species_skills VALUES($1,$2,$3,$4)',[id,p.id,slot,skill]);
   }
   await tx.query('COMMIT');return {id,hash,created:true};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
 }
 async read(id:string):Promise<PetContentDraft|null>{
  const tx=await this.db.connect();
  try{
   await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await tx.query("SET LOCAL statement_timeout='2000ms'");
   const draft=(await tx.query<{source_hash:string}>('SELECT source_hash FROM pet_content_drafts WHERE id=$1',[id])).rows[0];if(!draft){await tx.query('COMMIT');return null;}
   const value=await this.load(tx,id);
   if(petDraftHash(value)!==draft.source_hash)throw Error('Draft integrity mismatch');
   await tx.query('COMMIT');return value;
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
 }
 private async load(tx:PoolClient,id:string):Promise<PetContentDraft>{
   const elements=(await tx.query('SELECT element_id AS id,display_name AS "displayName" FROM pet_content_elements WHERE draft_id=$1 ORDER BY element_id',[id])).rows;
   const effectiveness=(await tx.query('SELECT attacker,defender,permille FROM pet_content_effectiveness WHERE draft_id=$1 ORDER BY attacker,defender',[id])).rows;
   const profiles=(await tx.query('SELECT profile_id AS id,hp,attack,defense,speed FROM pet_content_profiles WHERE draft_id=$1 ORDER BY profile_id',[id])).rows;
   const growth=(await tx.query('SELECT growth_id AS id,per_level_permille AS "perLevelPermille",max_level AS "maxLevel" FROM pet_content_growth WHERE draft_id=$1 ORDER BY growth_id',[id])).rows;
   const skills=(await tx.query('SELECT skill_id AS id,opcode,power_permille AS "powerPermille",mana_cost AS "manaCost",cooldown,target,stack_cap AS "stackCap",duration_turns AS "durationTurns" FROM pet_content_skills WHERE draft_id=$1 ORDER BY skill_id',[id])).rows.map(row=>row.durationTurns===null?Object.fromEntries(Object.entries(row).filter(([key])=>key!=='durationTurns')):row);
   const species=(await tx.query(`SELECT p.species_id AS id,p.display_name AS "displayName",p.element_id AS element,p.rarity,p.profile_id AS "statProfile",p.growth_id AS "growthProfile",p.level_cap AS "levelCap",p.asset_state AS "assetState",p.production_ready AS "productionReady",ARRAY(SELECT s.skill_id FROM pet_content_species_skills s WHERE s.draft_id=p.draft_id AND s.species_id=p.species_id ORDER BY s.slot) AS skills FROM pet_content_species p WHERE p.draft_id=$1 ORDER BY p.species_id`,[id])).rows;
   return PetContentDraftSchema.parse({schemaVersion:2,ruleset:'pet-arena-pve-v2',elements,effectiveness,profiles,growth,skills,species});
 }
}
