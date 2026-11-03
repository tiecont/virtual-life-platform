import { z } from 'zod';
export const ProgressionWorldSchema = z.enum(['deadline','maid','library','restaurant','lounge','park','dating']);
export const RewardKindSchema = z.enum(['focus-completed','hospitality-completed']);
const rule = z.strictObject({ kinds: z.array(RewardKindSchema).max(2).refine(items => new Set(items).size === items.length), xp: z.number().int().min(1).max(2), dailyXp: z.number().int().min(0).max(10) });
export const ProgressionPolicySchema = z.strictObject({
  schemaVersion: z.literal(1), version: z.literal('1.0.0'), enabled: z.boolean(), accountDailyXp: z.number().int().min(1).max(20),
  partnerDailyCompletions: z.number().int().min(1).max(2), cooldownSeconds: z.number().int().min(60).max(3600), maxObservationAgeSeconds: z.number().int().min(1).max(86400),
  tradable: z.literal(false), monetaryValue: z.literal(false), publicLeaderboard: z.literal(false),
  worlds: z.strictObject({ deadline: rule, maid: rule, library: rule, restaurant: rule, lounge: rule, park: rule, dating: rule }),
  cosmetics: z.tuple([z.strictObject({ key: z.literal('casual'), lifetimeXp: z.literal(0) }), z.strictObject({ key: z.literal('cafe-apron'), lifetimeXp: z.number().int().min(10).max(100) })]),
}).superRefine((policy, ctx) => {
  const permitted: Record<z.infer<typeof ProgressionWorldSchema>, readonly z.infer<typeof RewardKindSchema>[]> = { deadline: ['focus-completed'], library: ['focus-completed'], maid: ['hospitality-completed'], restaurant: ['hospitality-completed'], lounge: ['hospitality-completed'], park: [], dating: [] };
  for (const world of ProgressionWorldSchema.options) {
    const value = policy.worlds[world]; if (value.kinds.some(kind => !permitted[world].includes(kind)) || value.dailyXp > policy.accountDailyXp || !value.kinds.length && value.dailyXp !== 0 || value.kinds.length && value.dailyXp < value.xp) ctx.addIssue({ code: 'custom', path: ['worlds',world], message: 'Unsupported or inconsistent completion reward policy' });
  }
});
export type ProgressionPolicy = z.infer<typeof ProgressionPolicySchema>;
export const RewardObservationSchema = z.strictObject({ schemaVersion: z.literal(1), accountId: z.uuid(), sourceId: z.uuid(), worldSlug: ProgressionWorldSchema, kind: RewardKindSchema, completedAt: z.iso.datetime(), partnerId: z.uuid().optional() });
export type RewardObservation = z.infer<typeof RewardObservationSchema>;
export const ProgressionClaimFocusSchema = z.strictObject({ schemaVersion: z.literal(1), focusId: z.uuid() });
export const CosmeticsInventorySchema = z.strictObject({ schemaVersion:z.literal(1),enabled:z.boolean(),items:z.array(z.strictObject({key:z.enum(['casual','cafe-apron']),requiredXp:z.number().int().nonnegative(),owned:z.boolean()})).length(2) });
export const ProgressionViewSchema = z.strictObject({ schemaVersion: z.literal(1), enabled: z.boolean(), lifetimeXp: z.number().int().nonnegative(), entitlements: z.array(z.enum(['casual','cafe-apron'])).max(2), history: z.array(z.strictObject({ id: z.uuid(), kind: RewardKindSchema, worldSlug: ProgressionWorldSchema, xp: z.number().int().min(1).max(2), completedAt: z.iso.datetime() })).max(100), truncated: z.boolean() });
