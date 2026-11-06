import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {validateBrowserBatches} from './ci-policy.mjs';
const args=process.argv.slice(2);assert(args.length===0||args.length===1&&args[0]==='--classic','Only --classic is supported');
const mode=args.length?'classic':'scene-first',id=randomUUID().slice(0,8),directory='artifacts/vnext/n06-03/ux-run-'+id,startedAt=new Date().toISOString();await mkdir(directory,{recursive:true,mode:0o700});
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),trackedDiffSha256=createHash('sha256').update(execFileSync('git',['diff','--binary','HEAD'],{maxBuffer:32*1024*1024})).digest('hex');
// Build the portal with matching NEXT_PUBLIC_VLP_SCENE_FIRST before this check.
const child=spawn(process.execPath,['scripts/run-browser-tests.mjs','tests/e2e/ux-core.spec.ts'],{stdio:'inherit',env:{...process.env,UX_SHELL_MODE:mode,UX_EVIDENCE_RUN:id,BROWSER_REPORT_SCOPE:'ci/study/ux-core-'+mode+'-'+id}});
const code=await new Promise((ok,no)=>{child.once('error',no);child.once('close',code=>ok(code??1));});let reportValid=false,batches=[];
try{assert((await stat('artifacts/browser-batches.json')).mtimeMs>=Date.parse(startedAt));batches=JSON.parse(await readFile('artifacts/browser-batches.json','utf8'));validateBrowserBatches(batches,'ux-core.spec.ts',code);reportValid=true;}catch{ /* Missing/stale/foreign report cannot pass. */ }
const exitCode=code||!reportValid?code||1:0,facts={scope:'Actual browser/API shared shell; desktop and Chromium mobile emulation, not native device acceptance',mode,sourceRevision,trackedDiffSha256,startedAt,completedAt:new Date().toISOString(),processExitCode:code,exitCode,reportValid,batches,visualDirectory:'artifacts/vnext/n06-03/ux-'+id};await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({...facts,artifactDirectory:directory}));process.exitCode=exitCode;
