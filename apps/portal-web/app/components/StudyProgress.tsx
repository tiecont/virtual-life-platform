'use client';
import { useEffect,useRef,useState } from 'react';
import { StudySharingStateSchema,StudyViewSchema,type Me,type StudyView,type StudySharingState,type TravelSource } from '@virtual-city/contracts';
type Pending={key:string;body:unknown};
export default function StudyProgress({me,eventId,source}:{me:Me;eventId:string;source:TravelSource|null}){
 const [view,setView]=useState<StudyView|null>(null),[state,setState]=useState<StudySharingState|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[retry,setRetry]=useState(false);
 const pending=useRef<Pending|null>(null),refresh=useRef<()=>Promise<void>>(async()=>{}),mutate=useRef<(value:Pending)=>Promise<void>>(async()=>{});
 const epoch=source?.epoch,roomId=source?.roomId,membershipId=source?.membershipId;
 useEffect(()=>{
  const lifetime=new AbortController();let expiry:ReturnType<typeof setTimeout>|undefined,sequence=0,writing=false;
  setView(null);setState(null);setMessage('Checking study sharing...');setBusy(false);setRetry(false);pending.current=null;
  const clear=()=>{sequence++;clearTimeout(expiry);setView(null);setMessage('Study progress expired or offline. Refresh to check again.');};
  async function request(path:string,body?:unknown,key?:string){const response=await fetch('/v1/library/'+path,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(8000)]),headers:body?{'content-type':'application/json','x-csrf-token':me.csrfToken,...key?{'idempotency-key':key}:{}}:undefined,body:body?JSON.stringify(body):undefined});if(!response.ok)throw Object.assign(Error('Study progress unavailable'),{status:response.status});return response.json();}
  refresh.current=async()=>{
   if(writing||lifetime.signal.aborted)return;const ticket=++sequence,started=performance.now();clearTimeout(expiry);setView(null);
   try{const own=StudySharingStateSchema.parse(await request('study-sharing'));if(lifetime.signal.aborted||ticket!==sequence)return;setState(own);
    if(!epoch||!roomId||!membershipId){setMessage('Enter this study room to share or view group progress.');return;}
    const next=StudyViewSchema.parse(await request('study-view',{schemaVersion:1,source:{epoch,roomId,membershipId},eventId}));if(lifetime.signal.aborted||ticket!==sequence)return;const remaining=Math.min(Date.parse(next.expiresAt)-Date.now(),5000-(performance.now()-started));if(remaining<=0){clear();return;}setState(next);setView(next);setMessage(next.sharing?'Only phase counts are shared with consenting, visible participants here.':'Group progress sharing is off for this visit.');expiry=setTimeout(()=>{setView(null);setMessage('Study progress expired. Refresh to check again.');},remaining);
   }catch{if(!lifetime.signal.aborted&&ticket===sequence){setView(null);setMessage('Study progress unavailable. Refresh to try again.');}}
  };
  mutate.current=async value=>{
   if(writing||lifetime.signal.aborted)return;writing=true;const ticket=++sequence;clearTimeout(expiry);setView(null);setBusy(true);setMessage('Confirming sharing choice...');
   try{const next=StudySharingStateSchema.parse(await request('study-sharing',value.body,value.key));if(lifetime.signal.aborted||ticket!==sequence)return;setState(next);pending.current=null;setRetry(false);setMessage(next.sharing?'Sharing confirmed.':'Sharing stopped.');}
   catch(error){if(lifetime.signal.aborted)return;const status=(error as {status?:number}).status;if(status&&[400,401,403,404,409,422].includes(status)){pending.current=null;setRetry(false);setMessage('Choice declined or context changed. Refresh before choosing again.');}else{setRetry(true);setMessage('Sharing reply interrupted. Retry the same choice, or stop sharing.');}}
   finally{writing=false;if(!lifetime.signal.aborted){setBusy(false);await refresh.current();}}
  };
  const hide=()=>{if(document.visibilityState==='hidden')clear();};const stopped=()=>{pending.current=null;setRetry(false);setState({schemaVersion:1,sharing:false,revision:null});clear();void refresh.current();};document.addEventListener('visibilitychange',hide);window.addEventListener('offline',clear);window.addEventListener('library-study-sharing-stopped',stopped);void refresh.current();
  return()=>{lifetime.abort();sequence++;clearTimeout(expiry);pending.current=null;document.removeEventListener('visibilitychange',hide);window.removeEventListener('offline',clear);window.removeEventListener('library-study-sharing-stopped',stopped);};
 },[me.profile.id,me.csrfToken,eventId,epoch,roomId,membershipId]);
 const choose=(sharing:boolean)=>{if(busy)return;const value:Pending={key:crypto.randomUUID(),body:sharing?{schemaVersion:1,source:{epoch,roomId,membershipId},eventId,sharing:true,expectedRevision:state?.revision}:{schemaVersion:1,sharing:false}};pending.current=value;setRetry(false);void mutate.current(value);};
 return <section className="study-progress" aria-label="Consented group progress"><h4>Group focus progress</h4><p>Share only counts of focus phases with visible, consenting participants in this study room. Names, task descriptions and timer durations stay private. This choice resets after leaving or restarting.</p><p aria-live="polite">{message}</p>
  <p>Your sharing: {state?state.sharing?'on':'off':'unconfirmed'}</p><button disabled={busy||retry||!view||!state?.revision||state.sharing} onClick={()=>choose(true)}>Share phase counts for this visit</button>{' '}<button disabled={busy} onClick={()=>choose(false)}>Stop sharing group progress</button>{' '}<button disabled={busy} onClick={()=>void refresh.current()}>Refresh group progress</button>{retry&&<button disabled={busy} onClick={()=>{if(pending.current)void mutate.current(pending.current);}}>Retry sharing choice</button>}
  {view?.counts&&<dl aria-label="Shared phase counts"><dt>Focusing</dt><dd>{view.counts.active}</dd><dt>Paused</dt><dd>{view.counts.paused}</dd><dt>Completed</dt><dd>{view.counts.completed}</dd><dt>No current timer</dt><dd>{view.counts.idle}</dd></dl>}
 </section>;
}
