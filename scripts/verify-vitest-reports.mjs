import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';

const directory=process.argv[2],capacity=JSON.parse(await readFile('config/ci-capacity.json','utf8'));
const expected=process.argv[3]===undefined?capacity.integrationTestTotal:Number(process.argv[3]);
assert(capacity.schemaVersion===1&&capacity.integrationShards===4&&Number.isSafeInteger(capacity.integrationTestTotal)&&capacity.integrationTestTotal>0,'Invalid CI capacity config');
assert(directory&&Number.isSafeInteger(expected)&&expected>0,'usage: verify-vitest-reports <directory> [expected-total]');
const files=(await readdir(directory)).filter(name=>name.endsWith('.json')).sort();
assert.equal(files.length,4,'Expected exactly four integration-shard reports');
let total=0,passed=0;
for(const file of files){
  const report=JSON.parse(await readFile(path.join(directory,file),'utf8'));
  assert.equal(report.success,true,`${file} did not report success`);
  for(const field of ['numFailedTests','numPendingTests','numTodoTests'])assert.equal(report[field],0,`${file} has ${field}`);
  assert(Number.isSafeInteger(report.numTotalTests)&&report.numTotalTests>0,`${file} is empty`);
  assert(Number.isSafeInteger(report.numPassedTests),`${file} omitted passed count`);
  assert.equal(report.numPassedTests,report.numTotalTests,`${file} did not pass every test`);
  total+=report.numTotalTests;passed+=report.numPassedTests;
}
assert.equal(total,expected,`Expected ${expected} integration tests, received ${total}`);
assert.equal(passed,expected,`Expected ${expected} passed integration tests, received ${passed}`);
console.log(JSON.stringify({reports:files.length,total,passed,pending:0,todo:0,skipped:0}));
