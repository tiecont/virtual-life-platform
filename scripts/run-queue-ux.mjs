import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {validateBrowserBatches} from './ci-policy.mjs';
const id=randomUUID().slice(0,8),directory='artifacts/vnext/n09-03/queue-run-'+id,startedAt=new Date().toISOString();await mkdir(directory,{recursive:true,mode:0o700});
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),trackedDiffSha256=createHash('sha256').update(execFileSync('git',['diff','--binary','HEAD'],{maxBuffer:32*1024*1024})).digest('hex');
const child=spawn(process.execPath,['scripts/run-browser-tests.mjs','tests/e2e/queue-ux.spec.ts'],{stdio:'inherit',env:{...process.env,UX_EVIDENCE_RUN:id,BROWSER_REPORT_SCOPE:'ci/study/queue-ux-'+id}});
const code=await new Promise((ok,no)=>{child.once('error',no);child.once('close',code=>ok(code??1));});let reportValid=false,batches=[];
try{if((await stat('artifacts/browser-batches.json')).mtimeMs<Date.parse(startedAt))throw Error('Stale browser report');batches=JSON.parse(await readFile('artifacts/browser-batches.json','utf8'));validateBrowserBatches(batches,'queue-ux.spec.ts',code);reportValid=true;}catch{/* Fail closed. */}
const exitCode=code||!reportValid?code||1:0,facts={scope:'Actual queue HTTP/identity/PostgreSQL and Next shared UI; synthetic cap/offer fixtures, not allocator activation, native auth or physical-device acceptance',sourceRevision,trackedDiffSha256,startedAt,completedAt:new Date().toISOString(),processExitCode:code,exitCode,reportValid,batches,visualDirectory:'artifacts/vnext/n09-03/queue-'+id};await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({...facts,artifactDirectory:directory}));process.exitCode=exitCode;
