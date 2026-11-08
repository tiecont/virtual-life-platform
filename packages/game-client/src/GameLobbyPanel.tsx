'use client';
import {useEffect,useRef,useState} from 'react';
import {ApiErrorSchema,GameLobbyViewSchema,type GameLobbyView,type GameMode,type Me,type TravelSource} from '@virtual-city/contracts';
import type {ClientPlatform} from '@virtual-city/client-sdk';
const modes:{id:GameMode;title:string;detail:string}[]=[{id:'lantern-colors',title:'Lantern Colors',detail:'2–6 players'},{id:'mask-and-tell',title:'Mask & Tell',detail:'3–6 players'},{id:'mistbound-routes',title:'Mistbound Routes',detail:'4–8 players'}];
export function GameLobbyPanel({me,source,active=!!source,platform}:{me:Me;source:TravelSource|null;active?:boolean;platform:ClientPlatform}){
 const [view,setView]=useState<GameLobbyView|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[mode,setMode]=useState<GameMode>('lantern-colors'),[consent,setConsent]=useState(false);
 const generation=useRef(0),writing=useRef(false),lifetime=useRef<AbortController|null>(null),current=useRef(source);current.current=source;
 async function request(input:Record<string,unknown>,leave=false){
  if(writing.current)return;const ticket=++generation.current;writing.current=true;setBusy(true);setMessage('Waiting for table confirmation…');
  try{const response=await platform.request('/v1/games/lobby'+(leave?'/leave':''),{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':me.csrfToken},body:JSON.stringify({schemaVersion:1,...input}),signal:AbortSignal.any([lifetime.current!.signal,AbortSignal.timeout(8000)])});
   const raw:unknown=await response.json();if(ticket!==generation.current)return;if(!response.ok){const error=ApiErrorSchema.safeParse(raw);setView(null);setMessage(error.success&&error.data.error.code==='ROOM_FULL'?'This table is full. Refresh or choose another room.':'This table is unavailable or your visit changed. Refresh before continuing.');return;}
   setView(GameLobbyViewSchema.parse(raw));setConsent(false);setMessage(leave?'You left the table.':input.op==='ready'?'Readiness confirmed. Games are not open yet.':'Table confirmed.');
  }catch{if(ticket===generation.current){setView(null);setMessage('The reply was interrupted. Refresh to check the current table.');}}
  finally{if(ticket===generation.current){writing.current=false;setBusy(false);}}
 }
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;generation.current++;writing.current=false;setBusy(false);setView(null);setConsent(false);setMessage(source?'Refresh to see the table in this room.':'Enter the Lodge to see its table.');return()=>{controller.abort();generation.current++;writing.current=false;};},[me.profile.id,me.csrfToken,source?.epoch,source?.roomId,source?.membershipId]);
 const table=view?.table,own=table?.ownSeat!==null&&table?.ownSeat!==undefined,ready=table?.slots.find(slot=>slot.own)?.ready??false;
 return <section className="lodge-lobby" aria-label="Lantern table lobby"><p className="lodge-eyebrow">A LITTLE COMPANY, A LITTLE MYSTERY</p><h2>The lantern table</h2><p>Join by choice. Your seat and readiness are shared anonymously with this table. Leaving the room withdraws consent.</p>
  <p role="status" aria-live="polite">{message}</p><button disabled={busy||!source||!active} onClick={()=>void request({op:'view',source:current.current})}>Refresh table</button>
  {view&&!table&&<div><h3>No table is open</h3><label>Choose a game<select value={mode} disabled={busy} onChange={event=>{setMode(event.target.value as GameMode);setConsent(false);}}>{modes.map(item=><option key={item.id} value={item.id}>{item.title} · {item.detail}</option>)}</select></label></div>}
  {table&&<div><h3>{modes.find(item=>item.id===table.mode)?.title}</h3><p>{table.slots.length} / {table.capacity} seats · Minimum {table.minimum} · {table.phase==='READY_CHECK'?'Everyone is ready':'Waiting for players'}</p><ol aria-label="Table seats">{Array.from({length:table.capacity},(_,seat)=>{const slot=table.slots.find(item=>item.seat===seat);return <li key={seat}>{slot?slot.own?'Your seat':'Player seat':'Open seat'}{slot?.ready?' · Ready':''}</li>;})}</ol></div>}
  {view&&!own&&<><label className="lodge-consent"><input type="checkbox" checked={consent} disabled={busy||!source||!active} onChange={event=>setConsent(event.target.checked)}/>I choose to join this table and share seat/readiness.</label><button disabled={busy||!source||!active||!consent||!!table&&table.slots.length>=table.capacity} onClick={()=>void request(table?{op:'join',source:current.current,tableId:table.tableId,generation:table.generation,consent:true}:{op:'open',source:current.current,mode,consent:true})}>{table?'Join table':'Open table'}</button></>}
  {table&&own&&<><button disabled={busy||!source||!active} onClick={()=>void request({op:'ready',source:current.current,tableId:table.tableId,generation:table.generation,expectedVersion:table.version,ready:!ready})}>{ready?'Not ready':'Ready'}</button><button disabled={busy} onClick={()=>void request({tableId:table.tableId,generation:table.generation},true)}>Leave table</button></>}
  <button disabled aria-describedby="lodge-spectator">Spectate unavailable</button><p id="lodge-spectator">Spectating is closed. Game starts are not available during this lobby preview.</p>
 </section>;
}
