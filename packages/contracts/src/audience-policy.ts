import { z } from 'zod';
import { WorldVersionSchema } from './world-primitives';
export const AudiencePolicySchema=z.strictObject({version:WorldVersionSchema,disclosure:z.literal('anonymous-counts'),windowSeconds:z.literal(10),maxPerRoom:z.literal(20),cooldownSeconds:z.literal(2),maxPerAccountWindow:z.literal(5),approvalSeconds:z.literal(300)});
