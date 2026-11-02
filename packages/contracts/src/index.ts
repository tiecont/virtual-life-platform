import { z } from 'zod';
// Foundation status only. World/session/room schemas belong to their gated modules.
export const SCHEMA_VERSION = 1 as const;
export const LivenessSchema = z.strictObject({ status: z.literal('ok') });
export const ReadinessSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), schemaVersion: z.literal(SCHEMA_VERSION) }),
  z.strictObject({ status: z.literal('unavailable') }),
]);
export const ApiErrorSchema = z.strictObject({ error: z.strictObject({
  code: z.enum(['FORBIDDEN', 'NOT_FOUND', 'INVALID_REQUEST', 'INTERNAL_ERROR']),
  message: z.string(), requestId: z.uuid(),
}) });
export type Readiness = z.infer<typeof ReadinessSchema>;
