import { z } from 'zod';
export const LegacyIdentityLinkInputSchema=z.strictObject({schemaVersion:z.literal(1),expectedRevision:z.number().int().min(0).max(2147483646)});
export const LegacyIdentityUnlinkInputSchema=z.strictObject({schemaVersion:z.literal(1),expectedRevision:z.number().int().min(0).max(2147483647)});
export const LegacyIdentityViewSchema=z.strictObject({schemaVersion:z.literal(1),source:z.literal('deadline'),available:z.boolean(),linked:z.boolean(),revision:z.number().int().min(0).max(2147483647),linkedAt:z.iso.datetime().nullable(),changedAt:z.iso.datetime().nullable()});
export type LegacyIdentityView=z.infer<typeof LegacyIdentityViewSchema>;
