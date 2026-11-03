import { z } from 'zod';
import { WorldSlugSchema } from './world-primitives';

export const SafetyCategorySchema = z.enum(['harassment', 'hate', 'threats', 'sexual-content', 'child-safety', 'privacy', 'impersonation', 'spam', 'media-rights', 'staff-abuse', 'consent-violation', 'self-harm']);
export const SafetySeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const SafetySanctionSchema = z.enum(['warn', 'mute', 'room-eject', 'world-ban', 'platform-ban']);
export const CannedMessageIdSchema = z.enum(['hello', 'thanks', 'need-help', 'bye']);
const unique = <T>(values: T[]) => new Set(values).size === values.length;
export const WorldContentRuleSchema = z.strictObject({
  mode: z.enum(['silent', 'canned', 'moderated']), fallback: z.enum(['deny', 'canned-only']),
  audience: z.enum(['none', 'room', 'isolated-session']), cannedIds: z.array(CannedMessageIdSchema).max(4).refine(unique),
  liveOperatorRequired: z.boolean(), reviewedAdultRequired: z.boolean(), discloseActivity: z.boolean(),
  media: z.enum(['none', 'original-visual-only']),
}).superRefine((rule, context) => {
  if (rule.mode === 'silent' && (rule.audience !== 'none' || rule.cannedIds.length || rule.fallback !== 'deny')) context.addIssue({ code: 'custom', message: 'Silent contexts have no outbound channel' });
  if ((rule.mode === 'canned' || rule.fallback === 'canned-only') && !rule.cannedIds.length) context.addIssue({ code: 'custom', message: 'Canned delivery requires a bounded approved vocabulary' });
  if (rule.mode !== 'silent' && rule.audience === 'none') context.addIssue({ code: 'custom', message: 'A delivery mode must declare its scoped audience' });
});
export const SafetyPolicySchema = z.strictObject({
  schemaVersion: z.literal(1), policyVersion: z.literal('1.0.0'),
  approval: z.strictObject({ publicRelease: z.literal(false), operatorCoverageApproved: z.literal(false), retentionReviewed: z.literal(false) }),
  defaults: z.strictObject({ chatEnabled: z.literal(false), unsolicitedDm: z.literal(false), rawChatRetentionHours: z.literal(0), reporterIdentityPublic: z.literal(false), unreviewedClassifierSanctions: z.literal(false), unlicensedMedia: z.literal(false) }),
  contexts: z.record(WorldSlugSchema, WorldContentRuleSchema).refine(contexts => Object.keys(contexts).length <= 32),
  categories: z.record(SafetyCategorySchema, z.strictObject({ defaultSeverity: SafetySeveritySchema, humanReviewRequired: z.literal(true) })),
  severities: z.record(SafetySeveritySchema, z.strictObject({ triageTargetMinutes: z.number().int().min(1).max(10080), allowedSanctions: z.array(SafetySanctionSchema).min(1).max(5).refine(unique) })),
  sanctions: z.strictObject({ reasonRequired: z.literal(true), evidenceReferenceRequired: z.literal(true), appealReceiptRequired: z.literal(true), permanentBanRequiresIndependentReview: z.literal(true), staffRoleFromClient: z.literal(false), maxMuteHours: z.number().int().min(1).max(168), maxWorldBanHours: z.number().int().min(1).max(720), maxTemporaryPlatformBanHours: z.number().int().min(1).max(720) }),
  draftRetentionHours: z.strictObject({ rejectedText: z.literal(0), reportEvidence: z.number().int().min(1).max(720), caseMetadata: z.number().int().min(1).max(2160), auditMetadata: z.number().int().min(1).max(4320), appealMetadata: z.number().int().min(1).max(2160) }),
  evidence: z.strictObject({ maxMessageReferences: z.number().int().min(1).max(5), maxReporterNoteChars: z.number().int().min(1).max(1000), encryptedAtRestRequired: z.literal(true), assignedCaseAccessOnly: z.literal(true), rawEvidenceInLogs: z.literal(false), legalHoldReviewDays: z.number().int().min(1).max(30) }),
  appeals: z.strictObject({ windowDays: z.number().int().min(1).max(90), reviewTargetHours: z.number().int().min(1).max(168), independentReviewerRequired: z.literal(true), contact: z.null() }),
  escalation: z.strictObject({ operator: z.literal('unassigned'), safetyLead: z.literal('unassigned'), privacyOwner: z.literal('unassigned'), automaticExternalMessages: z.literal(false) }),
}).superRefine((policy, context) => {
  for (const slug of ['portal', 'sdk-sandbox', 'deadline', 'maid', 'library', 'restaurant', 'lounge', 'dating', 'park']) if (!policy.contexts[slug]) context.addIssue({ code: 'custom', path: ['contexts', slug], message: 'Required product context missing' });
  for (const slug of ['portal', 'deadline', 'library']) if (policy.contexts[slug]?.mode !== 'silent') context.addIssue({ code: 'custom', path: ['contexts', slug], message: 'This context remains silent' });
  const dating = policy.contexts.dating;
  if (dating && (!dating.reviewedAdultRequired || !dating.liveOperatorRequired || dating.discloseActivity || (dating.mode !== 'silent' && dating.audience !== 'isolated-session'))) context.addIssue({ code: 'custom', path: ['contexts', 'dating'], message: 'Dating must remain adult-reviewed, staffed and isolated' });
  if (policy.contexts.lounge && !policy.contexts.lounge.liveOperatorRequired) context.addIssue({ code: 'custom', path: ['contexts', 'lounge'], message: 'Lounge requires staffed original visuals or no media' });
  const targets = SafetySeveritySchema.options.map(severity => policy.severities[severity].triageTargetMinutes);
  if (targets.some((target, index) => index > 0 && target > targets[index - 1])) context.addIssue({ code: 'custom', path: ['severities'], message: 'Higher severity cannot have a slower triage target' });
  if (policy.categories['child-safety'].defaultSeverity !== 'critical' || policy.categories.threats.defaultSeverity !== 'critical') context.addIssue({ code: 'custom', path: ['categories'], message: 'Child safety and threats require critical triage' });
});
export type SafetyPolicy = z.infer<typeof SafetyPolicySchema>;
export type WorldContentRule = z.infer<typeof WorldContentRuleSchema>;
