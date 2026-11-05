'use client';
import { useState } from 'react';
import type { Me } from '@virtual-city/contracts';
import { maidScene,maidAreas,maidWorldVersion,maidServicePolicy } from '@virtual-city/maid-world';
import WorldRoomPanel,{type RoomExperience,type RoomChildContext} from '../../components/WorldRoomPanel';
import VoluntaryStaffControls from '../../components/VoluntaryStaffControls';
import RoomGreetings from '../../components/RoomGreetings';
import MaidService from './MaidService';
import './maid.css';
const experience:RoomExperience={slug:'maid',worldVersion:maidWorldVersion,scene:maidScene,title:'Maid Cafe Social',eyebrow:'CAFE SAKURA',badge:'LOCAL MAID PREVIEW',noun:'cafe',theme:'maid',capacity:30,sceneLabel:'Original Cafe Sakura floor plan. Six tables with twenty-four service chairs,a coffee counter,garden corners and a city entrance. Native controls follow below.',caption:'VIRTUAL SERVICE · VOLUNTARY WORK · SHARED CAFE',areas:maidAreas,areaLabel:'Cafe Sakura tables',areaHeading:'A table for a little company',areaDescription:'Twenty-four chairs and standing space share this thirty-visitor room. Taking a chair does not request service or start conversation.',provenance:'/assets/maid/provenance.json',destinations:[{label:'Entrance',x:12,y:16},{label:'Central aisle',x:12,y:10},{label:'Window aisle',x:3,y:8},{label:'Counter front',x:12,y:3}],focus:false,wardrobe:true,portalReturn:true};
function MaidActivity({me,...context}:RoomChildContext&{me:Me}){
 const [workAllowed,setWorkAllowed]=useState(true),[workRevision,setWorkRevision]=useState(0),retained=context.retainedSource??context.source;
 // Stop hides the staff lane immediately,including old reads/writes still in flight.
 // Only a newly confirmed voluntary start/switch creates a fresh service lifetime.
 return <><VoluntaryStaffControls me={me} source={context.source} worldSlug="maid" venue="cafe" policy={maidServicePolicy} onStopIntent={()=>setWorkAllowed(false)} onPositiveConfirmed={()=>{setWorkRevision(value=>value+1);setWorkAllowed(true);}} introduction="Customer and Maid are gameplay choices. Starting work is voluntary and gives no moderation or administration powers. Your clothing does not grant permission." footer="At most six volunteers share the same thirty-place room. Stop works outside the room and during a pending reply;unfinished assigned work returns to the queue."/><MaidService key={workRevision} me={me} source={retained} active={!!context.active} workAllowed={workAllowed} seated={context.seated}/></>;
}
export default function MaidRoom({socketOrigin}:{socketOrigin:string}){return <WorldRoomPanel socketOrigin={socketOrigin} experience={experience}>{context=>{
 const retained=context.retainedSource??context.source,key=[context.me?.profile.id,context.me?.csrfToken,retained?.membershipId].join(':');return <>{context.me&&<MaidActivity key={'activity:'+key} {...context} me={context.me}/>}<RoomGreetings key={'greetings:'+key} {...context} source={retained} venue="Cafe"/></>;
 }}</WorldRoomPanel>;}
