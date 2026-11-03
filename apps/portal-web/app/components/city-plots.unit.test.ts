import { it,expect } from 'vitest';
import { layoutCityWorlds,cityPlots } from './city-plots';
const world=(slug:string)=>({slug,version:'1.0.0',title:slug,kind:'sandbox',sceneRef:{key:slug,version:'1.0.0'},capacity:8,capabilities:['presence'],map:{region:'sandbox',position:{x:.5,y:.5},icon:'flask'},accessHint:'session-required',availability:'available',discoverability:'listed'});
it('allocates distinct bounded schematic plots for overlapping registry coordinates in stable slug order',()=>{
 const input=['world-c','world-a','world-b'].map(world),result=layoutCityWorlds(input);expect(result).toEqual(layoutCityWorlds([...input].reverse()));expect(new Set(result.map(item=>item.plot)).size).toBe(3);expect(result.map(item=>item.world.slug)).toEqual(['world-a','world-b','world-c']);expect(result.every(item=>item.x>0&&item.x<48&&item.y>0&&item.y<30)).toBe(true);
});
it('caps map density without inventing metadata and rejects duplicate or malformed catalog entries',()=>{
 const input=Array.from({length:100},(_,n)=>world('world-'+String(n).padStart(3,'0')));expect(layoutCityWorlds(input)).toHaveLength(cityPlots.length);expect(new Set(layoutCityWorlds(input).map(item=>item.plot)).size).toBe(cityPlots.length);expect(layoutCityWorlds([])).toEqual([]);expect(()=>layoutCityWorlds([input[0],input[0]])).toThrow('DUPLICATE_CITY_WORLD');expect(()=>layoutCityWorlds([{...input[0],availability:'open'}])).toThrow();expect(()=>layoutCityWorlds([{...input[0],profile:{id:'hidden'}}])).toThrow();
});
