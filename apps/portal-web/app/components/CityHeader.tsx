'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect,useRef,useState } from 'react';
import { MeSchema,OwnRoomSchema,WorldCatalogSchema,type Me } from '@virtual-city/contracts';
import { avatarAtlasSpec,avatarFrame } from '@virtual-city/pixi-scene';
import { ownVisitLabel } from './own-visit';
import './city-header.css';
export default function CityHeader(){
 const pathname=usePathname(),[me,setMe]=useState<Me|null>(null),[visit,setVisit]=useState('Visit unconfirmed'),[state,setState]=useState<'loading'|'ready'|'session'|'error'>('loading'),[failed,setFailed]=useState(false);const refresh=useRef<()=>Promise<void>>(async()=>{});
 useEffect(()=>{let disposed=false,pending:AbortController|null=null,hintTimer:ReturnType<typeof setTimeout>|undefined;
  refresh.current=async()=>{pending?.abort();const controller=new AbortController();pending=controller;setMe(null);setVisit('Visit unconfirmed');setState('loading');setFailed(false);
   const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(8000)]);
   async function read(path:string){const response=await fetch('/v1/'+path,{cache:'no-store',credentials:'same-origin',signal});if(response.status===401)throw Error('SESSION_ENDED');if(!response.ok)throw Error('UNCONFIRMED');return response.json();}
   try{const identity=MeSchema.parse(await read('me'));const results=await Promise.allSettled([read('me/room').then(raw=>OwnRoomSchema.parse(raw)),read('worlds').then(raw=>WorldCatalogSchema.parse(raw))]);if(disposed||controller.signal.aborted)return;
    if(results.some(result=>result.status==='rejected'&&result.reason instanceof Error&&result.reason.message==='SESSION_ENDED'))throw Error('SESSION_ENDED');
    setMe(identity);setState('ready');const room=results[0],worlds=results[1];if(room.status==='fulfilled'){if(!room.value.snapshot)setVisit(ownVisitLabel(null,[]));else if(worlds.status==='fulfilled')setVisit(ownVisitLabel(room.value.snapshot,worlds.value.worlds));}else setVisit('Visit unconfirmed');
   }catch(error){if(!disposed&&!controller.signal.aborted){setMe(null);setVisit('Visit unconfirmed');setState(error instanceof Error&&error.message==='SESSION_ENDED'?'session':'error');}}
  };
  const identity=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('virtual-city-identity'),visits=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('virtual-city-visit');if(identity)identity.onmessage=()=>void refresh.current();
  const hint=()=>{clearTimeout(hintTimer);hintTimer=setTimeout(()=>void refresh.current(),100);};if(visits)visits.onmessage=hint;
  const visible=()=>{if(document.visibilityState==='visible')void refresh.current();},offline=()=>{pending?.abort();setMe(null);setVisit('Visit unconfirmed');setState('error');};document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible);window.addEventListener('offline',offline);window.addEventListener('virtual-city-visit-changed',hint);
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh.current();},30000);void refresh.current();
  return()=>{disposed=true;pending?.abort();clearTimeout(hintTimer);clearInterval(timer);identity?.close();visits?.close();document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);window.removeEventListener('offline',offline);window.removeEventListener('virtual-city-visit-changed',hint);};
 },[pathname]);
 const frame=me?avatarFrame({schemaVersion:1,core:'starter-v1',palette:me.profile.avatarKey,outfit:'casual'},'idle',0):null;
 return <header className="city-header" aria-label="Shared city header"><div className="city-header-inner"><Link className="city-home" href="/" aria-label="City home"><span aria-hidden="true">VL</span><strong>Virtual Life Platform</strong></Link><nav aria-label="Friends and travel"><Link href="/social">Friends</Link><Link href="/invitations">Invitation inbox</Link><Link href="/travel">Travel desk</Link></nav>
  <div className="city-header-person"><Link className="city-profile" href="/identity" aria-label="Manage identity">{me&&frame&&!failed?<span className="city-header-avatar" role="img" aria-label={'Your '+me.profile.avatarKey+' avatar'}><img src={avatarAtlasSpec.path} alt="" aria-hidden="true" width={avatarAtlasSpec.width} height={avatarAtlasSpec.height} style={{left:-frame.x,top:-frame.y}} onError={()=>setFailed(true)}/></span>:<span className="city-header-avatar-fallback" aria-hidden="true">◇</span>}<span><span>{me?me.profile.displayName:state==='loading'?'Checking your space...':state==='session'?'Create or sign in':'Your space unconfirmed'}</span><small>{me?'Manage identity':'Open identity'}</small></span></Link>
   <p className="city-header-visit" aria-live="polite">{me?'Your last checked visit: '+visit:state==='session'?'A session connects your city visits.':'Your visit is unconfirmed.'}</p><button className="city-header-refresh" disabled={state==='loading'} onClick={()=>void refresh.current()}>Refresh your space</button>
  </div></div></header>;
}
