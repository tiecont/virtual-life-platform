'use client';
import {useEffect,useRef,useState} from 'react';
import type {AvatarParts} from '@virtual-city/contracts';
type Portrait={setAppearance(parts:AvatarParts):void;destroy():void};
export function AvatarThumbnail({parts,label,loadComposer}:{parts:AvatarParts;label:string;loadComposer:()=>Promise<unknown>}){
 const host=useRef<HTMLSpanElement>(null),portrait=useRef<Portrait|null>(null),latest=useRef(parts);latest.current=parts;const [available,setAvailable]=useState(false);
 useEffect(()=>{const abort=new AbortController();void loadComposer().then(module=>{if(abort.signal.aborted||!host.current)return;const factory=(module as {createAvatarPortrait?:unknown}).createAvatarPortrait;if(typeof factory!=='function')return;portrait.current=(factory as (host:HTMLElement,parts:AvatarParts,options:{signal:AbortSignal;onContext:(available:boolean)=>void})=>Portrait)(host.current,latest.current,{signal:abort.signal,onContext:setAvailable});setAvailable(true);}).catch(()=>{if(!abort.signal.aborted)setAvailable(false);});return()=>{abort.abort();portrait.current?.destroy();portrait.current=null;};},[loadComposer]);
 useEffect(()=>{portrait.current?.setAppearance(parts);},[parts]);
 return <span className="avatar-thumbnail" role="img" aria-label={label}><span className="avatar-thumbnail-fallback" hidden={available} aria-hidden="true">{parts.species==='rabbit'?'♧':parts.species==='dog'?'♢':'✦'}</span><span className="avatar-thumbnail-canvas" ref={host}/></span>;
}
