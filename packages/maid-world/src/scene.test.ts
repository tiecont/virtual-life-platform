import { it,expect } from 'vitest';
import { findScenePath,isWalkable } from '@virtual-city/world-sdk';
import { maidScene,maidAreas,maidSeatIds,maidCatalog,createMaidWorld } from './index';
it('all24service chairs are unique,reachable around solid furniture and identical to authoritative Maid seat metadata',()=>{
 expect(maidScene.seats.map(seat=>seat.seatId)).toEqual(maidSeatIds);expect(new Set(maidSeatIds).size).toBe(maidCatalog.maxCustomer);expect(createMaidWorld().definition.sceneRef).toEqual({key:maidScene.key,version:maidScene.version});expect(createMaidWorld().definition.capacity).toBe(30);
 for(const seat of maidScene.seats){expect(isWalkable(maidScene,seat)).toBe(true);const path=findScenePath(maidScene,maidScene.spawn,seat);expect(path).not.toBeNull();expect(path!.at(-1)).toEqual({x:seat.x,y:seat.y});}
 expect(isWalkable(maidScene,{x:4,y:4})).toBe(false);expect(isWalkable(maidScene,{x:8,y:2})).toBe(false);expect(maidAreas.flatMap(area=>area.seatIds).sort()).toEqual([...maidSeatIds].sort());
});
