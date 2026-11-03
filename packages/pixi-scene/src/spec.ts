import { SceneManifestSchema, type SceneManifest } from '@virtual-city/contracts';

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
