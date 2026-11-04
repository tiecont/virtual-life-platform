'use client';
import { useEffect,useRef,useState } from 'react';
import { HospitalityMenuSchema,OrderPageSchema,OrderResultSchema,StaffStateSchema,type Me,type TravelSource } from '@virtual-city/contracts';
export type Orders=ReturnType<typeof OrderPageSchema.parse>;
type Data={menu:ReturnType<typeof HospitalityMenuSchema.parse>|null;own:Orders|null;queue:Orders|null;staff:ReturnType<typeof StaffStateSchema.parse>|null};
type Change={path:string;body:object;key:string;withdraw?:boolean};
class ServiceError extends Error{constructor(readonly status:number){super('Service request unavailable');}}
const empty:Data={menu:null,own:null,queue:null,staff:null};
export default function useHospitalityOrders(me:Me,source:TravelSource|null,worldSlug:string){
 const [data,setData]=useState<Data>(empty),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState('');
 const pending=useRef<Change|null>(null),refresh=useRef<()=>Promise<void>>(async()=>{}),run=useRef<(change:Change)=>Promise<void>>(async()=>{});
 useEffect(()=>{
  const lifetime=new AbortController();let read:AbortController|undefined,write:AbortController|undefined,reading=0,ticket=0,writing=false,expiry:ReturnType<typeof setTimeout>|undefined,queueExpiry:ReturnType<typeof setTimeout>|undefined;
  pending.current=null;setData(empty);setBusy(false);setUncertain(false);setMessage('');
  const invalidate=()=>{reading++;read?.abort();clearTimeout(expiry);clearTimeout(queueExpiry);setData(empty);};
  const observable=()=>document.visibilityState!=='hidden'&&navigator.onLine;
  const request=async<T,>(path:string,parse:(value:unknown)=>T,signal:AbortSignal,body?:object)=>{const response=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([lifetime.signal,signal,AbortSignal.timeout(8000)]),...body?{method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrfToken},body:JSON.stringify(body)}:{}});if(!response.ok)throw new ServiceError(response.status);return parse(await response.json());};
  refresh.current=async()=>{
   if(lifetime.signal.aborted||writing)return;if(document.visibilityState==='hidden'||!navigator.onLine){invalidate();return;}read?.abort();const controller=new AbortController();read=controller;const revision=++reading,started=performance.now();clearTimeout(expiry);clearTimeout(queueExpiry);setData(empty);
   const result=await Promise.allSettled([source?request('/v1/orders/menu',HospitalityMenuSchema.parse,controller.signal,{schemaVersion:1,source}):Promise.resolve(null),request('/v1/orders/mine',OrderPageSchema.parse,controller.signal),request('/v1/staff/state',StaffStateSchema.parse,controller.signal)]);
   if(lifetime.signal.aborted||controller.signal.aborted||revision!==reading)return;const staff=result[2].status==='fulfilled'?result[2].value:null;let queue:Orders|null=null;
   if(source&&staff?.shift?.worldSlug===worldSlug&&staff.shift.roomId===source.roomId&&staff.shift.phase==='active'){try{queue=await request('/v1/orders/queue',OrderPageSchema.parse,controller.signal,{schemaVersion:1,source});}catch{/* An unavailable queue never becomes a fabricated empty queue. */}}
   if(lifetime.signal.aborted||controller.signal.aborted||revision!==reading)return;const elapsed=performance.now()-started;if(elapsed>=30000){invalidate();return;}
   setData({menu:result[0].status==='fulfilled'?result[0].value:null,own:result[1].status==='fulfilled'?result[1].value:null,staff,queue:elapsed<10000?queue:null});expiry=setTimeout(invalidate,30000-elapsed);if(elapsed<10000)queueExpiry=setTimeout(()=>setData(current=>({...current,queue:null})),10000-elapsed);
  };
  run.current=async change=>{
   if(lifetime.signal.aborted)return;if(change.withdraw){ticket++;write?.abort();writing=false;pending.current=change;setUncertain(false);}if(writing)return;writing=true;const generation=++ticket,controller=new AbortController();let confirmed:ReturnType<typeof OrderResultSchema.parse>['order']|null=null;write=controller;setBusy(true);setMessage('Confirming virtual service...');
   try{const response=await fetch(change.path,{method:'POST',cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([lifetime.signal,controller.signal,AbortSignal.timeout(8000)]),headers:{'content-type':'application/json','x-csrf-token':me.csrfToken,'idempotency-key':change.key},body:JSON.stringify(change.body)});if(!response.ok)throw new ServiceError(response.status);confirmed=OrderResultSchema.parse(await response.json()).order;if(lifetime.signal.aborted||ticket!==generation)return;pending.current=null;setUncertain(false);setMessage('Service change recorded. Refresh the service controls to check current availability.');}
   catch(error){if(lifetime.signal.aborted||ticket!==generation)return;if(error instanceof ServiceError&&[400,401,403,404,409,422,429].includes(error.status)){pending.current=null;setUncertain(false);setMessage('The service change was declined or your role/order changed. Refresh to check current permissions and preparation.');}else{setUncertain(true);setMessage('The service response was interrupted. Retry the same change to check it.');}}
   finally{if(!lifetime.signal.aborted&&ticket===generation){
    if(confirmed?.mine&&observable()){const order=confirmed;setData(current=>{if(!current.own)return current;const known=current.own.items.some(item=>item.id===order.id);return {...current,own:{...current.own,items:[order,...current.own.items.filter(item=>item.id!==order.id)].slice(0,20),truncated:current.own.truncated||!known&&current.own.items.length>=20}};});}
    else if(confirmed&&source&&observable()){clearTimeout(queueExpiry);setData(current=>({...current,queue:null}));const started=performance.now();try{const queue=await request('/v1/orders/queue',OrderPageSchema.parse,controller.signal,{schemaVersion:1,source});if(!lifetime.signal.aborted&&ticket===generation&&observable()){const remaining=10000-(performance.now()-started);if(remaining>0){setData(current=>({...current,queue}));queueExpiry=setTimeout(()=>setData(current=>({...current,queue:null})),remaining);}}}catch{/* The mutation is confirmed even when its queue refresh is unavailable. */}}
    if(!lifetime.signal.aborted&&ticket===generation){writing=false;setBusy(false);if(!confirmed)await refresh.current();}
   }}
  };
  const hidden=()=>{if(document.visibilityState==='hidden')invalidate();};document.addEventListener('visibilitychange',hidden);window.addEventListener('offline',invalidate);void refresh.current();return()=>{lifetime.abort();read?.abort();write?.abort();clearTimeout(expiry);clearTimeout(queueExpiry);pending.current=null;document.removeEventListener('visibilitychange',hidden);window.removeEventListener('offline',invalidate);};
 },[me.profile.id,me.csrfToken,source?.epoch,source?.roomId,source?.membershipId,worldSlug]);
 const change=(path:string,body:object,withdraw=false)=>{if(!withdraw&&(busy||uncertain||pending.current))return;const next={path,body,key:crypto.randomUUID(),withdraw};pending.current=next;void run.current(next);};
 return {data,busy,uncertain,message,refresh:()=>void refresh.current(),retry:()=>{if(pending.current)void run.current(pending.current);},change};
}
