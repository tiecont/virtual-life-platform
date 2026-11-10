'use client';
import { useEffect,useRef,useState } from 'react';
import { StudySharingStateSchema,type Me } from '@virtual-city/contracts';
// Always available independently of an event card/read/room membership.
export default function StopStudySharing({me}:{me:Me}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const pending=useRef<string|null>(null),stop=useRef<()=>Promise<void>>(async()=>{});
 useEffect(()=>{const lifetime=new AbortController();let writing=false;pending.current=null;setBusy(false);setMessage('');stop.current=async()=>{if(writing||lifetime.signal.aborted)return;writing=true;setBusy(true);pending.current??=crypto.randomUUID();try{const response=await fetch('/v1/library/study-sharing',{method:'POST',cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(8000)]),headers:{'content-type':'application/json','x-csrf-token':me.csrfToken,'idempotency-key':pending.current},body:JSON.stringify({schemaVersion:1,sharing:false})});if(!response.ok)throw Error();const next=StudySharingStateSchema.parse(await response.json());if(next.sharing)throw Error();if(!lifetime.signal.aborted){pending.current=null;setMessage('Group sharing stopped. Existing observations expire within five seconds.');window.dispatchEvent(new Event('library-study-sharing-stopped'));}}catch{if(!lifetime.signal.aborted)setMessage('Stop could not be confirmed. Retry this stop request.');}finally{writing=false;if(!lifetime.signal.aborted)setBusy(false);}};return()=>{lifetime.abort();pending.current=null;};},[me.profile.id,me.csrfToken]);
 return <div><button disabled={busy} onClick={()=>void stop.current()}>Stop all study sharing</button>{message&&<p aria-live="polite">{message}</p>}</div>;
}
