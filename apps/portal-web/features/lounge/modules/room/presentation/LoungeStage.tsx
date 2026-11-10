'use client';
import { useEffect,useRef,useState } from 'react';
import { EventCatalogSchema,StageOwnSchema,StageViewSchema,StageResultSchema,StageStoppedSchema,type Me,type TravelSource } from '@virtual-city/contracts';
type Own=ReturnType<typeof StageOwnSchema.parse>;
type View=ReturnType<typeof StageViewSchema.parse>;
type Command={path:string;body:unknown;key:string;stop:boolean};
const usable=()=>document.visibilityState!=='hidden'&&navigator.onLine;
// Independent Stop invalidates every older UI operation before sending withdrawal.
export default function LoungeStage({me,source}:{me:Me;source:TravelSource|null}){
 const [own,setOwn]=useState<Own|null>(null),[view,setView]=useState<View|null>(null),[events,setEvents]=useState<{id:string;title:string}[]>([]),[eventId,setEventId]=useState(''),[status,setStatus]=useState('Stage availability unconfirmed.'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[stopping,setStopping]=useState(false),[retry,setRetry]=useState(false);
 const generation=useRef(0),lifetime=useRef<AbortController|null>(null),request=useRef<AbortController|null>(null),pending=useRef<Command|null>(null),reload=useRef<()=>Promise<void>>(async()=>{}),expiry=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const sourceKey=source?`${source.epoch}:${source.roomId}:${source.membershipId}`:'';
 useEffect(()=>{
  const life=new AbortController();lifetime.current=life;let reading:AbortController|undefined;
  const invalidate=()=>{generation.current++;reading?.abort();request.current?.abort();clearTimeout(expiry.current);setOwn(null);setView(null);setEvents([]);setBusy(false);setRetry(!!pending.current);setMessage(pending.current?'Stage outcome unconfirmed. Retry the same request or use Stop.':'');setStatus('Stage availability unconfirmed. Refresh to check.');};
  reload.current=async()=>{
   if(life.signal.aborted)return;if(!usable()){invalidate();return;}
   const ticket=++generation.current,started=performance.now();reading?.abort();const controller=new AbortController();reading=controller;clearTimeout(expiry.current);setView(null);setOwn(null);setStatus('Checking stage authority...');
   const options={credentials:'same-origin' as const,cache:'no-store' as const,signal:AbortSignal.any([life.signal,controller.signal,AbortSignal.timeout(8000)])};
   try{
    const [ownResponse,catalogResponse]=await Promise.all([fetch('/v1/stage/me',options),fetch('/v1/events?worldSlug=lounge',options)]);if(!ownResponse.ok||!catalogResponse.ok)throw Error('Stage unavailable');
    const history=StageOwnSchema.parse(await ownResponse.json()),catalog=EventCatalogSchema.parse(await catalogResponse.json()),listed=catalog.items.filter(event=>event.worldSlug==='lounge'&&['OPEN','LIVE'].includes(event.phase)).slice(0,5),selected=listed.some(event=>event.id===eventId)?eventId:listed[0]?.id??'';
    let snapshot:View|null=null;
    if(source&&selected){const response=await fetch('/v1/stage/view',{...options,method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrfToken},body:JSON.stringify({schemaVersion:1,eventId:selected,source})});if(!response.ok)throw Error('Stage unavailable');snapshot=StageViewSchema.parse(await response.json());}
    if(life.signal.aborted||controller.signal.aborted||ticket!==generation.current||!usable())return;
    const remaining=(snapshot?5000:30000)-(performance.now()-started);if(remaining<=0){invalidate();return;}
    setOwn(history);setEvents(listed.map(event=>({id:event.id,title:event.title})));setEventId(selected);setView(snapshot);setStatus(snapshot?'Stage as observed. Refresh before acting if availability expires.':source?'No open or live listed set is available.':'Enter the lounge to request a stage slot. Stop remains available here.');
    expiry.current=setTimeout(()=>{if(ticket===generation.current)invalidate();},remaining);
   }catch{if(!life.signal.aborted&&!controller.signal.aborted&&ticket===generation.current)invalidate();}
  };
  const visibility=()=>{if(!usable())invalidate();};document.addEventListener('visibilitychange',visibility);window.addEventListener('offline',invalidate);void reload.current();
  return()=>{life.abort();reading?.abort();request.current?.abort();generation.current++;clearTimeout(expiry.current);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('offline',invalidate);};
 // A source change cancels UI authority;the server independently checks the actual visit.
 },[me.profile.id,me.csrfToken,sourceKey,eventId]);
 async function execute(command:Command){
  if(!usable()||lifetime.current?.signal.aborted)return;
  const ticket=++generation.current;request.current?.abort();const controller=new AbortController();request.current=controller;pending.current=command;clearTimeout(expiry.current);setRetry(false);setView(null);
  if(command.stop){setStopping(true);setBusy(false);setOwn(null);setMessage('Stopping stage participation. Confirmation pending.');}else{setBusy(true);setMessage('Stage action pending confirmation. Stop remains available.');}
  try{
   const response=await fetch('/v1/'+command.path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-csrf-token':me.csrfToken,'idempotency-key':command.key},body:JSON.stringify(command.body),signal:AbortSignal.any([lifetime.current!.signal,controller.signal,AbortSignal.timeout(8000)])});
   if(ticket!==generation.current||lifetime.current?.signal.aborted||!usable())return;
   if(!response.ok){if(response.status>=500||response.status===429)throw Error('Outcome unknown');pending.current=null;setMessage('Stage action was declined. Refresh to check current authority.');setBusy(false);setStopping(false);await reload.current();return;}
   const body=await response.json();if(ticket!==generation.current||lifetime.current?.signal.aborted)return;
   if(command.stop){StageStoppedSchema.parse(body);setMessage('Stage participation stopped. A new request needs your explicit consent.');}else{const result=StageResultSchema.parse(body);setMessage(result.slot.phase==='ACTIVE'?'Stage acceptance recorded. Current authority appears in the snapshot below.':result.slot.phase==='OFFERED'?'Offer sent. The performer must choose Accept.':result.slot.phase==='QUEUED'?'Queue request recorded. A host must offer a slot.':'Stage slot ended.');}
   pending.current=null;setRetry(false);setBusy(false);setStopping(false);await reload.current();
  }catch{if(ticket===generation.current&&!lifetime.current?.signal.aborted){setBusy(false);setStopping(false);setRetry(true);setOwn(null);setView(null);setMessage('Stage outcome unconfirmed. Retry the same request or use Stop.');}}
 }
 const command=(path:string,body:unknown,stop=false)=>void execute({path,body,key:crypto.randomUUID(),stop});
 const open=own?.items.find(slot=>slot.phase!=='ENDED'),canAct=!!view&&!!own&&!!source&&!busy&&!stopping&&!pending.current;
 return <section className="room-events" aria-label="Stage controls"><h2>Text and visual stage</h2><p>One performer at a time. Joining the queue is voluntary. A host offer needs your separate acceptance. This slot does not move your avatar or reserve a chair.</p><p aria-live="polite">{status}</p><p aria-live="polite">{message}</p>
  <div className="cafe-seat-grid"><button disabled={busy||stopping} onClick={()=>{if(!pending.current)setMessage('');void reload.current();}}>Refresh stage</button><button disabled={stopping} onClick={()=>{pending.current=null;setRetry(false);command('stage/stop',{schemaVersion:1},true);}}>Stop stage participation</button>{retry&&<button onClick={()=>{if(pending.current)void execute(pending.current);}}>Retry stage request</button>}</div>
  {events.length>0&&<label>Current set<select aria-label="Stage set" value={eventId} disabled={busy||stopping} onChange={event=>setEventId(event.target.value)}>{events.map(event=><option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}
  {view&&<p>{view.occupied?'A text and visual slot is occupied.':'No performer is active in this snapshot.'}</p>}
  {open&&<p>Your stage request: {open.phase}{open.endsAt&&<> · ends <time dateTime={open.endsAt}>{new Date(open.endsAt).toLocaleTimeString()}</time></>}</p>}
  {view?.permissions.performer&&!open&&<button disabled={!canAct} onClick={()=>command('stage/queue',{schemaVersion:1,eventId,source,expectedRevision:own!.revision,consent:true})}>Request stage slot with consent</button>}
  {open?.phase==='OFFERED'&&<button disabled={!canAct||view?.own?.id!==open.id} onClick={()=>command(`stage/slots/${open.id}/accept`,{schemaVersion:1,source,expectedRevision:own!.revision,expectedVersion:open.version})}>Accept stage offer</button>}
  {open&&<button disabled={busy||stopping} onClick={()=>command(`stage/slots/${open.id}/withdraw`,{schemaVersion:1,expectedVersion:open.version})}>Withdraw stage request</button>}
  {view&&!view.permissions.performer&&<p>A current event performer grant is required to join. Viewing this panel grants no role.</p>}
  {view&&(view.permissions.host||view.permissions.moderator)&&<div aria-label="Stage operator controls"><h3>Stage operator controls</h3><button disabled={!canAct||view.occupied||view.controls?.items.some(slot=>slot.phase==='OFFERED')||!view.controls?.items.some(slot=>slot.phase==='QUEUED')} onClick={()=>command('stage/offer',{schemaVersion:1,eventId,source})}>Offer next FIFO slot</button>{view.controls?.items.map((slot,i)=><div key={slot.id}><p>Queue position {i+1}: {slot.phase}</p><button disabled={busy||stopping} aria-label={'Revoke stage request '+(i+1)} onClick={()=>command(`stage/slots/${slot.id}/revoke`,{schemaVersion:1,expectedVersion:slot.version})}>Revoke request {i+1}</button></div>)}</div>}
 </section>;
}
