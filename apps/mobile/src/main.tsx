import {Capacitor} from '@capacitor/core';
import {lazy,Suspense} from 'react';
const NativeAccountPanel=lazy(()=>import('./NativeAccountPanel').then(module=>({default:module.NativeAccountPanel})));
import {useState,useMemo,useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {WorldRoomPanel,AnimalStudyPanel,type RoomWidgets} from '@virtual-city/game-client';import '@virtual-city/game-client/styles.css';import {mobilePlatform,bindMobileBack} from './platform';import './shell.css';import {bindLandscape,type LandscapeMode} from './orientation';
const Empty=()=>null;
const room3d=import.meta.env.VITE_VLP_ROOM_3D==='1';
const rendererLoader=()=>room3d?import('@virtual-city/scene3d'):import('@virtual-city/pixi-scene/csp-renderer');
const loadStudy=()=>import('@virtual-city/scene3d');
function Shell(){const [route,setRoute]=useState('/');const [orientation,setOrientation]=useState<LandscapeMode>('sensor');const sceneFirst=import.meta.env.VITE_VLP_SCENE_FIRST!=='0';const platform=useMemo(()=>mobilePlatform(setRoute),[]);const widgets:RoomWidgets=useMemo(()=>({Link:({href,children})=><a href={href} onClick={event=>{event.preventDefault();platform.navigate(href);}}>{children}</a>,FocusPanel:Empty,Wardrobe:Empty,WorldEvents:Empty,RoomInvitation:Empty,RoomSafety:Empty}),[platform]);
 useEffect(()=>bindMobileBack(setRoute),[]);
 const studyEnabled=import.meta.env.VITE_VLP_SCENE3D_STUDY==='1',landscapeActive=sceneFirst&&(route==='/'||studyEnabled&&route==='/3d-study');
 useEffect(()=>landscapeActive?bindLandscape(orientation):undefined,[landscapeActive,orientation]);
 if(import.meta.env.VITE_VLP_NATIVE_AUTH==='1'&&route==='/account')return <Suspense fallback={<main className="mobile-account" role="status">Opening your account…</main>}><NativeAccountPanel onLeave={()=>setRoute('/')}/></Suspense>;
 if(studyEnabled&&route==='/3d-study')return <AnimalStudyPanel loadStudy={loadStudy} platform={platform} onLeave={()=>setRoute('/')} onRotate={Capacitor.getPlatform()==='android'?()=>setOrientation(value=>value==='secondary'?'primary':'secondary'):undefined}/>;
 if(route!=='/')return <main className="mobile-fallback"><h1>You're offline</h1><p>Sign-in and city visits are not available in this preview.</p><button onClick={()=>setRoute('/')}>Return to preview</button></main>;
 return <><div className="mobile-notice"><span>Local preview · City visits are unavailable</span>{import.meta.env.VITE_VLP_NATIVE_AUTH==='1'&&Capacitor.getPlatform()==='android'&&<button onClick={()=>setRoute('/account')}>Your account</button>}{studyEnabled&&<button onClick={()=>setRoute('/3d-study')}>3D animal studio</button>}{sceneFirst&&Capacitor.getPlatform()==='android'&&<button onClick={()=>setOrientation(value=>value==='secondary'?'primary':'secondary')}>Rotate view</button>}</div><WorldRoomPanel sceneFirst={sceneFirst} rendererLoader={rendererLoader} artLabel={room3d?'3D room study · original technical art':undefined} socketOrigin="https://native-session-unavailable.invalid" platform={platform} widgets={widgets}/></>;
}
// An explicit build mode isolates synthetic performance fixtures from normal
// product builds; no real identity,network or room authority is created.
if(import.meta.env.MODE==='renderer-workload')void import('../../../tests/renderer-workload/main').then(module=>module.startRendererWorkload());
else if(import.meta.env.MODE==='native-auth-qualification')void Promise.all([import('../../../tests/native-android/main'),import('./NativeAccountPanel')]).then(([fixture,account])=>{fixture.startNativeAccountQualification();const Account=account.NativeAccountPanel;createRoot(document.getElementById('root')!).render(<Account onLeave={()=>location.reload()}/>);});
else if(import.meta.env.MODE==='native-policy-qualification')void Promise.all([import('../../../tests/mobile-policy/native-probe'),import('./NativeAccountPanel')]).then(([fixture,account])=>{fixture.startNativePolicyQualification();const Account=account.NativeAccountPanel;createRoot(document.getElementById('root')!).render(<Account onLeave={()=>location.reload()}/>);});
else createRoot(document.getElementById('root')!).render(<Shell/>);
