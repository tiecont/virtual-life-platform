import { it, expect } from 'vitest';
import { TravelPhaseSchema } from '@virtual-city/contracts';
import { advanceTravelLifecycle, createTravelLifecycle, TravelLifecycleSchema, TRAVEL_MAX_TTL_MS, type TravelLifecycle, type TravelLifecycleEvent } from './lifecycle';

const created = createTravelLifecycle(1000), ready = advanceTravelLifecycle(created, 'TARGET_READY', 1001);
const events: TravelLifecycleEvent[] = ['TARGET_READY', 'TARGET_COMMITTED', 'TIMEOUT', 'FAIL', 'CANCEL'];
const phases = TravelPhaseSchema.options;
const terminal: Record<string, TravelLifecycle> = {
  COMMITTED: advanceTravelLifecycle(ready, 'TARGET_COMMITTED', 1002),
  FAILED: advanceTravelLifecycle(ready, 'FAIL', 1002),
  CANCELLED: advanceTravelLifecycle(ready, 'CANCEL', 1002),
  EXPIRED: advanceTravelLifecycle(ready, 'TIMEOUT', ready.expiresAt),
};
it.each(phases.flatMap(phase => events.map(event => ({ phase, event }))))('validates lifecycle $phase + $event without reactivating terminal state', ({ phase, event }) => {
  const state = phase === 'CREATED' ? created : phase === 'READY' ? ready : terminal[phase];
  if (phase === 'CREATED' && event === 'TARGET_COMMITTED') { expect(() => advanceTravelLifecycle(state, event, 1005)).toThrow('INVALID_TRANSITION'); return; }
  const result = advanceTravelLifecycle(state, event, phase === 'CREATED' || phase === 'READY' ? 1005 : 40000);
  if (terminal[phase]) { expect(result).toEqual(state); return; }
  const expected = event === 'TIMEOUT' ? phase : event === 'FAIL' ? 'FAILED' : event === 'CANCEL' ? 'CANCELLED' : event === 'TARGET_READY' ? 'READY' : 'COMMITTED';
  expect(result.phase).toBe(expected); expect(result.createdAt).toBe(state.createdAt); expect(result.expiresAt).toBe(state.expiresAt);
});

it.each(['CREATED', 'READY'] as const)('expiry at the exact deadline wins over all pending %s events', phase => {
  const state = phase === 'CREATED' ? created : ready;
  for (const event of events) expect(advanceTravelLifecycle(state, event, state.expiresAt)).toMatchObject({ phase: 'EXPIRED', changedAt: state.expiresAt });
});

it('does not extend the original deadline or completion timestamp on readiness, timeout polling or terminal retries', () => {
  expect(advanceTravelLifecycle(ready, 'TARGET_READY', 2000)).toEqual(ready);
  expect(advanceTravelLifecycle(created, 'TIMEOUT', 2000)).toEqual(created);
  expect(advanceTravelLifecycle(terminal.COMMITTED, 'CANCEL', 60000)).toEqual(terminal.COMMITTED);
  expect(Object.isFrozen(created)).toBe(true); expect(Object.isFrozen(ready)).toBe(true);
});

it('rejects invalid/oversized deadlines, clock rollback, unknown events and malformed persisted state', () => {
  for (const ttl of [0, -1, TRAVEL_MAX_TTL_MS + 1, .5, Infinity]) expect(() => createTravelLifecycle(1000, ttl)).toThrow();
  for (const now of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) expect(() => createTravelLifecycle(now)).toThrow();
  for (const now of [999, .5, NaN, Infinity]) expect(() => advanceTravelLifecycle(ready, 'TARGET_COMMITTED', now)).toThrow('INVALID_TIME');
  expect(() => advanceTravelLifecycle(ready, 'FORCE_COMMIT' as TravelLifecycleEvent, 1002)).toThrow();
  for (const state of [
    { ...created, expiresAt: created.createdAt }, { ...created, changedAt: 999 },
    { ...created, changedAt: 1001 }, { ...ready, changedAt: ready.expiresAt },
    { ...terminal.EXPIRED, changedAt: 1005 }, { ...created, role: 'admin' },
  ]) expect(TravelLifecycleSchema.safeParse(state).success).toBe(false);
});
