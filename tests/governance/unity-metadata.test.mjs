import assert from 'node:assert/strict';
import {glob,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

test('Unity asset metadata has valid unique GUIDs so assembly definitions import',async()=>{
 const root='apps/unity-client/Assets',seen=new Map();
 for await(const path of glob('**/*.meta',{cwd:root})){
  const source=await readFile(join(root,path),'utf8'),guid=/^guid: ([a-f0-9]{32})\r?$/m.exec(source)?.[1];
  assert(guid,'Invalid Unity GUID: '+path);
  assert(!seen.has(guid),'Duplicate Unity GUID: '+path+' / '+seen.get(guid));
  seen.set(guid,path);
 }
 assert(seen.size>0,'Unity project metadata must be present');
});
