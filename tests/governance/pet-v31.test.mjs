import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const source=new URL('../../specs/pet-arena/v3.1/data/',import.meta.url);
function check(path){return spawnSync('python3',['scripts/validate-pet-v31.py',path],{encoding:'utf8'});}
test('V3.1 canonical catalog validates all240 drafts against actual upstream114',()=>{
 const result=check(source.pathname);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/240 draft Pets/);
});
test('V3.1 rejects tampering and rehashed semantic violations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vl-v31-'));
 try{
  for(const [file,mutate,rehash] of [
   ['pets_initial_240.json',c=>{c.pets[0].name='Tampered';},false],
   ['pets_initial_240.json',c=>{c.pets[0].published=true;},true],
   ['pets_initial_240.json',c=>{c.pets[239].rank='SSR';},true],
   ['pets_initial_240.json',c=>{c.pets[239].combat.signatureCard='signature_card_icarus';},true],
   ['pets_initial_240.json',c=>{c.pets[0].combat.skillRefs[3]='signature_icarus';},true],
   ['pets_initial_240.json',c=>{c.pets.find(p=>p.source==='standard_gacha').combat.skillRefs[3]='signature_icarus';},true],
   ['pets_initial_240.json',c=>{c.pets.find(p=>p.name==='Glaciemora').combat.skillRefs[3]='signature_icarus';},true],
   ['pets_initial_240.json',c=>{c.pets[239].mapId=c.pets[0].mapId;},true],
   ['pets_initial_240.json',c=>{c.pets[239].combat.statProfile.hp=1201;},true],
   ['pets_initial_240.json',c=>{c.pets[239].name=c.pets[0].name;},true],
   ['gacha_economy.json',c=>{c.standardPool[0].petId='normal-puffern';},true],
   ['gacha_economy.json',c=>{c.standardBanner.limitedGuaranteeMutation=true;},true],
   ['gacha_economy.json',c=>{c.standardPool[0].weight=0;},true],
   ['pet_asset_manifest_240.json',c=>{c.petAssets.pop();},true],
   ['element_effectiveness_matrix.json',c=>{delete c.attackerRowsDefenderColumns.fire.water;},true],
  ]){
   await cp(source,dir,{recursive:true});
   const path=join(dir,file),value=JSON.parse(await readFile(path,'utf8'));mutate(value);
   const bytes=JSON.stringify(value);await writeFile(path,bytes);
   if(rehash){const path=join(dir,'catalog_manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));manifest.files[file]=createHash('sha256').update(bytes).digest('hex');await writeFile(path,JSON.stringify(manifest));}
   const result=check(dir);assert.notEqual(result.status,0,`${file} mutation accepted`);assert.match(result.stderr,/ValueError/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
