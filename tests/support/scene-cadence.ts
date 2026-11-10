import type {Locator} from '@playwright/test';

// Keep observation in the page before the command; remote assertion/locator
// round trips must not consume the movement interval being measured.
export async function armSceneCadence(canvas:Locator){
 const handle=await canvas.evaluateHandle(element=>{
  const node=element as HTMLElement;
  const result={status:'armed',armedAtMs:performance.now(),startedAtMs:null as number|null,finishedAtMs:null as number|null,
   initialMoving:node.dataset.movingCount,rawGapsMs:[] as number[],callbacks:[] as Array<{rafMs:number;observedAtMs:number;moving:string|undefined;connected:boolean}>,
   transitions:[] as Array<{atMs:number;moving:string|undefined}>,connectedThroughout:true};
  let complete!:(value:typeof result)=>void,frame:number,last:number|undefined,closed=false;
  const done=new Promise<typeof result>(resolve=>complete=resolve);
  function finish(status:string){
   if(closed)return;closed=true;result.status=status;result.finishedAtMs=performance.now();
   cancelAnimationFrame(frame);clearTimeout(timer);observer.disconnect();complete(result);
  }
  function observe(){
   const moving=node.dataset.movingCount;
   result.transitions.push({atMs:performance.now(),moving});
   if(result.startedAtMs===null&&moving==='1')result.startedAtMs=performance.now();
  }
  const observer=new MutationObserver(observe);
  observer.observe(node,{attributes:true,attributeFilter:['data-moving-count']});
  function sample(time:number){
   const moving=node.dataset.movingCount,connected=node.isConnected;
   result.connectedThroughout&&=connected;
   if(!connected){finish('detached');return;}
   if(result.startedAtMs===null&&moving==='1')result.startedAtMs=performance.now();
   if(result.startedAtMs!==null){
    if(last!==undefined)result.rawGapsMs.push(time-last);
    result.callbacks.push({rafMs:time,observedAtMs:performance.now(),moving,connected});
    if(moving==='0'){finish('settled');return;}
   }
   last=time;frame=requestAnimationFrame(sample);
  }
  const timer=setTimeout(()=>finish('timeout'),8000);
  frame=requestAnimationFrame(sample);
  return{done,cancel:()=>finish('cancelled')};
 });
 return{
  finish:()=>handle.evaluate(async value=>await value.done),
  dispose:async()=>{try{await handle.evaluate(value=>value.cancel());}finally{await handle.dispose();}},
 };
}
