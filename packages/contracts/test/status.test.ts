import { describe, it, expect } from 'vitest';
import { ReadinessSchema, ApiErrorSchema } from '../src';
describe('foundation HTTP compatibility', () => {
  it('fails closed on schema drift or private payload fields', () => {
    expect(ReadinessSchema.safeParse({ status: 'ready', schemaVersion: 2 }).success).toBe(false);
    expect(ReadinessSchema.safeParse({ status: 'ready', schemaVersion: 1, databaseUrl: 'private' }).success).toBe(false);
    expect(ReadinessSchema.parse({ status: 'unavailable' })).toEqual({ status: 'unavailable' });
  });
  it('requires stable safe error shape with a correlation ID', () => {
    expect(ApiErrorSchema.safeParse({ error: { code: 'raw-sql-error', message: 'db', requestId: 'invalid' } }).success).toBe(false);
  });
});
