import { spawn } from 'node:child_process';
import { mkdir,copyFile,writeFile,readFile,rm } from 'node:fs/promises';
import { browserPlan,validateBrowserBatches } from './ci-policy.mjs';
const group=process.argv[2];
async function main(){
 const plan=await browserPlan();if(!Object.hasOwn(plan.groups,group))throw Error('Unknown browser group');
 const results=[],root='artifacts/ci/'+group;await mkdir(root,{recursive:true});
 for(const file of plan.groups[group]){
  const slug=file.replace('.spec.ts',''),scope='ci/'+group+'/'+slug;console.log('CI browser group '+group+': '+file);
  await rm('artifacts/browser-batches.json',{force:true});
  const code=await new Promise((ok,no)=>{const child=spawn(process.execPath,['scripts/run-browser-tests.mjs','tests/e2e/'+file],{env:{...process.env,BROWSER_REPORT_SCOPE:scope},stdio:'inherit'});child.once('error',no);child.once('exit',value=>ok(value??1));});
  let reportValid=false;
  try{validateBrowserBatches(JSON.parse(await readFile('artifacts/browser-batches.json','utf8')),file,code);await copyFile('artifacts/browser-batches.json',root+'/'+slug+'-batches.json');reportValid=true;}catch{ /* Never archive a stale/foreign/incomplete success report. */ }
  const outcome=code||!reportValid?code||1:0;results.push({spec:file,exitCode:outcome,processExitCode:code,reportValid});await writeFile(root+'/summary.json',JSON.stringify({group,results},null,2)+'\n');
  if(outcome!==0){process.exitCode=outcome;return;}
 }
}
void main().catch(()=>{console.error('CI browser group failed;no remaining spec is claimed passed');process.exitCode=1;});
