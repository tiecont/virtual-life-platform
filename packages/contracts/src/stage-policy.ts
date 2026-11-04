import { z } from 'zod';
import { WorldVersionSchema } from './world-primitives';
// Trusted world configuration only;wire actions never accept these bounds.
export const StagePolicySchema=z.strictObject({version:WorldVersionSchema,maxPerformers:z.literal(1),maxQueue:z.number().int().min(1).max(10),offerSeconds:z.number().int().min(1).max(120),slotSeconds:z.number().int().min(1).max(300),waitSeconds:z.number().int().min(1).max(600),disclosure:z.literal('anonymous-slot')});
