'use client';
import { useEffect,useRef,useState } from 'react';
import { EventCatalogSchema,EventRsvpResultSchema,type Me,type TravelSource } from '@virtual-city/contracts';
import StudyProgress from '../../../../focus/modules/focus/presentation/StudyProgress';
import StopStudySharing from '../../../../focus/modules/focus/presentation/StopStudySharing';
import Link from 'next/link';
import { travelHref } from '../../../../travel/modules/travel/application/destination-link';
type Catalog=ReturnType<typeof EventCatalogSchema.parse>;
type Change={id:string;action:'rsvp'|'withdraw';key:string};
class EventRequestError extends Error{constructor(readonly status:number){super('Event request unavailable');}}
export default function WorldEvents({me,worldSlug,source=null}:{me:Me;worldSlug:string;source?:TravelSource|null}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[state,setState]=useState<'loading'|'ready'|'unknown'|'expired'>('loading'),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState(''),[checked,setChecked]=useState<string|null>(null);
 const pending=useRef<Change|null>(null),refresh=useRef<()=>Promise<void>>(async()=>{}),run=useRef<(change:Change)=>Promise<void>>(async()=>{});
 useEffect(()=>{
  const lifetime=new AbortController();let read:AbortController|undefined,expiry:ReturnType<typeof setTimeout>|undefined,revision=0,writing=false;
  pending.current=null;setCatalog(null);setState('loading');setBusy(false);setUncertain(false);setMessage('');setChecked(null);
  const invalidate=()=>{revision++;read?.abort();clearTimeout(expiry);setCatalog(null);setState('expired');setChecked(null);};
  refresh.current=async()=>{
   if(writing||lifetime.signal.aborted)return;if(document.visibilityState==='hidden'||!navigator.onLine){invalidate();return;}
   read?.abort();read=new AbortController();const controller=read,ticket=++revision,started=performance.now();clearTimeout(expiry);setCatalog(null);setState('loading');setChecked(null);
   try{const response=await fetch('/v1/events?worldSlug='+encodeURIComponent(worldSlug),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([lifetime.signal,controller.signal,AbortSignal.timeout(8000)])});if(!response.ok)throw new EventRequestError(response.status);const next=EventCatalogSchema.parse(await response.json());
    if(lifetime.signal.aborted||controller.signal.aborted||ticket!==revision)return;const remaining=30000-(performance.now()-started);if(remaining<=0){invalidate();return;}
    setCatalog({...next,items:next.items.filter(item=>item.worldSlug===worldSlug)});setChecked(new Date().toISOString());setState('ready');expiry=setTimeout(invalidate,remaining);
   }catch{if(!lifetime.signal.aborted&&!controller.signal.aborted&&ticket===revision){setCatalog(null);setState('unknown');}}
  };
  run.current=async change=>{
   if(writing||lifetime.signal.aborted)return;writing=true;setBusy(true);setMessage('Confirming your RSVP change...');
   try{const response=await fetch(`/v1/events/${change.id}/${change.action}`,{method:'POST',cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(8000)]),headers:{'content-type':'application/json','x-csrf-token':me.csrfToken,'idempotency-key':change.key},body:JSON.stringify({schemaVersion:1})});if(!response.ok)throw new EventRequestError(response.status);EventRsvpResultSchema.parse(await response.json());if(lifetime.signal.aborted)return;pending.current=null;setUncertain(false);setMessage('RSVP change confirmed. Room entry is checked separately.');
   }catch(error){if(lifetime.signal.aborted)return;if(error instanceof EventRequestError&&[400,401,403,404,409,422].includes(error.status)){pending.current=null;setUncertain(false);setMessage('The RSVP change was declined or the session changed. Refresh to check availability.');}else{setUncertain(true);setMessage('The RSVP response was interrupted. Retry the same change to confirm it.');}}
   finally{writing=false;if(!lifetime.signal.aborted){setBusy(false);await refresh.current();}}
  };
  const visibility=()=>{if(document.visibilityState==='hidden')invalidate();};document.addEventListener('visibilitychange',visibility);window.addEventListener('offline',invalidate);void refresh.current();
  return()=>{lifetime.abort();read?.abort();clearTimeout(expiry);pending.current=null;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('offline',invalidate);};
 },[me.profile.id,me.csrfToken,worldSlug]);
 const change=(id:string,action:Change['action'])=>{if(pending.current||busy)return;const value={id,action,key:crypto.randomUUID()};pending.current=value;setUncertain(false);void run.current(value);};
 return <section className="room-events" aria-label="Quiet study sessions"><h2>Study quietly, together</h2><p>No general chat, emotes or audio in this room. An RSVP expresses intent; it does not reserve room entry or a desk.</p>
  {worldSlug==='library'&&<StopStudySharing me={me}/>}
  <button disabled={busy} onClick={()=>{setMessage('');void refresh.current();}}>Refresh study sessions</button><p aria-live="polite">{state==='loading'?'Checking study schedules...':state==='unknown'?'Study schedules unavailable. Refresh to try again.':state==='expired'?'Study schedule snapshot expired. Refresh to check again.':catalog?.items.length?'Listed silent sessions as last observed.':'No listed quiet study sessions in this snapshot.'}</p>
  {message&&<p aria-live="polite">{message}</p>}{uncertain&&<button disabled={busy} onClick={()=>{if(pending.current)void run.current(pending.current);}}>Retry last RSVP change</button>}
  {state==='ready'&&catalog&&<>{catalog.items.slice(0,5).map(event=><article key={event.id} aria-label={'Study session: '+event.title}><h3>{event.title}</h3><p>{event.phase} as observed · up to {event.capacity} RSVP places</p><p><time dateTime={event.schedule.startsAt}>{event.startsLabel}</time> — <time dateTime={event.schedule.endsAt}>{event.endsLabel}</time> · {event.schedule.timeZone}</p><p>Your RSVP: {event.rsvp?.phase??'none'}</p>
   {event.rsvp?.phase==='CONFIRMED'?<button disabled={busy||uncertain} onClick={()=>change(event.id,'withdraw')}>Withdraw RSVP</button>:<button disabled={busy||uncertain||!['OPEN','LIVE'].includes(event.phase)} onClick={()=>change(event.id,'rsvp')}>Join quiet session</button>}
   {worldSlug==='library'&&event.rsvp?.phase==='CONFIRMED'&&['OPEN','LIVE'].includes(event.phase)&&<StudyProgress key={event.id} me={me} eventId={event.id} source={source}/>}
   </article>)}{(catalog.truncated||catalog.items.length>5)&&<p>Only the first five sessions are shown. The schedule list may be incomplete.</p>}{checked&&<p>Checked on this device: <time dateTime={checked}>{new Date(checked).toLocaleString('en-GB',{timeZone:'UTC',timeZoneName:'short'})}</time>. Snapshot expires after 30 seconds.</p>}</>}
  <Link href={travelHref(worldSlug)}>Review room entry separately</Link>
 </section>;
}
