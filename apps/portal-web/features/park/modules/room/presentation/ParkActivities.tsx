'use client';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { WorldCatalogSchema,type WorldCatalog,type Me } from '@virtual-city/contracts';
import WorldActivity from '../../../../rooms/modules/rooms/presentation/WorldActivity';
import { travelHref } from '../../../../travel/modules/travel/application/destination-link';
import '../../../../city/modules/city/presentation/city-map.css';

export default function ParkActivities({me}:{me:Me|null}){
 const [catalog,setCatalog]=useState<WorldCatalog|null>(null),[expanded,setExpanded]=useState<string|null>(null),[state,setState]=useState<'loading'|'ready'|'session'|'error'|'expired'>('loading');
 const refresh=useRef<()=>Promise<void>>(async()=>{});
 useEffect(()=>{
  let disposed=false,pending:AbortController|null=null;
  refresh.current=async()=>{
   pending?.abort();setCatalog(null);setExpanded(null);if(!me){setState('session');return;}const controller=new AbortController();pending=controller;setState('loading');
   try{const response=await fetch('/v1/worlds',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});if(response.status===401){if(!disposed&&!controller.signal.aborted)setState('session');return;}if(!response.ok)throw Error('CATALOG_UNAVAILABLE');const next=WorldCatalogSchema.parse(await response.json());if(!disposed&&!controller.signal.aborted){setCatalog(next);setState('ready');}}
   catch{if(!disposed&&!controller.signal.aborted){setCatalog(null);setState('error');}}
  };
  const invalidate=()=>{pending?.abort();setCatalog(null);setExpanded(null);setState('expired');},visibility=()=>{if(document.visibilityState==='hidden')invalidate();};
  window.addEventListener('offline',invalidate);document.addEventListener('visibilitychange',visibility);void refresh.current();
  return()=>{disposed=true;pending?.abort();window.removeEventListener('offline',invalidate);document.removeEventListener('visibilitychange',visibility);};
 },[me?.profile.id,me?.csrfToken]);
 const worlds=catalog?.worlds.filter(world=>world.slug!=='park'&&world.slug!=='dating'&&world.availability==='available'&&world.discoverability==='listed'&&world.accessHint==='session-required'&&world.capabilities.includes('events'))??[];
 return <section className="park-activities" aria-label="Activities elsewhere"><h2>Activities elsewhere</h2>
  <p>Check listed schedules in other places. A board view holds no room place or RSVP;each visit needs your confirmation.</p>
  <p aria-live="polite">{state==='loading'?'Checking the activity catalog...':state==='session'?'Open identity to check activities available to your session.':state==='error'?'Activity catalog unavailable. Refresh to try again.':state==='expired'?'Refresh the activity catalog after returning or reconnecting.':worlds.length?'Expand a place to check its current schedules and room places.':'No other listed event spaces are available in this catalog. You can still use the travel desk or try a small greeting here.'}</p>
  {state==='session'?<Link href="/identity">Open identity for activities</Link>:<button disabled={state==='loading'} onClick={()=>void refresh.current()}>Refresh Park activities</button>}
  {state==='ready'&&<ul className="park-activity-list">{worlds.map(world=><li key={world.slug} data-world-slug={world.slug}><h3>{world.title}</h3><div className="park-board-links"><button aria-expanded={expanded===world.slug} onClick={()=>setExpanded(value=>value===world.slug?null:world.slug)}>{expanded===world.slug?'Hide activity for ':'Show activity for '}{world.title}</button><Link href={travelHref(world.slug)}>Review a visit to {world.title}</Link></div>{expanded===world.slug&&<WorldActivity world={world} onAccessChanged={()=>void refresh.current()}/>}</li>)}</ul>}
 </section>;
}
