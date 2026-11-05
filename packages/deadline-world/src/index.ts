import { defineWorld,WorldError } from '@virtual-city/world-sdk';

// Compatibility metadata from the owner's immutable selected source. No source
// room/focus authority exists to duplicate: shared City owners supply both.
export const deadlineSourceCommit='6d2ca6a4e00505b2df1d6f41f1041fa14a227c5b';
export const deadlineLayout={width:960,height:640,seats:Array.from({length:30},(_,i)=>({id:`seat-${String(i+1).padStart(2,'0')}`,x:110+(i%6)*144,y:190+Math.floor(i/6)*82}))};
export const deadlineWorldVersion='1.0.0';
export function createDeadlineWorld(){
 let started=false;
 const current=()=>{if(!started)throw new WorldError('WORLD_UNAVAILABLE','Deadline unavailable');};
 return defineWorld({schemaVersion:1,apiVersion:1,slug:'deadline',version:deadlineWorldVersion,title:'Deadline Cafe',kind:'world',
  sceneRef:{key:'deadline',version:'1.0.0'},capacity:40,seatIds:deadlineLayout.seats.map(seat=>seat.id),capabilities:['presence','seating','focus','portals'],
  // Selected legacy SQL has active/completed/cancelled, with no pause operation.
  focusPolicy:{pauseAllowed:false},appearancePolicy:{apron:'forbidden'},accessPolicy:{kind:'public'},visibility:'listed',map:{region:'work',position:{x:.32,y:.44},icon:'coffee'},
 },{bootstrap:async()=>{started=true;},shutdown:async()=>{started=false;},onJoin:async()=>{current();},onLeave:async()=>{},
  onCommand:async()=>{throw new WorldError('INVALID_REQUEST','Use shared room and focus commands');},
  travel:{prepare:async context=>{current();if(context.signal.aborted)throw new WorldError('WORLD_UNAVAILABLE','Deadline unavailable');},abort:async()=>{},depart:async()=>{}},
 });
}
