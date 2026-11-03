import { z } from 'zod';
import { WorldSlugSchema, WorldVersionSchema } from './world-primitives';

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
