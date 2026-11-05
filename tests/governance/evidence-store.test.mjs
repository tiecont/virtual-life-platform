import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rename,rm,chmod,access,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createArchive,checkArchive,restoreArchive,readEvidenceBytes,validateIndex} from '../../scripts/evidence-store.mjs';

async function fixture(work) {
 const root=await mkdtemp(join(tmpdir(),'vlp-evidence-store-'));
 try {
  execFileSync('git',['init','-q'],{cwd:root});await mkdir(join(root,'docs/agent/evidence'),{recursive:true});
  await writeFile(join(root,'.gitignore'),'artifacts/\n');
  await writeFile(join(root,'docs/agent/evidence/result.json'),'{"result":"PASS","scope":"synthetic"}\n');
  await writeFile(join(root,'docs/agent/evidence/scene.png'),'synthetic fixture bytes');await writeFile(join(root,'docs/agent/evidence/empty.log'),'');
  execFileSync('git',['add','.'],{cwd:root});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture'],{cwd:root});
  await work(root);
 } finally {await rm(root,{recursive:true,force:true});}
}
const options=root=>({root,store:'artifacts/store',key:'artifacts/keys/archive.key'});

test('archive verifies all bytes and restores a missing source through authenticated objects without changing originals',async()=>fixture(async root=>{
 const expected=await readFile(join(root,'docs/agent/evidence/result.json')),index=await createArchive(options(root));
 assert.equal(index.entries.length,3);assert.equal(index.policy.originalsRetained,true);assert.equal(index.policy.cleanupAuthorized,false);
 assert.deepEqual(await readFile(join(root,'docs/agent/evidence/result.json')),expected);assert.equal((await checkArchive(index,options(root))).verifiedFiles,3);
 const result=await restoreArchive(index,{...options(root),target:'artifacts/restore'});assert.equal(result.restoredFiles,3);
 assert.deepEqual(await readFile(join(root,'artifacts/restore/docs/agent/evidence/result.json')),expected);
 await rename(join(root,'docs/agent/evidence'),join(root,'docs/agent/retained'));
 assert.deepEqual(await readEvidenceBytes('docs/agent/evidence/result.json',{...options(root),index}),expected);
}));

test('tampered ciphertext and a wrong key fail before a restore target exists; original mismatch never falls back silently',async()=>fixture(async root=>{
 const index=await createArchive(options(root));
 await writeFile(join(root,'docs/agent/evidence/result.json'),'tampered');
 await assert.rejects(()=>readEvidenceBytes('docs/agent/evidence/result.json',{...options(root),index}),/Original evidence hash mismatch/);
 await writeFile(join(root,'artifacts/keys/wrong.key'),randomBytes(32),{mode:0o600});
 await assert.rejects(()=>checkArchive(index,{...options(root),key:'artifacts/keys/wrong.key'}),/authentication/);
 const entry=index.entries[0],object=join(root,'artifacts/store/objects',entry.sha256+'.vlpe'),bytes=await readFile(object);bytes[bytes.length-1]^=1;await writeFile(object,bytes);
 await assert.rejects(()=>restoreArchive(index,{...options(root),target:'artifacts/rejected'}),/ciphertext hash/);
 await assert.rejects(()=>access(join(root,'artifacts/rejected')));
}));

test('index rejects traversal, duplicates, bounds and unversioned formats',async()=>fixture(async root=>{
 const index=await createArchive(options(root));
 for(const mutation of [x=>x.entries[0].path='docs/agent/evidence/../../outside',x=>x.entries.push({...x.entries[0]}),x=>x.entries[0].bytes=1e12,x=>x.schemaVersion=999]){
  const changed=JSON.parse(JSON.stringify(index));mutation(changed);assert.throws(()=>validateIndex(changed));
 }
}));

test('existing archive/restore targets and publicly readable key are refused',async()=>fixture(async root=>{
 const index=await createArchive(options(root));await assert.rejects(()=>createArchive(options(root)),/exist/);
 await mkdir(join(root,'artifacts/existing'));await assert.rejects(()=>restoreArchive(index,{...options(root),target:'artifacts/existing'}),/exist/);
 await chmod(join(root,'artifacts/keys/archive.key'),0o644);await assert.rejects(()=>checkArchive(index,options(root)),/private key/);
}));

test('missing archive objects fail closed and source/output symlinks are refused',async()=>fixture(async root=>{
 const index=await createArchive(options(root)),entry=index.entries[0];await rename(join(root,'artifacts/store/objects',entry.sha256+'.vlpe'),join(root,'artifacts/store/objects/held.vlpe'));
 await assert.rejects(()=>checkArchive(index,options(root)),{code:'ENOENT'});
 await mkdir(join(root,'artifacts/linked-parent'));await symlink(join(root,'artifacts/keys'),join(root,'artifacts/linked-parent/escape'));
 await assert.rejects(()=>restoreArchive(index,{...options(root),target:'artifacts/linked-parent/escape/restore'}),/Symlink/);
}));
