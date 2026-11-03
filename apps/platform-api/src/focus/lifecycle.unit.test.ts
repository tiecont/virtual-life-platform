import { it, expect } from 'vitest';
import { startFocus, advanceFocus, remainingFocus } from './lifecycle';
it('keeps server deadlines stable after browser sleep and gives completion precedence over cancellation at the exact deadline', () => {
  const initial = startFocus(1000, 900, false); expect(initial.endsAt).toBe(901000); expect(remainingFocus(initial, 451000)).toBe(450000);
  expect(advanceFocus(initial, 'read', 451000)).toEqual(initial); expect(advanceFocus(initial, 'cancel', 901000)).toMatchObject({ phase: 'completed', changedAt: 901000, remainingMs: 0 });
  expect(() => advanceFocus(initial, 'finish', 900999)).toThrow(); const finished = advanceFocus(initial, 'finish', 999999); expect(finished.phase).toBe('completed'); expect(finished.changedAt).toBe(initial.endsAt);
  for (const action of ['read', 'finish', 'cancel', 'pause', 'resume'] as const) expect(advanceFocus(finished, action, 999999)).toEqual(finished);
});
it('forbids Deadline pause and never trusts arbitrary durations or a backwards clock', () => {
  const initial = startFocus(1000, 1500, false); expect(() => advanceFocus(initial, 'pause', 2000)).toThrow(); expect(() => advanceFocus(initial, 'read', 999)).toThrow(); expect(() => startFocus(0, 1, true)).toThrow();
});
it('pauses only explicit modes, deducts cumulative pause time and cancels when the bounded pause window expires', () => {
  const initial = startFocus(1000, 900, true), paused = advanceFocus(initial, 'pause', 101000); expect(paused).toMatchObject({ phase: 'paused', endsAt: null, remainingMs: 800000, pausedUntil: 701000 });
  expect(remainingFocus(paused, 151000)).toBe(800000); expect(advanceFocus(paused, 'pause', 151000)).toEqual(paused);
  const resumed = advanceFocus(paused, 'resume', 201000); expect(resumed).toMatchObject({ phase: 'active', endsAt: 1001000, remainingMs: 800000, pauseBudgetMs: 500000 });
  const again = advanceFocus(resumed, 'pause', 301000); expect(again.pausedUntil).toBe(801000); expect(advanceFocus(again, 'resume', 801000)).toMatchObject({ phase: 'cancelled', changedAt: 801000, pauseBudgetMs: 0 });
});
