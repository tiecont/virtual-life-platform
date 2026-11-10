import {SceneManifestSchema} from '@virtual-city/contracts';
// Original code-authored geometry. Room chairs are navigation/seating only;
// table consent is a separate server operation, never inferred from a chair.
export const lodgeScene=SceneManifestSchema.parse({schemaVersion:1,key:'lantern-lodge',version:'1.0.0',projection:'orthogonal',tileSize:48,columns:18,rows:14,spawn:{x:9,y:12},
 collisionZones:[{id:'north-wall',kind:'wall',x:0,y:0,width:18,height:1},{id:'west-wall',kind:'wall',x:0,y:1,width:1,height:13},{id:'east-wall',kind:'wall',x:17,y:1,width:1,height:13},{id:'lodge-table',kind:'table',x:6,y:5,width:6,height:3},{id:'west-planter',kind:'planter',x:2,y:2,width:2,height:2},{id:'east-planter',kind:'planter',x:14,y:2,width:2,height:2}],
 seats:[...Array.from({length:4},(_,i)=>({seatId:'lodge-north-'+i,label:'North lodge chair '+(i+1),x:6+i*2,y:4,facing:'south' as const})),...Array.from({length:4},(_,i)=>({seatId:'lodge-south-'+i,label:'South lodge chair '+(i+1),x:6+i*2,y:8,facing:'north' as const}))]});
export const lodgeAreas=[{key:'lodge-table',title:'The lantern table',description:'Eight room chairs. Sitting here does not join a game or disclose a hand.',seatIds:lodgeScene.seats.map(seat=>seat.seatId)}];
