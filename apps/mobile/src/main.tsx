import {useState,useMemo} from 'react';import {createRoot} from 'react-dom/client';
import {WorldRoomPanel,type RoomWidgets} from '@virtual-city/game-client';import '@virtual-city/game-client/styles.css';import {mobilePlatform} from './platform';import './shell.css';
const Empty=()=>null;
const rendererLoader=()=>import('@virtual-city/pixi-scene/csp-renderer');
function Shell(){const [route,setRoute]=useState('/');const platform=useMemo(()=>mobilePlatform(setRoute),[]);const widgets:RoomWidgets=useMemo(()=>({Link:({href,children})=><a href={href} onClick={event=>{event.preventDefault();platform.navigate(href);}}>{children}</a>,FocusPanel:Empty,Wardrobe:Empty,WorldEvents:Empty,RoomInvitation:Empty,RoomSafety:Empty}),[platform]);
 if(route!=='/')return <main className="mobile-fallback"><h1>You're offline</h1><p>Sign-in and city visits are not available in this preview.</p><button onClick={()=>setRoute('/')}>Return to preview</button></main>;
 return <><div className="mobile-notice" role="status">Local preview · City visits are unavailable</div><WorldRoomPanel rendererLoader={rendererLoader} socketOrigin="https://native-session-unavailable.invalid" platform={platform} widgets={widgets}/></>;
}
createRoot(document.getElementById('root')!).render(<Shell/>);
