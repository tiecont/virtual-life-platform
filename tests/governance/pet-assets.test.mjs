import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createMissingPetVisualDraft,verifyPetAssetFiles} from '../../scripts/pet-asset-check.mjs';
const content={ruleset:'pet-arena-pve-v2',priorityVisualSet:['fire-emberloom'],priorityBoss:'light-dawnarchon',species:[{id:'fire-emberloom',formId:'emberloom-base'},{id:'light-dawnarchon',formId:'dawnarchon-base'}]};
test('visual preflight reports missing files and cannot confer rights or Unity rendering acceptance',async()=>{
 const result=await verifyPetAssetFiles(createMissingPetVisualDraft(content,'a'.repeat(64)));
 assert.equal(result.pets,2);assert.equal(result.filesVerified,0);assert.equal(result.productionReady,false);assert.equal(result.runtimeEnabled,false);assert.equal(result.rightsReview,'PENDING');assert.equal(result.renderedPreview,'NOT_TESTED');assert(result.missing.includes('fire-emberloom:rage:clip'));
});
test('asset, editable source and import settings require actual bytes; missing, changed or escaping files fail',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pet-asset-test-')),outside=await mkdtemp(join(tmpdir(),'pet-asset-outside-')),hash=b=>createHash('sha256').update(b).digest('hex');
 try{
  await mkdir(join(dir,'assets'));const bytes=Buffer.from('synthetic asset test; not production art');await writeFile(join(dir,'assets/runtime.png'),bytes);await writeFile(join(dir,'assets/source.kra'),bytes);await writeFile(join(dir,'assets/import.json'),bytes);
  const input=createMissingPetVisualDraft(content,'a'.repeat(64));input.assets=[{id:'portrait',kind:'portrait',path:'assets/runtime.png',sha256:hash(bytes),source:{path:'assets/source.kra',sha256:hash(bytes),origin:'original',author:'Synthetic fixture',provenanceRef:'test-only',rights:'PENDING_REVIEW'},importSettings:{path:'assets/import.json',sha256:hash(bytes)}}];input.pets[0].portrait='portrait';
  assert.equal((await verifyPetAssetFiles(input,dir)).filesVerified,3);
  await writeFile(join(dir,'assets/runtime.png'),'changed');await assert.rejects(verifyPetAssetFiles(input,dir),/hash mismatch/);
  await rm(join(dir,'assets/runtime.png'));await assert.rejects(verifyPetAssetFiles(input,dir),/ENOENT/);
  await writeFile(join(outside,'escape.png'),bytes);await symlink(join(outside,'escape.png'),join(dir,'assets/runtime.png'));await assert.rejects(verifyPetAssetFiles(input,dir),/escapes workspace/);
 }finally{await rm(dir,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
