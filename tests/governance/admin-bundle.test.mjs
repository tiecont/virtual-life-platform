import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectAdminBundle} from '../../scripts/admin-bundle-check.mjs';
const markers=['synthetic-private-read-token-only-0001','https://synthetic-internal-api.invalid'];
test('production bundle inspection hashes actual files and rejects leaked markers/private entrypoints',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'admin-bundle-'));try{await writeFile(join(folder,'client.js'),'console.log("public interface");');assert.equal((await inspectAdminBundle(folder,markers)).files.length,1);
  for(const value of [...markers,'/internal/telemetry']){await writeFile(join(folder,'client.js'),JSON.stringify(value));await assert.rejects(inspectAdminBundle(folder,markers));}
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('inspection refuses missing marker authority, empty artifacts and symlink traversal',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'admin-bundle-'));try{await assert.rejects(inspectAdminBundle(folder,[]));await assert.rejects(inspectAdminBundle(folder,markers));await writeFile(join(folder,'private.txt'),'synthetic protected bytes');await symlink(join(folder,'private.txt'),join(folder,'client.js'));await assert.rejects(inspectAdminBundle(folder,markers));}finally{await rm(folder,{recursive:true,force:true});}
});
