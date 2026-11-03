import { SceneManifestSchema } from '@virtual-city/contracts';
import { defineWorld,WorldError } from '@virtual-city/world-sdk';

// Original project-authored geometry. Desks are grouped into areas of the same
// quiet layout; no isolated/private room or copyrighted reading material implied.
export const libraryScene=SceneManifestSchema.parse({
 schemaVersion:1,key:'library',version:'1.0.0',projection:'orthogonal',tileSize:48,columns:20,rows:14,spawn:{x:10,y:11},
 collisionZones:[
  {id:'north-wall',kind:'wall',x:0,y:0,width:20,height:2},
  {id:'west-wall',kind:'wall',x:0,y:2,width:1,height:12},
  {id:'east-wall',kind:'wall',x:19,y:2,width:1,height:12},
  {id:'reading-shelves',kind:'counter',x:2,y:2,width:6,height:1},
  {id:'study-shelves',kind:'counter',x:12,y:2,width:6,height:1},
  {id:'book-island',kind:'counter',x:8,y:4,width:2,height:4},
  {id:'reading-desk',kind:'table',x:3,y:5,width:2,height:1},
  {id:'study-table',kind:'table',x:12,y:5,width:3,height:2},
  {id:'west-fern',kind:'planter',x:1,y:10,width:1,height:1},
  {id:'east-fern',kind:'planter',x:18,y:10,width:1,height:1},
 ],
 seats:[
  {seatId:'seat-1',label:'Reading corner 01',x:3,y:4,facing:'south'},
  {seatId:'seat-2',label:'Reading corner 02',x:4,y:4,facing:'south'},
  {seatId:'seat-3',label:'Reading corner 03',x:3,y:6,facing:'north'},
  {seatId:'seat-4',label:'Reading corner 04',x:4,y:6,facing:'north'},
  {seatId:'seat-5',label:'Study alcove 05',x:12,y:4,facing:'south'},
  {seatId:'seat-6',label:'Study alcove 06',x:14,y:4,facing:'south'},
  {seatId:'seat-7',label:'Study alcove 07',x:12,y:7,facing:'north'},
  {seatId:'seat-8',label:'Study alcove 08',x:14,y:7,facing:'north'},
 ],
});
export const libraryAreas=[
 {key:'reading',title:'Reading corner',description:'Individual reading desks. Bring your own reading; no books are distributed.',seatIds:['seat-1','seat-2','seat-3','seat-4']},
 {key:'study',title:'Study alcove',description:'Shared desks for quiet company. These are in the same room, with no private-space promise.',seatIds:['seat-5','seat-6','seat-7','seat-8']},
] as const;
export const libraryWorldVersion='1.2.0';
export function createLibraryWorld(){
 let started=false;
 return defineWorld({schemaVersion:1,apiVersion:1,slug:'library',version:libraryWorldVersion,title:'Eternal Library',kind:'world',sceneRef:{key:libraryScene.key,version:libraryScene.version},scene:libraryScene,
  capacity:8,seatIds:libraryScene.seats.map(seat=>seat.seatId),capabilities:['presence','seating','focus','events','portals'],focusPolicy:{pauseAllowed:true},eventPolicy:{schemaVersion:1,version:'1.0.0',maxCapacity:8},appearancePolicy:{apron:'forbidden'},
  accessPolicy:{kind:'public'},visibility:'listed',map:{region:'learning',position:{x:.25,y:.2},icon:'book'},
 },{bootstrap:async()=>{started=true;},shutdown:async()=>{started=false;},onJoin:async()=>{if(!started)throw Error('Library unavailable');},onLeave:async()=>{},
  onCommand:async()=>{throw new WorldError('INVALID_REQUEST','Library activity unavailable');},
  travel:{prepare:async context=>{if(!started||context.signal.aborted)throw Error('Library unavailable');},abort:async()=>{},depart:async()=>{}},
 });
}
