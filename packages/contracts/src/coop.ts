import {z} from 'zod';
export const CoopRulesetSchema=z.literal('arena8-coop-pve');
export const CoopRoomStatusSchema=z.enum(['OPEN','LOCKED','STARTED','CLOSED']);
export type CoopRoomStatus=z.infer<typeof CoopRoomStatusSchema>;
export const CoopPetIdSchema=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
export const CoopBossIdSchema=CoopPetIdSchema;
const requestId=z.uuid().transform(value=>value.toLowerCase());
const points=z.number().int().min(0).max(1_000_000),seatNumber=z.number().int().min(0).max(3);
const configVersion=z.number().int().positive().max(9_007_199_254_740_991);
const displayName=z.string().min(1).max(128);
export const CoopRoomSeatSchema=z.strictObject({
 seat:seatNumber,petId:CoopPetIdSchema.nullable(),petLevel:z.number().int().min(1).max(60).nullable(),ready:z.boolean(),you:z.boolean(),ownedPetInstanceId:z.uuid().nullable().default(null),
});
export const CoopRoomViewSchema=z.strictObject({
 roomId:z.uuid(),ruleset:CoopRulesetSchema,bossId:z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
 mapId:CoopPetIdSchema.nullable().optional(),status:CoopRoomStatusSchema,revision:z.number().int().nonnegative().max(2_147_483_647),
 configVersion,
 requiredPoints:points,createdAt:z.iso.datetime(),
 you:z.strictObject({seat:seatNumber.nullable(),isHost:z.boolean()}),
 seats:z.array(CoopRoomSeatSchema).max(4),
 canJoin:z.boolean(),canStart:z.boolean(),
});
export const CoopMapPrerequisiteSchema=z.strictObject({mapId:CoopPetIdSchema,mapName:displayName,cleared:z.boolean()});
const coopHosting=z.strictObject({
 bossId:CoopBossIdSchema,requiredPoints:points,eligible:z.boolean(),prerequisite:CoopMapPrerequisiteSchema.nullable().optional(),
});
export const CoopEligibilitySchema=coopHosting.extend({ruleset:CoopRulesetSchema,points});
const encounterId=z.string().regex(/^[a-z][a-z0-9-]{2,63}-(regular|boss)$/);
const coopEncounter=coopHosting.extend({
 mapId:CoopPetIdSchema,mapName:displayName,bossName:z.string().min(1),
 regularEncounterId:encounterId.nullable(),bossEncounterId:encounterId.nullable(),
 prerequisite:CoopMapPrerequisiteSchema.nullable(),
 recruitment:z.strictObject({regularPetIds:z.array(CoopPetIdSchema),legendaryPetId:CoopPetIdSchema.nullable()}).nullable(),
});
export const CoopEncounterCatalogSchema=z.strictObject({ruleset:CoopRulesetSchema,configVersion,points,encounters:z.array(coopEncounter).max(6)});
export const CoopCreateRoomSchema=z.strictObject({requestId,bossId:CoopBossIdSchema.optional(),mapId:CoopBossIdSchema.optional(),petId:CoopPetIdSchema.optional(),ownedPetInstanceId:z.uuid().optional()});
export const CoopJoinRoomSchema=z.strictObject({requestId,mapId:CoopPetIdSchema.optional()});
export const CoopSelectPetSchema=z.strictObject({requestId,petId:CoopPetIdSchema,ownedPetInstanceId:z.uuid().optional()});
export const CoopReadySchema=z.strictObject({requestId,ready:z.boolean()});
export const CoopRoomCommandSchema=z.strictObject({requestId});
export const CoopRoomParamsSchema=z.strictObject({roomId:z.uuid()});
export const CoopRewardReceiptSchema=z.strictObject({
 roomId:z.uuid(),matchId:z.uuid(),outcome:z.enum(['won','lost']),petId:CoopPetIdSchema,
 achievementPoints:points,coins:points,exp:points,materials:points,firstClear:z.boolean(),
});
export const CoopAdmissionCommandSchema=z.strictObject({});
export const CoopAdmissionViewSchema=z.strictObject({
 roomId:z.uuid(),bossId:CoopBossIdSchema,matchId:z.uuid(),bootId:z.uuid(),accountId:z.uuid(),seat:seatNumber,
 wssUrl:z.string().min(10).max(512),httpsOrigin:z.string().url(),
 ticket:z.string().min(20).max(8192),expiresAt:z.iso.datetime(),
 contentHash:z.string().regex(/^[a-f0-9]{64}$/),
});
export type CoopAdmissionView=z.infer<typeof CoopAdmissionViewSchema>;

export const CoopSkillLevelSchema=z.number().int().min(1).max(10);
export const CoopSkillIdSchema=z.string().min(1).max(64);
export const CoopSkillLevelBindingSchema=z.strictObject({skillId:CoopSkillIdSchema,level:CoopSkillLevelSchema.min(2)});
export const CoopSkillPetParamsSchema=z.strictObject({ownedPetInstanceId:z.uuid().transform(value=>value.toLowerCase())});
const skillConfigVersion=z.number().int().positive();
const skillConfigDigest=z.string().regex(/^[a-f0-9]{64}$/);
const skillMaterials=z.number().int().min(0).max(2_147_483_647);
export const CoopSkillUpgradeSchema=z.strictObject({
 requestId,skillId:CoopSkillIdSchema,expectedLevel:CoopSkillLevelSchema,expectedConfigVersion:skillConfigVersion,
});
export const CoopSkillProgressionSchema=z.strictObject({
 ownedPetInstanceId:z.uuid(),petId:CoopPetIdSchema,configVersion:skillConfigVersion,configDigest:skillConfigDigest,
 materials:skillMaterials,skills:z.array(z.strictObject({
  skillId:CoopSkillIdSchema,level:CoopSkillLevelSchema,effectiveLevel:CoopSkillLevelSchema,maxLevel:CoopSkillLevelSchema,
  nextMaterialCost:skillMaterials.nullable(),
 })).max(5),
});
export const CoopSkillUpgradeReceiptSchema=z.strictObject({
 ownedPetInstanceId:z.uuid(),skillId:CoopSkillIdSchema,level:CoopSkillLevelSchema,
 maxLevel:CoopSkillLevelSchema,spentMaterials:skillMaterials,remainingMaterials:skillMaterials,
 configVersion:skillConfigVersion,configDigest:skillConfigDigest,
});
export type CoopSkillLevelBinding=z.infer<typeof CoopSkillLevelBindingSchema>;
export type CoopSkillUpgrade=z.infer<typeof CoopSkillUpgradeSchema>;
