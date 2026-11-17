import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const source=new URL('../../specs/pet-arena/design/pet-lore-design-240.json',import.meta.url);
function check(path){return spawnSync('python3',['scripts/validate-pet-lore-design.py',path],{encoding:'utf8'});}

test('240 editorial stories preserve canonical identity and disclosed appearance constraints',()=>{
 const result=check(source.pathname);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/240 unique stories\/prompts/);
});

test('editorial integrity rejects missing Pets, taxonomy drift, copied prose and leaked Icarus authority',async()=>{
 const original=JSON.parse(await readFile(source,'utf8'));
 const dir=await mkdtemp(join(tmpdir(),'aetheria-pet-lore-'));
 try{
  for(const [label,mutate] of [
   ['missing Pet',d=>{d.pets.pop();}],
   ['duplicate ID',d=>{d.pets[1].id=d.pets[0].id;}],
   ['taxonomy drift',d=>{d.pets[0].visualConstraints.canonical.bodyPlan='humanoid';}],
   ['palette drift',d=>{d.pets[0].visualConstraints.canonical.primaryColor='#FFFFFF';}],
   ['copied story',d=>{d.pets[1].storyVi=d.pets[0].storyVi;}],
   ['hidden conflict',d=>{d.pets[0].designPrompt=d.pets[0].designPrompt.replace(d.pets[0].visualConstraints.silhouetteReview.issue,'');}],
   ['foreign owner authority',d=>{d.pets[1].visualConstraints.appearanceAuthority='OWNER_ICARUS_V3';}],
   ['publication claim',d=>{d.publishAllowed=true;}],
  ]){
   const draft=JSON.parse(JSON.stringify(original));mutate(draft);
   const path=join(dir,'draft.json');await writeFile(path,JSON.stringify(draft));
   const result=check(path);
   assert.notEqual(result.status,0,`${label} accepted`);
   assert.match(result.stderr,/FAIL:/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
