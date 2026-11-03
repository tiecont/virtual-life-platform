import { SceneManifestSchema, type SceneManifest, type RoomMotion } from '@virtual-city/contracts';

export const sandboxScene: SceneManifest = SceneManifestSchema.parse({
  schemaVersion: 1, key: 'sdk-sandbox', version: '1.0.0', projection: 'orthogonal', tileSize: 48, columns: 20, rows: 14, spawn: { x: 10, y: 11 },
  collisionZones: [
    { id: 'north-wall', kind: 'wall', x: 0, y: 0, width: 20, height: 2 },
    { id: 'west-wall', kind: 'wall', x: 0, y: 2, width: 1, height: 12 },
    { id: 'east-wall', kind: 'wall', x: 19, y: 2, width: 1, height: 12 },
    { id: 'window-table', kind: 'table', x: 3, y: 4, width: 3, height: 2 },
    { id: 'garden-table', kind: 'table', x: 12, y: 4, width: 3, height: 2 },
    { id: 'counter', kind: 'counter', x: 14, y: 10, width: 4, height: 2 },
    { id: 'planter-west', kind: 'planter', x: 1, y: 2, width: 1, height: 1 },
    { id: 'planter-east', kind: 'planter', x: 18, y: 2, width: 1, height: 1 },
  ],
  seats: [
    { seatId: 'seat-1', label: 'Window table 01', x: 3, y: 3, facing: 'south' },
    { seatId: 'seat-2', label: 'Window table 02', x: 5, y: 3, facing: 'south' },
    { seatId: 'seat-3', label: 'Window table 03', x: 3, y: 6, facing: 'north' },
    { seatId: 'seat-4', label: 'Window table 04', x: 5, y: 6, facing: 'north' },
    { seatId: 'seat-5', label: 'Garden table 05', x: 12, y: 3, facing: 'south' },
    { seatId: 'seat-6', label: 'Garden table 06', x: 14, y: 3, facing: 'south' },
    { seatId: 'seat-7', label: 'Garden table 07', x: 12, y: 6, facing: 'north' },
    { seatId: 'seat-8', label: 'Garden table 08', x: 14, y: 6, facing: 'north' },
  ],
});

export function tileCenter(scene: SceneManifest, point: { x: number; y: number }) {
  return { x: (point.x + 0.5) * scene.tileSize, y: (point.y + 0.5) * scene.tileSize };
}
export function isWalkable(scene: SceneManifest, point: { x: number; y: number }) {
  return Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.y >= 0 && point.x < scene.columns && point.y < scene.rows
    && !scene.collisionZones.some(zone => point.x >= zone.x && point.x < zone.x + zone.width && point.y >= zone.y && point.y < zone.y + zone.height);
}

export function findScenePath(scene: SceneManifest, from: { x: number; y: number }, to: { x: number; y: number }) {
  if (!isWalkable(scene, from) || !isWalkable(scene, to)) return null;
  const key = (point: { x: number; y: number }) => point.y * scene.columns + point.x;
  const queue = [from]; const parent = new Map<number, number | null>([[key(from), null]]);
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    if (key(point) === key(to)) {
      const path = []; let cursor: number | null = key(point);
      while (cursor !== null) { path.push({ x: cursor % scene.columns, y: Math.floor(cursor / scene.columns) }); cursor = parent.get(cursor) ?? null; }
      path.reverse(); return path.length <= 256 ? path : null;
    }
    for (const next of [{ x: point.x, y: point.y - 1 }, { x: point.x - 1, y: point.y }, { x: point.x + 1, y: point.y }, { x: point.x, y: point.y + 1 }]) {
      if (isWalkable(scene, next) && !parent.has(key(next))) { parent.set(key(next), key(point)); queue.push(next); }
    }
  }
  return null;
}
export function motionPosition(motion: RoomMotion, time: number, interpolate = true) {
  const progress = Math.max(0, Math.min(motion.path.length - 1, (time - motion.startedAt) / motion.stepMs));
  const index = Math.floor(progress); const from = motion.path[index], to = motion.path[Math.min(index + 1, motion.path.length - 1)];
  const fraction = interpolate ? progress - index : 0;
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction, moving: progress < motion.path.length - 1 };
}
