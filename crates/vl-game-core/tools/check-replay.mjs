import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const cargo=process.env.CARGO_HOME?resolve(process.env.CARGO_HOME,'bin/cargo'):'cargo';
const expected=readFileSync(new URL('../fixtures/replay-v1.txt',import.meta.url),'utf8');
const args=['run','--locked','--quiet','--package','vl-game-core','--example','replay-probe'];
for(let run=1;run<=2;run++) {
  const output=execFileSync(cargo,args,{encoding:'utf8',stdio:['ignore','pipe','inherit']});
  assert.equal(output,expected,`Separate process ${run} changed the frozen v1 replay`);
}
console.log(JSON.stringify({result:'PASS',processes:2,turnsPerProcess:5,fixtureSha256:createHash('sha256').update(expected).digest('hex')}));
