import { it,expect } from 'vitest';
import { WorldCardSchema } from '@virtual-city/contracts';
import { rankDiscovery } from './policy';
const now=Date.parse('2026-11-03T10:00:00.000Z'),observedAt=new Date(now).toISOString(),roomId='00000000-0000-4000-8000-000000000001';
const card=(slug:string)=>WorldCardSchema.parse({slug,version:'1.0.0',title:slug,kind:'sandbox',sceneRef:{key:slug,version:'1.0.0'},capacity:8,capabilities:['presence'],map:{region:'sandbox',position:{x:.5,y:.5},icon:'flask'},accessHint:'session-required',availability:'available',discoverability:'listed'});
it('concentrates confirmed empty activity into one actual eligible place rather than invented worlds',()=>{
 const view=rankDiscovery({observedAt,worlds:[card('elsewhere'),card('sdk-sandbox')],rooms:[]},{schemaVersion:1,items:[],truncated:false},now);expect(view.featured).toHaveLength(1);expect(view.featured[0]).toMatchObject({worldSlug:'sdk-sandbox',reason:'start-here',usedPlaces:0,roomCount:0});expect(view.expiresAt).toBe(new Date(now+30000).toISOString());
});
it('prefers actual occupied places and excludes nonpublic,closed and dating metadata with a three-place bound',()=>{
 const worlds=['world-a','world-b','world-c','world-d'].map(card),rooms=worlds.map((world,n)=>({worldSlug:world.slug,roomId:roomId.slice(0,-1)+(n+1),capacity:8,occupancy:n+1}));const view=rankDiscovery({observedAt,worlds:[...worlds,{...card('private-place'),accessHint:'permission-required'},card('dating'),{...card('closed-place'),availability:'disabled'}],rooms},null,now);expect(view.featured.map(item=>item.worldSlug)).toEqual(['world-d','world-c','world-b']);expect(view.schedulesKnown).toBe(false);expect(view.featured[0]).toMatchObject({reason:'occupied',usedPlaces:4,roomCount:1});
});
it('does not substitute empty activity when schedule source is unknown or snapshot expired',()=>{
 expect(rankDiscovery({observedAt,worlds:[card('sdk-sandbox')],rooms:[]},null,now).featured).toEqual([]);expect(rankDiscovery({observedAt,worlds:[card('sdk-sandbox')],rooms:[]},{schemaVersion:1,items:[],truncated:true},now).featured).toEqual([]);for(const at of [now-1,now+30000])expect(()=>rankDiscovery({observedAt,worlds:[card('sdk-sandbox')],rooms:[]},{schemaVersion:1,items:[],truncated:false},at)).toThrow();
});
