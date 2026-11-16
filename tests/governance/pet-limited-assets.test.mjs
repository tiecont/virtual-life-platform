import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {LimitedPetVisualDraftSchema} from '@virtual-city/contracts';
import {readLimitedPetCatalog,createMissingLimitedPetVisualDraft,verifyLimitedPetAssetFiles} from '../../scripts/pet-limited-asset-check.mjs';

const catalog=await readLimitedPetCatalog();
function draft(){const value=createMissingLimitedPetVisualDraft(catalog);value.pets=value.pets.filter(p=>p.petId==='pet-v3-fire-icarus');return value;}
const bytes=Buffer.from('Synthetic binding fixture only; not a model, animation or rendered preview.');
const hash=createHash('sha256').update(bytes).digest('hex');
const file=path=>({path,sha256:hash});

test('Limited preflight uses the actual v3.1 catalog and reports all missing art without changing publication',async()=>{
 assert.equal(catalog.pets.length,6);
 const value=createMissingLimitedPetVisualDraft(catalog),result=await verifyLimitedPetAssetFiles(value,catalog);
 assert.equal(result.pets,6);assert.equal(result.filesVerified,0);assert.equal(result.bindingStatus,'MISSING_BINDINGS');
 assert(result.missing.includes('pet-v3-fire-icarus:reference'));assert(result.missing.includes('pet-v3-fire-icarus:signature_skill_cast:clip'));
 assert.equal(result.runtimeEnabled,false);assert.equal(result.productionReady,false);
 await assert.rejects(verifyLimitedPetAssetFiles(value,catalog,process.cwd(),{requireComplete:true}),/Incomplete Limited bindings/);
});

test('canonical identity, exact manifest hash, signature opcode, action coverage and authority cannot be substituted',async()=>{
 for(const change of [
  value=>{value.catalogManifestHash='0'.repeat(64);},
  value=>{value.pets[0].petId='pet-v31-fire-cindrelis';},
  value=>{value.pets[0].signatureOpcode='TIDE_CURRENT';},
  value=>{value.pets[0].animations[1].action='idle';},
  value=>{value.pets[0].serverOutcomeIndependent=false;},
  value=>{value.runtimeEnabled=true;},
  value=>{value.productionReady=true;},
  value=>{value.state='PUBLISHED';},
 ]){const value=draft();change(value);await assert.rejects(verifyLimitedPetAssetFiles(value,catalog));}
 const profileDrift=globalThis.structuredClone(catalog);profileDrift.profiles[0].actions[0]='invented_action';
 await assert.rejects(verifyLimitedPetAssetFiles(draft(),profileDrift),/animation profile mismatch/);
});

test('Limited reference artwork is verified from actual bytes and cannot escape the workspace',async()=>{
 const root=await mkdtemp(join(tmpdir(),'limited-reference-')),outside=await mkdtemp(join(tmpdir(),'limited-outside-'));
 try{
  const value=draft();value.pets[0].reference=file('reference.png');
  await writeFile(join(root,'reference.png'),bytes);assert.equal((await verifyLimitedPetAssetFiles(value,catalog,root)).filesVerified,1);
  await writeFile(join(root,'reference.png'),'modified');await assert.rejects(verifyLimitedPetAssetFiles(value,catalog,root),/hash mismatch/);
  await rm(join(root,'reference.png'));await writeFile(join(outside,'reference.png'),bytes);
  await symlink(join(outside,'reference.png'),join(root,'reference.png'));await assert.rejects(verifyLimitedPetAssetFiles(value,catalog,root),/escapes workspace/);
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

test('complete synthetic byte bindings remain uninspected drafts and never count as Unity or rendered acceptance',async()=>{
 const root=await mkdtemp(join(tmpdir(),'limited-bindings-')),value=draft(),pet=value.pets[0];
 try{
  await mkdir(join(root,'assets'));await writeFile(join(root,'assets/source.blend'),bytes);await writeFile(join(root,'assets/import.json'),bytes);
  const bind=async(id,kind,extension)=>{
   const path='assets/'+id+'.'+extension;await writeFile(join(root,path),bytes);
   value.assets.push({id,kind,...file(path),source:{...file('assets/source.blend'),origin:'generated',author:'Synthetic fixture',provenanceRef:'test-only',rights:'PENDING_REVIEW'},importSettings:file('assets/import.json')});
   return id;
  };
  pet.reference=file('assets/reference.png');await writeFile(join(root,pet.reference.path),bytes);
  for(const key of ['portrait','icon','model','prefab','controller','localization'])pet[key]=await bind(key,key,key==='model'?'glb':'fixture');
  pet.materials=[await bind('body','material','mat')];
  pet.preview=await bind('preview','preview','mp4');pet.reducedMotionPreview=await bind('reduced','preview','mp4');
  for(const animation of pet.animations){
   for(const [key,kind] of [['clip','clip'],['vfx','vfx'],['audio','audio']])animation[key]=await bind(animation.action+'-'+key,kind,'fixture');
  }
  const result=await verifyLimitedPetAssetFiles(value,catalog,root,{requireComplete:true});
  assert.equal(result.bindingStatus,'BOUND_DRAFT');assert.deepEqual(result.missing,[]);assert.equal(result.filesVerified,value.assets.length+3);
  for(const key of ['modelInspection','unityImport','renderedPreview'])assert.equal(result[key],'NOT_TESTED');
  assert.equal(result.rightsReview,'PENDING');assert.equal(result.productionReady,false);
  const bad=globalThis.structuredClone(value);bad.pets[0].animations.find(a=>a.action==='rage_sword_100').clip=pet.animations.find(a=>a.action==='normal_sword_hit').clip;
  assert.equal(LimitedPetVisualDraftSchema.safeParse(bad).success,false);
  for(const change of [
   v=>{v.pets[0].reducedMotionPreview=v.pets[0].preview;},
   v=>{v.assets.find(a=>a.kind==='model').source.path='assets/not-editable.png';},
   v=>{v.assets.find(a=>a.kind==='model').path='assets/not-model.png';},
   v=>{v.pets[0].materials.push('body');},
  ]){const altered=globalThis.structuredClone(value);change(altered);assert.equal(LimitedPetVisualDraftSchema.safeParse(altered).success,false);}
  const model=value.assets.find(a=>a.kind==='model');await writeFile(join(root,model.path),'modified export');
  await assert.rejects(verifyLimitedPetAssetFiles(value,catalog,root,{requireComplete:true}),/hash mismatch/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('CLI complete gate fails for missing Limited bindings and never prints a successful manifest',()=>{
 const result=spawnSync(process.execPath,['--import','tsx','scripts/pet-asset-check.mjs','--limited-v31','--require-complete'],{encoding:'utf8',timeout:30000});
 assert.ifError(result.error);assert.equal(result.status,1);assert.match(result.stderr,/Incomplete Limited bindings/);assert.equal(result.stdout,'');
});
