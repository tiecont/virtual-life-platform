'use client';
import {useEffect,useMemo,useState} from 'react';
import type {ClientPlatform} from '@virtual-city/client-sdk';
import {QueueController,type QueuePresentation} from './queue-controller';

export function QueuePanel({platform}:{platform:ClientPlatform}){
 const [view,setView]=useState<QueuePresentation>({phase:'checking',snapshot:null,busy:false,uncertain:false,remainingSeconds:null,message:'Checking your place…'});
 const controller=useMemo(()=>new QueueController(platform,setView),[platform]);
 useEffect(()=>{controller.start();const visibility=()=>controller.setForeground(document.visibilityState!=='hidden');visibility();document.addEventListener('visibilitychange',visibility);return()=>{document.removeEventListener('visibilitychange',visibility);controller.stop();};},[controller]);
 const own=view.snapshot?.own,ready=own?.state==='RESERVED',grace=own?.state==='RECONNECT_GRACE';
 const disabled=view.phase!=='connected'||view.busy||view.uncertain;
 const title=ready?'Your place is ready':grace?'Welcome back':own?.state==='ACTIVE'?'Your place is confirmed':own?'Waiting for a place':'Before you enter';
 return <section className="queue-panel" aria-labelledby="queue-heading">
  <p className="queue-eyebrow">A place in the city</p><h1 id="queue-heading">{title}</h1>
  <p role="status" aria-live="polite" aria-atomic="true">{view.message}</p>
  {view.phase==='signed-out'&&<button onClick={()=>platform.navigate('/identity')}>Open identity</button>}
  {own?.state==='WAITING'&&<><p className="queue-position">Your position: <strong>{own.position}</strong></p><p>{view.snapshot?.etaSeconds?`Estimated wait: ${view.snapshot.etaSeconds[0]}–${view.snapshot.etaSeconds[1]} seconds.`:'We cannot estimate the wait yet. Your position can change as places become available.'}</p></>}
  {(ready||grace)&&<><p>{ready?'Confirm before this offer ends.':'Check your connection, then confirm your return before the reconnect window ends.'}</p><p role="timer" aria-live="off">{view.remainingSeconds?`${view.remainingSeconds} seconds remaining`:'This window may have ended. Check your place again.'}</p><button disabled={disabled||!view.remainingSeconds} onClick={()=>void controller.act(ready?'claim':'reconnect')}>{ready?'I’m ready':'Reconnect to my place'}</button></>}
  {own?.state==='ACTIVE'&&<><p>This confirms your platform place. Room seating and invitations are checked separately.</p><button disabled={disabled} onClick={()=>platform.navigate('/travel')}>Choose a room</button></>}
  {!own&&view.phase==='connected'&&<><p>{['CLOSED','PAUSED'].includes(view.snapshot!.availability)?'New places are paused. You can check again later.':'Join the waiting list when you are ready. It does not reserve a seat in a room.'}</p><button disabled={disabled||['CLOSED','PAUSED'].includes(view.snapshot!.availability)} onClick={()=>void controller.act('enqueue')}>Join waiting list</button></>}
  {own&&<button disabled={disabled} onClick={()=>void controller.act('leave')}>{own.state==='ACTIVE'?'Release my platform place':'Leave waiting list'}</button>}
  {view.uncertain&&<p>The last action has no confirmed result. Retry sends the same request; it does not create a second place.</p>}
  <div className="queue-controls"><button disabled={view.busy} onClick={()=>void controller.retry()}>{view.uncertain?'Retry last action':'Check my place'}</button><button onClick={()=>platform.navigate('/')}>Back to city</button></div>
  <p className="queue-note">This screen checks only your place. You can leave it open; updates pause in the background. You must confirm a ready offer yourself.</p>
 </section>;
}
