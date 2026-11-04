'use client';
import { useEffect,useRef,useState } from 'react';
import { MediaViewSchema,type EventCatalogSchema,type Me,type TravelSource } from '@virtual-city/contracts';
type View=ReturnType<typeof MediaViewSchema.parse>;
type EventView=ReturnType<typeof EventCatalogSchema.parse>['items'][number];
const usable=()=>document.visibilityState!=='hidden'&&navigator.onLine;
export default function LoungeMedia({me,source,events}:{me:Me;source:TravelSource|null;events:EventView[]}){
 const [selected,setSelected]=useState(''),[view,setView]=useState<View|null>(null),[message,setMessage]=useState('No media clearance checked. The lounge remains silent.'),[busy,setBusy]=useState(false),reload=useRef<()=>Promise<void>>(async()=>{});
 const eventId=events.some(event=>event.id===selected)?selected:events[0]?.id??'',sourceKey=source?JSON.stringify(source):'';
 useEffect(()=>{const life=new AbortController();let read:AbortController|undefined,expiry:ReturnType<typeof setTimeout>|undefined,generation=0;setView(null);setBusy(false);setMessage('No media clearance checked. The lounge remains silent.');
  const invalidate=()=>{generation++;read?.abort();clearTimeout(expiry);setView(null);setBusy(false);setMessage('Media observation expired or unavailable. The lounge remains silent.');};
  reload.current=async()=>{if(!source||!eventId||!usable()||life.signal.aborted){invalidate();return;}const ticket=++generation,started=performance.now();read?.abort();clearTimeout(expiry);read=new AbortController();const controller=read;setBusy(true);setView(null);
   try{const response=await fetch('/v1/media/view',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':me.csrfToken},body:JSON.stringify({schemaVersion:1,eventId,source}),signal:AbortSignal.any([life.signal,controller.signal,AbortSignal.timeout(8000)])});if(!response.ok)throw Error();const next=MediaViewSchema.parse(await response.json());if(ticket!==generation||life.signal.aborted||!usable())return;const remaining=next.expiresAt-next.serverTime-(performance.now()-started);if(remaining<=0){invalidate();return;}setView(next);setMessage(next.clearance==='UNAVAILABLE'?'No current reviewed media source is available. Enjoy the silent text and visual set.':'A media review is recorded. Playback remains disabled in this preview.');expiry=setTimeout(invalidate,remaining);
   }catch{if(ticket===generation&&!life.signal.aborted)invalidate();}finally{if(ticket===generation&&!life.signal.aborted)setBusy(false);}
  };
  const visibility=()=>{if(!usable())invalidate();};document.addEventListener('visibilitychange',visibility);window.addEventListener('offline',invalidate);return()=>{life.abort();read?.abort();clearTimeout(expiry);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('offline',invalidate);};
 },[me.profile.id,me.csrfToken,sourceKey,eventId]);
 return <section className="room-events" aria-label="Media clearance"><h2>Silent text and visual sets</h2><p>This preview offers silent text and visual performances. It stays silent even if a media source has been reviewed.</p>{events.length>0&&<label>Media set<select aria-label="Media set" value={eventId} onChange={e=>setSelected(e.target.value)}>{events.map(event=><option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}<button disabled={busy||!source||!eventId} onClick={()=>void reload.current()}>Check media clearance</button><p aria-live="polite">{message}</p>{view&&<p>Playback: disabled. This check expires within three seconds.</p>}</section>;
}
