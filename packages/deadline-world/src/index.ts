import { defineWorld,WorldError } from '@virtual-city/world-sdk';
import { deadlineScene } from './scene';
import { deadlineLayout } from './baseline';
export { deadlineSourceCommit,deadlineLayout } from './baseline';
export { deadlineScene,deadlineAreas } from './scene';

// Compatibility metadata from the owner's immutable selected source. No source
// room/focus authority exists to duplicate: shared City owners supply both.
export const deadlineWorldVersion='1.1.0';
export function createDeadlineWorld(){
 let started=false;
 const current=()=>{if(!started)throw new WorldError('WORLD_UNAVAILABLE','Deadline unavailable');};
 return defineWorld({schemaVersion:1,apiVersion:1,slug:'deadline',version:deadlineWorldVersion,title:'Deadline Cafe',kind:'world',
  sceneRef:{key:deadlineScene.key,version:deadlineScene.version},scene:deadlineScene,capacity:40,seatIds:deadlineLayout.seats.map(seat=>seat.id),capabilities:['presence','seating','focus','portals'],
  // Selected legacy SQL has active/completed/cancelled, with no pause operation.
  focusPolicy:{pauseAllowed:false},appearancePolicy:{apron:'forbidden'},accessPolicy:{kind:'public'},visibility:'listed',map:{region:'work',position:{x:.32,y:.44},icon:'coffee'},
 },{bootstrap:async()=>{started=true;},shutdown:async()=>{started=false;},onJoin:async()=>{current();},onLeave:async()=>{},
  onCommand:async()=>{throw new WorldError('INVALID_REQUEST','Use shared room and focus commands');},
  travel:{prepare:async context=>{current();if(context.signal.aborted)throw new WorldError('WORLD_UNAVAILABLE','Deadline unavailable');},abort:async()=>{},depart:async()=>{}},
 });
}
