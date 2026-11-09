import {createRoomScene} from '../../packages/scene3d/src/renderer';
import {animalResourceSummary} from '../../packages/scene3d/src/animal';
import {RoomProjection} from '../../packages/scene3d/src/projection';
import type {SceneQuality} from '../../packages/client-sdk/src/scene';
import {cafeSnapshot,scenes,type Cafe} from './fixture';

const requested=new URLSearchParams(window.location.search).get('cafe');
if(requested!=='deadline'&&requested!=='maid')throw Error('Unknown synthetic cafe');
const cafe:Cafe=requested,host=document.getElementById('host')!,status=document.querySelector('[role=status]')!;
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
let handle:Awaited<ReturnType<typeof createRoomScene>>|null=null,generation=0,quality:SceneQuality='low';
const snapshot=cafeSnapshot(cafe),projection=new RoomProjection(scenes[cafe]);projection.accept(snapshot,0);
const actors=projection.actors(0),poses={seated:actors.filter(actor=>actor.pose==='sit').length,walking:actors.filter(actor=>actor.pose==='walk').length,idle:actors.filter(actor=>actor.pose==='idle').length};
if(poses.seated!==4||poses.walking!==10||poses.idle!==6)throw Error('Unexpected synthetic actor mixture');
const facts=()=>({cafe,quality,poses,diagnostics:handle?.diagnostics()??null,inventory:handle?.resourceInventory()??null,cache:animalResourceSummary(),art:JSON.parse(host.querySelector('canvas')?.dataset.roomArt??'null')});
function stop(){generation++;handle?.destroy();handle=null;status.textContent='Stopped';return facts();}
async function start(value:SceneQuality){
 stop();const ticket=generation;quality=value;
 const next=await createRoomScene(host,scenes[cafe],()=>{throw Error('Synthetic fixture has no gameplay authority');},{quality,theme:cafe,onMove:()=>{throw Error('Synthetic fixture has no gameplay authority');}});
 if(ticket!==generation){next.destroy();throw Error('Synthetic fixture superseded');}
 handle=next;handle.update(snapshot);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));status.textContent='20 synthetic actors ready';return facts();
}
async function measure(milliseconds:number){
 if(!handle||!Number.isInteger(milliseconds)||milliseconds<3000||milliseconds>30000)throw Error('Bounded3..30second measurement required');
 handle.resetMeasurements();const samples:ReturnType<typeof facts>[]=[],intervals:number[]=[],began=performance.now();let previous:number|null=null,frame=0;
 const collect=(now:number)=>{if(previous!==null&&now-began>=2000)intervals.push(now-previous);previous=now;frame=requestAnimationFrame(collect);};frame=requestAnimationFrame(collect);
 try{while(performance.now()<began+milliseconds){await wait(500);samples.push(facts());}}finally{cancelAnimationFrame(frame);}
 const ordered=intervals.slice().sort((a,b)=>a-b);
 return{...facts(),samples,frameWindow:{scope:'External RAF intervals after2second warmup;all samples,no GPU fence',samples:intervals.length,p95Ms:ordered.length?ordered[Math.ceil(ordered.length*.95)-1]:null,maxMs:ordered.at(-1)??null,stallsOver250Ms:intervals.filter(value=>value>250).length,elapsedMs:performance.now()-began}};
}
declare global{interface Window{cafeWorkload:{start:typeof start;stop:typeof stop;facts:typeof facts;measure:typeof measure}}}
window.cafeWorkload={start,stop,facts,measure};window.addEventListener('pagehide',stop,{once:true});await start('low');
