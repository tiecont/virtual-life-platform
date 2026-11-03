import { z } from 'zod';
import { TravelPhaseSchema } from '@virtual-city/contracts';

export const TRAVEL_MAX_TTL_MS = 30000;
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const TravelLifecycleSchema = z.strictObject({
  schemaVersion: z.literal(1), phase: TravelPhaseSchema,
  createdAt: time, expiresAt: time, changedAt: time,
}).refine(state => state.expiresAt > state.createdAt && state.expiresAt - state.createdAt <= TRAVEL_MAX_TTL_MS
  && state.changedAt >= state.createdAt
  && (state.phase === 'EXPIRED' ? state.changedAt >= state.expiresAt : state.changedAt < state.expiresAt)
  && (state.phase !== 'CREATED' || state.changedAt === state.createdAt), 'Invalid travel lifecycle timestamps');
export const TravelLifecycleEventSchema = z.enum(['TARGET_READY', 'TARGET_COMMITTED', 'TIMEOUT', 'FAIL', 'CANCEL']);
export type TravelLifecycle = Readonly<z.infer<typeof TravelLifecycleSchema>>;
export type TravelLifecycleEvent = z.infer<typeof TravelLifecycleEventSchema>;
export class TravelLifecycleError extends Error {
  constructor(readonly reason: 'INVALID_TIME' | 'INVALID_TRANSITION') { super(reason); }
}
export function createTravelLifecycle(now: number, ttlMs = TRAVEL_MAX_TTL_MS): TravelLifecycle {
  return Object.freeze(TravelLifecycleSchema.parse({ schemaVersion: 1, phase: 'CREATED', createdAt: now, expiresAt: now + ttlMs, changedAt: now }));
}
export function advanceTravelLifecycle(raw: TravelLifecycle, event: TravelLifecycleEvent, now: number): TravelLifecycle {
  const state = TravelLifecycleSchema.parse(raw), action = TravelLifecycleEventSchema.parse(event);
  if (!time.safeParse(now).success || now < state.changedAt) throw new TravelLifecycleError('INVALID_TIME');
  if (state.phase !== 'CREATED' && state.phase !== 'READY') return Object.freeze(state);
  // A terminal retry never reactivates an intent; expiry wins over any late
  // preparation/commit. Actual admission and its commit point belong to the owner.
  const phase = now >= state.expiresAt ? 'EXPIRED' : action === 'TIMEOUT' ? state.phase
    : action === 'FAIL' ? 'FAILED' : action === 'CANCEL' ? 'CANCELLED'
      : action === 'TARGET_READY' ? 'READY' : state.phase === 'READY' ? 'COMMITTED' : null;
  if (!phase) throw new TravelLifecycleError('INVALID_TRANSITION');
  return Object.freeze(TravelLifecycleSchema.parse({ ...state, phase, changedAt: phase === state.phase ? state.changedAt : now }));
}
