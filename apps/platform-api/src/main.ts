import { Pool } from 'pg';
import { readConfig } from './config';
import { createApp } from './app';
async function main() {
  const config = readConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 2000 });
  pool.on('error', () => console.error('Database pool unavailable'));
  const { app, beginDrain,identity, social, worlds, rooms, reports, sanctions, travel, invitations, focus, hospitality, hospitalityOutbox, events, stage, audience, datingProfiles, datingMatching, datingDates, datingContinuations, progression } = await createApp(config, pool, true);
  await app.listen(config.PORT, config.HOST);
  const maintenance = setInterval(() => { void identity.purgeExpired().then(() => social.purgeExpired()).then(() => rooms.maintain()).then(() => reports.maintain()).then(() => sanctions.maintain()).then(() => travel.maintain()).then(() => invitations.maintain()).then(() => focus.maintain()).catch(() => console.error('Platform maintenance unavailable')); }, 300000);
  maintenance.unref();
  const serviceMaintenance = setInterval(() => { void hospitality.maintain().then(() => hospitalityOutbox.drain()).then(() => events.maintain()).then(() => stage.maintain()).then(() => audience.maintain()).then(() => datingProfiles.maintain()).then(() => datingContinuations.maintain()).then(() => datingMatching.maintain()).then(() => datingDates.maintain()).then(() => progression.maintain()).catch(() => console.error('Service maintenance unavailable')); }, 3000);
  serviceMaintenance.unref();
  const reloadWorlds = () => { void worlds.reloadFlags().catch(() => console.error('World flag reload failed; check local configuration and world health.')); };
  process.on('SIGHUP', reloadWorlds);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    beginDrain();
    const deadline=setTimeout(()=>{console.error('Platform shutdown deadline exceeded');process.exit(1);},12000);
    clearInterval(maintenance);
    clearInterval(serviceMaintenance);
    process.removeListener('SIGHUP', reloadWorlds);
    try { await app.close(); await pool.end(); } catch { console.error('Platform shutdown failed');process.exit(1); } finally {clearTimeout(deadline);}
  };
  process.once('SIGTERM', () => { void stop(); });
  process.once('SIGINT', () => { void stop(); });
}
void main().catch(() => { console.error('Platform startup failed; check configuration and port availability.'); process.exitCode = 1; });
