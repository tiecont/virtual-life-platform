'use client';
import WorldRoomPanel from '../../../components/WorldRoomPanel';
const renderer=()=>import('@virtual-city/scene3d');
export default function RoomClient({socketOrigin}:{socketOrigin:string}){return <WorldRoomPanel socketOrigin={socketOrigin} rendererLoader={renderer} sceneFirst artLabel="3D room study · original technical art"/>;}
