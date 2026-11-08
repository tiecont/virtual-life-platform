'use client';
import { deadlineScene,deadlineAreas,deadlineWorldVersion } from '@virtual-city/deadline-world';
import WorldRoomPanel,{type RoomExperience} from '../../components/WorldRoomPanel';
const experience:RoomExperience={slug:'deadline',worldVersion:deadlineWorldVersion,scene:deadlineScene,title:'Deadline Cafe',eyebrow:'FOCUS TOGETHER',badge:'LOCAL DEADLINE PREVIEW',noun:'cafe',theme:'deadline',capacity:40,
 sceneLabel:'Deadline Cafe floor plan. Thirty desks in a shared cafe,coffee counter,garden corners and an entrance. Native desk and movement controls follow below.',caption:'WINDOW · CENTER · GARDEN DESKS',
 destinations:[{label:'Entrance',x:12,y:14},{label:'Window aisle',x:1,y:8},{label:'Central aisle',x:12,y:8},{label:'Counter front',x:10,y:3}],
 areas:deadlineAreas,areaLabel:'Deadline desk areas',areaHeading:'A place to focus together',areaDescription:'All thirty desks share one cafe. Focus history stays private;choosing a desk does not invite anyone or share a task.',provenance:'/assets/deadline/provenance.json',focus:true,wardrobe:false,portalReturn:true,roomInvites:true};
const renderer=()=>import('@virtual-city/scene3d');
export default function DeadlineRoom({socketOrigin,modular3d=false}:{socketOrigin:string;modular3d?:boolean}){return <WorldRoomPanel socketOrigin={socketOrigin} experience={experience} {...(modular3d?{rendererLoader:renderer,modularAppearance:true,sceneFirst:true,artLabel:'3D character integration · room art under review'}:{})}/>;}
