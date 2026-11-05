import { it, expect } from 'vitest';
import { RoomMetrics } from './metrics';
import {databaseObservation} from '../common/database-observation';
import {performance} from 'node:perf_hooks';

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

it('attributes concurrent commands to bounded outcomes, suppresses nested projection double counting and expires background context', async () => {
  const metrics = new RoomMetrics(); let delayed!: () => void; let databaseWasInactive = false, projectionElapsed = 0;
  await Promise.all([
    metrics.command('room.join', async () => {
      metrics.recordPhase('queue_wait', 7);
      const start = performance.now();
      await metrics.phase('projection', async () => {await metrics.phase('projection', async () => {databaseObservation()?.record('query', 4, false); await new Promise(resolve => setTimeout(resolve, 30));});});
      projectionElapsed = performance.now() - start;
      delayed = () => {databaseWasInactive = !databaseObservation(); metrics.recordPhase('queue_wait', 999);};
      setTimeout(delayed, 5);
    }),
    metrics.command('room.move', async () => {metrics.recordPhase('queue_wait', 13); throw Object.assign(Error('private fixture text'), {code: 'UNKNOWN_ACCOUNT_SECRET'});}).catch(() => {}),
  ]);
  const snapshot = metrics.snapshot(), join = snapshot.phases.find(item => item.command === 'room.join')!;
  expect(join.timings.queue_wait.totalMs).toBe(7); expect(join.timings.db_query.totalMs).toBe(4); expect(join.timings.projection.count).toBe(1);
  expect(join.timings.projection.totalMs).toBeLessThanOrEqual(projectionElapsed + 1);
  expect(snapshot.phases.find(item => item.command === 'room.move')?.outcome).toBe('INTERNAL_ERROR');
  expect(JSON.stringify(snapshot)).not.toMatch(/private fixture text|UNKNOWN_ACCOUNT_SECRET/);
  await new Promise(resolve => setTimeout(resolve, 15)); expect(databaseWasInactive).toBe(true);
  expect(metrics.snapshot().phases.find(item => item.command === 'room.join')!.timings.queue_wait.totalMs).toBe(7);
  join.timings.queue_wait.buckets[0].count = 999; expect(metrics.snapshot().phases[0].timings.queue_wait.buckets[0].count).not.toBe(999);
  metrics.close();
});

it('keeps unknown labels internal, preserves original failures and represents an empty/stopped loop observation as unavailable', async () => {
  const metrics = new RoomMetrics(); expect(metrics.snapshot().eventLoop).toMatchObject({status: 'not_started', p95Ms: null});
  const stop = metrics.observeEventLoop(); expect(metrics.snapshot().eventLoop.status).toBe('warming');
  const error = Object.defineProperty(Error('original'), 'code', {get: () => {throw Error('secondary');}});
  await expect(metrics.command('untrusted-id' as 'room.join', async () => {throw error;})).rejects.toBe(error);
  expect(metrics.snapshot().phases[0]).toMatchObject({command: 'internal', outcome: 'INTERNAL_ERROR'});
  stop(); metrics.close(); expect(metrics.snapshot().eventLoop).toMatchObject({status: 'not_started', count: 0, p95Ms: null});
});
