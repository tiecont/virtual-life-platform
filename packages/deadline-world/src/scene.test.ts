import { it,expect } from 'vitest';
import { findScenePath,isWalkable,tileCenter } from '@virtual-city/world-sdk';
import { deadlineLayout } from './baseline';
import { deadlineScene,deadlineAreas } from './scene';
it('all adapted source seats retain identity and pixel bounds and are reachable around solid cafe furniture',()=>{
 expect(deadlineScene.columns*deadlineScene.tileSize).toBe(deadlineLayout.width);expect(deadlineScene.rows*deadlineScene.tileSize).toBe(deadlineLayout.height);
 for(const [i,seat] of deadlineScene.seats.entries()){const legacy=deadlineLayout.seats[i],center=tileCenter(deadlineScene,seat);expect(seat.seatId).toBe(legacy.id);expect(Math.abs(center.x-legacy.x)).toBeLessThanOrEqual(20);expect(Math.abs(center.y-legacy.y)).toBeLessThanOrEqual(20);expect(isWalkable(deadlineScene,seat)).toBe(true);const path=findScenePath(deadlineScene,deadlineScene.spawn,seat);expect(path).not.toBeNull();expect(path!.at(-1)).toEqual({x:seat.x,y:seat.y});}
 expect(isWalkable(deadlineScene,{x:2,y:2})).toBe(false);expect(isWalkable(deadlineScene,{x:0,y:8})).toBe(false);expect(deadlineAreas.flatMap(area=>area.seatIds).sort()).toEqual(deadlineScene.seats.map(seat=>seat.seatId).sort());expect(new Set(deadlineAreas.flatMap(area=>area.seatIds)).size).toBe(30);
});
