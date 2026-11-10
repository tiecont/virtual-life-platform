import {useEffect,useMemo,useState} from 'react';
import type {Me} from '@virtual-city/contracts';
import {WorldRoomPanel,TravelPanel,type RoomExperience,type RoomWidgets} from '@virtual-city/game-client';
import {deadlineScene,deadlineWorldVersion,deadlineAreas} from '@virtual-city/deadline-world';
import {maidScene,maidWorldVersion,maidAreas} from '@virtual-city/maid-world';
import {NativeAccountPanel} from './NativeAccountPanel';
import {NativeAvatarCreator} from './NativeAvatarCreator';
import {NativeSafetyPanel} from './NativeSafetyPanel';
import {androidSession} from './native-session';
import {nativeWorldPlatform} from './world-platform';
import {bindMobileBack} from './platform';
import {bindLandscape} from './orientation';
const supported=['deadline','maid']as const,empty=()=>null,renderer=()=>import('@virtual-city/scene3d');
const rooms:Record<typeof supported[number],RoomExperience>={
 deadline:{slug:'deadline',worldVersion:deadlineWorldVersion,scene:deadlineScene,title:'Deadline Cafe',eyebrow:'FOCUS TOGETHER',badge:'DEADLINE',noun:'cafe',theme:'deadline',sceneLabel:'Deadline cafe desks,counter and garden. Accessible movement and seating controls are available in Room actions.',caption:'WINDOW · CENTER · GARDEN DESKS',destinations:[{label:'Entrance',x:12,y:14},{label:'Window aisle',x:1,y:8},{label:'Central aisle',x:12,y:8},{label:'Counter front',x:10,y:3}],areas:deadlineAreas,focus:false,wardrobe:false,capacity:40},
 maid:{slug:'maid',worldVersion:maidWorldVersion,scene:maidScene,title:'Maid Cafe Social',eyebrow:'CAFE SAKURA',badge:'CAFE SAKURA',noun:'cafe',theme:'maid',sceneLabel:'Cafe Sakura tables,counter and garden. Accessible movement and seating controls are available in Room actions.',caption:'CAFE SAKURA · GARDEN & WINDOW TABLES',destinations:[{label:'Entrance',x:12,y:16},{label:'Central aisle',x:12,y:10},{label:'Window aisle',x:3,y:8},{label:'Counter front',x:12,y:3}],areas:maidAreas,focus:false,wardrobe:false,capacity:30},
};
function RoomSafety({me}:{me:Me}){const[busy,setBusy]=useState(false);return <NativeSafetyPanel key={me.profile.id} accountId={me.profile.id} busy={busy} onBusy={setBusy}/>;}
const roomHref=(slug:string)=>'/worlds/'+slug;
// Opt-in Android lane only. No browser-cookie fallback or second room owner.
export function NativeCity({onLeave}:{onLeave:()=>void}){
 const [route,setRoute]=useState('/account'),[context,setContext]=useState<{me:Me;origin:string}|null>(null),[message,setMessage]=useState('');
 const platform=useMemo(()=>context?nativeWorldPlatform(androidSession(),context.me.profile.id,setRoute):null,[context]);
 const Link=useMemo<RoomWidgets['Link']>(()=>function CityLink({href,children}){return <a href={href} onClick={event=>{event.preventDefault();setRoute(href==='/identity'?'/account':href);}}>{children}</a>;},[]);
 const widgets=useMemo<RoomWidgets>(()=>({Link,FocusPanel:empty,Wardrobe:empty,WorldEvents:empty,RoomInvitation:empty,RoomSafety}),[Link]);
 useEffect(()=>platform?.watchIdentity(()=>{setContext(null);setRoute('/account');}),[platform]);
 useEffect(()=>bindMobileBack(()=>{if(route==='/account'||route==='/city')onLeave();else setRoute('/city');}),[route,onLeave]);
 const world=route==='/worlds/deadline'?'deadline':route==='/worlds/maid'?'maid':null;
 useEffect(()=>world?bindLandscape('primary'):undefined,[world]);
 async function explore(expected:Me){try{const session=androidSession(),state=await session.restore(),destination=await session.destination();if(!state.me||state.me.profile.id!==expected.profile.id)throw Error('Account changed');const url=new URL(destination.origin);if(url.protocol!=='https:'||url.origin!==destination.origin||url.username||url.password)throw Error('Destination unavailable');setContext({me:state.me,origin:url.origin});setMessage('');setRoute('/city');}catch{setMessage('City visits are unavailable. Refresh your account before trying again.');}}
 if(route==='/account'||!context||!platform)return <><NativeAccountPanel onLeave={onLeave} onExplore={me=>void explore(me)}/><p role="alert">{message}</p></>;
 if(route==='/character')return <NativeAvatarCreator me={context.me} onClose={()=>setRoute('/city')}/>;
 return <div className="native-city"><nav className="native-city-nav" aria-label="City navigation"><button onClick={()=>setRoute('/city')}>City lobby</button><button onClick={()=>setRoute('/character')}>Your character</button><button onClick={()=>setRoute('/travel')}>Travel desk</button><button onClick={()=>{setContext(null);setRoute('/account');}}>Your account</button></nav>
 {world?<WorldRoomPanel key={world} socketOrigin={context.origin} experience={rooms[world]} platform={platform} widgets={widgets} sceneFirst modularAppearance rendererLoader={renderer} artLabel="3D room art under review"/>:route==='/travel'?<main className="native-city-page"><h1>Travel desk</h1><TravelPanel socketOrigin={context.origin} platform={platform} Link={Link} supportedWorlds={supported} modularAppearance roomHref={roomHref}/></main>:<main className="native-city-page"><p className="native-city-eyebrow">A PLACE TO RETURN TO</p><h1>Welcome, {context.me.profile.displayName}</h1><p>Choose a cafe,find a seat and bring your character along.</p><div className="native-city-destinations"><button onClick={()=>setRoute('/worlds/deadline')}><strong>Deadline Cafe</strong><span>Window desks and a quiet garden</span></button><button onClick={()=>setRoute('/worlds/maid')}><strong>Cafe Sakura</strong><span>Shared tables and a little company</span></button></div><p>Android room visits currently support movement,seating,travel and safety controls. Focus sessions,cafe service and messaging are being prepared.</p></main>}
 </div>;
}
