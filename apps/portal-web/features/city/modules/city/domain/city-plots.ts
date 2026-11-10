import { WorldCatalogSchema } from '@virtual-city/contracts';
export const cityPlots = [6,15,24].flatMap(y=>[7,18,30,41].map(x=>({x,y})));
// Schematic display slots, not authoritative rooms or physical-world coordinates.
export function layoutCityWorlds(raw:unknown) {
  const worlds=WorldCatalogSchema.shape.worlds.parse(raw);
  if(new Set(worlds.map(world=>world.slug)).size!==worlds.length)throw Error('DUPLICATE_CITY_WORLD');
  const free=new Set(cityPlots.map((_,index)=>index));
  return [...worlds].sort((a,b)=>a.slug<b.slug?-1:a.slug>b.slug?1:0).slice(0,cityPlots.length).map(world=>{
    const distance=(index:number)=>(cityPlots[index].x/48-world.map.position.x)**2+(cityPlots[index].y/30-world.map.position.y)**2;
    const plot=[...free].sort((a,b)=>distance(a)-distance(b)||a-b)[0];free.delete(plot);
    return {world,plot,...cityPlots[plot]};
  });
}
