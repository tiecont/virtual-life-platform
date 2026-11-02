import { Pool } from 'pg';
import { readConfig } from '../config';
import { migrate } from './migrations';
async function main() {
  const config = readConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try { await migrate(pool); console.log('City migrations applied'); }
  finally { await pool.end(); }
}
void main().catch(() => { console.error('City migration failed; check configuration, database availability and migration integrity.'); process.exitCode = 1; });
