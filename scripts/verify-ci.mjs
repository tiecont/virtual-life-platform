import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { browserPlan } from './ci-policy.mjs';
import {verifyToolchain} from './verify-toolchain.mjs';
async function main(){
 const plan=await browserPlan(),workflow=await readFile('.github/workflows/quality.yml','utf8'),pins=JSON.parse(await readFile('config/ci-actions.json','utf8'));
 assert(!/pull_request_target|secrets\.|continue-on-error|\|\|\s*true/.test(workflow));
 assert(/permissions:\s*\n\s+contents: read/.test(workflow));assert(workflow.includes('persist-credentials: false'));
 assert.equal((workflow.match(/fetch-depth: 0/g)??[]).length,2,'Core/browser readers need full historical evidence objects');
 for(const match of workflow.matchAll(/uses:\s*([^\s#]+)/g)){const [repo,ref]=match[1].split('@');assert(/^[a-f0-9]{40}$/.test(ref??''),'Action must use an immutable commit');assert.equal(ref,pins[repo],'Action must match reviewed immutable pin');}
 assert(workflow.includes('fromJSON(needs.core.outputs.groups'));
 assert(workflow.includes('max-parallel: 2')&&workflow.includes('fail-fast: false'));
 const gate=workflow.split('\n  quality:')[1];assert(gate&&gate.includes('needs: [core, browser]')&&gate.includes('if: ${{ always() }}')&&gate.includes('node scripts/ci-gate.mjs'));
 assert(!/^\s+artifacts\/\s*$/m.test(workflow));assert(!workflow.includes('pnpm test:e2e'));
 const toolchain=await verifyToolchain();
 console.log(JSON.stringify({toolchain:{node:toolchain.node,pnpm:toolchain.pnpm,workspaces:toolchain.workspaces,buildTargets:toolchain.buildTargets,installedDeclarations:toolchain.installedDeclarations,strategy:toolchain.strategy}}));
 console.log(JSON.stringify({groups:Object.keys(plan.groups),specs:Object.values(plan.groups).flat().length,requiredCheck:'quality',scope:'Local workflow contract only;hosted run/required-check settings NOT_RUN'}));
}
void main().catch(()=>{console.error('CI workflow/pins/browser coverage contract failed');process.exitCode=1;});
