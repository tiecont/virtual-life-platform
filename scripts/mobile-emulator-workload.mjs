import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {evaluateWorkload} from './scene3d-workload-policy.mjs';
import {workloadHash as hash,workloadSourceFiles} from './scene3d-workload-evidence.mjs';

// Task-owned AVD and own DEBUG WebView only; no USB/personal-app fallback.
const config=JSON.parse(await readFile('config/mobile/android-emulator.json')),instance=JSON.parse(await readFile('artifacts/vnext/n10-05/runtime/instance.json'));
const adb=process.env.ADB_PATH,serial=process.env.VLP_EMULATOR_SERIAL,apk=resolve(process.env.VLP_EMULATOR_APK??''),root=process.cwd(),app='life.virtualcity.spike';
assert(adb&&serial==='emulator-'+config.port&&instance.serial===serial&&instance.avdName===config.avdName);
assert.equal(readFileSync('/proc/'+instance.pid+'/stat','utf8').split(') ').at(-1).split(' ')[19],instance.startTicks);
const argv=readFileSync('/proc/'+instance.pid+'/cmdline','utf8').split('\0');assert(argv.includes(config.avdName)&&argv.includes(String(config.port)));
assert((apk.startsWith(root+'/artifacts/')||apk.startsWith(root+'/apps/mobile/android/app/build/outputs/apk/'))&&apk.endsWith('.apk'));
const evidenceSet=process.env.VLP_RENDERER_EVIDENCE_SET??'workload-v1';assert(['workload-v1','serve-v1','cache-v1','groom-v1'].includes(evidenceSet),'Unknown renderer evidence set');
const output=resolve('artifacts/vnext/n06-11/'+evidenceSet+'/android-'+randomUUID().slice(0,8));await mkdir(output,{recursive:true,mode:0o700});
const budget=JSON.parse(await readFile('config/rendering/budgets-v1.json')),profile=JSON.parse(await readFile('tests/renderer-workload/PROFILE.json')),commands=[];
const facts={scope:profile.scope,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),trackedDiffSha256:hash(execFileSync('git',['diff','--binary','HEAD'],{maxBuffer:32*1024*1024})),sourceFiles:await workloadSourceFiles(),budgetSHA256:hash(await readFile('config/rendering/budgets-v1.json')),profileSHA256:hash(await readFile('tests/renderer-workload/PROFILE.json')),startedAt:new Date().toISOString(),commands,tiers:[],physicalPerformanceQualified:false,physicalDevice:false,distributed:false};
function run(label,args,{binary=false,allowMissing=false}={}){let bytes;try{bytes=execFileSync(adb,['-s',serial,...args],{timeout:30000,maxBuffer:8*1024*1024});}catch(error){commands.push({label,args,exitCode:error.status,signal:error.signal??null});if(allowMissing&&error.status===1)return '';throw error;}commands.push({label,args,exitCode:0});return binary?bytes:bytes.toString().trim();}
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));let ws,forward,sequence=0;const pending=new Map(),exceptions=[];
function send(method,params={}){return new Promise((ok,no)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);no(Error('Own WebView CDP deadline: '+method));},60000);pending.set(id,{ok,no,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!result.exceptionDetails,'Own app expression failed: '+JSON.stringify(result.exceptionDetails));return result.result.value;}
async function until(expression){const end=Date.now()+60000;while(Date.now()<end){if(await evaluate(expression))return;await sleep(200);}throw Error('Own fixture readiness deadline');}
async function capture(name){let focused=false;for(let i=0;i<20;i++){focused=run('capture-own-focus',['shell','dumpsys','window']).split('\n').some(line=>line.includes('mCurrentFocus=')&&line.includes(app+'/'));if(focused)break;await sleep(200);}assert(focused,'Refusing screenshot without own-app focus');await writeFile(output+'/'+name+'.png',run('capture-own-window',['exec-out','screencap','-p'],{binary:true}),{mode:0o600});}
try{
 assert.equal(run('qemu-guard',['shell','getprop','ro.kernel.qemu']),'1');assert(run('avd-guard',['emu','avd','name']).split(/\r?\n/).includes(config.avdName));
 const bytes=await readFile(apk);facts.apk={sha256:hash(bytes),bytes:bytes.length};await writeFile(output+'/app-debug.apk',bytes,{mode:0o600});
 run('install-own-debug-apk',['install','-r',apk]);run('stop-own-previous-app',['shell','am','force-stop',app]);run('start-own-app',['shell','am','start','-n',app+'/.MainActivity']);
 let pid;for(let i=0;i<40;i++){pid=run('own-app-pid',['shell','pidof',app],{allowMissing:true});if(/^\d+$/.test(pid))break;await sleep(250);}assert(/^\d+$/.test(pid));
 forward=run('forward-own-webview',['forward','tcp:0','localabstract:webview_devtools_remote_'+pid]);assert(/^\d+$/.test(forward));let target;
 for(let i=0;i<40;i++){try{const list=await fetch('http://127.0.0.1:'+forward+'/json/list',{signal:globalThis.AbortSignal.timeout(1000)}).then(response=>response.json());target=list.find(value=>value.type==='page'&&new URL(value.url).origin==='https://localhost');if(target)break;}catch{/* Wait for this own WebView only. */}await sleep(250);}assert(target,'Own packaged localhost WebView unavailable');
 const url=new URL(target.webSocketDebuggerUrl);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.port===forward);ws=new globalThis.WebSocket(url);
 await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true});});ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const callback=pending.get(message.id);if(callback){pending.delete(message.id);clearTimeout(callback.timer);if(message.error)callback.no(Error(message.error.message));else callback.ok(message.result);}}else if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);});await send('Runtime.enable');
 await until("window.rendererWorkload&&document.querySelector('[role=status]')?.textContent==='20 synthetic actors ready'");
 facts.device={model:run('model',['shell','getprop','ro.product.model']),android:run('android',['shell','getprop','ro.build.version.release']),api:run('api',['shell','getprop','ro.build.version.sdk']),webview:await evaluate('navigator.userAgent')};
 facts.gpu=await evaluate("(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{version:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'Unknown'};})()");
 facts.memoryBefore=run('own-app-memory-before',['shell','dumpsys','meminfo',app]);
 for(const quality of profile.tiers){if(quality!=='low')await evaluate('window.rendererWorkload.start('+JSON.stringify(quality)+')');const measured=await evaluate('window.rendererWorkload.measure('+profile.measureMilliseconds+')');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Own synthetic canvas overflows viewport');facts.tiers.push({quality,required:profile.requiredTiers.androidAVD.includes(quality),measured,evaluation:evaluateWorkload(measured,budget,'androidAVD')});await capture(quality);}
 facts.cycles=await evaluate('window.rendererWorkload.cycles('+profile.balancedRecreateCycles+')');assert.equal(facts.cycles.samples.length,20);assert(facts.cycles.samples.every(sample=>sample.after.cache.references===0));
 facts.stopped=await evaluate('window.rendererWorkload.stop()');assert.equal(facts.stopped.cache.references,0);assert.equal(await evaluate("document.querySelectorAll('canvas').length"),0);facts.memoryAfter=run('own-app-memory-after',['shell','dumpsys','meminfo',app]);assert.deepEqual(exceptions,[]);
 facts.functionalResult='PASS';facts.observedRequiredLimitsMet=facts.tiers.filter(value=>value.required).every(value=>value.evaluation.observedLimitsMet);facts.result=facts.observedRequiredLimitsMet?'OBSERVED_LIMITS_MET_NOT_PHYSICAL_QUALIFICATION':'OBSERVED_LIMITS_EXCEEDED_NOT_PHYSICAL_QUALIFICATION';if(!facts.observedRequiredLimitsMet)process.exitCode=1;
}catch(error){facts.result='FUNCTIONAL_FAILURE';facts.error=error.message;process.exitCode=1;}
finally{if(ws){try{await evaluate('window.rendererWorkload?.stop()');}catch{/* Preserve original failure; release process on AVD shutdown. */}for(const callback of pending.values()){clearTimeout(callback.timer);callback.no(Error('Own CDP session closed'));}pending.clear();ws.close();}if(forward){try{run('remove-own-forward',['forward','--remove','tcp:'+forward]);}catch(error){facts.cleanupError=error.message;process.exitCode=1;}}facts.completedAt=new Date().toISOString();await writeFile(output+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({result:facts.result,error:facts.error,artifactDirectory:relative(root,output),physicalPerformanceQualified:false}));}
