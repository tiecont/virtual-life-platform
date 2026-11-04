import { SceneManifestSchema,HospitalityPolicySchema } from '@virtual-city/contracts';
import { defineWorld,WorldError } from '@virtual-city/world-sdk';
// Original all-ages text/visual venue. The closed stage is a solid collision
// region,not an audience seat or a role granted by scene presentation.
export const loungeScene=SceneManifestSchema.parse({schemaVersion:1,key:'lounge',version:'1.0.0',projection:'orthogonal',tileSize:40,columns:24,rows:16,spawn:{x:12,y:13},collisionZones:[
 {id:'north-wall',kind:'wall',x:0,y:0,width:24,height:2},
 {id:'west-wall',kind:'wall',x:0,y:2,width:1,height:14},
 {id:'east-wall',kind:'wall',x:23,y:2,width:1,height:14},
 {id:'closed-stage',kind:'stage',x:6,y:2,width:12,height:3},
 {id:'mocktail-counter',kind:'counter',x:17,y:10,width:5,height:2},
 {id:'west-greenery',kind:'planter',x:1,y:3,width:1,height:1},
 {id:'east-greenery',kind:'planter',x:22,y:3,width:1,height:1},
 ],seats:[
  ...[4,7,10,13,16].map((x,i)=>({seatId:'seat-'+(i+1),label:'Front row '+String(i+1).padStart(2,'0'),x,y:7,facing:'north' as const})),
  ...[4,7,10,13,16].map((x,i)=>({seatId:'seat-'+(i+6),label:'Back row '+String(i+6).padStart(2,'0'),x,y:10,facing:'north' as const})),
 ]});
export const loungeAreas=[{key:'audience',title:'Audience seating',description:'Ten native seat controls face the closed text and visual stage.',capacity:10,seatIds:loungeScene.seats.map(seat=>seat.seatId)},{key:'mocktail-counter',title:'Mocktail counter',description:'All-ages virtual mocktails use explicit voluntary bartender shifts. Everything served is virtual.',capacity:0,seatIds:[]}] as const;
export const loungeWorldVersion='1.3.0';
export const loungeServicePolicy=HospitalityPolicySchema.parse({version:'1.0.0',itemKeys:['moonlit-mint','berry-spark'],maxActivePerStaff:2,maxQueue:10,staffing:{kind:'voluntary',maxStaff:2,roles:[{key:'bartender',label:'Virtual bartender',actions:['claim','prepare','ready','serve']}]},menu:{items:[{key:'moonlit-mint',label:'Moonlit mint-lime',workflowKey:'virtual-mocktail'},{key:'berry-spark',label:'Berry spark',workflowKey:'virtual-mocktail'}],workflows:[{key:'virtual-mocktail',version:'1.0.0',kind:'timed-courses',courses:[{key:'mix',label:'Virtual mocktail',prepareSeconds:2}]}]}});
export function createLoungeWorld(){let started=false;return defineWorld({schemaVersion:1,apiVersion:1,slug:'lounge',version:loungeWorldVersion,title:'Moonlight Lounge',kind:'world',sceneRef:{key:loungeScene.key,version:loungeScene.version},scene:loungeScene,capacity:12,seatIds:loungeScene.seats.map(seat=>seat.seatId),capabilities:['presence','seating','events','portals','hospitality'],hospitalityPolicy:loungeServicePolicy,eventPolicy:{schemaVersion:1,version:'1.0.0',maxCapacity:10},audiencePolicy:{version:'1.0.0',disclosure:'anonymous-counts',windowSeconds:10,maxPerRoom:20,cooldownSeconds:2,maxPerAccountWindow:5,approvalSeconds:300},stagePolicy:{version:'1.0.0',maxPerformers:1,maxQueue:10,offerSeconds:30,slotSeconds:60,waitSeconds:600,disclosure:'anonymous-slot'},appearancePolicy:{apron:'forbidden'},accessPolicy:{kind:'public'},visibility:'listed',map:{region:'arts',position:{x:.82,y:.4},icon:'music'}},{bootstrap:async()=>{started=true;},shutdown:async()=>{started=false;},onJoin:async()=>{if(!started)throw Error('Lounge unavailable');},onLeave:async()=>{},onCommand:async()=>{throw new WorldError('INVALID_REQUEST','Stage floor entry is closed');},travel:{prepare:async context=>{if(!started||context.signal.aborted)throw Error('Lounge unavailable');},abort:async()=>{},depart:async()=>{}}});}
