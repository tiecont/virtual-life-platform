import { z } from 'zod';
import { AvatarKeySchema, PublicProfileSchema } from './profiles';
export * from './profiles';
export * from './world';
export * from './rooms';
export * from './protocol';
export * from './scene';
export * from './avatar';
export * from './safety';
export * from './chat';
// Foundation status only. World/session/room schemas belong to their gated modules.
export const SCHEMA_VERSION = 1 as const;
export const LivenessSchema = z.strictObject({ status: z.literal('ok') });
export const ReadinessSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), schemaVersion: z.literal(SCHEMA_VERSION) }),
  z.strictObject({ status: z.literal('unavailable') }),
]);
export const ApiErrorSchema = z.strictObject({ error: z.strictObject({
  code: z.enum(['FORBIDDEN', 'NOT_FOUND', 'INVALID_REQUEST', 'INTERNAL_ERROR', 'UNAUTHENTICATED', 'RATE_LIMITED', 'IDEMPOTENCY_CONFLICT', 'NAME_UNAVAILABLE', 'NOT_AVAILABLE', 'SAFETY_UNAVAILABLE', 'WORLD_UNAVAILABLE', 'WORLD_VERSION_MISMATCH', 'ROOM_FULL', 'ALREADY_IN_ROOM', 'NOT_IN_ROOM', 'SEAT_TAKEN', 'ALREADY_SEATED']),
  message: z.string(), requestId: z.uuid(),
}) });
export type Readiness = z.infer<typeof ReadinessSchema>;

export const DisplayNameSchema = z.string().normalize('NFKC').trim().transform(n => n.replace(/\s+/gu, ' ')).pipe(z.string().min(2).max(24)
  .regex(/^[\p{L}\p{N} ._-]+$/u).refine(n => !['admin', 'system', 'moderator', 'support'].includes(n.toLowerCase())));
export const ProfileInputSchema = z.strictObject({ displayName: DisplayNameSchema, avatarKey: AvatarKeySchema });
export const GuestInputSchema = ProfileInputSchema.extend({ requestId: z.uuid() });
export const MeSchema = z.strictObject({ profile: PublicProfileSchema, kind: z.enum(['guest', 'registered']), expiresAt: z.iso.datetime(), csrfToken: z.string().regex(/^[a-f0-9]{64}$/) });
export const VisibilitySchema = z.enum(['hidden', 'friends', 'public']);
export const PrivacySchema = z.strictObject({
  presence: VisibilitySchema,
  analyticsConsent: z.boolean(),
  worldVisibility: z.strictObject({ deadline: VisibilitySchema.optional(), maid: VisibilitySchema.optional(), library: VisibilitySchema.optional(), restaurant: VisibilitySchema.optional(), lounge: VisibilitySchema.optional(), dating: z.literal('hidden').optional(), park: VisibilitySchema.optional() }),
});
export type Me = z.infer<typeof MeSchema>;
export type Privacy = z.infer<typeof PrivacySchema>;
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export const ProfilePatchSchema = ProfileInputSchema.partial().refine(value => Object.keys(value).length > 0);

export const LoginNameSchema = z.string().normalize('NFKC').trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,31}$/);
export const UpgradeInputSchema = z.strictObject({ loginName: LoginNameSchema, password: z.string().min(12).max(128) });
export const LoginInputSchema = UpgradeInputSchema.extend({ requestId: z.uuid() });
export type UpgradeInput = z.infer<typeof UpgradeInputSchema>;
// Identity transport only; room/world envelopes remain owned by M05/M06/M09.
export const SessionHandshakeSchema = z.strictObject({ schemaVersion: z.literal(1), csrfToken: z.string().regex(/^[a-f0-9]{64}$/) });
export const SessionCheckSchema = z.strictObject({ schemaVersion: z.literal(1), requestId: z.uuid() });
export const SessionCheckAckSchema = z.discriminatedUnion('ok', [
  z.strictObject({ schemaVersion: z.literal(1), requestId: z.uuid(), ok: z.literal(true), result: z.strictObject({ accountId: z.uuid(), kind: z.enum(['guest', 'registered']) }) }),
  z.strictObject({ schemaVersion: z.literal(1), requestId: z.uuid(), ok: z.literal(false), error: z.strictObject({ code: z.enum(['INVALID_REQUEST', 'UNAUTHENTICATED', 'RATE_LIMITED', 'INTERNAL_ERROR']), retryable: z.boolean() }) }),
]);

export type ApiErrorCode = z.infer<typeof ApiErrorSchema>['error']['code'];
export const ContactCodeSchema = z.string().trim().toUpperCase().regex(/^VL-[A-F0-9]{32}$/);
export const FriendRequestStateSchema = z.enum(['PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED']);
export const FriendRequestInputSchema = z.strictObject({ contactCode: ContactCodeSchema });
export const FriendRespondSchema = z.strictObject({ action: z.enum(['accept','decline','cancel']) });
export const BlockInputSchema = z.strictObject({ targetId: z.uuid().transform(id => id.toLowerCase()), blocked: z.boolean() });
export const SocialSettingsInputSchema = z.strictObject({ requestPolicy: z.enum(['code','none']) });
export const SocialSettingsSchema = SocialSettingsInputSchema.extend({ schemaVersion: z.literal(1), contactCode: ContactCodeSchema });
export const FriendRequestResultSchema = z.strictObject({ schemaVersion: z.literal(1), id: z.uuid(), state: FriendRequestStateSchema, expiresAt: z.iso.datetime() });
export const SocialPageSchema = z.strictObject({ cursor: z.uuid().transform(id => id.toLowerCase()).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
export const SharedActivitySchema = z.strictObject({ worldSlug: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/) });
export const FriendsPageSchema = z.strictObject({ schemaVersion: z.literal(1), items: z.array(z.strictObject({ profile: PublicProfileSchema, activity: SharedActivitySchema.nullable() })), nextCursor: z.uuid().nullable() });
export type SharedActivity = z.infer<typeof SharedActivitySchema>;
export type SocialSettings = z.infer<typeof SocialSettingsSchema>;
export type FriendRequestResult = z.infer<typeof FriendRequestResultSchema>;

export const SocialRequestsPageSchema = z.strictObject({ schemaVersion: z.literal(1), items: z.array(FriendRequestResultSchema.extend({ direction: z.enum(['incoming','outgoing']), sender: PublicProfileSchema.nullable(), codeHint: z.string().nullable() })), nextCursor: z.uuid().nullable() });
export const BlocksPageSchema = z.strictObject({ schemaVersion: z.literal(1), items: z.array(z.strictObject({ targetId: z.uuid(), label: z.string().nullable() })) });

export type FriendsPage = z.infer<typeof FriendsPageSchema>;
export type SocialRequestsPage = z.infer<typeof SocialRequestsPageSchema>;
export type BlocksPage = z.infer<typeof BlocksPageSchema>;
export * from './reports';
export * from './sanctions';
export * from './moderation';
export * from './travel';
export * from './invitations';
export * from './focus';
export * from './hospitality';
export * from './events';
export * from './discovery';
export * from './study';
export * from './reservations';
export * from './progression';
export * from './stage';
export * from './audience';
export * from './media';
export * from './dating-policy';
export * from './dating-profile';
export * from './dating-match';
export * from './dating-date';
export * from './dating-continuation';
export * from './legacy-identity';
