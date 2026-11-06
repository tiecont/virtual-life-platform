import {Capacitor} from '@capacitor/core';
import {useState,useMemo,useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {WorldRoomPanel,type RoomWidgets} from '@virtual-city/game-client';import '@virtual-city/game-client/styles.css';import {mobilePlatform,bindMobileBack} from './platform';import './shell.css';import {bindLandscape,type LandscapeMode} from './orientation';
const Empty=()=>null;
const rendererLoader=()=>import('@virtual-city/pixi-scene/csp-renderer');
function Shell(){const [route,setRoute]=useState('/');const [orientation,setOrientation]=useState<LandscapeMode>('sensor');const sceneFirst=import.meta.env.VITE_VLP_SCENE_FIRST!=='0';const platform=useMemo(()=>mobilePlatform(setRoute),[]);const widgets:RoomWidgets=useMemo(()=>({Link:({href,children})=><a href={href} onClick={event=>{event.preventDefault();platform.navigate(href);}}>{children}</a>,FocusPanel:Empty,Wardrobe:Empty,WorldEvents:Empty,RoomInvitation:Empty,RoomSafety:Empty}),[platform]);
 useEffect(()=>bindMobileBack(setRoute),[]);
 useEffect(()=>route==='/'&&sceneFirst?bindLandscape(orientation):undefined,[route,sceneFirst,orientation]);
 if(route!=='/')return <main className="mobile-fallback"><h1>You're offline</h1><p>Sign-in and city visits are not available in this preview.</p><button onClick={()=>setRoute('/')}>Return to preview</button></main>;
 return <><div className="mobile-notice"><span>Local preview · City visits are unavailable</span>{sceneFirst&&Capacitor.getPlatform()==='android'&&<button onClick={()=>setOrientation(value=>value==='secondary'?'primary':'secondary')}>Rotate view</button>}</div><WorldRoomPanel sceneFirst={sceneFirst} rendererLoader={rendererLoader} socketOrigin="https://native-session-unavailable.invalid" platform={platform} widgets={widgets}/></>;
}
createRoot(document.getElementById('root')!).render(<Shell/>);
