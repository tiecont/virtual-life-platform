import { z } from 'zod';
import { EventScheduleSchema, EventCapacityPolicySchema, EventPhaseSchema, ReservationPhaseSchema, type EventSchedule, type EventCapacityPolicy, type EventPhase } from '@virtual-city/contracts';
import { DomainError } from '../common/errors';

const time = z.number().int().nonnegative().max(8640000000000000);
const invalid = () => new DomainError('NOT_AVAILABLE', 409, 'This schedule changed');
export const EventStateSchema = z.strictObject({ schemaVersion: z.literal(1), phase: EventPhaseSchema, schedule: EventScheduleSchema, createdAt: time, changedAt: time }).refine(state => {
  const opens = Date.parse(state.schedule.opensAt), starts = Date.parse(state.schedule.startsAt), ends = Date.parse(state.schedule.endsAt);
  return state.createdAt < opens && state.changedAt >= state.createdAt && (state.phase === 'ENDED' ? state.changedAt >= ends : state.changedAt < ends)
    && (state.phase !== 'SCHEDULED' || state.changedAt < opens) && (state.phase !== 'OPEN' || state.changedAt >= opens && state.changedAt < starts) && (state.phase !== 'LIVE' || state.changedAt >= starts);
}, 'Invalid event lifecycle');
export type EventState = Readonly<Omit<z.infer<typeof EventStateSchema>, 'schedule'> & { schedule: EventSchedule }>;
const freezeEvent = (raw: unknown): EventState => { const state = EventStateSchema.parse(raw); return Object.freeze({ ...state, schedule: Object.freeze(state.schedule) }); };
export function createEvent(raw: unknown, now: number): EventState { return freezeEvent({ schemaVersion: 1, phase: 'SCHEDULED', schedule: EventScheduleSchema.parse(raw), createdAt: now, changedAt: now }); }
export function advanceEvent(raw: EventState, action: 'observe' | 'cancel', now: number): EventState {
  const state = EventStateSchema.parse(raw); z.enum(['observe', 'cancel']).parse(action);
  if (!time.safeParse(now).success || now < state.changedAt) throw invalid();
  if (state.phase === 'ENDED' || state.phase === 'CANCELLED') return freezeEvent(state);
  const ends = Date.parse(state.schedule.endsAt), starts = Date.parse(state.schedule.startsAt), opens = Date.parse(state.schedule.opensAt);
  const phase = now >= ends ? 'ENDED' : action === 'cancel' ? 'CANCELLED' : now >= starts ? 'LIVE' : now >= opens ? 'OPEN' : 'SCHEDULED';
  return freezeEvent({ ...state, phase, changedAt: phase === state.phase ? state.changedAt : phase === 'ENDED' ? ends : now });
}

export const ReservationStateSchema = z.strictObject({ schemaVersion: z.literal(1), phase: ReservationPhaseSchema, schedule: EventScheduleSchema, partySize: z.number().int().min(1).max(100), createdAt: time, changedAt: time, holdExpiresAt: time }).refine(state => {
  const starts = Date.parse(state.schedule.startsAt), closes = Date.parse(state.schedule.checkInClosesAt), opens = Date.parse(state.schedule.opensAt);
  return state.createdAt < starts && state.changedAt >= state.createdAt && state.holdExpiresAt > state.createdAt && state.holdExpiresAt <= starts && state.holdExpiresAt - state.createdAt <= 300000
    && (state.phase !== 'HELD' || state.changedAt < state.holdExpiresAt)
    && (state.phase !== 'CONFIRMED' || state.changedAt < closes)
    && (state.phase !== 'CHECKED_IN' || state.changedAt >= opens && state.changedAt < closes)
    && (state.phase !== 'EXPIRED' || state.changedAt >= state.holdExpiresAt);
}, 'Invalid reservation lifecycle');
export type ReservationState = Readonly<Omit<z.infer<typeof ReservationStateSchema>, 'schedule'> & { schedule: EventSchedule }>;
const freezeReservation = (raw: unknown): ReservationState => { const state = ReservationStateSchema.parse(raw); return Object.freeze({ ...state, schedule: Object.freeze(state.schedule) }); };
export function createReservation(rawSchedule: unknown, rawPolicy: unknown, partySize: number, now: number): ReservationState {
  const schedule = EventScheduleSchema.parse(rawSchedule), policy = EventCapacityPolicySchema.parse(rawPolicy);
  z.number().int().min(1).max(policy.maxPartySize).parse(partySize);
  return freezeReservation({ schemaVersion: 1, phase: 'HELD', schedule, partySize, createdAt: now, changedAt: now, holdExpiresAt: Math.min(now + policy.holdSeconds * 1000, Date.parse(schedule.startsAt)) });
}
export function advanceReservation(raw: ReservationState, action: 'observe' | 'confirm' | 'check-in' | 'cancel', now: number, eventPhase: EventPhase): ReservationState {
  const state = ReservationStateSchema.parse(raw); z.enum(['observe', 'confirm', 'check-in', 'cancel']).parse(action); EventPhaseSchema.parse(eventPhase);
  if (!time.safeParse(now).success || now < state.changedAt) throw invalid();
  if (state.phase === 'EXPIRED' || state.phase === 'CANCELLED') return freezeReservation(state);
  if (eventPhase === 'CANCELLED') return freezeReservation({ ...state, phase: 'CANCELLED', changedAt: now });
  if (state.phase === 'CHECKED_IN') return freezeReservation(state);
  const deadline = state.phase === 'HELD' ? state.holdExpiresAt : Date.parse(state.schedule.checkInClosesAt);
  if (now >= deadline || eventPhase === 'ENDED') return freezeReservation({ ...state, phase: 'EXPIRED', changedAt: Math.max(state.changedAt, Math.min(now, deadline)) });
  if (action === 'observe' || action === 'confirm' && state.phase === 'CONFIRMED') return freezeReservation(state);
  if (action === 'cancel') return freezeReservation({ ...state, phase: 'CANCELLED', changedAt: now });
  if (action === 'confirm') return freezeReservation({ ...state, phase: 'CONFIRMED', changedAt: now });
  if (state.phase !== 'CONFIRMED' || now < Date.parse(state.schedule.opensAt) || !['OPEN', 'LIVE'].includes(eventPhase)) throw invalid();
  return freezeReservation({ ...state, phase: 'CHECKED_IN', changedAt: now });
}
export function availableCapacity(rawPolicy: EventCapacityPolicy, activePartySizes: readonly number[]): number {
  const policy = EventCapacityPolicySchema.parse(rawPolicy), sizes = z.array(z.number().int().min(1).max(policy.maxPartySize)).max(100).parse(activePartySizes);
  const available = policy.capacity - sizes.reduce((total, size) => total + size, 0); if (available < 0) throw invalid(); return available;
}
export function formatEventSchedule(raw: unknown) {
  const schedule = EventScheduleSchema.parse(raw), formatter = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' });
  return Object.freeze({ ...schedule, startsLabel: formatter.format(new Date(schedule.startsAt)), endsLabel: formatter.format(new Date(schedule.endsAt)) });
}
