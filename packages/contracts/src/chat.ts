import { z } from 'zod';
import { RoomOwnCommandSchema } from './rooms';
import { PublicProfileSchema } from './profiles';
import { CannedMessageIdSchema } from './safety';

export const ChatTextSchema = z.string().min(1).max(280);
export const EmoteIdSchema = z.enum(['wave', 'smile', 'clap', 'nod']);
export const ChatContentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: ChatTextSchema }),
  z.strictObject({ kind: z.literal('canned'), id: CannedMessageIdSchema }),
  z.strictObject({ kind: z.literal('emote'), id: EmoteIdSchema }),
]);
// Chat retains its existing receipt/moderation contract; room ordering is not a chat capability.
export const ChatSendSchema = RoomOwnCommandSchema.omit({clientSeq: true}).extend({ content: ChatContentSchema });
export type ChatSend = z.infer<typeof ChatSendSchema>;
export const ModerationDecisionSchema = z.strictObject({ decision: z.enum(['allow', 'reject', 'review']) });
export const ChatMessageSchema = z.strictObject({ schemaVersion: z.literal(1), messageId: z.uuid(), epoch: z.uuid(), roomId: z.uuid(), createdAt: z.iso.datetime(), sender: PublicProfileSchema,
  content: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('text'), text: ChatTextSchema }),
    z.strictObject({ kind: z.literal('canned'), id: CannedMessageIdSchema, text: ChatTextSchema }),
    z.strictObject({ kind: z.literal('emote'), id: EmoteIdSchema }),
  ]),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export const ChatAcceptedSchema = z.strictObject({ type: z.literal('accepted'), messageId: z.uuid(), createdAt: z.iso.datetime() });
export type ChatAccepted = z.infer<typeof ChatAcceptedSchema>;
export const ChatErrorCodeSchema = z.enum(['INVALID_REQUEST', 'UNAUTHENTICATED', 'FORBIDDEN', 'RATE_LIMITED', 'NOT_IN_ROOM', 'WORLD_UNAVAILABLE', 'CONTENT_REJECTED', 'MODERATION_UNAVAILABLE', 'IDEMPOTENCY_CONFLICT', 'INTERNAL_ERROR']);
export type ChatErrorCode = z.infer<typeof ChatErrorCodeSchema>;
export const ChatAckSchema = z.discriminatedUnion('ok', [
  z.strictObject({ schemaVersion: z.literal(1), requestId: z.uuid(), ok: z.literal(true), result: ChatAcceptedSchema }),
  z.strictObject({ schemaVersion: z.literal(1), requestId: z.uuid(), ok: z.literal(false), error: z.strictObject({ code: ChatErrorCodeSchema, retryable: z.boolean() }) }),
]);
