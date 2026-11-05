import { SceneManifestSchema } from '@virtual-city/contracts';
import { defineWorld,WorldError } from '@virtual-city/world-sdk';

export const parkWorldVersion='1.1.0';
export const parkScene=SceneManifestSchema.parse({
 schemaVersion:1,key:'park',version:'1.0.0',projection:'orthogonal',tileSize:48,columns:24,rows:16,spawn:{x:11,y:14},
 collisionZones:[
  {id:'north-hedge',kind:'wall',x:0,y:0,width:24,height:1},
  {id:'west-hedge',kind:'wall',x:0,y:1,width:1,height:15},
  {id:'east-hedge',kind:'wall',x:23,y:1,width:1,height:15},
  {id:'tree-northwest',kind:'planter',x:1,y:1,width:3,height:3},
  {id:'tree-northeast',kind:'planter',x:20,y:1,width:3,height:3},
  {id:'tree-southwest',kind:'planter',x:1,y:12,width:2,height:3},
  {id:'tree-southeast',kind:'planter',x:21,y:12,width:2,height:3},
  {id:'commons-garden',kind:'planter',x:10,y:5,width:4,height:3},
  {id:'bench-west-north',kind:'counter',x:2,y:4,width:4,height:1},
  {id:'bench-east-north',kind:'counter',x:18,y:4,width:4,height:1},
  {id:'bench-west-south',kind:'counter',x:2,y:8,width:4,height:1},
  {id:'bench-east-south',kind:'counter',x:18,y:8,width:4,height:1},
  {id:'activity-board',kind:'counter',x:3,y:12,width:3,height:2},
  {id:'portal-signpost',kind:'counter',x:18,y:12,width:3,height:2},
 ],
 seats:[
  {seatId:'seat-1',label:'West bench 01',x:3,y:5,facing:'south'},
  {seatId:'seat-2',label:'West bench 02',x:4,y:5,facing:'south'},
  {seatId:'seat-3',label:'East bench 03',x:19,y:5,facing:'south'},
  {seatId:'seat-4',label:'East bench 04',x:20,y:5,facing:'south'},
  {seatId:'seat-5',label:'West bench 05',x:3,y:9,facing:'south'},
  {seatId:'seat-6',label:'West bench 06',x:4,y:9,facing:'south'},
  {seatId:'seat-7',label:'East bench 07',x:19,y:9,facing:'south'},
  {seatId:'seat-8',label:'East bench 08',x:20,y:9,facing:'south'},
 ],
});
export const parkAreas=[
 {key:'west',title:'West benches',description:'Two shared benches beside the trees. Choosing a place does not share contact details.',seatIds:['seat-1','seat-2','seat-5','seat-6']},
 {key:'east',title:'East benches',description:'Two shared benches near the garden path. Standing visitors share the same small room.',seatIds:['seat-3','seat-4','seat-7','seat-8']},
] as const;
export const parkDestinations=[{label:'Entrance',x:11,y:14},{label:'Garden path',x:9,y:6},{label:'Activity board',x:6,y:13},{label:'Portal signpost',x:17,y:13}];
export function createParkWorld(){
 let started=false;
 return defineWorld({schemaVersion:1,apiVersion:1,slug:'park',version:parkWorldVersion,title:'Central Park',kind:'world',sceneRef:{key:parkScene.key,version:parkScene.version},scene:parkScene,
  capacity:12,seatIds:parkScene.seats.map(seat=>seat.seatId),capabilities:['presence','seating','chat','portals'],appearancePolicy:{apron:'forbidden'},accessPolicy:{kind:'public'},visibility:'listed',map:{region:'commons',position:{x:.5,y:.5},icon:'trees'},
 },{bootstrap:async()=>{started=true;},shutdown:async()=>{started=false;},onJoin:async()=>{if(!started)throw Error('Park unavailable');},onLeave:async()=>{},onCommand:async()=>{throw new WorldError('INVALID_REQUEST','Park activity unavailable');},
  travel:{prepare:async context=>{if(!started||context.signal.aborted)throw Error('Park unavailable');},abort:async()=>{},depart:async()=>{}},
 });
}
