import { z } from 'zod';
import { SeatIdSchema, WorldVersionSchema } from './world';

const Point = z.strictObject({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });
export const SceneManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), key: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), version: WorldVersionSchema,
  projection: z.literal('orthogonal'), tileSize: z.number().int().min(16).max(128),
  columns: z.number().int().min(4).max(64), rows: z.number().int().min(4).max(64), spawn: Point,
  collisionZones: z.array(Point.extend({ id: z.string().min(1).max(64), width: z.number().int().positive(), height: z.number().int().positive(), kind: z.enum(['wall', 'table', 'counter', 'planter']) })).max(128),
  seats: z.array(Point.extend({ seatId: SeatIdSchema, label: z.string().min(1).max(64), facing: z.enum(['north', 'south']) })).max(100),
}).superRefine((scene, context) => {
  const inside = (point: { x: number; y: number }) => point.x < scene.columns && point.y < scene.rows;
  const blocked = (point: { x: number; y: number }) => scene.collisionZones.some(zone => point.x >= zone.x && point.x < zone.x + zone.width && point.y >= zone.y && point.y < zone.y + zone.height);
  const positions = scene.seats.map(seat => seat.x + ':' + seat.y);
  if (!inside(scene.spawn) || blocked(scene.spawn)) context.addIssue({ code: 'custom', message: 'Spawn must be inside a walkable tile' });
  if (scene.collisionZones.some(zone => zone.x + zone.width > scene.columns || zone.y + zone.height > scene.rows)) context.addIssue({ code: 'custom', message: 'Collision zone outside scene' });
  if (new Set(scene.collisionZones.map(zone => zone.id)).size !== scene.collisionZones.length) context.addIssue({ code: 'custom', message: 'Duplicate collision ID' });
  if (new Set(scene.seats.map(seat => seat.seatId)).size !== scene.seats.length || new Set(positions).size !== positions.length) context.addIssue({ code: 'custom', message: 'Duplicate seat ID or tile' });
  if (scene.seats.some(seat => !inside(seat) || blocked(seat))) context.addIssue({ code: 'custom', message: 'Seat must be inside a walkable tile' });
});
export type SceneManifest = z.infer<typeof SceneManifestSchema>;
