import {RoomSnapshotSchema,type RoomSnapshot} from '@virtual-city/contracts';
import {sandboxScene,isWalkable} from '@virtual-city/world-sdk';
export const WORKLOAD_LABEL='SYNTHETIC 20-ACTOR RENDERER BENCHMARK — no real session, capacity, authority or reward';
const id=(value:number)=>'00000000-0000-4000-8000-'+String(value).padStart(12,'0');
export function workloadSnapshot():RoomSnapshot{
 const loop:Array<{x:number;y:number}>=[];for(let x=2;x<=11;x++)loop.push({x,y:8});for(let y=9;y<=12;y++)loop.push({x:11,y});for(let x=10;x>=2;x--)loop.push({x,y:12});for(let y=11;y>=9;y--)loop.push({x:2,y});
 if(!loop.every(point=>isWalkable(sandboxScene,point)))throw Error('Synthetic workload left the canonical floor');
 const participants=Array.from({length:20},(_,index)=>{const seat=index<4?sandboxScene.seats[index]:null,path=seat?[{x:seat.x,y:seat.y}]:Array.from({length:index<14?200:1},(_,step)=>loop[(step+index*2)%loop.length]);return{profile:{id:id(index+1),displayName:'Synthetic actor '+(index+1),avatarKey:(['fern','amber','indigo','rose','cloud','cocoa','mint','plum']as const)[index%8]},seatId:seat?.seatId??null,state:index>=18?'reconnecting' as const:'active' as const,outfit:'cafe-apron' as const,motion:{path,startedAt:1000,stepMs:150 as const}};});
 return RoomSnapshotSchema.parse({schemaVersion:1,type:'snapshot',epoch:id(90),roomId:id(91),membershipId:id(92),worldSlug:sandboxScene.key,roomVersion:1,capacity:20,occupancy:20,serverTime:1000,self:{accountId:id(1),seatId:'seat-1',motion:participants[0].motion},seats:sandboxScene.seats.map((seat,index)=>({seatId:seat.seatId,state:index<4?'occupied':'available',mine:index===0})),participants});
}
