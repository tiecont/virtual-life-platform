import type {CDPSession} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {evidenceOutput} from '../../scripts/evidence-output.mjs';

// Diagnostic only: CPU/timeline collection adds overhead. Callers keep the
// original cadence sample and acceptance limits,including failed observations.
export async function profileSceneMovement(cdp:CDPSession,prefix:'m07'|'m15',project:string){
 await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 await cdp.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,gpu,viz,renderer.scheduler',transferMode:'ReturnAsStream'});
 return async()=>{
  const {profile}=await cdp.send('Profiler.stop');await cdp.send('Profiler.disable');
  await writeFile(evidenceOutput(`docs/agent/evidence/${prefix}-movement-cpu-${project}.cpuprofile`),JSON.stringify(profile));
  const completed=new Promise<{stream?:string}>(resolve=>cdp.once('Tracing.tracingComplete',resolve));
  await cdp.send('Tracing.end');const {stream}=await completed;if(!stream)throw Error('Movement diagnostic trace stream unavailable');
  const chunks:Buffer[]=[];
  try{for(;;){const part=await cdp.send('IO.read',{handle:stream,size:65536});chunks.push(Buffer.from(part.data,part.base64Encoded?'base64':'utf8'));if(part.eof)break;}}
  finally{await cdp.send('IO.close',{handle:stream});}
  await writeFile(evidenceOutput(`docs/agent/evidence/${prefix}-movement-timeline-${project}.json`),Buffer.concat(chunks));
 };
}
