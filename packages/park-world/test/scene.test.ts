import { describe,it,expect } from 'vitest';
import { createParkWorld,parkScene,parkAreas,parkDestinations } from '../src/index';
import { findScenePath,isWalkable } from '@virtual-city/world-sdk';
describe('original Central Park geometry and shared-owner adapter',()=>{
 it('eight bench places and every native destination are reachable without entering trees or boards',()=>{
  expect(parkScene.seats).toHaveLength(8);expect(new Set(parkAreas.flatMap(area=>area.seatIds))).toEqual(new Set(parkScene.seats.map(seat=>seat.seatId)));
  for(const point of [...parkScene.seats,...parkDestinations])expect(findScenePath(parkScene,parkScene.spawn,point)?.at(-1)).toEqual({x:point.x,y:point.y});
  for(const id of ['activity-board','portal-signpost','tree-northwest','commons-garden']){const object=parkScene.collisionZones.find(zone=>zone.id===id)!;expect(object).toBeDefined();expect(isWalkable(parkScene,{x:object.x,y:object.y})).toBe(false);}
 });
 it('uses the standard scene/avatar contract and the shared chat capability without focus,service or event authority',()=>{
  const world=createParkWorld();expect(world.definition).toMatchObject({slug:'park',kind:'world',capacity:12,scene:parkScene,sceneRef:{key:parkScene.key,version:parkScene.version},accessPolicy:{kind:'public'},visibility:'listed',appearancePolicy:{apron:'forbidden'}});
  expect(world.definition.capabilities).toEqual(['presence','seating','chat','portals']);expect(world.definition.map.icon).toBe('trees');expect(parkScene.key).toBe(world.definition.slug);
 });
});
