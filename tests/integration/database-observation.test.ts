import {it, expect} from 'vitest';
import {Pool, Query} from 'pg';
import {performance} from 'node:perf_hooks';
import {once} from 'node:events';
import {observePool} from '../../apps/platform-api/src/shared/database/observe-pool';
import {withDatabaseObservation} from '../../apps/platform-api/src/shared/common/database-observation';
import {RoomMetrics} from '../../apps/platform-api/src/features/rooms/modules/presence/application/metrics';

function pool() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw Error('Disposable local database only');
  return new Pool({connectionString: url.toString(), max: 1});
}
it('observes real pool waiting, SQL Promise/callback success and failure without retaining payloads or changing release semantics', async () => {
  const db = pool(), original = db.connect, stop = observePool(db), samples: {kind: string; ms: number; failed: boolean}[] = []; let unsupported = 0;
  const observer = {record: (kind: string, ms: number, failed: boolean) => samples.push({kind, ms, failed}), unsupported: () => {unsupported++;}};
  try {
    const held = await db.connect();
    const started = performance.now(), pending = withDatabaseObservation(observer, () => db.query('SELECT $1::text AS value', ['synthetic-private-value']));
    await new Promise(resolve => setTimeout(resolve, 40)); held.release();
    expect((await pending).rows[0].value).toBe('synthetic-private-value'); expect(performance.now() - started).toBeGreaterThanOrEqual(35);
    await withDatabaseObservation(observer, () => new Promise<void>((resolve, reject) => db.query('SELECT 3 AS value', (error, result) => {if (error) reject(error); else {expect(result.rows[0].value).toBe(3); resolve();}})));
    await expect(withDatabaseObservation(observer, () => db.query('SELECT * FROM n05_deliberately_absent_relation'))).rejects.toMatchObject({code: '42P01'});
    expect(samples.filter(item => item.kind === 'query')).toHaveLength(3); expect(samples.some(item => item.kind === 'query' && item.failed)).toBe(true);
    expect(samples.some(item => item.kind === 'pool_wait' && item.ms >= 30)).toBe(true);
    expect(unsupported).toBe(0);
    expect(JSON.stringify(samples)).not.toMatch(/synthetic-private-value|SELECT|absent_relation/);
    stop(); expect(db.connect).toBe(original);
    const client = await db.connect(); client.release(); expect(() => client.release()).toThrow();
  } finally {stop(); await db.end();}
});

it('attributes a pool handoff to the waiting command rather than the releasing callback context', async () => {
  const db = pool(), stop = observePool(db), metrics = new RoomMetrics();
  try {
    await Promise.all([
      metrics.command('room.join', async () => {await db.query('SELECT pg_sleep(0.04)');}),
      metrics.command('room.move', async () => {await db.query('SELECT 1');}),
    ]);
    const result = metrics.snapshot().phases, waiting = result.find(series => series.command === 'room.move')!, first = result.find(series => series.command === 'room.join')!;
    expect(waiting.timings.db_pool_wait.totalMs).toBeGreaterThanOrEqual(30);
    expect(waiting.timings.db_query.totalMs).toBeGreaterThan(0);
    expect(first.timings.db_query.totalMs).toBeGreaterThanOrEqual(30);
  } finally {stop(); metrics.close(); await db.end();}
});

it('reference-counts shared pool observers, keeps explicit checkout callbacks and reports uninstrumented Submittable queries honestly', async () => {
  const db = pool(), original = db.connect, a = observePool(db), b = observePool(db); let queries = 0, unsupported = 0;
  const observer = {record: (kind: string) => {if (kind === 'query') queries++;}, unsupported: () => {unsupported++;}};
  try {
    await withDatabaseObservation(observer, () => db.query('SELECT 1')); expect(queries).toBe(1);
    a(); expect(db.connect).not.toBe(original);
    await withDatabaseObservation(observer, () => new Promise<void>((resolve, reject) => db.connect((error, client, release) => {
      if (error || !client) {reject(error); return;}
      client.query('SELECT 2', queryError => {release(); if (queryError) reject(queryError); else resolve();});
    }))); expect(queries).toBe(2);
    const client = await db.connect();
    try {const query = new Query('SELECT 4'); const ended = once(query, 'end'); expect(withDatabaseObservation(observer, () => client.query(query))).toBe(query); await ended;}
    finally {client.release();}
    expect(unsupported).toBe(1); expect(queries).toBe(2);
    let observerFailures = 0;
    expect((await withDatabaseObservation({record: () => {observerFailures++; throw Error('observer failure');}, unsupported: () => {}}, () => db.query('SELECT 5 AS value'))).rows[0].value).toBe(5);
    expect(observerFailures).toBeGreaterThanOrEqual(2);
    b(); expect(db.connect).toBe(original);
  } finally {a(); b(); await db.end();}
});
