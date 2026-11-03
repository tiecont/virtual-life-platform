import { z } from 'zod';
import { WorldSlugSchema, WorldVersionSchema } from './world-primitives';
export const HospitalityPolicySchema = z.strictObject({ version: WorldVersionSchema, itemKeys: z.array(WorldSlugSchema).min(1).max(50).refine(items => new Set(items).size === items.length), maxActivePerStaff: z.number().int().min(1).max(4), maxQueue: z.number().int().min(1).max(100), staffing: z.strictObject({ kind: z.literal('voluntary'), maxStaff: z.number().int().min(1).max(32) }).optional() });
export type HospitalityPolicy = z.infer<typeof HospitalityPolicySchema>;
