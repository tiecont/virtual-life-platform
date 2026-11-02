import { z } from 'zod';
// Foundation status only. World/session/room schemas belong to their gated modules.
export const SCHEMA_VERSION = 1 as const;
export const LivenessSchema = z.strictObject({ status: z.literal('ok') });
export const ReadinessSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), schemaVersion: z.literal(SCHEMA_VERSION) }),
  z.strictObject({ status: z.literal('unavailable') }),
]);
export const ApiErrorSchema = z.strictObject({ error: z.strictObject({
  code: z.enum(['FORBIDDEN', 'NOT_FOUND', 'INVALID_REQUEST', 'INTERNAL_ERROR', 'UNAUTHENTICATED', 'RATE_LIMITED', 'IDEMPOTENCY_CONFLICT', 'NAME_UNAVAILABLE']),
  message: z.string(), requestId: z.uuid(),
}) });
export type Readiness = z.infer<typeof ReadinessSchema>;

export const AvatarKeySchema = z.enum(['fern', 'amber', 'indigo', 'rose', 'cloud', 'cocoa', 'mint', 'plum']);
export const DisplayNameSchema = z.string().normalize('NFKC').trim().transform(n => n.replace(/\s+/gu, ' ')).pipe(z.string().min(2).max(24)
  .regex(/^[\p{L}\p{N} ._-]+$/u).refine(n => !['admin', 'system', 'moderator', 'support'].includes(n.toLowerCase())));
export const ProfileInputSchema = z.strictObject({ displayName: DisplayNameSchema, avatarKey: AvatarKeySchema });
export const GuestInputSchema = ProfileInputSchema.extend({ requestId: z.uuid() });
export const PublicProfileSchema = z.strictObject({ id: z.uuid(), displayName: z.string(), avatarKey: AvatarKeySchema });
export const MeSchema = z.strictObject({ profile: PublicProfileSchema, kind: z.enum(['guest', 'registered']), expiresAt: z.iso.datetime(), csrfToken: z.string().regex(/^[a-f0-9]{64}$/) });
export const VisibilitySchema = z.enum(['hidden', 'friends', 'public']);
export const PrivacySchema = z.strictObject({
  presence: VisibilitySchema,
  analyticsConsent: z.boolean(),
  worldVisibility: z.strictObject({ deadline: VisibilitySchema.optional(), maid: VisibilitySchema.optional(), library: VisibilitySchema.optional(), restaurant: VisibilitySchema.optional(), lounge: VisibilitySchema.optional(), dating: z.literal('hidden').optional(), park: VisibilitySchema.optional() }),
});
export type Me = z.infer<typeof MeSchema>;
export type PublicProfile = z.infer<typeof PublicProfileSchema>;
export type Privacy = z.infer<typeof PrivacySchema>;
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export const ProfilePatchSchema = ProfileInputSchema.partial().refine(value => Object.keys(value).length > 0);

export const LoginNameSchema = z.string().normalize('NFKC').trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,31}$/);
export const UpgradeInputSchema = z.strictObject({ loginName: LoginNameSchema, password: z.string().min(12).max(128) });
export const LoginInputSchema = UpgradeInputSchema.extend({ requestId: z.uuid() });
export type UpgradeInput = z.infer<typeof UpgradeInputSchema>;
