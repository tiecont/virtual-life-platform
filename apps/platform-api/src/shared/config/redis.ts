import { Redis as UpstashRedis } from '@upstash/redis';
import { createClient } from 'redis';

const LOCAL_REDIS_PROTOCOLS = new Set(['redis:', 'rediss:']);
const MAX_KEY_LENGTH = 1024;
const MAX_TTL_SECONDS = 2592000;

export type RedisConfig =
  | Readonly<{ backend: 'local'; url: string }>
  | Readonly<{ backend: 'upstash-rest'; url: string; token: string }>;

export type RedisSetOptions = Readonly<{ ttlSeconds?: number }>;

export interface RedisAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  close(): Promise<void>;
}

interface RedisBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, options?: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  close(): Promise<void>;
}

export interface RedisAdapterFactories {
  createLocal(url: string): Promise<RedisBackend>;
  createUpstash(url: string, token: string): Promise<RedisBackend>;
}

function value(env: Record<string, string | undefined>, key: string): string | undefined {
  const candidate = env[key]?.trim();
  return candidate || undefined;
}

function localUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('REDIS_URL must be a valid redis or rediss URL');
  }
  if (!LOCAL_REDIS_PROTOCOLS.has(url.protocol) || !url.hostname || url.search || url.hash) {
    throw new Error('REDIS_URL must be an exact redis or rediss URL without query or fragment');
  }
  const database = url.pathname === '' || url.pathname === '/' ? 0 : Number(url.pathname.slice(1));
  if (!Number.isInteger(database) || database < 0 || database > 15) {
    throw new Error('REDIS_URL database must be between 0 and 15');
  }
  return input;
}

function upstashUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('UPSTASH_REDIS_REST_URL must be a valid HTTPS URL');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/'].includes(url.pathname)
  ) {
    throw new Error('UPSTASH_REDIS_REST_URL must be an exact HTTPS origin');
  }
  return url.origin;
}

function upstashToken(input: string): string {
  if (!/^[\x21-\x7e]{16,4096}$/.test(input)) {
    throw new Error('UPSTASH_REDIS_REST_TOKEN is missing or invalid');
  }
  return input;
}

export function readRedisConfig(
  env: Record<string, string | undefined> = process.env,
  runtime: 'local' | 'production' = env.NODE_ENV === 'production' ? 'production' : 'local',
): RedisConfig {
  const redisUrl = value(env, 'REDIS_URL');
  const upstashRestUrl = value(env, 'UPSTASH_REDIS_REST_URL');
  const upstashRestToken = value(env, 'UPSTASH_REDIS_REST_TOKEN');

  if (runtime === 'production') {
    if (redisUrl) throw new Error('Production Redis cannot combine REDIS_URL with Upstash REST');
    if (!upstashRestUrl || !upstashRestToken) {
      throw new Error('Production Redis requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
    }
    return Object.freeze({
      backend: 'upstash-rest',
      url: upstashUrl(upstashRestUrl),
      token: upstashToken(upstashRestToken),
    });
  }

  if (upstashRestUrl || upstashRestToken) {
    throw new Error('Upstash REST configuration is only valid for production Redis');
  }
  if (!redisUrl) throw new Error('Local Redis requires REDIS_URL');
  return Object.freeze({ backend: 'local', url: localUrl(redisUrl) });
}

function assertKey(key: string): void {
  if (typeof key !== 'string') throw new Error('Redis key is invalid');
  const hasControlCharacter = [...key].some(character => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (
    key.length === 0 ||
    key.length > MAX_KEY_LENGTH ||
    hasControlCharacter
  ) {
    throw new Error('Redis key is invalid');
  }
}

function assertValue(input: string): void {
  if (typeof input !== 'string') throw new Error('Redis value must be a string');
}

function commandOptions(options: RedisSetOptions | undefined): { ex: number } | undefined {
  if (options === undefined) return undefined;
  const ttlSeconds = options.ttlSeconds;
  if (
    ttlSeconds === undefined ||
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > MAX_TTL_SECONDS
  ) {
    throw new Error('Redis TTL must be an integer between 1 and 2592000 seconds');
  }
  return { ex: ttlSeconds };
}

async function defaultLocal(url: string): Promise<RedisBackend> {
  const client = createClient({
    url,
    socket: { connectTimeout: 5000, reconnectStrategy: false },
  });
  client.on('error', () => {
    // Callers receive operation failures; connection details are not logged here.
  });
  await client.connect();
  return {
    get: key => client.get(key),
    set: (key, input, options) =>
      options
        ? client.set(key, input, { expiration: { type: 'EX', value: options.ex } })
        : client.set(key, input),
    del: key => client.del(key),
    close: async () => {
      if (client.isOpen) await client.quit();
      else client.destroy();
    },
  };
}

async function defaultUpstash(url: string, token: string): Promise<RedisBackend> {
  const client = new UpstashRedis({
    url,
    token,
    automaticDeserialization: false,
  });
  return {
    get: key => client.get(key),
    set: (key, input, options) =>
      options ? client.set(key, input, { ex: options.ex }) : client.set(key, input),
    del: key => client.del(key),
    close: async () => undefined,
  };
}

export const defaultRedisAdapterFactories: RedisAdapterFactories = {
  createLocal: defaultLocal,
  createUpstash: defaultUpstash,
};

export async function createRedisAdapter(
  config: RedisConfig,
  factories: RedisAdapterFactories = defaultRedisAdapterFactories,
): Promise<RedisAdapter> {
  const backend =
    config.backend === 'local'
      ? await factories.createLocal(config.url)
      : await factories.createUpstash(config.url, config.token);
  let closed = false;
  return {
    async get(key) {
      assertKey(key);
      const result = await backend.get(key);
      return result === null || result === undefined
        ? null
        : Buffer.isBuffer(result)
          ? result.toString('utf8')
          : String(result);
    },
    async set(key, input, options) {
      assertKey(key);
      assertValue(input);
      await backend.set(key, input, commandOptions(options));
    },
    async delete(key) {
      assertKey(key);
      return Number(await backend.del(key)) > 0;
    },
    async close() {
      if (closed) return;
      closed = true;
      await backend.close();
    },
  };
}
