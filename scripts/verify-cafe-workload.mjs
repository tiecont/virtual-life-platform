import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {platform,release,cpus,totalmem} from 'node:os';
import {chromium,expect} from '@playwright/test';
import {evaluateWorkload} from './scene3d-workload-policy.mjs';
import {evaluateHeap} from './scene3d-loading-policy.mjs';
import {workloadBundleFiles} from './scene3d-workload-evidence.mjs';

const profileRef='tests/cafe-workload/PROFILE-v1.json',budgetRef='docs/design/vnext/animals-3d/budgets-v1.json';
const json=async ref=>JSON.parse(await readFile(ref)),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const profile=await json(profileRef),budget=await json(budgetRef),output='artifacts/vnext/n06-04/cafe-workload-v1/browser-'+randomUUID().slice(0,8),bundle=resolve(output+'/bundle');
await mkdir(output,{recursive:true,mode:0o700});
const sourceRefs=[profileRef,budgetRef,'tests/cafe-workload/index.html','tests/cafe-workload/main.ts','tests/cafe-workload/fixture.ts','scripts/verify-cafe-workload.mjs','scripts/scene3d-workload-policy.mjs','scripts/scene3d-loading-policy.mjs','scripts/scene3d-workload-evidence.mjs','packages/deadline-world/src/scene.ts','packages/deadline-world/src/baseline.ts','packages/maid-world/src/scene.ts','pnpm-lock.yaml'];
for(const directory of ['packages/scene3d/src','packages/contracts/src','packages/world-sdk/src'])for(const name of await readdir(directory))if(name.endsWith('.ts'))sourceRefs.push(directory+'/'+name);
sourceRefs.sort();const sources=()=>Promise.all(sourceRefs.map(async ref=>({ref,sha256:hash(await readFile(ref))})));
const mobile=createRequire(resolve('apps/mobile/package.json')),vite=await import(pathToFileURL(mobile.resolve('vite')).href);
const facts={sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),trackedDiffSha256:hash(execFileSync('git',['diff','--binary','HEAD'])),sourceFiles:await sources(),profile,profileSha256:hash(await readFile(profileRef)),budgetSha256:hash(await readFile(budgetRef)),environment:{os:platform(),kernel:release(),node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem()},startedAt:new Date().toISOString(),result:'IN_PROGRESS',profiles:[],limitations:['Synthetic input,not actual20authenticated sessions,server capacity,final-art or native qualification.','Controlled cold/warm loading and complete starter catalog NOT_RUN by this driver.','No native RSS,thermal,battery,owner art approval or human usability claim.']};
const save=()=>writeFile(output+'/facts.json',JSON.stringify(facts,null,2)+'\n');await save();
let browser,server;
try{
 await vite.build({configFile:false,root:resolve('tests/cafe-workload'),publicDir:false,base:'./',build:{outDir:bundle,emptyOutDir:false,target:'es2022',sourcemap:false}});
 facts.bundleFiles=await workloadBundleFiles(bundle);const html=await readFile(bundle+'/index.html','utf8');assert(html.includes('connect-src \'none\'')&&!html.includes('unsafe-eval'));
 const bodies=new Map();for(const file of facts.bundleFiles)bodies.set('/'+file.ref,gzipSync(await readFile(bundle+'/'+file.ref)));
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
 server=createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,path=pathname==='/'?'/index.html':pathname,body=bodies.get(path);if(!body){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream','content-encoding':'gzip','content-length':body.length,'cache-control':path==='/index.html'?'no-store':'public,max-age=31536000,immutable'});res.end(body);});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch();facts.environment.chromium=browser.version();
 for(const cafe of profile.scenes)for(const setup of profile.profiles){
  const {name,...options}=setup,context=await browser.newContext({...options,serviceWorkers:'block'}),page=await context.newPage(),errors=[],foreign=[],sockets=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',request=>{if(!request.url().startsWith(origin+'/')&&!/^(data:|blob:)/.test(request.url()))foreign.push(request.url());});page.on('websocket',socket=>sockets.push(socket.url()));
  const recorded={cafe,name,setup,tiers:[],heap:null,result:'IN_PROGRESS'};facts.profiles.push(recorded);await save();
  const check=()=>{assert.deepEqual(errors,[]);assert.deepEqual(foreign,[]);assert.deepEqual(sockets,[]);};
  try{
   await page.goto(origin+'/?cafe='+cafe);await expect(page.getByRole('status')).toHaveText('20 synthetic actors ready',{timeout:60000});
   recorded.gpu=await page.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{version:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'UNKNOWN'};});
   for(const quality of profile.tiers){
    if(quality!=='low')await page.evaluate(value=>window.cafeWorkload.start(value),quality);
    const measured=await page.evaluate(ms=>window.cafeWorkload.measure(ms),profile.measureMilliseconds),evaluation=evaluateWorkload(measured,budget,name);
    assert.deepEqual(measured.poses,{seated:4,walking:10,idle:6});assert.equal(measured.art.theme,cafe);assert.equal(measured.art.workstations,cafe==='deadline'?18:0);assert.equal(measured.art.teaSets,cafe==='maid'?6:0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));check();recorded.tiers.push({quality,required:profile.requiredTiers[name].includes(quality),measured,evaluation});await save();
    await page.screenshot({path:output+'/'+cafe+'-'+name+'-'+quality+'.png'});
    console.log(JSON.stringify({cafe,profile:name,quality,required:recorded.tiers.at(-1).required,checks:evaluation.checks,frameWindow:measured.frameWindow,artifactDirectory:output}));
   }
   const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.enable');
   async function gc(){for(let i=0;i<profile.heap.garbageCollectionsPerSample;i++){await page.waitForTimeout(profile.heap.idleMilliseconds);await cdp.send('HeapProfiler.collectGarbage');}const heap=await cdp.send('Runtime.getHeapUsage');assert(Number.isFinite(heap.usedSize)&&heap.usedSize>0);return{...heap,gcCompleted:true,at:new Date().toISOString()};}
   for(let i=0;i<profile.heap.warmRecreates;i++)await page.evaluate(value=>window.cafeWorkload.start(value),profile.heap.quality);
   const heap={baseline:await gc(),samples:[],stopped:null,evaluation:null};recorded.heap=heap;await save();
   for(let cycle=1;cycle<=profile.heap.cycles;cycle++){
    const stopped=await page.evaluate(()=>({facts:window.cafeWorkload.stop(),canvases:document.querySelectorAll('canvas').length}));assert.equal(stopped.facts.cache.references,0);assert.equal(stopped.canvases,0);
    const active=await page.evaluate(value=>window.cafeWorkload.start(value),profile.heap.quality);assert.equal(active.diagnostics.actors,20);assert.equal(active.cache.references,20);
    heap.samples.push({cycle,...await gc(),teardown:{references:stopped.facts.cache.references,canvases:stopped.canvases}});check();await save();
   }
   const stopped=await page.evaluate(()=>({facts:window.cafeWorkload.stop(),canvases:document.querySelectorAll('canvas').length}));assert.equal(stopped.facts.cache.references,0);assert.equal(stopped.canvases,0);heap.stopped={...await gc(),references:0,canvases:0};heap.evaluation=evaluateHeap(heap.baseline,heap.samples,profile.heap.cycles,budget);
   recorded.result='FUNCTIONAL_PASS';recorded.observedRequiredLimitsMet=recorded.tiers.filter(tier=>tier.required).every(tier=>tier.evaluation.observedLimitsMet)&&heap.evaluation.observedLimitMet;check();await save();
   console.log(JSON.stringify({cafe,profile:name,heap:heap.evaluation,artifactDirectory:output}));
  }finally{await context.close();}
 }
 assert.deepEqual(await sources(),facts.sourceFiles,'Source changed during measurement');assert.deepEqual(await workloadBundleFiles(bundle),facts.bundleFiles,'Bundle changed during measurement');
 facts.result=facts.profiles.every(value=>value.observedRequiredLimitsMet)?'OBSERVED_SYNTHETIC_LIMITS_MET':'OBSERVED_SYNTHETIC_LIMITS_EXCEEDED';if(facts.result.endsWith('EXCEEDED'))process.exitCode=1;
}catch(error){facts.result='FUNCTIONAL_FAILURE';facts.error=error.stack;process.exitCode=1;}finally{
 if(browser)await browser.close();if(server)await new Promise(ok=>server.close(ok));facts.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({result:facts.result,error:facts.error,artifactDirectory:output}));
}
