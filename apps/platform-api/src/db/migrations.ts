import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
// Transactional, checksum-verified, additive migrations; never share a legacy journal.
export async function migrate(pool: Pool, directory = resolve(__dirname, 'migrations')): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(86732401)');
    await client.query('CREATE TABLE IF NOT EXISTS city_schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const names = (await readdir(directory)).filter(n => /^\d+.*\.sql$/.test(n)).sort();
    if (names.length === 0) throw new Error('No migration files found');
    for (const name of names) {
      const sql = await readFile(resolve(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const result = await client.query<{ checksum: string }>('SELECT checksum FROM city_schema_migrations WHERE name=$1', [name]);
      if (result.rows.length > 0) {
        if (result.rows[0].checksum !== checksum) throw new Error('Historical migration checksum mismatch: ' + name);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO city_schema_migrations(name, checksum) VALUES($1,$2)', [name, checksum]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
