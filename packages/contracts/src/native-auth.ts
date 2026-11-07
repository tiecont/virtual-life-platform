import {z} from 'zod';
import {ClientProtocolOfferSchema,NegotiatedSessionSchema} from './compatibility';

// Android v1 only. Platform/build claims are compatibility metadata,not device
// attestation,identity,entitlement or permission to enter a world.
export const NATIVE_ANDROID_ORIGIN='https://localhost' as const;
export const NativeClientSchema=z.strictObject({schemaVersion:z.literal(1),platform:z.literal('android'),clientBuild:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),protocol:ClientProtocolOfferSchema});
export const NativeDeviceLabelSchema=z.string().normalize('NFKC').trim().min(2).max(48).regex(/^[\p{L}\p{N} ._()-]+$/u);
export const NativeAccessTokenSchema=z.string().regex(/^na1\.[a-f0-9]{64}$/);
export const NativeRefreshTokenSchema=z.string().regex(/^nr1\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.[a-f0-9]{64}$/);
export const NativeSocketTicketSchema=z.string().regex(/^nt1\.[a-f0-9]{64}$/);
export const NativeTokensSchema=z.strictObject({deviceId:z.uuid(),accessToken:NativeAccessTokenSchema,accessExpiresAt:z.iso.datetime(),refreshToken:NativeRefreshTokenSchema,refreshExpiresAt:z.iso.datetime()});
export const NativeRefreshInputSchema=NativeClientSchema.extend({refreshToken:NativeRefreshTokenSchema});
export const NativeLogoutInputSchema=z.strictObject({schemaVersion:z.literal(1),refreshToken:NativeRefreshTokenSchema});
export const NativeLogoutResultSchema=z.strictObject({schemaVersion:z.literal(1),loggedOut:z.literal(true)});
export const NativeTicketInputSchema=NativeClientSchema;
export const NativeTicketResultSchema=z.strictObject({schemaVersion:z.literal(1),ticket:NativeSocketTicketSchema,expiresAt:z.iso.datetime(),selection:NegotiatedSessionSchema});
export const NativeSocketHandshakeSchema=z.strictObject({schemaVersion:z.literal(1),nativeTicket:NativeSocketTicketSchema,protocol:ClientProtocolOfferSchema});
export const NativeDeviceSchema=z.strictObject({deviceId:z.uuid(),platform:z.literal('android'),label:NativeDeviceLabelSchema,createdAt:z.iso.datetime(),expiresAt:z.iso.datetime(),current:z.boolean()});
// Lists active native devices only; the existing account session ceiling is10.
export const NativeDevicesSchema=z.strictObject({schemaVersion:z.literal(1),devices:z.array(NativeDeviceSchema).max(10)});
export const NativeRevokeInputSchema=z.strictObject({schemaVersion:z.literal(1),deviceId:z.uuid()});
export const NativeRevokeResultSchema=z.strictObject({schemaVersion:z.literal(1),revoked:z.literal(true)});
export const NativeAuthErrorSchema=z.strictObject({error:z.strictObject({code:z.enum(['FORBIDDEN','NOT_FOUND','INVALID_REQUEST','UNAUTHENTICATED','NOT_AVAILABLE','IDEMPOTENCY_CONFLICT','NAME_UNAVAILABLE','RATE_LIMITED','INTERNAL_ERROR','WORLD_UNAVAILABLE','UPGRADE_REQUIRED']),message:z.string().max(256),requestId:z.uuid()})});
export type NativeClient=z.infer<typeof NativeClientSchema>;
export type NativeTokens=z.infer<typeof NativeTokensSchema>;
export type NativeRefreshInput=z.infer<typeof NativeRefreshInputSchema>;
export type NativeSocketHandshake=z.infer<typeof NativeSocketHandshakeSchema>;
export type NativeDevices=z.infer<typeof NativeDevicesSchema>;
export type NativeTicketResult=z.infer<typeof NativeTicketResultSchema>;
// expectedAccountId is a stale-view guard,never authority to choose a target.
export const NativeAccountDeleteInputSchema=z.strictObject({schemaVersion:z.literal(1),requestId:z.uuid().transform(value=>value.toLowerCase()),expectedAccountId:z.uuid().transform(value=>value.toLowerCase()),confirmDelete:z.literal(true)});
export const NativeAccountDeleteResponseSchema=z.strictObject({schemaVersion:z.literal(1),deleted:z.literal(true)});
export const NativeAccountDeleteOutcomeSchema=z.strictObject({schemaVersion:z.literal(1),outcome:z.enum(['DELETED','UNCONFIRMED']),localCleared:z.literal(true)});
export type NativeAccountDeleteOutcome=z.infer<typeof NativeAccountDeleteOutcomeSchema>;
