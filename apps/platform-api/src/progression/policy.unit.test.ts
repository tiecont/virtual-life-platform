import { expect, it } from 'vitest';
import { ProgressionPolicySchema, RewardObservationSchema } from '@virtual-city/contracts';
import { DEFAULT_PROGRESSION_POLICY, assessReward } from './policy';
const id = '7233ef20-8ff6-4ed8-a493-7dff1d465001', partner = '7233ef20-8ff6-4ed8-a493-7dff1d465002';
const now = Date.parse('2026-11-03T12:00:00.000Z'), event = { schemaVersion: 1 as const, accountId: id, sourceId: id, worldSlug: 'deadline' as const, kind: 'focus-completed' as const, completedAt: new Date(now).toISOString() };
const usage = { day: '2026-11-03', accountXp: 0, worldXp: 0, partnerCompletions: 0, lastAt: null as number | null };
const enabled = () => ({ ...structuredClone(DEFAULT_PROGRESSION_POLICY), enabled: true });
it('defaults to no rewards and enables only reviewed completion kinds per world', () => {
  expect(assessReward(DEFAULT_PROGRESSION_POLICY, event, usage, now, true)).toEqual({ allowed: false, reason: 'disabled' });
  expect(assessReward(enabled(), event, usage, now, true)).toEqual({ allowed: true, xp: 2, day: '2026-11-03' });
  for (const worldSlug of ['park','dating'] as const) expect(assessReward(enabled(), { ...event, worldSlug }, usage, now, true).allowed).toBe(false);
  expect(assessReward(enabled(), { ...event, worldSlug: 'maid' }, usage, now, true).allowed).toBe(false);
});
it('caps account/day, world/day and repeated hospitality partners, with no partial grant', () => {
  for (const changed of [{ accountXp: 19 }, { accountXp: 20 }, { worldXp: 9 }, { worldXp: 10 }]) expect(assessReward(enabled(), event, { ...usage, ...changed }, now, true).allowed).toBe(false);
  const service = { ...event, worldSlug: 'maid' as const, kind: 'hospitality-completed' as const, partnerId: partner };
  expect(assessReward(enabled(), service, usage, now, true).allowed).toBe(true);
  expect(assessReward(enabled(), service, { ...usage, partnerCompletions: 2 }, now, true).allowed).toBe(false);
  expect(assessReward(enabled(), { ...service, partnerId: id }, usage, now, true).allowed).toBe(false);
});
it('rejects forged amount/social actions/unknown worlds, unsafe budgets and policy switches', () => {
  for (const extra of [{ amount: 999 }, { role: 'moderator' }, { paidTip: 1 }]) expect(RewardObservationSchema.safeParse({ ...event, ...extra }).success).toBe(false);
  for (const kind of ['message-sent','friend-added','date-matched','online-seconds','tip']) expect(RewardObservationSchema.safeParse({ ...event, kind }).success).toBe(false);
  expect(RewardObservationSchema.safeParse({ ...event, worldSlug: 'unknown' }).success).toBe(false);
  for (const patch of [{ tradable: true }, { monetaryValue: true }, { publicLeaderboard: true }, { accountDailyXp: 100000 }]) expect(ProgressionPolicySchema.safeParse({ ...enabled(), ...patch }).success).toBe(false);
  const bad = enabled(); bad.worlds.dating.kinds = ['focus-completed']; expect(ProgressionPolicySchema.safeParse(bad).success).toBe(false);
});
it('uses the completion UTC day, current safety, bounded lateness and cooldown instead of client clock', () => {
  expect(assessReward(enabled(), event, usage, now, false).allowed).toBe(false);
  expect(assessReward(enabled(), event, { ...usage, day: '2026-11-04' }, now, true).allowed).toBe(false);
  expect(assessReward(enabled(), event, { ...usage, lastAt: now - 59999 }, now, true).allowed).toBe(false);
  expect(assessReward(enabled(), event, { ...usage, lastAt: now - 60000 }, now, true).allowed).toBe(true);
  expect(assessReward(enabled(), event, usage, now - 1, true).allowed).toBe(false); expect(assessReward(enabled(), event, usage, now + 86400001, true).allowed).toBe(false);
  expect(() => assessReward(enabled(), event, { ...usage, accountXp: -1 }, now, true)).toThrow();
});
