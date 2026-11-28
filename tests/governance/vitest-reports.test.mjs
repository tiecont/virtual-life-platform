import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {test} from 'node:test';

const run=promisify(execFile),script=path.resolve('scripts/verify-vitest-reports.mjs');

async function fixture(counts){
  const root=await mkdtemp(path.join(tmpdir(),'aetheria-vitest-reports-'));
  await mkdir(path.join(root,'reports'));
  for(const [index,count] of counts.entries())await writeFile(path.join(root,'reports',`shard-${index+1}.json`),JSON.stringify({
    success:true,numTotalTests:count,numPassedTests:count,numFailedTests:0,numPendingTests:0,numTodoTests:0,
  }));
  return root;
}

test('four shard reports must account for exactly the complete suite with zero skipped tests',async()=>{
  const root=await fixture([200,205,204,204]);
  try{
    const result=await run(process.execPath,[script,path.join(root,'reports'),'813']);
    assert.deepEqual(JSON.parse(result.stdout),{reports:4,total:813,passed:813,pending:0,todo:0,skipped:0});
    await assert.rejects(run(process.execPath,[script,path.join(root,'reports'),'812']));
  }finally{await rm(root,{recursive:true,force:true});}
});

test('shard verification rejects missing, empty, failed, pending or todo reports',async()=>{
  const root=await fixture([203,203,203,203]);
  try{
    const reports=path.join(root,'reports');
    await assert.rejects(run(process.execPath,[script,reports,'813']),/Expected 813/);
    await rm(path.join(reports,'shard-4.json'));
    await assert.rejects(run(process.execPath,[script,reports,'812']),/exactly four/i);
    for(const field of ['numFailedTests','numPendingTests','numTodoTests']){
      await writeFile(path.join(reports,'shard-4.json'),JSON.stringify({
        success:true,numTotalTests:204,numPassedTests:203,numFailedTests:0,numPendingTests:0,numTodoTests:0,[field]:1,
      }));
      await assert.rejects(run(process.execPath,[script,reports,'813']),new RegExp(field));
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
