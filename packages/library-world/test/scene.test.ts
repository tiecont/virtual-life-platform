import { describe,it,expect } from 'vitest';
import { libraryScene,libraryAreas,createLibraryWorld } from '@virtual-city/library-world';
import { findScenePath } from '@virtual-city/world-sdk';
describe('original library layout and adapter',()=>{
 it('all eight desks have distinct reachable tiles and honest desk-area categories',()=>{
  expect(libraryScene.seats).toHaveLength(8);expect(new Set(libraryAreas.flatMap(area=>area.seatIds))).toEqual(new Set(libraryScene.seats.map(seat=>seat.seatId)));
  for(const seat of libraryScene.seats)expect(findScenePath(libraryScene,libraryScene.spawn,seat)?.at(-1)).toEqual({x:seat.x,y:seat.y});
  expect(libraryAreas.map(area=>area.key)).toEqual(['reading','study']);
 });
 it('adapter has exact geometry and offers seating without claiming unfinished focus or event integration',()=>{
  const world=createLibraryWorld();expect(world.definition.slug).toBe('library');expect(world.definition.scene).toEqual(libraryScene);expect(world.definition.capacity).toBe(8);
  expect(world.definition.capabilities).toEqual(['presence','seating','portals']);expect(world.definition.appearancePolicy).toEqual({apron:'forbidden'});
 });
});
