import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {createMissingPetVisualDraft,verifyPetAssetFiles} from '../../scripts/pet-asset-check.mjs';
const content={ruleset:'pet-arena-pve-v2',priorityVisualSet:['fire-emberloom'],priorityBoss:'light-dawnarchon',species:[{id:'fire-emberloom',formId:'emberloom-base'},{id:'light-dawnarchon',formId:'dawnarchon-base'}]};
function assetDraft(bytes){
 const hash=createHash('sha256').update(bytes).digest('hex'),input=createMissingPetVisualDraft(content,'a'.repeat(64));
 input.assets=[{id:'portrait',kind:'portrait',path:'assets/runtime.png',sha256:hash,source:{path:'assets/source.kra',sha256:hash,origin:'original',author:'Synthetic fixture',provenanceRef:'test-only',rights:'PENDING_REVIEW'},importSettings:{path:'assets/import.json',sha256:hash}}];input.pets[0].portrait='portrait';return input;
}
test('visual preflight reports missing files and cannot confer rights or Unity rendering acceptance',async()=>{
 const result=await verifyPetAssetFiles(createMissingPetVisualDraft(content,'a'.repeat(64)));
 assert.equal(result.pets,2);assert.equal(result.filesVerified,0);assert.equal(result.productionReady,false);assert.equal(result.runtimeEnabled,false);assert.equal(result.rightsReview,'PENDING');assert.equal(result.renderedPreview,'NOT_TESTED');assert(result.missing.includes('fire-emberloom:rage:clip'));
});
test('asset, editable source and import settings require actual bytes; missing, changed or escaping files fail',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pet-asset-test-')),outside=await mkdtemp(join(tmpdir(),'pet-asset-outside-'));
 try{
  await mkdir(join(dir,'assets'));const bytes=Buffer.from('synthetic asset test; not production art');await writeFile(join(dir,'assets/runtime.png'),bytes);await writeFile(join(dir,'assets/source.kra'),bytes);await writeFile(join(dir,'assets/import.json'),bytes);
  const input=assetDraft(bytes);
  assert.equal((await verifyPetAssetFiles(input,dir)).filesVerified,3);
  await writeFile(join(outside,'escape.png'),bytes);
  for(const file of [input.assets[0],input.assets[0].source,input.assets[0].importSettings]){
   const target=join(dir,file.path);
   await writeFile(target,'changed');await assert.rejects(verifyPetAssetFiles(input,dir),/hash mismatch/);
   await rm(target);await assert.rejects(verifyPetAssetFiles(input,dir),/ENOENT/);
   await symlink(join(outside,'escape.png'),target);await assert.rejects(verifyPetAssetFiles(input,dir),/escapes workspace/);
   await rm(target);await mkdir(target);await assert.rejects(verifyPetAssetFiles(input,dir),/non-regular/);
   await rm(target,{recursive:true});await writeFile(target,bytes);
  }
  assert.equal((await verifyPetAssetFiles(input,dir)).filesVerified,3);
 }finally{await rm(dir,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
test('FIFO runtime, source and import files fail promptly without waiting for a writer',{skip:process.platform==='win32'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pet-asset-fifo-')),bytes=Buffer.from('synthetic asset test; not production art'),input=assetDraft(bytes),files=[input.assets[0],input.assets[0].source,input.assets[0].importSettings];
 try{
  await mkdir(join(dir,'assets'));for(const file of files)await writeFile(join(dir,file.path),bytes);
  for(const file of files){
   const target=join(dir,file.path);await rm(target);execFileSync('mkfifo',[target]);
   const result=spawnSync(process.execPath,['--input-type=module','-e','const {verifyPetAssetFiles}=await import(process.argv[1]);await verifyPetAssetFiles(JSON.parse(process.argv[2]),process.argv[3]);',new URL('../../scripts/pet-asset-check.mjs',import.meta.url).href,JSON.stringify(input),dir],{timeout:5000,encoding:'utf8'});
   assert.ifError(result.error);assert.equal(result.signal,null);assert.equal(result.status,1);assert.match(result.stderr,/non-regular/);
   await rm(target);await writeFile(target,bytes);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
