import { it, expect } from 'vitest';
import { RoomMotionSchema, WorldDefinitionSchema } from '@virtual-city/contracts';
import { sandboxScene, findScenePath, isWalkable, motionPosition, createSandboxWorld } from '../src';

it('routes around solid tables with bounded adjacent orthogonal tiles and rejects unreachable destinations', () => {
  const path = findScenePath(sandboxScene, { x: 2, y: 4 }, { x: 6, y: 4 })!;
  expect(path.length).toBeGreaterThan(5); expect(path.every(point => isWalkable(sandboxScene, point))).toBe(true);
  expect(RoomMotionSchema.safeParse({ path, startedAt: 1000, stepMs: 150 }).success).toBe(true);
  for (const target of [{ x: 3, y: 4 }, { x: -1, y: 3 }, { x: 20, y: 3 }, { x: .5, y: 3 }]) expect(findScenePath(sandboxScene, sandboxScene.spawn, target)).toBeNull();
  const enclosed = { ...sandboxScene, collisionZones: [...sandboxScene.collisionZones, { id: 'barrier', kind: 'wall' as const, x: 1, y: 8, width: 18, height: 1 }] };
  expect(findScenePath(enclosed, sandboxScene.spawn, { x: 2, y: 4 })).toBeNull();
});
it('interpolates only on an approved segment and clamps early/late playback', () => {
  const motion = { path: [{ x: 2, y: 3 }, { x: 2, y: 4 }, { x: 3, y: 4 }], startedAt: 1000, stepMs: 150 as const };
  expect(motionPosition(motion, 900)).toEqual({ x: 2, y: 3, moving: true });
  expect(motionPosition(motion, 1075)).toEqual({ x: 2, y: 3.5, moving: true });
  expect(motionPosition(motion, 1225)).toEqual({ x: 2.5, y: 4, moving: true });
  expect(motionPosition(motion, 9999)).toEqual({ x: 3, y: 4, moving: false });
  expect(motionPosition(motion, 1225, false)).toEqual({ x: 2, y: 4, moving: true });
  expect(RoomMotionSchema.safeParse({ ...motion, path: [{ x: 2, y: 3 }, { x: 3, y: 4 }] }).success).toBe(false);
});
it('requires trusted world geometry to match scene version and registered seat IDs', () => {
  const definition = createSandboxWorld().definition;
  expect(WorldDefinitionSchema.safeParse(definition).success).toBe(true);
  expect(WorldDefinitionSchema.safeParse({ ...definition, scene: { ...sandboxScene, version: '9.0.0' } }).success).toBe(false);
  expect(WorldDefinitionSchema.safeParse({ ...definition, scene: { ...sandboxScene, seats: [] } }).success).toBe(false);
});
