import {z} from 'zod';
export const CoopRulesetSchema=z.literal('arena8-coop-pve');
export const CoopRoomStatusSchema=z.enum(['OPEN','LOCKED','STARTED','CLOSED']);
export type CoopRoomStatus=z.infer<typeof CoopRoomStatusSchema>;
export const CoopPetIdSchema=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const requestId=z.uuid().transform(value=>value.toLowerCase());
const points=z.number().int().min(0).max(1_000_000),seatNumber=z.number().int().min(0).max(3);
export const CoopRoomSeatSchema=z.strictObject({
 seat:seatNumber,petId:CoopPetIdSchema.nullable(),petLevel:z.number().int().min(1).max(60).nullable(),ready:z.boolean(),you:z.boolean(),
});
export const CoopRoomViewSchema=z.strictObject({
 roomId:z.uuid(),ruleset:CoopRulesetSchema,bossId:z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
 status:CoopRoomStatusSchema,revision:z.number().int().nonnegative().max(2_147_483_647),
 configVersion:z.number().int().positive().max(9_007_199_254_740_991),
 requiredPoints:points,createdAt:z.iso.datetime(),
 you:z.strictObject({seat:seatNumber.nullable(),isHost:z.boolean()}),
 seats:z.array(CoopRoomSeatSchema).max(4),
 canJoin:z.boolean(),canStart:z.boolean(),
});
export const CoopEligibilitySchema=z.strictObject({
 ruleset:CoopRulesetSchema,bossId:z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),points,requiredPoints:points,eligible:z.boolean(),
});
export const CoopCreateRoomSchema=z.strictObject({requestId,petId:CoopPetIdSchema.optional()});
export const CoopJoinRoomSchema=z.strictObject({requestId});
export const CoopSelectPetSchema=z.strictObject({requestId,petId:CoopPetIdSchema});
export const CoopReadySchema=z.strictObject({requestId,ready:z.boolean()});
export const CoopRoomCommandSchema=z.strictObject({requestId});
export const CoopRoomParamsSchema=z.strictObject({roomId:z.uuid()});
