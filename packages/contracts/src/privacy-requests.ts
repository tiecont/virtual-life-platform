import {z} from 'zod';
const id=z.uuid().transform(value=>value.toLowerCase()),password=z.string().min(12).max(128);
export const PrivacyRetentionSchema=z.strictObject({requestSeconds:z.literal(604800),approvalSeconds:z.literal(900),receiptSeconds:z.literal(86400),auditDays:z.literal(30),payloadStored:z.literal(false)});
export const PrivacyRequestCreateSchema=z.strictObject({requestId:id,loginName:z.string().normalize('NFKC').trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,31}$/),password,operation:z.enum(['export','delete'])});
export const PrivacyCompleteSchema=z.strictObject({privacyRequestId:id,password,confirmDelete:z.boolean()});
export const PrivacyCloseSchema=z.strictObject({privacyRequestId:id});
export const PrivacyRequestViewSchema=z.strictObject({id,operation:z.enum(['export','delete']),status:z.enum(['PENDING','APPROVED','REVIEW_REQUIRED','DENIED','COMPLETED','CANCELLED','EXPIRED']),canConfirm:z.boolean(),version:z.number().int().positive(),createdAt:z.iso.datetime(),expiresAt:z.iso.datetime(),approvalExpiresAt:z.iso.datetime().nullable(),receiptExpiresAt:z.iso.datetime().nullable(),retention:PrivacyRetentionSchema});
export const PrivacyOwnerStateSchema=PrivacyRequestViewSchema.extend({csrfToken:z.string().regex(/^[a-f0-9]{64}$/)});
export const PrivacyCompleteResultSchema=z.discriminatedUnion('operation',[
 z.strictObject({operation:z.literal('export'),state:PrivacyOwnerStateSchema,payload:z.unknown()}),
 z.strictObject({operation:z.literal('delete'),state:PrivacyOwnerStateSchema,deleted:z.literal(true)}),
]);
export const OperatorPrivacyRequestsSchema=z.strictObject({requests:z.array(PrivacyRequestViewSchema).max(20),truncated:z.boolean(),retention:PrivacyRetentionSchema});
const review={requestId:id,accountId:id,privacyRequestId:id,expectedVersion:z.number().int().positive().max(2147483646)};
export const OperatorPrivacyReviewSchema=z.discriminatedUnion('decision',[
 z.strictObject({...review,decision:z.literal('approve'),reason:z.literal('OWNER_VERIFIED'),ownershipVerified:z.literal(true),verificationRef:id}),
 z.strictObject({...review,decision:z.literal('deny'),reason:z.enum(['OWNER_UNVERIFIED','SECURITY_REVIEW'])}),
]);
export type PrivacyRequestView=z.infer<typeof PrivacyRequestViewSchema>;
