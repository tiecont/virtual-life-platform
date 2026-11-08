import {defineWorld,WorldError} from '@virtual-city/world-sdk';
import {lodgeScene} from './scene';
export {lodgeScene,lodgeAreas} from './scene';
export const lodgeWorldVersion='1.0.0';
export function createLanternLodgeWorld(){
 let started=false;const current=()=>{if(!started)throw new WorldError('WORLD_UNAVAILABLE','Lodge unavailable');};
 return defineWorld({schemaVersion:1,apiVersion:1,slug:'lantern-lodge',version:lodgeWorldVersion,title:'Lantern Lodge',kind:'world',sceneRef:{key:lodgeScene.key,version:lodgeScene.version},scene:lodgeScene,capacity:8,seatIds:lodgeScene.seats.map(seat=>seat.seatId),capabilities:['presence','seating','chat','portals'],accessPolicy:{kind:'public'},visibility:'listed',map:{region:'social',position:{x:.72,y:.65},icon:'coffee'}},
 {bootstrap:async()=>{started=true;},shutdown:async()=>{started=false;},onJoin:async()=>current(),onLeave:async()=>{},onCommand:async()=>{throw new WorldError('INVALID_REQUEST','Use shared room and consented table controls');},travel:{prepare:async context=>{current();if(context.signal.aborted)throw new WorldError('WORLD_UNAVAILABLE','Lodge unavailable');},abort:async()=>{},depart:async()=>{}}});
}
