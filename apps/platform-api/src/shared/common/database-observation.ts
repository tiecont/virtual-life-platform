import {AsyncLocalStorage} from 'node:async_hooks';

export type DatabaseObservation = {active?(): boolean; record(kind: 'pool_wait' | 'query', ms: number, failed: boolean): void; unsupported(): void};
const observations = new AsyncLocalStorage<DatabaseObservation | undefined>();
export function databaseObservation() {const observer = observations.getStore(); try {return observer && (observer.active?.() ?? true) ? observer : undefined;} catch {return undefined;}}
export function withDatabaseObservation<T>(observer: DatabaseObservation | undefined, work: () => T): T {return observations.run(observer, work);}
export function recordDatabase(observer: DatabaseObservation | undefined, kind: 'pool_wait' | 'query', ms: number, failed: boolean) {
  try {if (observer && (observer.active?.() ?? true)) observer.record(kind, ms, failed);} catch { /* Observation cannot change database effects. */ }
}
export function unsupportedDatabase(observer: DatabaseObservation | undefined) {try {observer?.unsupported();} catch { /* Observation only. */ }}
