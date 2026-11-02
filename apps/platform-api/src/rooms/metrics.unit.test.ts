import { it, expect } from 'vitest';
import { RoomMetrics } from './metrics';

it('keeps fixed buckets/outcomes without raw input and balances in-flight commands once', () => {
  const metrics = new RoomMetrics(); const finish = metrics.begin();
  expect(metrics.snapshot().pendingCommands).toBe(1);
  finish('room.join', 'UNTRUSTED_ACCOUNT_SECRET'); finish('room.join', 'OK');
  metrics.observe('room.join', 'RATE_LIMITED', 5001);
  const result = metrics.snapshot();
  expect(result.pendingCommands).toBe(0); expect(result.peakPendingCommands).toBe(1);
  expect(result.commands['room.join'].errors).toEqual({ INTERNAL_ERROR: 1, RATE_LIMITED: 1 });
  expect(result.commands['room.join'].buckets.at(-1)).toEqual({ upperMs: null, count: 1 });
  expect(JSON.stringify(result)).not.toContain('UNTRUSTED_ACCOUNT_SECRET');
  result.commands['room.join'].errors.INTERNAL_ERROR = 999;
  expect(metrics.snapshot().commands['room.join'].errors.INTERNAL_ERROR).toBe(1);
});
