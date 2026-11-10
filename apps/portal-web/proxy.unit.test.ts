import {afterEach, expect, it, vi} from 'vitest';
import {NextRequest} from 'next/server';
import {getRewrittenUrl, unstable_doesMiddlewareMatch} from 'next/experimental/testing/server';
import {proxy, config} from './proxy';
import {apiRewrite, internalApiOrigin} from './server-origin';

afterEach(() => vi.unstubAllEnvs());
it('uses the current server environment per request while preserving API paths and query strings', () => {
  vi.stubEnv('API_INTERNAL_URL', 'http://runtime-api-a.invalid:4300');
  expect(getRewrittenUrl(proxy(new NextRequest('https://public.invalid/v1/me?view=own')))).toBe('http://runtime-api-a.invalid:4300/v1/me?view=own');
  vi.stubEnv('API_INTERNAL_URL', 'http://runtime-api-b.invalid:4400');
  expect(apiRewrite('/v1/accounts', '?page=2').href).toBe('http://runtime-api-b.invalid:4400/v1/accounts?page=2');
});
it('only matches platform API paths and rejects non-origin or credential-bearing destinations without exposing input', () => {
  for (const url of ['/v1', '/v1/me']) expect(unstable_doesMiddlewareMatch({config, nextConfig: {}, url})).toBe(true);
  for (const url of ['/', '/identity', '/_next/static/a.js', '/assets/avatar.svg', '/socket.io/']) expect(unstable_doesMiddlewareMatch({config, nextConfig: {}, url})).toBe(false);
  for (const value of ['file:///etc/passwd', 'http://user:synthetic-secret@api.invalid', 'http://api.invalid/path', 'http://api.invalid?token=synthetic-secret', 'http://api.invalid#fragment']) {
    expect(() => internalApiOrigin(value)).toThrow('API_INTERNAL_URL must be a trusted HTTP origin');
  }
  expect(() => apiRewrite('//attacker.invalid/path', '')).toThrow('Only platform API');
});
