'use client';
import Link from 'next/link';
import {WorldRoomPanel as SharedRoom,type WorldRoomPanelProps} from '@virtual-city/game-client';
import {browserPlatform} from '@virtual-city/client-sdk';
import RoomSafety from './RoomSafety';import FocusPanel from './FocusPanel';import Wardrobe from './Wardrobe';import WorldEvents from './WorldEvents';import RoomInvitation from './RoomInvitation';import {announceVisitChange} from './visit-hint';
import './world-room.css';
export type {RoomExperience,RoomChildContext} from '@virtual-city/game-client';
const platform=browserPlatform(announceVisitChange),widgets={Link,RoomSafety,FocusPanel,Wardrobe,WorldEvents,RoomInvitation};
export default function WorldRoomPanel(props:Omit<WorldRoomPanelProps,'platform'|'widgets'>){return <SharedRoom {...props} platform={platform} widgets={widgets}/>;}
