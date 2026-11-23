import { describe, expect, it, vi } from 'vitest';
import {
  createRedisAdapter,
  readRedisConfig,
  type RedisAdapterFactories,
  type RedisConfig,
} from './redis';

function fakeFactories() {
  const calls: string[] = [];
  const values = new Map<string, string>();
  const backend = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, options?: { ex: number }) => {
      calls.push(`set:${key}:${options?.ex ?? 'none'}`);
      values.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      calls.push(`del:${key}`);
      return values.delete(key) ? 1 : 0;
    }),
    close: vi.fn(async () => {
      calls.push('close');
    }),
  };
  const factories: RedisAdapterFactories = {
    createLocal: vi.fn(async (url: string) => {
      calls.push(`local:${url}`);
      return backend;
    }),
    createUpstash: vi.fn(async (url: string, token: string) => {
      calls.push(`upstash:${url}:${token ? 'token-present' : 'token-missing'}`);
      return backend;
    }),
  };
  return { backend, calls, factories };
}

describe('Redis environment selection', () => {
  it('selects Docker Compose Redis for local development without exposing Upstash', () => {
    expect(
      readRedisConfig({
        NODE_ENV: 'development',
        REDIS_URL: 'redis://127.0.0.1:6379/0',
      }),
    ).toEqual({ backend: 'local', url: 'redis://127.0.0.1:6379/0' });
    expect(
      readRedisConfig({
        NODE_ENV: 'test',
        REDIS_URL: 'rediss://cache.internal:6380/2',
      }),
    ).toEqual({ backend: 'local', url: 'rediss://cache.internal:6380/2' });
  });

  it('selects Upstash REST only in production and normalizes an exact origin', () => {
    expect(
      readRedisConfig({
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io/',
        UPSTASH_REDIS_REST_TOKEN: 'synthetic-token-value-123',
      }),
    ).toEqual({
      backend: 'upstash-rest',
      url: 'https://example.upstash.io',
      token: 'synthetic-token-value-123',
    });
  });

  it('fails closed for missing, partial, mixed, insecure or malformed settings', () => {
    const invalid = [
      {},
      { REDIS_URL: 'http://127.0.0.1:6379/0' },
      { REDIS_URL: 'redis://127.0.0.1:6379/16' },
      { REDIS_URL: 'redis://127.0.0.1:6379/0?private=marker' },
      { REDIS_URL: 'redis://127.0.0.1:6379/0', UPSTASH_REDIS_REST_URL: 'https://private-marker.invalid' },
      { NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://example.upstash.io' },
      { NODE_ENV: 'production', UPSTASH_REDIS_REST_TOKEN: 'synthetic-token-value-123' },
      {
        NODE_ENV: 'production',
        REDIS_URL: 'redis://127.0.0.1:6379/0',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'synthetic-token-value-123',
      },
      {
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL: 'http://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'synthetic-token-value-123',
      },
      {
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io/private',
        UPSTASH_REDIS_REST_TOKEN: 'synthetic-token-value-123',
      },
      {
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'short',
      },
    ];
    for (const env of invalid) {
      expect(() => readRedisConfig(env)).toThrow();
      try {
        readRedisConfig(env);
      } catch (error) {
        expect(String(error)).not.toContain('synthetic-token-value-123');
        expect(String(error)).not.toContain('private-marker');
      }
    }
  });
});

describe('Redis adapter boundary', () => {
  it('uses the selected backend and preserves string, TTL and delete semantics', async () => {
    const { backend, calls, factories } = fakeFactories();
    const local = readRedisConfig({
      NODE_ENV: 'development',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
    });
    const adapter = await createRedisAdapter(local, factories);

    await adapter.set('aetheria:key', '{"value":1}', { ttlSeconds: 90 });
    expect(await adapter.get('aetheria:key')).toBe('{"value":1}');
    expect(await adapter.delete('aetheria:key')).toBe(true);
    expect(await adapter.delete('aetheria:key')).toBe(false);
    await adapter.close();
    await adapter.close();

    expect(factories.createLocal).toHaveBeenCalledWith('redis://127.0.0.1:6379/0');
    expect(factories.createUpstash).not.toHaveBeenCalled();
    expect(backend.set).toHaveBeenCalledWith('aetheria:key', '{"value":1}', { ex: 90 });
    expect(calls).toEqual([
      'local:redis://127.0.0.1:6379/0',
      'set:aetheria:key:90',
      'del:aetheria:key',
      'del:aetheria:key',
      'close',
    ]);
  });

  it('uses Upstash without serializing or coercing caller data', async () => {
    const { backend, calls, factories } = fakeFactories();
    const production = readRedisConfig({
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'synthetic-token-value-123',
    });
    const adapter = await createRedisAdapter(production, factories);

    await adapter.set('aetheria:key', 'raw-string');
    expect(await adapter.get('aetheria:key')).toBe('raw-string');
    await adapter.close();

    expect(factories.createLocal).not.toHaveBeenCalled();
    expect(factories.createUpstash).toHaveBeenCalledWith(
      'https://example.upstash.io',
      'synthetic-token-value-123',
    );
    expect(backend.set).toHaveBeenCalledWith('aetheria:key', 'raw-string', undefined);
    expect(calls).toEqual([
      'upstash:https://example.upstash.io:token-present',
      'set:aetheria:key:none',
      'close',
    ]);
  });

  it('rejects unsafe or out-of-range adapter input before touching Redis', async () => {
    const { backend, factories } = fakeFactories();
    const config: RedisConfig = { backend: 'local', url: 'redis://127.0.0.1:6379/0' };
    const adapter = await createRedisAdapter(config, factories);

    await expect(adapter.get('')).rejects.toThrow('Redis key');
    await expect(adapter.get('bad\u0000key')).rejects.toThrow('Redis key');
    await expect(adapter.set('aetheria:key', 1 as unknown as string)).rejects.toThrow('string');
    await expect(adapter.set('aetheria:key', 'value', { ttlSeconds: 0 })).rejects.toThrow('TTL');
    await expect(adapter.set('aetheria:key', 'value', { ttlSeconds: 2592001 })).rejects.toThrow(
      'TTL',
    );
    expect(backend.get).not.toHaveBeenCalled();
    expect(backend.set).not.toHaveBeenCalled();
  });
});
