import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createArchive} from '../../scripts/evidence-store.mjs';
import {createEvidenceReader} from '../../scripts/evidence-reader.mjs';
const name='docs/agent/evidence/result.json';
async function fixture(work){
 const root=await mkdtemp(join(tmpdir(),'vlp-index-reader-')),options={root,store:'artifacts/store',key:'artifacts/keys/archive.key'};
 const git=args=>execFileSync('git',args,{cwd:root}).toString().trim();
 try{
  git(['init','-q']);await mkdir(join(root,'docs/agent/evidence'),{recursive:true});await mkdir(join(root,'config/evidence'),{recursive:true});
  await writeFile(join(root,'.gitignore'),'artifacts/\n');await writeFile(join(root,name),'{"result":"PASS","source":"synthetic"}\n');git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture']);
  const index=await createArchive(options),serialized=JSON.stringify(index),snapshot={schemaVersion:1,sourceRevision:git(['rev-parse','HEAD']),indexSha256:createHash('sha256').update(serialized).digest('hex'),entries:index.entries.map(row=>({...row,gitBlob:git(['rev-parse',`HEAD:${row.path}`])}))};
  await writeFile(join(root,'config/evidence/index.json'),serialized);const save=()=>writeFile(join(root,'config/evidence/git-snapshot.json'),JSON.stringify(snapshot));await save();await work({root,options,index,snapshot,save});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('indexed readers retrieve private Git history with originals, archive and key absent',async()=>fixture(async({root,options})=>{
 await rm(join(root,'docs/agent/evidence'),{recursive:true});await rm(join(root,'artifacts'),{recursive:true});
 const reader=await createEvidenceReader(options);assert.equal((await reader.json(name)).result,'PASS');assert.equal((await reader.verifyAll({gitOnly:true})).verifiedFiles,1);await assert.rejects(()=>reader.bytes('docs/agent/evidence/../secret'),/not indexed/);
}));
test('existing original mismatch fails even when immutable Git bytes are available',async()=>fixture(async({root,options})=>{
 await writeFile(join(root,name),'tampered');const reader=await createEvidenceReader(options);await assert.rejects(()=>reader.json(name),/bounds rejected|Original evidence hash mismatch/);
}));
test('snapshot coverage, object mapping, source revision and index digest fail closed',async()=>fixture(async({options,snapshot,save,root})=>{
 for(const mutate of [s=>s.indexSha256='0'.repeat(64),s=>s.entries=[],s=>s.entries[0].gitBlob='0'.repeat(40),s=>s.sourceRevision='0'.repeat(40)]){
  const copy=globalThis.structuredClone(snapshot);mutate(snapshot);await save();await assert.rejects(async()=>{const reader=await createEvidenceReader(options);await reader.verifyAll({gitOnly:true});});Object.assign(snapshot,copy);
 }
 await save();await rm(join(root,'config/evidence/index.json'));await assert.rejects(()=>createEvidenceReader(options),/ENOENT/);
}));
test('authenticated archive works; corrupt ciphertext never silently uses Git fallback',async()=>fixture(async({root,options,index})=>{
 await rm(join(root,name));const reader=await createEvidenceReader(options);assert.equal((await reader.json(name)).source,'synthetic');
 const object=join(root,options.store,'objects',index.entries[0].sha256+'.vlpe'),payload=await readFile(object);payload[36]^=1;await writeFile(object,payload);await assert.rejects(()=>reader.json(name),/ciphertext hash mismatch/);
}));
test('source symlinks fail without fallback',async()=>fixture(async({root,options})=>{
 await rm(join(root,name));await symlink(join(root,'.gitignore'),join(root,name));const reader=await createEvidenceReader(options);await assert.rejects(()=>reader.json(name),/Symlink refused/);
}));
test('missing historical object cannot be reported as a successful retrieval',async()=>fixture(async({root,options,snapshot})=>{
 const reader=await createEvidenceReader(options);await reader.verifyAll({gitOnly:true});
 const oid=snapshot.entries[0].gitBlob;await rm(join(root,'.git/objects',oid.slice(0,2),oid.slice(2)));
 await assert.rejects(()=>reader.bytes(name,{gitOnly:true}),/object unavailable/);
}));
test('standalone custom-index CLI still verifies an archive without Git snapshot metadata',async()=>fixture(async({root,options})=>{
 await rm(join(root,name));await rm(join(root,'config/evidence/git-snapshot.json'));
 const output=execFileSync(process.execPath,[fileURLToPath(new URL('../../scripts/evidence-cli.mjs',import.meta.url)),'check','--index','artifacts/store/index.json','--store',options.store,'--key-file',options.key],{cwd:root});
 assert.equal(JSON.parse(output).verifiedFiles,1);
}));
