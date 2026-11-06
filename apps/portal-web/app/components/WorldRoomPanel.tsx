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
export default function WorldRoomPanel(props:Omit<WorldRoomPanelProps,'platform'|'widgets'>){
 const router=useRouter(),sceneFirst=props.sceneFirst??process.env.NEXT_PUBLIC_VLP_SCENE_FIRST==='1';
 const platform=useMemo(()=>sceneFirst?browserPlatform(announceVisitChange,path=>router.push(path)):classicPlatform,[router,sceneFirst]);
 return <SharedRoom {...props} sceneFirst={sceneFirst} platform={platform} widgets={widgets}/>;
}
