'use client';
import {lodgeScene,lodgeAreas,lodgeWorldVersion} from '@virtual-city/lantern-lodge-world';
import {GameLobbyPanel} from '@virtual-city/game-client';
import {browserPlatform} from '@virtual-city/client-sdk';
import WorldRoomPanel,{type RoomExperience} from '../../components/WorldRoomPanel';
import './lodge.css';
const platform=browserPlatform(()=>{}),renderer=()=>import('@virtual-city/scene3d');
const experience:RoomExperience={slug:'lantern-lodge',worldVersion:lodgeWorldVersion,scene:lodgeScene,title:'Lantern Lodge',eyebrow:'THE LANTERN LODGE',badge:'LOCAL LOBBY PREVIEW',noun:'lounge',theme:'lounge',capacity:8,sceneLabel:'Original lantern lodge floor plan. A central table, eight chairs and two planted alcoves. Movement and table controls follow below.',caption:'ONE ROOM · ONE TABLE · JOIN BY CHOICE',areas:lodgeAreas,areaLabel:'Lodge table',areaHeading:'Gather under the lanterns',areaDescription:'Room chairs do not join games. Use the table consent controls to join.',provenance:'/assets/lantern-lodge/provenance.json',destinations:[{label:'Entrance',x:9,y:12},{label:'West aisle',x:4,y:6},{label:'East aisle',x:14,y:6}],focus:false,wardrobe:true,portalReturn:true,roomInvites:true};
export default function LodgeRoom({socketOrigin}:{socketOrigin:string}){return <WorldRoomPanel socketOrigin={socketOrigin} experience={experience} modularAppearance sceneFirst rendererLoader={renderer} artLabel="3D Lodge study · original geometry · art under review">{context=>context.me&&<GameLobbyPanel key={context.me.profile.id+':'+context.me.csrfToken} me={context.me} source={context.retainedSource??context.source} active={!!context.active} platform={platform}/>}</WorldRoomPanel>;}
