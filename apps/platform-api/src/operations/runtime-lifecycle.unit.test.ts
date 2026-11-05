import {afterEach, expect, it, vi} from 'vitest';
import {RuntimeLifecycle} from './runtime-lifecycle';

afterEach(() => {vi.useRealTimers();});
it('begins drain immediately, stops scheduling and settles admitted maintenance before app/owner and pool close', async () => {
  vi.useFakeTimers(); const calls: string[] = []; let release!: () => void;
  const blocked = new Promise<void>(resolve => {release = resolve;});
  const runtime = new RuntimeLifecycle({beginDrain: () => {calls.push('drain');}, closeApp: async () => {calls.push('app');}, closePool: async () => {calls.push('pool');}});
  runtime.every(10, async () => {calls.push('work'); await blocked; calls.push('committed');}, () => {calls.push('error');});
  await vi.advanceTimersByTimeAsync(40); expect(calls).toEqual(['work']);
  const stopped = runtime.stop(); expect(runtime.stop()).toBe(stopped); expect(calls).toEqual(['work', 'drain']);
  await vi.advanceTimersByTimeAsync(100); expect(calls).toEqual(['work', 'drain']);
  release(); await stopped;
  expect(calls).toEqual(['work', 'drain', 'committed', 'app', 'pool']); expect(runtime.state).toBe('closed');
  expect(() => runtime.every(10, async () => {}, () => {})).toThrow();
});
it('reports maintenance failures without overlapping jobs or leaking rejected promises and can still drain', async () => {
  vi.useFakeTimers(); let attempts = 0, failures = 0;
  const runtime = new RuntimeLifecycle({beginDrain: () => {}, closeApp: async () => {}, closePool: async () => {}});
  runtime.every(10, async () => {attempts++; throw Error('private failure');}, () => {failures++; throw Error('logger failed');});
  await vi.advanceTimersByTimeAsync(25); expect(attempts).toBe(2); expect(failures).toBe(2); await runtime.stop(); expect(runtime.state).toBe('closed');
});
it('fails at the bounded deadline without closing authority/pool ahead of stuck maintenance or claiming success later', async () => {
  vi.useFakeTimers(); let release!: () => void; const closed = vi.fn();
  const runtime = new RuntimeLifecycle({beginDrain: () => {}, closeApp: async () => {closed();}, closePool: async () => {closed();}, deadlineMs: 50});
  runtime.every(10, () => new Promise<void>(resolve => {release = resolve;}), () => {});
  await vi.advanceTimersByTimeAsync(10); const stopped = runtime.stop(); const failure = expect(stopped).rejects.toThrow('deadline');
  await vi.advanceTimersByTimeAsync(50); await failure; expect(runtime.state).toBe('failed'); expect(closed).not.toHaveBeenCalled();
  release(); await vi.advanceTimersByTimeAsync(1); expect(closed).not.toHaveBeenCalled(); expect(runtime.stop()).toBe(stopped);
});
it('keeps closure errors terminal without reporting a successful pool/owner release', async () => {
  const pool = vi.fn();
  const runtime = new RuntimeLifecycle({beginDrain: () => {}, closeApp: async () => {throw Error('close failed');}, closePool: async () => {pool();}});
  await expect(runtime.stop()).rejects.toThrow('close failed'); expect(runtime.state).toBe('failed'); expect(pool).not.toHaveBeenCalled();
});
it('settles admitted signal-triggered work and refuses work submitted after drain', async () => {
  let release!: () => void; let finished = false; const rejectedWork = vi.fn();
  const runtime = new RuntimeLifecycle({beginDrain: () => {}, closeApp: async () => {expect(finished).toBe(true);}, closePool: async () => {}});
  const work = runtime.run(async () => {await new Promise<void>(resolve => {release = resolve;}); finished = true;}, () => {});
  await Promise.resolve(); const stop = runtime.stop(); expect(runtime.run(rejectedWork, () => {})).toBeUndefined();
  release(); await work; await stop; expect(rejectedWork).not.toHaveBeenCalled();
});
