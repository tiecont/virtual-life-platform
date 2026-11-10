import {z} from 'zod';
const id=z.uuid().transform(value=>value.toLowerCase());
export const OperatorAccountQuerySchema=z.strictObject({accountId:id});
export const OperatorAccountStateSchema=z.strictObject({kind:z.enum(['guest','registered']),status:z.enum(['active','suspended']),version:z.number().int().min(0).max(2147483647),activeSessions:z.number().int().min(0)});
export const OperatorAccountViewSchema=OperatorAccountStateSchema.extend({accountId:id,privacy:z.strictObject({export:z.literal('OWNER_SELF_SERVICE'),deletion:z.literal('OWNER_SELF_SERVICE'),receiptTtlSeconds:z.literal(86400)})});
export const OperatorAccountCommandSchema=z.strictObject({requestId:id,accountId:id,expectedVersion:z.number().int().min(0).max(2147483646),action:z.enum(['suspend','resume','revoke']),reason:z.enum(['SECURITY_REVIEW','OWNER_REQUEST','ABUSE_PREVENTION','CORRECTION'])});
export const OperatorAccountResultSchema=z.strictObject({requestId:id,accountId:id,before:OperatorAccountStateSchema,after:OperatorAccountStateSchema});
export const OperatorAccountAuditSchema=z.strictObject({events:z.array(z.strictObject({requestId:id,action:OperatorAccountCommandSchema.shape.action,reason:OperatorAccountCommandSchema.shape.reason,before:OperatorAccountStateSchema,after:OperatorAccountStateSchema,occurredAt:z.iso.datetime(),previousHash:z.string().regex(/^[a-f0-9]{64}$/),eventHash:z.string().regex(/^[a-f0-9]{64}$/)})).max(20)});
export type OperatorAccountState=z.infer<typeof OperatorAccountStateSchema>;
