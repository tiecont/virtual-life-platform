import { EventEmitter } from 'node:events';
import type { Pool, PoolClient } from 'pg';
import { afterEach, it, expect, vi } from 'vitest';
import { RoomAuthority } from './authority';

afterEach(() => { vi.useRealTimers(); });
it('fails closed within the query deadline, destroys the connection and never reacquires after loss', async () => {
  vi.useFakeTimers();
  const client = Object.assign(new EventEmitter(), { query: vi.fn(() => new Promise(() => {})), release: vi.fn() });
  const db = { connect: vi.fn(async () => client) }; const authority = new RoomAuthority(db as unknown as Pick<Pool, 'connect'>);
  let losses = 0; authority.onLost(() => losses++);
  const outcome = authority.assert().catch(error => error.code);
  await vi.advanceTimersByTimeAsync(1001);
  expect(await outcome).toBe('WORLD_UNAVAILABLE'); expect(authority.state).toBe('lost'); expect(losses).toBe(1);
  expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
  await expect(authority.assert()).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' }); expect(db.connect).toHaveBeenCalledTimes(1);
  authority.close(); expect(client.release).toHaveBeenCalledTimes(1);
});
it('bounds pool acquisition and destroys a late connection without reviving authority', async () => {
  vi.useFakeTimers(); let late!: (client: PoolClient) => void;
  const db = { connect: () => new Promise<PoolClient>(resolve => { late = resolve; }) };
  const authority = new RoomAuthority(db as unknown as Pick<Pool, 'connect'>);
  const outcome = authority.assert().catch(error => error.code);
  await vi.advanceTimersByTimeAsync(2001); expect(await outcome).toBe('WORLD_UNAVAILABLE');
  const release = vi.fn(); late({ release } as unknown as PoolClient); await Promise.resolve();
  expect(release).toHaveBeenCalledExactlyOnceWith(true); expect(authority.state).toBe('lost'); authority.close();
});
