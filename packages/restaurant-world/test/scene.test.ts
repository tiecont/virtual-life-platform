import { it,expect } from 'vitest';
import { restaurantScene,restaurantTables,createRestaurantWorld } from '@virtual-city/restaurant-world';
import { findScenePath } from '@virtual-city/world-sdk';
it('two original dining tables map exactly to eight reachable chairs within ten room places',()=>{
 const world=createRestaurantWorld(),seats=restaurantScene.seats.map(seat=>seat.seatId);expect(world.definition.capacity).toBe(10);expect(seats).toHaveLength(8);expect(new Set(restaurantTables.flatMap(table=>table.seatIds))).toEqual(new Set(seats));
 for(const table of restaurantTables){expect(table.capacity).toBe(table.seatIds.length);expect(restaurantScene.collisionZones.some(zone=>zone.id===table.key&&zone.kind==='table')).toBe(true);}
 for(const seat of restaurantScene.seats)expect(findScenePath(restaurantScene,restaurantScene.spawn,seat)?.at(-1)).toEqual({x:seat.x,y:seat.y});
 expect(world.definition.eventPolicy?.reservations?.resources).toEqual(restaurantTables.map(table=>({key:table.key,capacity:table.capacity})));
});
it('Restaurant declares voluntary policy roles without giving scene perspectives or uniforms authority',()=>{
 const definition=createRestaurantWorld().definition;expect(definition.hospitalityPolicy?.staffing).toMatchObject({kind:'voluntary',maxStaff:2});expect(definition.hospitalityPolicy?.staffing?.roles).toEqual([{key:'server',label:'Server',actions:['claim','serve']},{key:'cook',label:'Cook',actions:['claim','prepare','ready']}]);expect(definition.hospitalityPolicy?.menu).toBeUndefined();expect(definition.appearancePolicy?.apron).toBe('forbidden');expect(definition.version).toBe('1.1.0');expect(definition.sceneRef.version).toBe('1.0.0');
});
