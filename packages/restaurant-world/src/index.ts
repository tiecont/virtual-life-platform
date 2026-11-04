import { SceneManifestSchema } from '@virtual-city/contracts';
import { defineWorld,WorldError } from '@virtual-city/world-sdk';
// Original project-authored layout. Eight dining chairs plus two unseated
// circulation places; none of those places grants a service role.
export const restaurantScene=SceneManifestSchema.parse({
 schemaVersion:1,key:'restaurant',version:'1.0.0',projection:'orthogonal',tileSize:40,columns:24,rows:16,spawn:{x:12,y:13},
 collisionZones:[
  {id:'north-wall',kind:'wall',x:0,y:0,width:24,height:2},
  {id:'west-wall',kind:'wall',x:0,y:2,width:1,height:14},
  {id:'east-wall',kind:'wall',x:23,y:2,width:1,height:14},
  {id:'garden-table',kind:'table',x:3,y:5,width:4,height:2},
  {id:'window-table',kind:'table',x:16,y:5,width:4,height:2},
  {id:'service-counter',kind:'counter',x:8,y:10,width:8,height:2},
  {id:'west-palm',kind:'planter',x:1,y:3,width:1,height:1},
  {id:'east-palm',kind:'planter',x:22,y:3,width:1,height:1},
 ],
 seats:[
  {seatId:'seat-1',label:'Garden dining 01',x:3,y:4,facing:'south'},
  {seatId:'seat-2',label:'Garden dining 02',x:6,y:4,facing:'south'},
  {seatId:'seat-3',label:'Garden dining 03',x:3,y:7,facing:'north'},
  {seatId:'seat-4',label:'Garden dining 04',x:6,y:7,facing:'north'},
  {seatId:'seat-5',label:'Window dining 05',x:16,y:4,facing:'south'},
  {seatId:'seat-6',label:'Window dining 06',x:19,y:4,facing:'south'},
  {seatId:'seat-7',label:'Window dining 07',x:16,y:7,facing:'north'},
  {seatId:'seat-8',label:'Window dining 08',x:19,y:7,facing:'north'},
 ],
});
export const restaurantTables=[
 {key:'garden-table',title:'Garden dining',description:'Four chairs by the garden side.',capacity:4,seatIds:['seat-1','seat-2','seat-3','seat-4']},
 {key:'window-table',title:'Window dining',description:'Four chairs under the windows.',capacity:4,seatIds:['seat-5','seat-6','seat-7','seat-8']},
] as const;
export const restaurantWorldVersion='1.0.0';
export function createRestaurantWorld(){let started=false;return defineWorld({schemaVersion:1,apiVersion:1,slug:'restaurant',version:restaurantWorldVersion,title:'Grand Restaurant',kind:'world',sceneRef:{key:restaurantScene.key,version:restaurantScene.version},scene:restaurantScene,capacity:10,seatIds:restaurantScene.seats.map(seat=>seat.seatId),capabilities:['presence','seating','events','portals'],eventPolicy:{schemaVersion:1,version:'1.0.0',maxCapacity:8,reservations:{holdSeconds:60,maxPartySize:4,waitlist:'fifo',resources:restaurantTables.map(table=>({key:table.key,capacity:table.capacity}))}},appearancePolicy:{apron:'forbidden'},accessPolicy:{kind:'public'},visibility:'listed',map:{region:'dining',position:{x:.7,y:.55},icon:'utensils'}},
 {bootstrap:async()=>{started=true;},shutdown:async()=>{started=false;},onJoin:async()=>{if(!started)throw Error('Restaurant unavailable');},onLeave:async()=>{},onCommand:async()=>{throw new WorldError('INVALID_REQUEST','Restaurant action unavailable');},travel:{prepare:async context=>{if(!started||context.signal.aborted)throw Error('Restaurant unavailable');},abort:async()=>{},depart:async()=>{}}});}
