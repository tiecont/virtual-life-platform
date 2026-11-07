'use client';
import Link from 'next/link';
import {useMemo} from 'react';
import {useRouter} from 'next/navigation';
import {WorldRoomPanel as SharedRoom,type WorldRoomPanelProps} from '@virtual-city/game-client';
import {browserPlatform} from '@virtual-city/client-sdk';
import RoomSafety from './RoomSafety';import FocusPanel from './FocusPanel';import Wardrobe from './Wardrobe';import WorldEvents from './WorldEvents';import RoomInvitation from './RoomInvitation';import {announceVisitChange} from './visit-hint';
import './world-room.css';
export type {RoomExperience,RoomChildContext} from '@virtual-city/game-client';
const classicPlatform=browserPlatform(announceVisitChange),widgets={Link,RoomSafety,FocusPanel,Wardrobe,WorldEvents,RoomInvitation};
const room3dRenderer=()=>import('@virtual-city/scene3d');
export default function WorldRoomPanel(props:Omit<WorldRoomPanelProps,'platform'|'widgets'>){
 const router=useRouter(),sceneFirst=props.sceneFirst??process.env.NEXT_PUBLIC_VLP_SCENE_FIRST==='1';
 const room3d=process.env.NEXT_PUBLIC_VLP_ROOM_3D==='1'&&(props.experience?.slug??'sdk-sandbox')==='sdk-sandbox';
 const platform=useMemo(()=>sceneFirst?browserPlatform(announceVisitChange,path=>router.push(path)):classicPlatform,[router,sceneFirst]);
 return <SharedRoom {...props} sceneFirst={sceneFirst} rendererLoader={props.rendererLoader??(room3d?room3dRenderer:undefined)} artLabel={props.artLabel??(room3d?'3D room study · original technical art':undefined)} platform={platform} widgets={widgets}/>;
}
