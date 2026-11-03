import { z } from 'zod';

export const TravelPhaseSchema = z.enum(['CREATED', 'READY', 'COMMITTED', 'EXPIRED', 'FAILED', 'CANCELLED']);
export type TravelPhase = z.infer<typeof TravelPhaseSchema>;
