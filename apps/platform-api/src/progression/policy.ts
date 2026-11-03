import { z } from 'zod';
import { ProgressionPolicySchema, RewardObservationSchema, type ProgressionPolicy } from '@virtual-city/contracts';
const focus = { kinds: ['focus-completed'], xp: 2, dailyXp: 10 }, service = { kinds: ['hospitality-completed'], xp: 2, dailyXp: 10 }, none = { kinds: [], xp: 2, dailyXp: 0 };
export const DEFAULT_PROGRESSION_POLICY: ProgressionPolicy = ProgressionPolicySchema.parse({ schemaVersion: 1, version: '1.0.0', enabled: false, accountDailyXp: 20, partnerDailyCompletions: 2, cooldownSeconds: 60, maxObservationAgeSeconds: 86400, tradable: false, monetaryValue: false, publicLeaderboard: false, worlds: { deadline: focus, library: focus, maid: service, restaurant: service, lounge: service, park: none, dating: none }, cosmetics: [{ key: 'casual', lifetimeXp: 0 }, { key: 'cafe-apron', lifetimeXp: 10 }] });
const usageSchema = z.strictObject({ day: z.iso.date(), accountXp: z.number().int().nonnegative().max(1000000), worldXp: z.number().int().nonnegative().max(1000000), partnerCompletions: z.number().int().nonnegative().max(1000000), lastAt: z.number().int().nonnegative().max(8640000000000000).nullable() });
export type RewardDecision = { allowed: true; xp: number; day: string } | { allowed: false; reason: 'disabled' | 'restricted' | 'unsupported' | 'time' | 'cap' | 'partner' | 'cooldown' };
// Trusted server/ledger inputs only. No public endpoint accepts observations or usage.
export function assessReward(rawPolicy: unknown, rawEvent: unknown, rawUsage: unknown, now: number, eligible: boolean): RewardDecision {
  const policy = ProgressionPolicySchema.parse(rawPolicy), event = RewardObservationSchema.parse(rawEvent), usage = usageSchema.parse(rawUsage), rule = policy.worlds[event.worldSlug];
  if (!policy.enabled) return { allowed: false, reason: 'disabled' };
  if (!eligible) return { allowed: false, reason: 'restricted' };
  if (!rule.kinds.includes(event.kind)) return { allowed: false, reason: 'unsupported' };
  const at = Date.parse(event.completedAt), day = new Date(at).toISOString().slice(0,10);
  if (!Number.isSafeInteger(now) || now < at || now - at > policy.maxObservationAgeSeconds * 1000 || usage.day !== day || usage.lastAt !== null && usage.lastAt > at) return { allowed: false, reason: 'time' };
  if (usage.accountXp + rule.xp > policy.accountDailyXp || usage.worldXp + rule.xp > rule.dailyXp) return { allowed: false, reason: 'cap' };
  if (event.kind === 'hospitality-completed' && (!event.partnerId || event.partnerId === event.accountId || usage.partnerCompletions >= policy.partnerDailyCompletions)) return { allowed: false, reason: 'partner' };
  if (usage.lastAt !== null && at - usage.lastAt < policy.cooldownSeconds * 1000) return { allowed: false, reason: 'cooldown' };
  return { allowed: true, xp: rule.xp, day };
}
