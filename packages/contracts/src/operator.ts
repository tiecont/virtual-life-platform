import {z} from 'zod';
const password=z.string().min(16).max(128), code=z.string().regex(/^[0-9]{6}$/);
export const OperatorTotpSecretSchema=z.string().regex(/^[A-Z2-7]{32}$/);
export const OperatorLoginSchema=z.strictObject({password,code});
export const OperatorRecoverySchema=z.strictObject({password,recoveryCode:z.string().regex(/^[a-f0-9]{64}$/),newTotpSecret:OperatorTotpSecretSchema,code});
export const OperatorSessionSchema=z.strictObject({subject:z.uuid(),audience:z.literal('operator'),expiresAt:z.iso.datetime(),idleExpiresAt:z.iso.datetime(),stepUpUntil:z.iso.datetime(),csrfToken:z.string().regex(/^[a-f0-9]{64}$/)});
export type OperatorSession=z.infer<typeof OperatorSessionSchema>;
export const OperatorBootstrapSchema=z.strictObject({password,totpSecret:OperatorTotpSecretSchema,code});
