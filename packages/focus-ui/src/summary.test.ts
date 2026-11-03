import { it, expect } from 'vitest';
import { completionSummary } from './summary';
const completed = { schemaVersion: 1, id: '181d00e7-929f-4e2b-b4ba-f228c92f1800', phase: 'completed', durationSeconds: 900, startedAt: '2026-11-03T00:00:00.000Z', changedAt: '2026-11-03T00:15:00.000Z', endsAt: '2026-11-03T00:15:00.000Z', pausedUntil: null, remainingMs: 0, canPause: false, pauseBudgetMs: 0, origin: { worldSlug: 'private-world', roomId: '181d00e7-929f-4e2b-b4ba-f228c92f1801', seatId: 'private-seat' } };
it('only shares elapsed duration without private identity,place,timestamps or task fields', () => {
  expect(completionSummary(completed)).toBe('I completed a 15-minute focus timer.');
  expect(completionSummary({ ...completed, durationSeconds: 3000 })).toBe('I completed a 50-minute focus timer.');
  for (const phase of ['active', 'paused', 'cancelled']) expect(completionSummary({ ...completed, phase })).toBeNull();
  expect(() => completionSummary({ ...completed, note: 'private task' })).toThrow();
});
