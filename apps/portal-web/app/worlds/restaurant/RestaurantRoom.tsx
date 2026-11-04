'use client';
import { useState } from 'react';
import { restaurantScene,restaurantTables,restaurantWorldVersion } from '@virtual-city/restaurant-world';
import WorldRoomPanel,{type RoomExperience} from '../../components/WorldRoomPanel';
import DiningReservations from './DiningReservations';
import RestaurantStaff from './RestaurantStaff';
import RestaurantService from './RestaurantService';
const experience:RoomExperience={slug:'restaurant',worldVersion:restaurantWorldVersion,scene:restaurantScene,title:'Grand Restaurant',eyebrow:'VIRTUAL DINING',badge:'LOCAL RESTAURANT PREVIEW',noun:'restaurant',theme:'dining-room',capacity:10,sceneLabel:'Original restaurant floor plan. Garden and window dining tables with four chairs each,a service counter and entrance. Keyboard table-chair controls follow below.',caption:'GARDEN DINING · WINDOW DINING',destinations:[{label:'Entrance',x:12,y:13},{label:'Garden aisle',x:2,y:5},{label:'Window aisle',x:15,y:5},{label:'Service counter',x:12,y:9}],areas:restaurantTables,areaLabel:'Restaurant dining areas',areaHeading:'A table for good company',areaDescription:'Two four-chair tables share one room. Eight dining seats and two unseated circulation places fit the ten-place room limit. This map does not promise a table booking or staff permission.',provenance:'/assets/restaurant/provenance.json',focus:false,wardrobe:false};
function Perspective(){
 const [view,setView]=useState<'diner'|'server'|'cook'>('diner');
 return <section className="room-events" aria-label="Restaurant perspectives"><h2>Your restaurant view</h2><fieldset><legend>Choose a perspective</legend>{(['diner','server','cook']as const).map(value=><label key={value} style={{display:'inline-flex',alignItems:'center',minHeight:44,marginRight:16}}><input type="radio" name="restaurant-perspective" checked={view===value} onChange={()=>setView(value)}/>{value[0].toUpperCase()+value.slice(1)}</label>)}</fieldset>
  {view==='diner'?<div><h3>Diner view</h3><p>Choose an available dining chair using the room controls. Everything served here is virtual.</p><p>Table inventory: {restaurantTables.map(table=>`${table.title} · ${table.capacity} dining seats`).join(' / ')}</p></div>:<div><h3>{view==='server'?'Server view':'Cook view'}</h3><p>Service actions require a confirmed voluntary shift. Changing this view does not start a shift.</p><p>Check the voluntary work controls for your last confirmed shift.</p></div>}
 </section>;
}
export default function RestaurantRoom({socketOrigin}:{socketOrigin:string}){return <WorldRoomPanel socketOrigin={socketOrigin} experience={experience}>{({me,source,seated})=><><Perspective/>{me&&<><RestaurantStaff key={'staff:'+me.profile.id+':'+me.csrfToken} me={me} source={source}/><RestaurantService key={'service:'+me.profile.id+':'+me.csrfToken} me={me} source={source} seated={seated}/><DiningReservations key={me.profile.id+':'+me.csrfToken} me={me} source={source}/></>}</>}</WorldRoomPanel>;}
