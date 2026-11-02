import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { ReadinessSchema } from '@virtual-city/contracts';
let pool: Pool; let admin: Pool;
const schema = 'city_test_' + randomUUID().replaceAll('-', '');
beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 3000 });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options', '-c search_path=' + schema);
  pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 3000 });
});
afterAll(async () => {
  await pool?.end();
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); }
});
describe('real PostgreSQL and HTTP vertical slice', () => {
  it('readiness fails on clean DB, then succeeds after idempotent concurrent migrations, including actual TCP', async () => {
    const { app, http } = await createApp(readConfig({ NODE_ENV: 'test', SESSION_SECRET: 'test-only-session-secret-not-production-0001', DATABASE_URL: process.env.TEST_DATABASE_URL }), pool);
    try {
      expect((await http.inject('/health/ready')).statusCode).toBe(503);
      await Promise.all([migrate(pool), migrate(pool)]);
      await migrate(pool);
      expect((await pool.query('SELECT count(*)::int AS count FROM city_schema_migrations')).rows[0].count).toBe(2);
      expect((await pool.query('SELECT count(*)::int AS count FROM platform_metadata')).rows[0].count).toBe(1);
      await app.listen(0, '127.0.0.1');
      const url = await app.getUrl();
      const response = await fetch(url + '/health/ready');
      expect(response.status).toBe(200);
      expect(ReadinessSchema.parse(await response.json())).toEqual({ status: 'ready', schemaVersion: 1 });
      await pool.query('UPDATE platform_metadata SET schema_version=2');
      expect((await http.inject('/health/ready')).statusCode).toBe(503);
      expect((await http.inject('/health/live')).statusCode).toBe(200);
      await pool.query('UPDATE platform_metadata SET schema_version=1');
    } finally { await app.close(); }
  });
  it('rejects historical checksum tampering and rolls back a partially failing new migration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'city-migration-'));
    try {
      await writeFile(join(directory, '0001_foundation.sql'), 'SELECT 1;');
      await expect(migrate(pool, directory)).rejects.toThrow('checksum mismatch');
      const original = await import('node:fs/promises').then(fs => fs.readFile('apps/platform-api/src/db/migrations/0001_foundation.sql', 'utf8'));
      await writeFile(join(directory, '0001_foundation.sql'), original);
      await writeFile(join(directory, '0002_broken.sql'), 'CREATE TABLE must_rollback(id integer); SELECT definitely_missing_column;');
      await expect(migrate(pool, directory)).rejects.toBeDefined();
      expect((await pool.query("SELECT to_regclass('must_rollback') AS table_name")).rows[0].table_name).toBe(null);
      expect((await pool.query('SELECT count(*)::int AS count FROM city_schema_migrations')).rows[0].count).toBe(2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('enforces singleton metadata and positive schema version in PostgreSQL', async () => {
    await expect(pool.query('INSERT INTO platform_metadata VALUES(false,1,now())')).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('UPDATE platform_metadata SET schema_version=0')).rejects.toMatchObject({ code: '23514' });
  });
});
