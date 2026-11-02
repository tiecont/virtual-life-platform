import { it, expect } from 'vitest';
import { AdmissionPolicy, canViewPresence } from '../src/identity/policy';
import { WindowLimiter } from '../src/identity/limits';
it('unknown-age/self-attested/forged-role accounts cannot bypass default restricted admission', async () => {
  const policy = new AdmissionPolicy();
  const context = { accountId: 'server-issued', sessionId: 'server-session', expiresAt: Date.now() + 10000, kind: 'guest' as const, age: 99, role: 'moderator' };
  expect(await policy.permits(context, { enabled: true, restricted: true, requiresAdult: true })).toBe(false);
  expect(await policy.permits(context, { enabled: false, restricted: false, requiresAdult: false })).toBe(false);
  expect(await policy.permits(null, { enabled: true, restricted: false, requiresAdult: false })).toBe(false);
  expect(await policy.permits(context, { enabled: true, restricted: false, requiresAdult: false })).toBe(true);
  expect(await policy.permits({ ...context, kind: 'registered' }, { enabled: true, restricted: true, requiresAdult: true })).toBe(false);
  const reviewed = new AdmissionPolicy({ hasReviewedProof: async () => true });
  expect(await reviewed.permits(context, { enabled: true, restricted: true, requiresAdult: true })).toBe(false);
  expect(await reviewed.permits(context, { enabled: true, restricted: true, requiresAdult: true, restrictedAccessApproved: true })).toBe(true);
});
it('world privacy, bilateral blocks, friendship and dating isolation filter presence', () => {
  const privacy = { presence: 'public' as const, analyticsConsent: false, worldVisibility: { deadline: 'friends' as const, dating: 'hidden' as const } };
  expect(canViewPresence('a', 'b', 'unknown-private-world', privacy, { blocked: false, friends: true })).toBe(false);
  expect(canViewPresence('a', 'b', 'dating', privacy, { blocked: false, friends: true })).toBe(false);
  expect(canViewPresence('a', 'b', 'maid', privacy, { blocked: true, friends: true })).toBe(false);
  expect(canViewPresence('a', 'b', 'deadline', privacy, { blocked: false, friends: false })).toBe(false);
  expect(canViewPresence('a', 'b', 'deadline', privacy, { blocked: false, friends: true })).toBe(true);
  expect(canViewPresence('b', 'b', 'dating', privacy, { blocked: false, friends: false })).toBe(true);
});
it('rate windows expire and key saturation fails closed without unbounded growth', () => {
  let now = 0; const limits = new WindowLimiter(() => now, 2);
  expect(limits.take('a', 1, 10)).toBe(true); expect(limits.take('a', 1, 10)).toBe(false);
  expect(limits.take('b', 1, 10)).toBe(true); expect(limits.take('c', 1, 10)).toBe(false);
  now = 11; expect(limits.take('c', 1, 10)).toBe(true);
});
