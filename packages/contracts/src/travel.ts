import { z } from 'zod';
import { WorldSlugSchema, WorldVersionSchema } from './world-primitives';
import { RoomSnapshotSchema } from './rooms';

export const TravelPhaseSchema = z.enum(['CREATED', 'READY', 'COMMITTED', 'EXPIRED', 'FAILED', 'CANCELLED']);
export type TravelPhase = z.infer<typeof TravelPhaseSchema>;
const uuid = z.uuid().transform(value => value.toLowerCase());
export const TravelSourceSchema = z.strictObject({ epoch: uuid, roomId: uuid, membershipId: uuid });
export const TravelDestinationSchema = z.strictObject({ worldSlug: WorldSlugSchema, worldVersion: WorldVersionSchema, sceneVersion: WorldVersionSchema, roomId: uuid.optional() });
export const TravelIntentInputSchema = z.strictObject({ schemaVersion: z.literal(1), source: TravelSourceSchema.nullable(), destination: TravelDestinationSchema });
export const TravelIntentReceiptSchema = z.strictObject({ schemaVersion: z.literal(1), intentId: uuid, phase: TravelPhaseSchema, createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), destination: TravelDestinationSchema, redeemed: z.boolean(), capability: z.string().regex(/^[a-f0-9]{64}$/).nullable() });
export type TravelSource = z.infer<typeof TravelSourceSchema>;
export type TravelDestination = z.infer<typeof TravelDestinationSchema>;
export type TravelIntentInput = z.infer<typeof TravelIntentInputSchema>;
export const TravelRequestSchema = z.strictObject({ schemaVersion: z.literal(1), requestId: uuid, intentId: uuid, capability: z.string().regex(/^[a-f0-9]{64}$/) });
export const TravelResultSchema = z.strictObject({ schemaVersion: z.literal(1), receipt: TravelIntentReceiptSchema, snapshot: RoomSnapshotSchema.nullable() });
export const TravelAckSchema = z.discriminatedUnion('ok', [
  z.strictObject({ schemaVersion: z.literal(1), requestId: uuid, ok: z.literal(true), result: TravelResultSchema }),
  z.strictObject({ schemaVersion: z.literal(1), requestId: uuid, ok: z.literal(false), error: z.strictObject({ code: z.enum(['INVALID_REQUEST','UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','NOT_AVAILABLE','RATE_LIMITED','INTERNAL_ERROR','WORLD_UNAVAILABLE','WORLD_VERSION_MISMATCH','ROOM_FULL','ALREADY_IN_ROOM','NOT_IN_ROOM','IDEMPOTENCY_CONFLICT']), retryable: z.boolean() }) }),
]);
export type TravelRequest = z.infer<typeof TravelRequestSchema>;
export type TravelResult = z.infer<typeof TravelResultSchema>;
export const OwnRoomSchema = z.strictObject({ schemaVersion: z.literal(1), snapshot: RoomSnapshotSchema.nullable(), worldVersion: WorldVersionSchema.nullable(), sceneVersion: WorldVersionSchema.nullable() }).refine(value => value.snapshot ? value.worldVersion !== null && value.sceneVersion !== null : value.worldVersion === null && value.sceneVersion === null);
