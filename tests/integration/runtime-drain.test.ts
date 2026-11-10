import {afterAll, afterEach, beforeAll, expect, it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {io, type Socket} from 'socket.io-client';
import {MeSchema, RoomAckSchema, type RoomSnapshot} from '@virtual-city/contracts';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {RuntimeLifecycle} from '../../apps/platform-api/src/features/operations/modules/lifecycle/application/runtime-lifecycle';

let admin: Pool;
type Runtime = {schema: string; role?: string; pool: Pool; poolClosed: boolean; app: Awaited<ReturnType<typeof createApp>>; config: ReturnType<typeof readConfig>; url: string};
const opened: Runtime[] = [];
const sockets = new Set<Socket>();
beforeAll(() => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw Error('Disposable local database only');
  admin = new Pool({connectionString: url.toString()});
});
afterEach(async () => {
  for (const socket of sockets) socket.close(); sockets.clear();
  for (const r of opened.splice(0)) {
    if (r.role) await admin.query(`ALTER ROLE "${r.role}" LOGIN`);
    await r.app.app.close(); if (!r.poolClosed) await r.pool.end();
    await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`);
    if (r.role) await admin.query(`DROP ROLE "${r.role}"`);
  }
});
afterAll(async () => {await admin.end();});
async function open(restricted = false): Promise<Runtime> {
  const suffix = randomUUID().replaceAll('-', ''), schema = 'runtime_drain_' + suffix;
  const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const migrationPool = new Pool({connectionString: url.toString()});
  try {await migrate(migrationPool);} finally {await migrationPool.end();}
  const role = restricted ? 'runtime_drain_' + suffix : undefined;
  if (role) {
    const password = randomUUID();
    await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
    await admin.query(`GRANT ALL ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`);
    await admin.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${role}"`);
    url.username = role; url.password = password;
  }
  const pool = new Pool({connectionString: url.toString(), connectionTimeoutMillis: 500}); pool.on('error', () => {});
  const config = readConfig({NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: randomUUID().repeat(2)});
  const app = await createApp(config, pool);
  await app.app.listen(0, '127.0.0.1');
  const result = {schema, role, pool, poolClosed: false, app, config, url: await app.app.getUrl()}; opened.push(result); return result;
}

it('settles an actually blocked PostgreSQL maintenance transaction before releasing the owner and pool', async () => {
  const r = await open(); expect((await fetch(r.url + '/health/ready')).status).toBe(200);
  await r.pool.query('CREATE TABLE synthetic_shutdown_effects(id integer PRIMARY KEY)');
  const lock = await admin.connect(), key = randomUUID();
  await lock.query('SELECT pg_advisory_lock(1447840562,hashtext($1))', [key]);
  let completed = false, failures = 0;
  const lifecycle = new RuntimeLifecycle({beginDrain: r.app.beginDrain, closeApp: () => r.app.app.close(), closePool: async () => {r.poolClosed = true; await r.pool.end();}});
  const work = lifecycle.run(async () => {
    const db = await r.pool.connect();
    try {await db.query('BEGIN'); await db.query('INSERT INTO synthetic_shutdown_effects VALUES(1)'); await db.query('SELECT pg_advisory_xact_lock(1447840562,hashtext($1))', [key]); await db.query('COMMIT'); completed = true;}
    catch (error) {await db.query('ROLLBACK'); throw error;} finally {db.release();}
  }, () => {failures++;});
  let stopping: Promise<void> | undefined;
  try {
    await expect.poll(async () => (await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event='advisory' AND query=$1", ['SELECT pg_advisory_xact_lock(1447840562,hashtext($1))'])).rows[0].n).toBe(1);
    stopping = lifecycle.stop(); expect(completed).toBe(false); expect(r.app.diagnostics().authority).toBe('held');
    expect((await fetch(r.url + '/health/ready')).status).toBe(503); expect((await fetch(r.url + '/health/live')).status).toBe(200);
    const observer = new Pool({connectionString: new URL(process.env.TEST_DATABASE_URL!).toString()});
    try {expect((await observer.query(`SELECT * FROM "${r.schema}".synthetic_shutdown_effects`)).rowCount).toBe(0);} finally {await observer.end();}
  } finally {
    await lock.query('SELECT pg_advisory_unlock(1447840562,hashtext($1))', [key]); lock.release(); await work; await stopping;
  }
  expect(failures).toBe(0); expect(completed).toBe(true); expect(lifecycle.state).toBe('closed'); expect(r.app.diagnostics().authority).toBe('closed');
  expect((await admin.query(`SELECT * FROM "${r.schema}".synthetic_shutdown_effects`)).rows).toEqual([{id: 1}]);
});

it('fences the old owner through a real API-role database-access outage and requires a new process epoch after access returns', async () => {
  const r = await open(true); expect((await fetch(r.url + '/health/ready')).status).toBe(200);
  await r.app.worlds.registry.setEnabled('sdk-sandbox', true);
  const origin = 'http://127.0.0.1:3300', response = await fetch(r.url + '/v1/session/guest', {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({requestId: randomUUID(), displayName: 'Database outage fixture', avatarKey: 'mint'})});
  expect(response.status).toBe(201); const cookie = response.headers.getSetCookie()[0].split(';')[0], me = MeSchema.parse(await response.json());
  const connect = async (url: string) => {
    const socket = io(url, {forceNew: true, autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: {origin, cookie}, auth: {schemaVersion: 1, csrfToken: me.csrfToken}}); sockets.add(socket);
    await new Promise<void>((resolve, reject) => {socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect();}); return socket;
  };
  const join = async (socket: Socket): Promise<RoomSnapshot> => {
    const ack = RoomAckSchema.parse(await socket.timeout(3000).emitWithAck('room.join', {schemaVersion: 1, requestId: randomUUID(), worldSlug: 'sdk-sandbox', worldVersion: '1.0.0', sceneVersion: '1.0.0'}));
    if (!ack.ok || ack.result.type !== 'snapshot') throw Error('Outage fixture join failed'); return ack.result;
  };
  const socket = await connect(r.url), before = await join(socket); let deltas = 0;
  socket.on('room.delta', () => {deltas++;});
  const epoch = r.app.rooms.epoch;
  try {
    await admin.query(`ALTER ROLE "${r.role}" NOLOGIN`);
    const victims = await admin.query('SELECT pid FROM pg_stat_activity WHERE usename=$1 AND datname=current_database()', [r.role]); expect(victims.rows.length).toBeGreaterThan(0);
    for (const {pid} of victims.rows) await admin.query('SELECT pg_terminate_backend($1)', [pid]);
    await expect.poll(() => r.app.diagnostics().authority).toBe('lost');
    await expect.poll(() => socket.connected).toBe(false); expect(deltas).toBe(0);
    expect((await fetch(r.url + '/health/live')).status).toBe(200); expect((await fetch(r.url + '/health/ready')).status).toBe(503);
  } finally {await admin.query(`ALTER ROLE "${r.role}" LOGIN`);}
  expect((await fetch(r.url + '/health/ready')).status).toBe(503); await expect(r.app.rooms.maintain()).resolves.toBeUndefined();
  const stale = {schemaVersion: 1, requestId: randomUUID(), epoch, roomId: before.roomId, membershipId: before.membershipId};
  const old = await connect(r.url), denied = RoomAckSchema.parse(await old.timeout(3000).emitWithAck('room.snapshot', stale));
  expect(denied).toMatchObject({ok: false, error: {code: 'WORLD_UNAVAILABLE'}});
  // Same DB/role restored; the terminal old owner must not silently reacquire.
  const replacement = await createApp(r.config, r.pool);
  try {
    await replacement.worlds.registry.setEnabled('sdk-sandbox', true); await replacement.app.listen(0, '127.0.0.1');
    const url = await replacement.app.getUrl(); expect((await fetch(url + '/health/ready')).status).toBe(200); expect(replacement.rooms.epoch).not.toBe(epoch);
    const fresh = await connect(url), reset = RoomAckSchema.parse(await fresh.timeout(3000).emitWithAck('room.snapshot', stale)); expect(reset).toMatchObject({ok: false, error: {code: 'NOT_IN_ROOM'}});
    const current = await join(fresh); expect(current.membershipId).not.toBe(before.membershipId); expect(current.self.seatId).toBeNull();
  }
  finally {await replacement.app.close();}
  expect(r.app.diagnostics().authority).toBe('lost');
});
