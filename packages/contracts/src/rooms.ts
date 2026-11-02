import { z } from 'zod';
import { WorldSlugSchema, WorldVersionSchema, SeatIdSchema } from './world';
import { PublicProfileSchema } from './profiles';

const CommandBase = z.strictObject({ schemaVersion: z.literal(1), requestId: z.uuid() });
export const RoomJoinSchema = CommandBase.extend({
  worldSlug: WorldSlugSchema, worldVersion: WorldVersionSchema, sceneVersion: WorldVersionSchema, roomId: z.uuid().optional(),
});
export const RoomOwnCommandSchema = CommandBase.extend({ epoch: z.uuid(), roomId: z.uuid(), membershipId: z.uuid() });
export const SeatClaimSchema = RoomOwnCommandSchema.extend({ seatId: SeatIdSchema });
export const SeatReleaseSchema = RoomOwnCommandSchema.extend({ seatId: SeatIdSchema });
export const RoomParticipantSchema = z.strictObject({ profile: PublicProfileSchema, seatId: SeatIdSchema.nullable(), state: z.enum(['active', 'reconnecting']) });
export const RoomSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1), type: z.literal('snapshot'), epoch: z.uuid(), roomId: z.uuid(), worldSlug: WorldSlugSchema,
  roomVersion: z.number().int().nonnegative(), capacity: z.number().int().min(1).max(100), occupancy: z.number().int().nonnegative().max(100),
  membershipId: z.uuid(), self: z.strictObject({ accountId: z.uuid(), seatId: SeatIdSchema.nullable() }),
  seats: z.array(z.strictObject({ seatId: SeatIdSchema, state: z.enum(['available', 'occupied', 'held']), mine: z.boolean() })).max(100),
  participants: z.array(RoomParticipantSchema).max(100),
}).refine(snapshot => snapshot.occupancy <= snapshot.capacity
  && new Set(snapshot.seats.map(seat => seat.seatId)).size === snapshot.seats.length
  && snapshot.seats.filter(seat => seat.mine).length === (snapshot.self.seatId ? 1 : 0)
  && snapshot.seats.every(seat => !seat.mine || (seat.seatId === snapshot.self.seatId && seat.state !== 'available')), 'Inconsistent authoritative room snapshot');
export const RoomDeltaSchema = z.strictObject({ schemaVersion: z.literal(1), type: z.literal('delta'), fromVersion: z.number().int().nonnegative(), state: RoomSnapshotSchema })
  .refine(delta => delta.state.roomVersion >= delta.fromVersion, 'Delta cannot precede its base');
export const RoomLeftSchema = z.strictObject({ schemaVersion: z.literal(1), type: z.literal('left'), epoch: z.uuid(), roomId: z.uuid() });
export const RoomEndedSchema = z.strictObject({ schemaVersion: z.literal(1), epoch: z.uuid(), roomId: z.uuid(), reason: z.enum(['left', 'disconnected', 'world-unavailable', 'server-stopping']) });
export const RoomAckSchema = z.discriminatedUnion('ok', [
  z.strictObject({ schemaVersion: z.literal(1), requestId: z.uuid(), ok: z.literal(true), result: z.union([RoomSnapshotSchema, RoomLeftSchema]) }),
  z.strictObject({ schemaVersion: z.literal(1), requestId: z.uuid(), ok: z.literal(false), error: z.strictObject({ code: z.enum(['INVALID_REQUEST', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR', 'WORLD_UNAVAILABLE', 'WORLD_VERSION_MISMATCH', 'ROOM_FULL', 'ALREADY_IN_ROOM', 'NOT_IN_ROOM', 'IDEMPOTENCY_CONFLICT', 'SEAT_TAKEN', 'ALREADY_SEATED']), retryable: z.boolean() }) }),
]);
export const RoomsListSchema = z.strictObject({ schemaVersion: z.literal(1), rooms: z.array(z.strictObject({ roomId: z.uuid(), capacity: z.number().int().min(1).max(100), occupancy: z.number().int().nonnegative().max(100) })).max(32) });
export type RoomJoin = z.infer<typeof RoomJoinSchema>;
export type RoomOwnCommand = z.infer<typeof RoomOwnCommandSchema>;
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
export type RoomEnded = z.infer<typeof RoomEndedSchema>;
export type RoomAck = z.infer<typeof RoomAckSchema>;
export type SeatClaim = z.infer<typeof SeatClaimSchema>;
export type SeatRelease = z.infer<typeof SeatReleaseSchema>;
export type RoomDelta = z.infer<typeof RoomDeltaSchema>;
