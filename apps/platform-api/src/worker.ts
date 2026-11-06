import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {readWorkerAction, readWorkerConfig} from './config/worker';
import {loadProgressionPolicy} from './config/progression';
import {loadSchemaCompatibility, isSchemaCompatible} from './config/schema-compatibility';
import {migrationManifest} from './db/migrations';
import {HospitalityOutbox} from './hospitality/jobs';
import {lockAccounts} from './identity/account-locks';
import {ProgressionLedger} from './progression/ledger';
import {IncidentPolicy} from './safety/incidents';
import {SanctionPolicy} from './safety/sanctions';
import {RuntimeLifecycle} from './operations/runtime-lifecycle';

// Independent composition root. No HTTP/socket, session secret or RoomAuthority.
export async function runDurableWorker(env = process.env, args = process.argv.slice(2)) {
  const action = readWorkerAction(args), config = readWorkerConfig(env);
  const policy = await loadProgressionPolicy(config.PROGRESSION_POLICY_FILE);
  if (!policy?.enabled) throw Error('Worker requires an explicit enabled progression policy');
  const compatibility = await loadSchemaCompatibility(config.SCHEMA_COMPATIBILITY_FILE, await migrationManifest());
  const pool = new Pool({connectionString: config.DATABASE_URL, max: 4, connectionTimeoutMillis: 2000, application_name: 'virtual-life-platform-durable-worker'});
  pool.on('error', () => console.error('Durable worker database unavailable'));
  const ledger = new ProgressionLedger(async (db, account, world) => await new IncidentPolicy(db).permits(account, world) && await new SanctionPolicy(db).permits(account, world), policy);
  const outbox = new HospitalityOutbox(pool, {lockAccounts}, [ledger.hospitalitySink()], Date.now, config.WORKER_RETRY_LIMIT);
  const lifecycle = new RuntimeLifecycle({beginDrain: () => {}, closeApp: () => outbox.close(), closePool: () => pool.end()});
  let failed = false, signalled = false, resolveStop!: () => void;
  const stopped = new Promise<void>(resolve => {resolveStop = resolve;});
  const stop = () => {
    signalled = true;
    void lifecycle.stop().then(resolveStop, () => {console.error('Durable worker shutdown failed or deadline exceeded'); process.exit(1);});
  };
  const assertSchema = async () => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN READ ONLY'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'");
      const rows = (await db.query('SELECT schema_version,(SELECT jsonb_object_agg(name,checksum) FROM city_schema_migrations) AS migrations FROM platform_metadata WHERE singleton=true')).rows;
      if (rows.length !== 1 || !isSchemaCompatible(compatibility, rows[0].schema_version, rows[0].migrations)) throw Error('Worker schema incompatible');
      await db.query('COMMIT');
    } catch (error) {await db.query('ROLLBACK'); throw error;} finally {db.release();}
  };
  const unavailable = () => {failed = true; console.error('Durable worker batch unavailable');};
  const batch = async () => {
    await assertSchema(); await outbox.drain();
    console.log(JSON.stringify({event: 'durable-worker.batch-complete', sampledAt: new Date().toISOString()}));
  };
  try {
    await assertSchema(); // Read-only validation; worker never runs migrations.
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
    console.log(JSON.stringify({event: 'durable-worker.ready', consumer: 'progression-completion-v1', policySha256: createHash('sha256').update(JSON.stringify(policy)).digest('hex'), retryLimit: config.WORKER_RETRY_LIMIT}));
    if (action.kind === 'run') {
      await lifecycle.run(batch, unavailable);
      if (lifecycle.state === 'running') lifecycle.every(config.WORKER_INTERVAL_MS, batch, unavailable, true);
      await stopped;
    } else {
      await lifecycle.run(async () => {
        await assertSchema();
        if (action.kind === 'once') await batch();
        else if (action.kind === 'dead-letters') console.log(JSON.stringify({event: 'durable-worker.dead-letters', items: await outbox.deadLetters()}));
        else {await outbox.retryDeadLetter(action.eventId, action.consumer, action.attempts, action.nextAt); console.log(JSON.stringify({event: 'durable-worker.retry-recorded', consumer: action.consumer}));}
      }, unavailable);
      if (failed || signalled) process.exitCode = 1;
    }
  } finally {
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    await lifecycle.stop();
  }
}
if (require.main === module) void runDurableWorker().catch(() => {console.error('Durable worker failed; check role, policy and database'); process.exitCode = 1;});
