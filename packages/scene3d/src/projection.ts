import type {RoomSnapshot,SceneManifest} from '@virtual-city/contracts';
import type {SceneQuality} from '@virtual-city/client-sdk';
import {sceneEntities,motionPosition,isWalkable} from '@virtual-city/world-sdk';

export type RoomActor=ReturnType<RoomProjection['actors']>[number];
export type PointerCandidate={seatId:string}|{point:{x:number;y:number}};
export class RoomProjection {
 #value:ReturnType<typeof sceneEntities>|null=null;
 #receivedAt=0;
 constructor(readonly scene:SceneManifest){}
 get state(){return this.#value?.state??null;}
 get context(){const state=this.state;return state?[state.epoch,state.roomId,state.membershipId,state.self.accountId].join(':'):'';}
 clear(){this.#value=null;}
 accept(input:RoomSnapshot|null,now:number){
  if(!input){this.clear();return true;}
  let projection:ReturnType<typeof sceneEntities>;
  try{projection=sceneEntities(this.scene,input);}catch(error){this.clear();throw error;}
  const current=this.state,next=projection.state;
  if(current&&current.epoch===next.epoch&&current.roomId===next.roomId&&current.membershipId===next.membershipId&&current.self.accountId===next.self.accountId){
   if(next.roomVersion<current.roomVersion)return false;
   if(next.roomVersion===current.roomVersion&&(next.serverTime??0)<=(current.serverTime??0))return false;
  }
  this.#value=projection;this.#receivedAt=now;return true;
 }
 actors(now:number,reduced=false){
  return(this.#value?.entities??[]).map(entity=>{
   const point=entity.motion?reduced?{...entity.motion.path.at(-1)!,moving:false}:motionPosition(entity.motion,this.#value!.state.serverTime!+Math.max(0,now-this.#receivedAt)):{x:entity.x/this.scene.tileSize-.5,y:entity.y/this.scene.tileSize-.5,moving:false};
   const person=this.state?.participants.find(person=>person.profile.id===entity.id),seatId=entity.self?this.state?.self.seatId:person?.seatId,seat=this.scene.seats.find(seat=>seat.seatId===seatId);
   return{...entity,x:point.x,y:point.y,pose:point.moving?'walk' as const:entity.settledPose,facing:seat?.facing==='north'?Math.PI:0};
  });
 }
 intent(candidate:PointerCandidate,now:number){
  const state=this.state;if(!state||state.self.seatId)return null;
  if(state.self.motion&&motionPosition(state.self.motion,state.serverTime!+Math.max(0,now-this.#receivedAt)).moving)return null;
  if('seatId'in candidate)return state.seats.some(seat=>seat.seatId===candidate.seatId&&seat.state==='available')?{kind:'seat' as const,seatId:candidate.seatId}:null;
  return isWalkable(this.scene,candidate.point)?{kind:'move' as const,destination:{...candidate.point}}:null;
 }
}
// Gameplay uses only LOD1/2. LOD0 stays in the close-up studio. Stabilize the
// rank of an already-near actor slightly to avoid rebuilding around a boundary.
export function selectRoomLods(actors:readonly {id:string;self:boolean;x:number;y:number}[],camera:{x:number;y:number},quality:SceneQuality,previous:ReadonlyMap<string,'low'|'balanced'>=new Map()){
 const maximum={low:2,balanced:4,high:8}[quality],distance=(actor:typeof actors[number])=>Math.hypot(actor.x-camera.x,actor.y-camera.y)-(previous.get(actor.id)==='balanced'?.25:0);
 const ordered=[...actors].sort((a,b)=>Number(b.self)-Number(a.self)||distance(a)-distance(b)||a.id.localeCompare(b.id));
 return new Map(ordered.map((actor,index)=>[actor.id,index<maximum?'balanced' as const:'low' as const]));
}
