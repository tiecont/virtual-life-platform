import { Pool } from 'pg';
import { readConfig } from '../config';
import { migrate,migrationManifest } from './migrations';
import {loadSchemaCompatibility} from '../config/schema-compatibility';
async function main() {
  const config = readConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try { const compatibility=await loadSchemaCompatibility(config.SCHEMA_COMPATIBILITY_FILE,await migrationManifest());await migrate(pool,undefined,compatibility);console.log('City migrations applied'); }
  finally { await pool.end(); }
}
void main().catch(() => { console.error('City migration failed; check configuration, database availability and migration integrity.'); process.exitCode = 1; });
