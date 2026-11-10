import { z } from 'zod';
import { FocusDurationSchema, FocusPhaseSchema } from '@virtual-city/contracts';
import { DomainError } from '../../../../../shared/common/errors';
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const FocusStateSchema = z.strictObject({ phase: FocusPhaseSchema, durationSeconds: FocusDurationSchema, startedAt: time, changedAt: time, endsAt: time.nullable(), pausedUntil: time.nullable(), remainingMs: z.number().int().min(0).max(3000000), canPause: z.boolean(), pauseBudgetMs: z.number().int().min(0).max(600000) }).refine(state => state.changedAt >= state.startedAt && state.remainingMs <= state.durationSeconds * 1000 && (state.canPause || state.pauseBudgetMs === 0)
  && (state.phase !== 'active' || (state.endsAt !== null && state.endsAt - state.changedAt === state.remainingMs && state.pausedUntil === null))
  && (state.phase !== 'paused' || (state.canPause && state.endsAt === null && state.pausedUntil !== null && state.pausedUntil - state.changedAt === state.pauseBudgetMs))
  && (state.phase !== 'completed' || (state.remainingMs === 0 && state.endsAt === state.changedAt)), 'Invalid focus lifecycle');
export type FocusState = Readonly<z.infer<typeof FocusStateSchema>>;
export type FocusAction = 'read' | 'finish' | 'cancel' | 'pause' | 'resume';
const freeze = (state: FocusState): FocusState => Object.freeze(FocusStateSchema.parse(state));
export function startFocus(now: number, durationSeconds: number, canPause: boolean): FocusState {
  const duration = FocusDurationSchema.parse(durationSeconds);
  return freeze({ phase: 'active', durationSeconds: duration, startedAt: now, changedAt: now, endsAt: now + duration * 1000, pausedUntil: null, remainingMs: duration * 1000, canPause, pauseBudgetMs: canPause ? 600000 : 0 });
}
export function remainingFocus(state: FocusState, now: number) { return state.phase === 'active' ? Math.max(0, state.endsAt! - now) : state.remainingMs; }
export function advanceFocus(raw: FocusState, action: FocusAction, now: number): FocusState {
  const state = FocusStateSchema.parse(raw);
  if (!time.safeParse(now).success || now < state.changedAt) throw new DomainError('INTERNAL_ERROR', 503, 'Trusted clock is unavailable');
  if (state.phase === 'completed' || state.phase === 'cancelled') return freeze(state);
  if (state.phase === 'active' && now >= state.endsAt!) return freeze({ ...state, phase: 'completed', changedAt: state.endsAt!, remainingMs: 0 });
  if (state.phase === 'paused' && now >= state.pausedUntil!) return freeze({ ...state, phase: 'cancelled', changedAt: state.pausedUntil!, pausedUntil: null, pauseBudgetMs: 0 });
  if (action === 'read') return freeze(state);
  if (action === 'finish') throw new DomainError('NOT_AVAILABLE', 409, 'This timer has not elapsed');
  if (action === 'cancel') return freeze({ ...state, phase: 'cancelled', changedAt: now, pausedUntil: null, remainingMs: remainingFocus(state, now) });
  if (action === 'pause') {
    if (!state.canPause || state.pauseBudgetMs <= 0) throw new DomainError('FORBIDDEN', 403, 'This timer cannot be paused');
    if (state.phase === 'paused') return freeze(state);
    return freeze({ ...state, phase: 'paused', remainingMs: remainingFocus(state, now), changedAt: now, endsAt: null, pausedUntil: now + state.pauseBudgetMs });
  }
  if (state.phase === 'active') return freeze(state);
  return freeze({ ...state, phase: 'active', endsAt: now + state.remainingMs, pausedUntil: null, changedAt: now, pauseBudgetMs: state.pauseBudgetMs - (now - state.changedAt) });
}
