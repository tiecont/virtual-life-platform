import { z } from 'zod';
import { SafetyCategorySchema, SafetySeveritySchema } from './safety';
import { WorldSlugSchema } from './world-primitives';
import { ChatMessageSchema } from './chat';
const uuid = z.uuid().transform(value => value.toLowerCase());
export const ReportInputSchema = z.strictObject({ schemaVersion: z.literal(1), category: SafetyCategorySchema, note: z.string().trim().max(1000), source: z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('room'), epoch: uuid, roomId: uuid, membershipId: uuid, targetId: uuid }),
  z.strictObject({ kind: z.literal('messages'), messageIds: z.array(uuid).min(1).max(5).refine(ids => new Set(ids).size === ids.length) }),
]) });
export type ReportInput = z.infer<typeof ReportInputSchema>;
export const ReportReceiptSchema = z.strictObject({ schemaVersion: z.literal(1), receiptId: uuid, status: z.literal('received'), createdAt: z.iso.datetime() });
export type ReportReceipt = z.infer<typeof ReportReceiptSchema>;
export const ReportStatusSchema = z.strictObject({ schemaVersion: z.literal(1), reportsAvailable: z.boolean() });
export const CaseSummarySchema = z.strictObject({ id: uuid, worldSlug: WorldSlugSchema, category: SafetyCategorySchema, severity: SafetySeveritySchema, status: z.literal('open'), createdAt: z.iso.datetime(), assignedTo: uuid.nullable() });
export const CasePageSchema = z.strictObject({ schemaVersion: z.literal(1), items: z.array(CaseSummarySchema).max(25), nextCursor: uuid.nullable() });
export const CaseAssignmentSchema = z.strictObject({ assigneeId: uuid, reason: z.enum(['triage', 'coverage', 'independent-review']) });
export const ReportEvidenceSchema = z.strictObject({ schemaVersion: z.literal(1), note: z.string().max(1000), attribution: z.literal('reporter-allegation-not-a-finding'), source: z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('room'), epoch: uuid, roomId: uuid, targetId: uuid }),
  z.strictObject({ kind: z.literal('messages'), messages: z.array(ChatMessageSchema).min(1).max(5) }),
]) });
export type ReportEvidence = z.infer<typeof ReportEvidenceSchema>;
export const CaseDetailSchema = z.strictObject({ schemaVersion: z.literal(1), case: CaseSummarySchema, subjectId: uuid.nullable(), evidence: ReportEvidenceSchema.nullable(), evidenceExpiresAt: z.iso.datetime().nullable() });
