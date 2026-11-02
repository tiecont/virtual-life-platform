import { Pool } from 'pg';
import { readConfig } from './config';
import { createApp } from './app';
async function main() {
  const config = readConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 2000 });
  pool.on('error', () => console.error('Database pool unavailable'));
  const { app, identity } = await createApp(config, pool, true);
  await app.listen(config.PORT, config.HOST);
  const maintenance = setInterval(() => { void identity.purgeExpired().catch(() => console.error('Identity maintenance unavailable')); }, 300000);
  maintenance.unref();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(maintenance);
    try { await app.close(); await pool.end(); } catch { process.exitCode = 1; }
  };
  process.once('SIGTERM', () => { void stop(); });
  process.once('SIGINT', () => { void stop(); });
}
void main().catch(() => { console.error('Platform startup failed; check configuration and port availability.'); process.exitCode = 1; });
