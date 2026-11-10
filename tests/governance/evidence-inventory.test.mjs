import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {collectInventory,writeInventory} from '../../scripts/evidence-inventory.mjs';

async function fixture(work) {
 const root=await mkdtemp(join(tmpdir(),'vlp-inventory-'));
 try {execFileSync('git',['init','-q'],{cwd:root});await writeFile(join(root,'.gitignore'),'artifacts/\n');await work(root);}finally{await rm(root,{recursive:true,force:true});}
}
async function put(root,path,content){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),content);}

test('inventory traces executable/document readers and flags dynamic evidence paths without inferring unused files',async()=>fixture(async root=>{
 await put(root,'docs/agent/evidence/result.json','{"result":"PASS"}\n');
 await put(root,'docs/agent/evidence/image.png','synthetic image bytes');
 await put(root,'scripts/reader.mjs',"readFile('docs/agent/evidence/result.json'); readFile(`docs/agent/evidence/${name}.json`);\n");
 await put(root,'docs/guide.md','[evidence](agent/evidence/result.json)');
 await put(root,'apps/api/src/db/migrations/0001.sql','CREATE TABLE example(id int);');
 await put(root,'assets/provenance.json','{"releaseApproved":false}');
 await put(root,'apps/api/src/not-a-file-reader.mjs',"const field = 'evidence'; const unrelated = { evidence: true }; import {check} from './evidence';\n");
 const before=execFileSync('git',['status','--porcelain=v1','-z'],{cwd:root});const data=await collectInventory(root);
 assert.equal(data.cleanupAuthorized,false);assert.equal(data.files.find(f=>f.path.endsWith('0001.sql')).decision,'KEEP');
 const result=data.files.find(f=>f.path==='docs/agent/evidence/result.json');assert.equal(result.classification,'EVIDENCE_JSON');assert.equal(result.bytes,18);assert.match(result.sha256,/^[a-f0-9]{64}$/);
 assert(result.consumers.some(c=>c.path==='scripts/reader.mjs'));assert(result.consumers.some(c=>c.path==='docs/guide.md'));
 assert(data.dynamicConsumers.some(c=>c.path==='scripts/reader.mjs'));assert.equal(data.files.find(f=>f.path.endsWith('image.png')).decision,'ARCHIVE_CANDIDATE');
 assert(!data.dynamicConsumers.some(c=>c.path==='apps/api/src/not-a-file-reader.mjs'));
 assert.equal(data.files.find(f=>f.path==='assets/provenance.json').decision,'KEEP');assert.deepEqual(execFileSync('git',['status','--porcelain=v1','-z'],{cwd:root}),before);
}));

test('protected credentials and symlinks are not read or hashed',async()=>fixture(async root=>{
 await put(root,'.env','SYNTHETIC_NOT_A_REAL_SECRET=fixture');await symlink(join(root,'.env'),join(root,'linked.json'));
 const data=await collectInventory(root);for(const name of ['.env','linked.json']){const row=data.files.find(f=>f.path===name);assert.equal(row.sha256,null);assert.match(row.decision,/KEEP|REVIEW/);}
}));

test('output refuses traversal, symlink escape and overwrite of an existing inventory',async()=>fixture(async root=>{
 await assert.rejects(()=>writeInventory(root,'../outside.json',{}),/artifacts/);
 await writeInventory(root,'artifacts/first.json',{original:true});await assert.rejects(()=>writeInventory(root,'artifacts/first.json',{original:false}),/exist/i);
 assert.deepEqual(JSON.parse(await readFile(join(root,'artifacts/first.json'),'utf8')),{original:true});
 const elsewhere=await mkdtemp(join(tmpdir(),'vlp-inventory-external-'));
 try {await symlink(elsewhere,join(root,'artifacts','escape'));await assert.rejects(()=>writeInventory(root,'artifacts/escape/output.json',{}),/escape|symlink/i);}finally{await rm(elsewhere,{recursive:true,force:true});}
}));
