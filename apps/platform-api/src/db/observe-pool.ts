import type {Pool, PoolClient} from 'pg';
import {performance} from 'node:perf_hooks';
import {databaseObservation, recordDatabase, unsupportedDatabase, withDatabaseObservation} from '../common/database-observation';

type Callable = (...args: unknown[]) => unknown;
type Lease = {query: PoolClient['query']; release: PoolClient['release']; wrappedQuery: PoolClient['query']; wrappedRelease: PoolClient['release']};
const attached = new WeakMap<object, {references: number; restore(): void}>();

// Observe the frozen pg callback and Promise APIs without changing checkout/release ownership.
// No SQL, parameters, rows, connection strings or identities are retained.
export function observePool(pool: Pick<Pool, 'connect'>) {
  const existing = attached.get(pool);
  if (existing) {
    existing.references++; let released = false;
    return () => {if (released) return; released = true; if (--existing.references === 0) {existing.restore(); attached.delete(pool);}};
  }
  const connect = pool.connect, leases = new Map<PoolClient, Lease>(); let closed = false;
  function restoreClient(client: PoolClient) {
    const lease = leases.get(client); if (!lease) return;
    if (client.query === lease.wrappedQuery) client.query = lease.query;
    if (client.release === lease.wrappedRelease) client.release = lease.release;
    leases.delete(client);
  }
  function checkout(client: PoolClient) {
    if (closed || leases.has(client)) return client;
    // An externally supplied proxy/custom method with unstable identity is not patched.
    if (client.query !== client.query || client.release !== client.release) {unsupportedDatabase(databaseObservation()); return client;}
    const query = client.query, release = client.release;
    const wrappedQuery = function(this: PoolClient, ...args: unknown[]) {
      const observer = databaseObservation();
      if (!observer) return Reflect.apply(query as Callable, this, args);
      if (args[0] && typeof args[0] === 'object' && 'submit' in args[0]) {unsupportedDatabase(observer); return Reflect.apply(query as Callable, this, args);}
      const started = performance.now(); let finished = false;
      const finish = (failed: boolean) => {if (!finished) {finished = true; recordDatabase(observer, 'query', performance.now() - started, failed);}};
      const callback = args.at(-1);
      if (typeof callback === 'function') args[args.length - 1] = function(this: unknown, ...values: unknown[]) {finish(!!values[0]); return Reflect.apply(callback, this, values);};
      try {
        const result = Reflect.apply(query as Callable, this, args);
        if (typeof callback === 'function') return result;
        if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') return (result as Promise<unknown>).then(value => {finish(false); return value;}, error => {finish(true); throw error;});
        unsupportedDatabase(observer); return result;
      } catch (error) {finish(true); throw error;}
    } as PoolClient['query'];
    const wrappedRelease = function(this: PoolClient, ...args: unknown[]) {restoreClient(client); return Reflect.apply(release as Callable, this, args);} as PoolClient['release'];
    client.query = wrappedQuery; client.release = wrappedRelease; leases.set(client, {query, release, wrappedQuery, wrappedRelease}); return client;
  }
  const wrappedConnect = function(this: Pick<Pool, 'connect'>, ...args: unknown[]) {
    const observer = databaseObservation(), started = performance.now(), callback = args[0];
    if (typeof callback === 'function') {
      args[0] = function(this: unknown, error: Error | undefined, client: PoolClient | undefined, done: unknown) {
        recordDatabase(observer, 'pool_wait', performance.now() - started, !!error);
        return withDatabaseObservation(observer, () => Reflect.apply(callback, this, [error, client ? checkout(client) : client, client?.release ?? done]));
      };
      return Reflect.apply(connect as Callable, this, args);
    }
    try {
      return (Reflect.apply(connect as Callable, this, args) as Promise<PoolClient>).then(client => {
        recordDatabase(observer, 'pool_wait', performance.now() - started, false); return checkout(client);
      }, error => {recordDatabase(observer, 'pool_wait', performance.now() - started, true); throw error;});
    } catch (error) {recordDatabase(observer, 'pool_wait', performance.now() - started, true); throw error;}
  } as Pool['connect'];
  pool.connect = wrappedConnect;
  const entry = {references: 1, restore: () => {closed = true; if (pool.connect === wrappedConnect) pool.connect = connect; for (const client of leases.keys()) restoreClient(client);}};
  attached.set(pool, entry); let released = false;
  return () => {if (released) return; released = true; if (--entry.references === 0) {entry.restore(); attached.delete(pool);}};
}
