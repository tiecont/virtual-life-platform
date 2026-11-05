import { Pool } from 'pg';
import { readConfig } from './config';
import { createApp } from './app';
import { RuntimeLifecycle } from './operations/runtime-lifecycle';
async function main() {
  const config = readConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 2000 });
  pool.on('error', () => console.error('Database pool unavailable'));
  const { app, beginDrain,identity, deadlineIdentity, social, worlds, rooms, reports, sanctions, travel, invitations, focus, hospitality, hospitalityOutbox, events, stage, audience, datingProfiles, datingMatching, datingDates, datingContinuations, progression } = await createApp(config, pool, true);
  await app.listen(config.PORT, config.HOST);
  const reloadWorlds = () => { void lifecycle.run(() => worlds.reloadFlags(), () => console.error('World flag reload failed; check local configuration and world health.')); };
  const lifecycle = new RuntimeLifecycle({beginDrain: () => {beginDrain(); process.removeListener('SIGHUP', reloadWorlds);}, closeApp: () => app.close(), closePool: () => pool.end()});
  lifecycle.every(300000, () => identity.purgeExpired().then(() => deadlineIdentity.maintain()).then(() => social.purgeExpired()).then(() => rooms.maintain()).then(() => reports.maintain()).then(() => sanctions.maintain()).then(() => travel.maintain()).then(() => invitations.maintain()).then(() => focus.maintain()), () => console.error('Platform maintenance unavailable'));
  lifecycle.every(3000, () => hospitality.maintain().then(() => hospitalityOutbox.drain()).then(() => events.maintain()).then(() => stage.maintain()).then(() => audience.maintain()).then(() => datingProfiles.maintain()).then(() => datingContinuations.maintain()).then(() => datingMatching.maintain()).then(() => datingDates.maintain()).then(() => progression.maintain()), () => console.error('Service maintenance unavailable'));
  process.on('SIGHUP', reloadWorlds);
  const stop = async () => {
    try {await lifecycle.stop();} catch {console.error('Platform shutdown failed or deadline exceeded'); process.exit(1);}
  };
  process.once('SIGTERM', () => { void stop(); });
  process.once('SIGINT', () => { void stop(); });
}
void main().catch(() => { console.error('Platform startup failed; check configuration and port availability.'); process.exitCode = 1; });
