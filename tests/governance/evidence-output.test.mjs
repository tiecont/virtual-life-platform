import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,writeFile,readFile,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evidenceOutput} from '../../scripts/evidence-output.mjs';

test('fresh output preserves historical bytes and fits scoped CI upload boundaries; invalid targets fail',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vlp-evidence-output-')),previous=process.cwd(),scope=process.env.BROWSER_REPORT_SCOPE;
 try{
  process.chdir(root);await mkdir('docs/agent/evidence',{recursive:true});await writeFile('docs/agent/evidence/result.json','historical');delete process.env.BROWSER_REPORT_SCOPE;
  const local=evidenceOutput('docs/agent/evidence/result.json');assert.match(local,/^artifacts\/evidence\/local\/[a-f0-9-]+\/result\.json$/);await writeFile(local,'fresh');
  process.env.BROWSER_REPORT_SCOPE='ci/legacy/city-header';const ci=evidenceOutput('docs/agent/evidence/visual/desktop.json');assert.equal(ci,'artifacts/ci/legacy/city-header/evidence/visual/desktop.json');await writeFile(ci,'fresh CI');
  assert.equal(await readFile('docs/agent/evidence/result.json','utf8'),'historical');
  for(const target of ['.env','docs/agent/evidence/../escape','docs/agent/evidence//empty'])assert.throws(()=>evidenceOutput(target));
  process.env.BROWSER_REPORT_SCOPE='../../escape';assert.throws(()=>evidenceOutput('docs/agent/evidence/result.json'),/Invalid evidence output scope/);
  process.env.BROWSER_REPORT_SCOPE='ci/legacy/linked';await symlink(root,'artifacts/ci/legacy/linked');assert.throws(()=>evidenceOutput('docs/agent/evidence/result.json'),/symlink refused/);
 }finally{process.chdir(previous);if(scope===undefined)delete process.env.BROWSER_REPORT_SCOPE;else process.env.BROWSER_REPORT_SCOPE=scope;await rm(root,{recursive:true,force:true});}
});
