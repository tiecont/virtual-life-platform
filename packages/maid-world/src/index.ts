import { defineWorld,WorldError } from '@virtual-city/world-sdk';
import { HospitalityPolicySchema } from '@virtual-city/contracts';
import { maidScene } from './scene';
export { maidScene,maidAreas } from './scene';

// Owner-selected foundation configuration. No legacy identity/room/shift/order
// runtime exists;City's shared services remain the only active authority.
export const maidSourceCommit='f676298fdab6cd3f2d54ad422f409538c4bdf52a';
export const maidCatalog={id:'cafe-sakura',slug:'cafe-sakura',maxTotal:30,maxCustomer:24,maxMaid:6} as const;
export const maidSourceAvatarSuggestions={sakura:'rose',mint:'mint',lavender:'plum',amber:'amber'} as const;
export const maidMenu=[
 {key:'coffee',label:'Coffee'},{key:'iced-latte',label:'Iced Latte'},
 {key:'milk-tea',label:'Milk Tea'},{key:'matcha',label:'Matcha'},
 {key:'cake',label:'Cake'},{key:'omurice',label:'Omurice'},
] as const;
export const maidWorldVersion='1.2.0';
export const maidRecipes={coffee:['coffee','water'],'iced-latte':['ice','coffee','milk'],'milk-tea':['tea','milk'],matcha:['matcha','water','milk'],cake:['sponge','cream','strawberry'],omurice:['rice','egg','sauce']} as const;
const ingredientChoices=[...new Set(Object.values(maidRecipes).flat())].sort();
export const maidSeatIds=maidScene.seats.map(seat=>seat.seatId);
export const maidServicePolicy=HospitalityPolicySchema.parse({version:'1.1.0',itemKeys:maidMenu.map(item=>item.key),maxActivePerStaff:1,maxQueue:24,
 staffing:{kind:'voluntary',maxStaff:maidCatalog.maxMaid,roles:[{key:'maid',label:'Maid',actions:['claim','prepare','ready','serve']}]},
 menu:{items:maidMenu.map(item=>({...item,workflowKey:item.key})),workflows:maidMenu.map(item=>({key:item.key,version:'1.1.0',kind:'timed-courses',courses:[{key:item.key,label:item.label,prepareSeconds:2,recipe:{steps:maidRecipes[item.key],choices:ingredientChoices}}]}))},
});
export function createMaidWorld(){
 let started=false;const current=()=>{if(!started)throw new WorldError('WORLD_UNAVAILABLE','Maid Cafe unavailable');};
 return defineWorld({schemaVersion:1,apiVersion:1,slug:'maid',version:maidWorldVersion,title:'Maid Cafe Social',kind:'world',
  sceneRef:{key:maidScene.key,version:maidScene.version},scene:maidScene,capacity:maidCatalog.maxTotal,seatIds:maidSeatIds,
  capabilities:['presence','seating','hospitality','chat','portals'],hospitalityPolicy:maidServicePolicy,appearancePolicy:{apron:'on-shift'},
  accessPolicy:{kind:'public'},visibility:'listed',map:{region:'social',position:{x:.58,y:.48},icon:'coffee'},
 },{bootstrap:async()=>{started=true;},shutdown:async()=>{started=false;},onJoin:async()=>{current();},onLeave:async()=>{},
  onCommand:async()=>{throw new WorldError('INVALID_REQUEST','Use shared room and service commands');},
  travel:{prepare:async context=>{current();if(context.signal.aborted)throw new WorldError('WORLD_UNAVAILABLE','Maid Cafe unavailable');},abort:async()=>{},depart:async()=>{}},
 });
}
