import { it, expect } from 'vitest';
import { SceneManifestSchema } from '@virtual-city/contracts';
import { sandboxScene, isWalkable, tileCenter } from '../src/spec';

it('defines eight unique walkable seats, bounded collision zones and deterministic tile centers', () => {
  expect(sandboxScene.seats).toHaveLength(8); expect(sandboxScene.seats.every(seat => isWalkable(sandboxScene, seat))).toBe(true);
  expect(isWalkable(sandboxScene, { x: 3, y: 4 })).toBe(false); expect(isWalkable(sandboxScene, { x: 20, y: 3 })).toBe(false);
  expect(isWalkable(sandboxScene, { x: 1.5, y: 3 })).toBe(false); expect(tileCenter(sandboxScene, { x: 3, y: 3 })).toEqual({ x: 168, y: 168 });
});
it('rejects duplicate IDs/tiles, out-of-bounds geometry, blocked spawn and client authority fields', () => {
  for (const change of [
    { seats: [sandboxScene.seats[0], sandboxScene.seats[0]] },
    { seats: [{ ...sandboxScene.seats[0], x: 3, y: 4 }] },
    { collisionZones: [{ ...sandboxScene.collisionZones[0], width: 21 }] },
    { spawn: { x: 3, y: 4 } }, { accountId: 'forged' },
  ]) expect(SceneManifestSchema.safeParse({ ...sandboxScene, ...change }).success).toBe(false);
});
