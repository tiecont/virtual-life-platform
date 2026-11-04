import { it,expect } from 'vitest';
import { loungeScene,createLoungeWorld } from '@virtual-city/lounge-world';
import { findScenePath,isWalkable } from '@virtual-city/world-sdk';
it('original ten audience seats are reachable within twelve places;closed stage admits zero audience occupants',()=>{
 const definition=createLoungeWorld().definition;expect(definition.capacity).toBe(12);expect(loungeScene.seats).toHaveLength(10);expect(definition.eventPolicy?.maxCapacity).toBe(10);expect(definition.capabilities).not.toContain('hospitality');expect(definition.capabilities).not.toContain('chat');expect(definition.hospitalityPolicy).toBeUndefined();
 for(const seat of loungeScene.seats)expect(findScenePath(loungeScene,loungeScene.spawn,seat)?.at(-1)).toEqual({x:seat.x,y:seat.y});const stage=loungeScene.collisionZones.find(zone=>zone.kind==='stage')!;for(let x=stage.x;x<stage.x+stage.width;x++)for(let y=stage.y;y<stage.y+stage.height;y++){expect(isWalkable(loungeScene,{x,y})).toBe(false);expect(findScenePath(loungeScene,loungeScene.spawn,{x,y})).toBeNull();}expect(definition.appearancePolicy?.apron).toBe('forbidden');
});
