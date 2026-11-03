import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { SafetyPolicySchema, SafetyCategorySchema } from '../src/safety';

const input = JSON.parse(readFileSync('config/safety-policy.json', 'utf8'));
it('validates complete product contexts, categories, escalation and bounded confidential retention defaults', () => {
  const policy = SafetyPolicySchema.parse(input);
  expect(Object.keys(policy.categories)).toHaveLength(SafetyCategorySchema.options.length);
  expect(policy.contexts.dating).toMatchObject({ reviewedAdultRequired: true, discloseActivity: false, audience: 'isolated-session' });
  expect(policy.contexts.deadline.mode).toBe('silent'); expect(policy.defaults.chatEnabled).toBe(false);
  expect(policy.escalation.operator).toBe('unassigned'); expect(policy.approval.retentionReviewed).toBe(false);
  const closed = structuredClone(input); closed.contexts.dating = { ...closed.contexts.dating, mode: 'silent', audience: 'none', fallback: 'deny', cannedIds: [] }; closed.contexts.lounge.media = 'none';
  expect(SafetyPolicySchema.safeParse(closed).success).toBe(true);
});
it('rejects unsafe fallback, reporter disclosure, auto-sanctions, retained raw chat and restricted-world bypasses', () => {
  const changes = [
    (value: typeof input) => { value.contexts.maid.fallback = 'allow'; },
    (value: typeof input) => { value.defaults.reporterIdentityPublic = true; },
    (value: typeof input) => { value.defaults.unreviewedClassifierSanctions = true; },
    (value: typeof input) => { value.defaults.rawChatRetentionHours = 1; },
    (value: typeof input) => { value.contexts.dating.discloseActivity = true; },
    (value: typeof input) => { value.contexts.dating.reviewedAdultRequired = false; },
    (value: typeof input) => { value.contexts.lounge.liveOperatorRequired = false; },
    (value: typeof input) => { value.contexts.deadline.mode = 'moderated'; },
    (value: typeof input) => { value.sanctions.permanentBanRequiresIndependentReview = false; },
    (value: typeof input) => { value.evidence.assignedCaseAccessOnly = false; },
    (value: typeof input) => { value.sanctions.maxTemporaryPlatformBanHours = 721; },
    (value: typeof input) => { value.draftRetentionHours.reportEvidence = 721; },
    (value: typeof input) => { value.severities.critical.triageTargetMinutes = 10080; },
    (value: typeof input) => { delete value.categories['child-safety']; },
    (value: typeof input) => { delete value.contexts.park; },
  ];
  for (const change of changes) { const value = structuredClone(input); change(value); expect(SafetyPolicySchema.safeParse(value).success).toBe(false); }
});
