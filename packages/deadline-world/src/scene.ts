import { SceneManifestSchema } from '@virtual-city/contracts';
import { deadlineLayout } from './baseline';

// Selected source coordinates mapped to40px tiles (at most20px displacement).
//960x640 therefore keeps its aspect in24x16 tiles. Original tables/walls below
// fill the source placeholder's missing scene without changing seat identities.
const seats=deadlineLayout.seats.map((seat,i)=>({seatId:seat.id,label:`Deadline desk ${String(i+1).padStart(2,'0')}`,x:Math.round(seat.x/40-.5),y:Math.round(seat.y/40-.5),facing:([0,2].includes(Math.floor(i/6))?'south':'north') as 'north'|'south'}));
export const deadlineScene=SceneManifestSchema.parse({schemaVersion:1,key:'deadline',version:'1.0.0',projection:'orthogonal',tileSize:40,columns:24,rows:16,spawn:{x:12,y:14},
 collisionZones:[
  {id:'north-wall',kind:'wall',x:0,y:0,width:24,height:2},{id:'west-wall',kind:'wall',x:0,y:2,width:1,height:14},{id:'east-wall',kind:'wall',x:23,y:2,width:1,height:14},
  {id:'south-west-wall',kind:'wall',x:1,y:15,width:9,height:1},{id:'south-east-wall',kind:'wall',x:15,y:15,width:8,height:1},
  {id:'coffee-counter',kind:'counter',x:2,y:2,width:9,height:1},
  ...[5,9,11].flatMap((y,row)=>seats.slice(0,6).map((seat,col)=>({id:`focus-table-${row}-${col}`,kind:'table' as const,x:seat.x,y,width:1,height:1}))),
  {id:'west-garden',kind:'planter',x:1,y:13,width:1,height:1},{id:'east-garden',kind:'planter',x:22,y:13,width:1,height:1},
 ],seats});
export const deadlineAreas=[
 {key:'window',title:'Window desks',description:'Ten desks along the west side of the same shared cafe.',seatIds:seats.filter((_,i)=>i%6<2).map(seat=>seat.seatId)},
 {key:'center',title:'Center desks',description:'Ten desks around the central aisle,with room for standing visitors.',seatIds:seats.filter((_,i)=>i%6>=2&&i%6<4).map(seat=>seat.seatId)},
 {key:'garden',title:'Garden desks',description:'Ten desks beside the east garden;no separate private room is implied.',seatIds:seats.filter((_,i)=>i%6>=4).map(seat=>seat.seatId)},
];
