import { afterEach, it, expect, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { AdmissionStore } from './store';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
afterEach(() => vi.useRealTimers());
it('bounds outstanding checkouts across repeated outages and destroys every late lease once without ending the shared pool', async () => {
    vi.useFakeTimers();
    const pending: Array<(db: PoolClient) => void> = [], connect = vi.fn(() => new Promise<PoolClient>(resolve => pending.push(resolve))), end = vi.fn();
    const pool = { connect, end };
    const store = new AdmissionStore(pool as unknown as Pick<Pool, 'connect'>, {} as IdentityService, { epoch: randomUUID(), assert: async () => { } });
    const first = Promise.allSettled(Array.from({ length: 64 }, () => store.capacity()));
    await Promise.resolve();
    await expect(store.capacity()).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(2001);
    expect((await first).every(result => result.status === 'rejected')).toBe(true);
    expect(connect).toHaveBeenCalledTimes(64);
    for (let i = 0; i < 3; i++)
        expect((await Promise.allSettled(Array.from({ length: 64 }, () => store.capacity()))).every(result => result.status === 'rejected')).toBe(true);
    expect(connect).toHaveBeenCalledTimes(64);
    store.close();
    const release = vi.fn();
    for (const resolve of pending)
        resolve({ release } as unknown as PoolClient);
    await vi.advanceTimersByTimeAsync(1);
    expect(release).toHaveBeenCalledTimes(64);
    expect(release.mock.calls.every(args => args[0] === true)).toBe(true);
    expect(end).not.toHaveBeenCalled();
    await expect(store.capacity()).rejects.toMatchObject({ status: 503 });
});
