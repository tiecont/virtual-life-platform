import {afterAll, afterEach, beforeAll, beforeEach, expect, it} from 'vitest';
import {spawn, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {Pool} from 'pg';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {ROOM_OWNER_LOCK_CLASS} from '../../apps/platform-api/src/features/rooms/modules/presence/application/authority';

let admin: Pool, db: Pool, schema: string, databaseUrl: string;
const children = new Set<ChildProcess>();
beforeAll(() => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw Error('Disposable local database only');
  admin = new Pool({connectionString: url.toString()});
});
beforeEach(async () => {
  schema = 'runtime_main_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema); databaseUrl = url.toString();
  db = new Pool({connectionString: databaseUrl}); await migrate(db);
});
afterEach(async () => {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) {const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;}
  children.clear(); await db.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
});
afterAll(async () => {await admin.end();});
async function start() {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const address = reservation.address(); if (!address || typeof address === 'string') throw Error('Port reservation failed');
  const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/platform-api/src/main.ts'], {
    stdio: ['ignore', 'ignore', 'pipe'], env: {PATH: process.env.PATH, TZ: 'UTC', NODE_ENV: 'test', DATABASE_URL: databaseUrl, SESSION_SECRET: randomUUID().repeat(2), HOST: '127.0.0.1', PORT: String(port), WEB_ORIGIN: 'http://127.0.0.1:3300'},
  }); children.add(child);
  let stderr = ''; child.stderr!.on('data', chunk => {if (stderr.length < 65536) stderr += String(chunk);});
  const url = 'http://127.0.0.1:' + port;
  await expect.poll(async () => {
    if (child.exitCode !== null) throw Error('Owned main exited before readiness');
    try {return (await fetch(url + '/health/ready', {signal: AbortSignal.timeout(1000)})).status;} catch {return 0;}
  }, {timeout: 10000}).toBe(200);
  return {child, url, stderr: () => stderr};
}
async function owners() {return (await admin.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=$1::oid AND objid=(hashtext($2)::bigint & 4294967295)::oid AND objsubid=2 AND granted", [ROOM_OWNER_LOCK_CLASS, schema])).rows[0].n;}

it.each([false, true])('actual main SIGTERM settles blocked maintenance or fails at its unchanged12s deadline (stuck=%s)', async stuck => {
  const runtime = await start(), lock = await db.connect();
  await lock.query('BEGIN'); await lock.query('LOCK TABLE engine_hospitality_shifts IN ACCESS EXCLUSIVE MODE');
  let exited: Promise<[number | null, NodeJS.Signals | null]> | undefined;
  try {
    await expect.poll(async () => (await db.query("SELECT count(*)::int AS n FROM pg_locks WHERE relation=$1::regclass AND NOT granted", [schema + '.engine_hospitality_shifts'])).rows[0].n, {timeout: 6000}).toBe(1);
    exited = once(runtime.child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
    const at = performance.now(); runtime.child.kill('SIGTERM');
    await expect.poll(async () => (await fetch(runtime.url + '/health/ready')).status).toBe(503);
    expect((await fetch(runtime.url + '/health/live')).status).toBe(200); expect(await owners()).toBe(1);
    if (!stuck) await lock.query('ROLLBACK');
    const [code, signal] = await exited, stopElapsedMs = performance.now() - at; expect(signal).toBeNull(); expect(code).toBe(stuck ? 1 : 0);
    if (stuck) {expect(stopElapsedMs).toBeGreaterThanOrEqual(11500); expect(runtime.stderr()).toContain('Platform shutdown failed or deadline exceeded');}
    await expect.poll(owners).toBe(0);
    console.log('Runtime main fault facts:', JSON.stringify({stuck, exitCode: code, signal, stopElapsedMs, shutdownBudgetMs: 12000, readinessDuringDrain: 503, livenessDuringDrain: 200, ownerCountDuringDrain: 1, ownerCountAfterExit: 0}));
  } finally {
    await lock.query('ROLLBACK'); lock.release();
    if (!exited && runtime.child.exitCode === null) {runtime.child.kill('SIGKILL');}
  }
}, 25000);
