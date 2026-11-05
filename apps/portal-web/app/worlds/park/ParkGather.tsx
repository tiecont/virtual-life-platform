'use client';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { FriendsPageSchema,InvitationsPageSchema,WorldCatalogSchema,InvitationChangedSchema,type FriendsPage,type InvitationsPage,type WorldCard } from '@virtual-city/contracts';
import GroupInvitations from '../../invitations/GroupInvitations';
import type { RoomChildContext } from '../../components/WorldRoomPanel';
import '../../invitations/invitations.css';
type View={friends:FriendsPage;worlds:WorldCard[];inbox:InvitationsPage};
export default function ParkGather({me,source,transport}:RoomChildContext){
 const [view,setView]=useState<View|null>(null),[state,setState]=useState<'inactive'|'loading'|'ready'|'error'>('inactive'),refresh=useRef<()=>Promise<void>>(async()=>{});
 const active=!!me&&!!source&&!!transport?.connected;
 useEffect(()=>{
  let disposed=false,pending:AbortController|null=null;
  refresh.current=async()=>{
   pending?.abort();setView(null);if(!active){setState('inactive');return;}const controller=new AbortController();pending=controller;setState('loading');
   const read=async(path:string)=>{const response=await fetch('/v1/'+path,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});if(!response.ok)throw Error('GROUP_CHOICES_UNAVAILABLE');return response.json();};
   try{const [friends,inbox,catalog]=await Promise.all([read('friends').then(raw=>FriendsPageSchema.parse(raw)),read('invitations').then(raw=>InvitationsPageSchema.parse(raw)),read('worlds').then(raw=>WorldCatalogSchema.parse(raw))]);if(disposed||controller.signal.aborted)return;setView({friends,inbox,worlds:catalog.worlds.filter(world=>world.slug!=='park'&&world.slug!=='dating'&&world.availability==='available'&&world.accessHint==='session-required'&&world.discoverability==='listed')});setState('ready');}
   catch{if(!disposed&&!controller.signal.aborted){controller.abort();setView(null);setState('error');}}
  };
  const changed=(raw:unknown)=>{if(InvitationChangedSchema.safeParse(raw).success)void refresh.current();},contact=()=>void refresh.current();
  transport?.on('invitation.received',changed);transport?.on('invitation.responded',changed);transport?.on('friendship.changed',contact);void refresh.current();
  return()=>{disposed=true;pending?.abort();transport?.off('invitation.received',changed);transport?.off('invitation.responded',changed);transport?.off('friendship.changed',contact);};
 },[active,me?.profile.id,me?.csrfToken,source?.epoch,source?.membershipId,transport]);
 return <section className="park-gather invitation-panel" aria-label="Plan a visit together"><h2>Plan a visit together</h2><p>A greeting shares no contact details or invitation consent. Choose existing friends who allow offers;each person accepts or declines and confirms travel separately. An offer holds no place.</p>
  <div className="park-board-links"><Link href="/invitations">Manage offers in your invitation inbox</Link><Link href="/social">Manage your circle</Link><Link href="/travel">Review your own travel</Link></div>
  {!active?<p>Enter the park to choose a group visit. Existing offers can be managed in your invitation inbox.</p>:<><p aria-live="polite">{state==='loading'?'Checking group choices...':state==='error'?'Group choices unavailable. Refresh to try again.':'Choices checked. Destination access and capacity are checked again during travel.'}</p><button disabled={state==='loading'} onClick={()=>void refresh.current()}>Refresh Park group choices</button><GroupInvitations me={me!} friends={view?.friends??null} worlds={view?.worlds??[]} revision={view?.inbox??null} optionsKnown={state==='ready'&&!!view}/>{view?.friends.nextCursor&&<p>Only your first page of friends is shown here. Use the invitation inbox for more contacts.</p>}</>}
 </section>;
}
