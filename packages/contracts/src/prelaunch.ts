import {z} from 'zod';

const id=z.uuid().transform(value=>value.toLowerCase());
const token=z.string().regex(/^[a-f0-9]{64}$/);
const email=z.string().trim().max(254).transform(value=>value.normalize('NFKC').toLowerCase()).pipe(z.email());

export const PrelaunchRegisterSchema=z.strictObject({
  schemaVersion:z.literal(1),
  requestId:id,
  campaignId:id,
  email,
  marketingConsent:z.boolean(),
});

export const PrelaunchResendSchema=z.strictObject({
  schemaVersion:z.literal(1),
  requestId:id,
  campaignId:id,
  email,
});

export const PrelaunchConfirmSchema=z.strictObject({
  schemaVersion:z.literal(1),
  token,
});

export const PrelaunchWithdrawSchema=z.strictObject({
  schemaVersion:z.literal(1),
  requestId:id,
  expectedVersion:z.number().int().min(0).max(2147483646),
});

export const PrelaunchAcceptedSchema=z.strictObject({
  schemaVersion:z.literal(1),
  accepted:z.literal(true),
});

export const PrelaunchRegistrationStateSchema=z.enum(['PENDING','CONFIRMED','WITHDRAWN','SUPPRESSED']);

export const PrelaunchRegistrationViewSchema=z.strictObject({
  schemaVersion:z.literal(1),
  state:PrelaunchRegistrationStateSchema,
  version:z.number().int().min(0).max(2147483646),
  marketingConsent:z.boolean(),
  confirmedAt:z.iso.datetime().nullable(),
  withdrawnAt:z.iso.datetime().nullable(),
});

export const PrelaunchConfirmationSchema=PrelaunchRegistrationViewSchema.extend({
  managementToken:token,
});

export const PrelaunchCampaignStateSchema=z.enum(['OPEN','FULL','CLOSED']);

export const PrelaunchCampaignSchema=z.strictObject({
  schemaVersion:z.literal(1),
  id,
  slug:z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  state:PrelaunchCampaignStateSchema,
});

export const OperatorPrelaunchQuerySchema=z.strictObject({
  campaignId:id,
});

export const OperatorPrelaunchSummarySchema=z.strictObject({
  schemaVersion:z.literal(1),
  campaignId:id,
  slug:z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  state:PrelaunchCampaignStateSchema,
  capacity:z.number().int().min(1).max(5000),
  confirmed:z.number().int().min(0).max(5000),
  remaining:z.number().int().min(0).max(5000),
  pending:z.number().int().min(0),
  withdrawn:z.number().int().min(0),
  suppressed:z.number().int().min(0),
  outbox:z.strictObject({
    pending:z.number().int().min(0),
    sent:z.number().int().min(0),
    failed:z.number().int().min(0),
    suppressed:z.number().int().min(0),
  }),
  recentAudit:z.array(z.strictObject({
    action:z.enum(['registration.requested','email.confirmed','registration.withdrawn','mail.suppressed']),
    actor:z.enum(['system','operator','owner']),
    occurredAt:z.iso.datetime(),
  })).max(20),
});

export type PrelaunchRegister=z.infer<typeof PrelaunchRegisterSchema>;
export type PrelaunchRegistrationView=z.infer<typeof PrelaunchRegistrationViewSchema>;
export type PrelaunchCampaign=z.infer<typeof PrelaunchCampaignSchema>;
export type OperatorPrelaunchSummary=z.infer<typeof OperatorPrelaunchSummarySchema>;
