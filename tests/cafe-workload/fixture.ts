import {RoomSnapshotSchema,AVATAR_CATALOG_VERSION,starterAvatarParts,type SceneManifest} from '@virtual-city/contracts';
import {isWalkable} from '@virtual-city/world-sdk';
import {deadlineScene} from '@virtual-city/deadline-world';
import {maidScene} from '@virtual-city/maid-world';

export const scenes={deadline:deadlineScene,maid:maidScene};
export type Cafe=keyof typeof scenes;
const id=(value:number)=>'00000000-0000-4000-8000-'+String(value).padStart(12,'0');

function walkingLoop(scene:SceneManifest){
 const candidates=[];
 for(let y=1;y<scene.rows-2;y++)for(let x=1;x<scene.columns-2;x++){
  const loop=[{x,y},{x:x+1,y},{x:x+1,y:y+1},{x,y:y+1}];
  if(loop.every(point=>isWalkable(scene,point)&&!scene.seats.some(seat=>seat.x===point.x&&seat.y===point.y)))candidates.push(loop);
 }
 candidates.sort((a,b)=>Math.hypot(a[0].x-scene.columns/2,a[0].y-scene.rows/2)-Math.hypot(b[0].x-scene.columns/2,b[0].y-scene.rows/2));
 if(!candidates.length)throw Error('No canonical walkable loop for synthetic cafe');
 return candidates[0];
}

export function cafeSnapshot(cafe:Cafe){
 const scene=scenes[cafe],loop=walkingLoop(scene),floor:Array<{x:number;y:number}>=[];
 for(let y=1;y<scene.rows-1;y++)for(let x=1;x<scene.columns-1;x++)if(isWalkable(scene,{x,y})&&!scene.seats.some(seat=>seat.x===x&&seat.y===y))floor.push({x,y});
 const participants=Array.from({length:20},(_,index)=>{
  const seat=index<4?scene.seats[index]:null,species=(['cat','dog','rabbit'] as const)[index%3],fur=(['fern','amber','indigo','rose','cloud','cocoa','mint','plum'] as const)[index%8];
  const path=seat?[{x:seat.x,y:seat.y}]:index<14?Array.from({length:256},(_,step)=>loop[(step+index)%loop.length]):[floor[Math.floor((index-14)*floor.length/6)]];
  const parts={...starterAvatarParts(fur,species),outfit:'cafe-apron' as const};
  return{profile:{id:id(index+1),displayName:'Synthetic actor '+(index+1),avatarKey:fur},seatId:seat?.seatId??null,state:index>=18?'reconnecting' as const:'active' as const,outfit:'cafe-apron' as const,appearance:{schemaVersion:2 as const,catalogVersion:AVATAR_CATALOG_VERSION,parts},motion:{path,startedAt:1000,stepMs:150 as const}};
 });
 return RoomSnapshotSchema.parse({schemaVersion:1,type:'snapshot',epoch:id(90),roomId:id(91),membershipId:id(92),worldSlug:cafe,roomVersion:1,capacity:20,occupancy:20,serverTime:1000,self:{accountId:id(1),seatId:scene.seats[0].seatId,motion:participants[0].motion},seats:scene.seats.map((seat,index)=>({seatId:seat.seatId,state:index<4?'occupied':'available',mine:index===0})),participants});
}
