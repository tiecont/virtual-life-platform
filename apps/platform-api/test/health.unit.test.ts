import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { ApiErrorSchema } from '@virtual-city/contracts';
import type { Pool } from 'pg';
const config = readConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/virtual_city_test' });
describe('HTTP outage behavior (stub DB; actual PostgreSQL in integration suite)', () => {
  it('keeps liveness healthy and readiness unavailable without exposing DB errors', async () => {
    const db = { query: async () => { throw new Error('private database credentials'); } } as unknown as Pick<Pool, 'query'>;
    const { app, http } = await createApp(config, db);
    try {
      expect((await http.inject('/health/live')).json()).toEqual({ status: 'ok' });
      const ready = await http.inject('/health/ready');
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({ status: 'unavailable' });
      expect(ready.headers['cache-control']).toBe('no-store');
      const response = await http.inject({ method: 'POST', url: '/anything', headers: { origin: 'https://attacker.example' } });
      expect(response.statusCode).toBe(403);
      expect(ApiErrorSchema.parse(response.json()).error.code).toBe('FORBIDDEN');
      const unknown = await http.inject('/missing?private=never-echo');
      expect(unknown.statusCode).toBe(404);
      expect(ApiErrorSchema.parse(unknown.json()).error.code).toBe('NOT_FOUND');
      expect(unknown.body).not.toContain('never-echo');
    } finally { await app.close(); }
  });
});
