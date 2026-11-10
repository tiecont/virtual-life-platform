import {performance, monitorEventLoopDelay, type IntervalHistogram} from 'node:perf_hooks';
import {AsyncLocalStorage} from 'node:async_hooks';
import {withDatabaseObservation} from '../../../../../shared/common/database-observation';

export const ROOM_COMMANDS = ['room.join', 'room.leave', 'room.snapshot', 'seat.claim', 'seat.release', 'room.move'] as const;
export type RoomCommandName = typeof ROOM_COMMANDS[number];
const buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, Infinity];
const outcomes = new Set(['OK', 'INVALID_REQUEST', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR', 'WORLD_UNAVAILABLE', 'WORLD_VERSION_MISMATCH', 'ROOM_FULL', 'ALREADY_IN_ROOM', 'NOT_IN_ROOM', 'IDEMPOTENCY_CONFLICT', 'SEAT_TAKEN', 'ALREADY_SEATED']);
export const ROOM_PHASES = ['queue_wait', 'execution', 'projection', 'fanout', 'path_compute', 'db_pool_wait', 'db_query'] as const;
export type RoomPhase = typeof ROOM_PHASES[number];
type PhaseCommand = RoomCommandName | 'internal';
type Timing = {count: number; totalMs: number; maxMs: number; buckets: number[]};
type CommandContext = {command: PhaseCommand; lifetime: {active: boolean}; totals: Record<RoomPhase, number>; stack: ReadonlySet<RoomPhase>; databaseErrors: number; unsupportedDatabaseCalls: number};

// Process-local operator diagnostics only: fixed labels, no identities/worlds or raw samples.
export class RoomMetrics {
  #context = new AsyncLocalStorage<CommandContext>();
  #phases = new Map<string, {command: PhaseCommand; outcome: string; timings: Record<RoomPhase, Timing>; databaseErrors: number; unsupportedDatabaseCalls: number}>();
  #eventLoop?: IntervalHistogram;
  #databaseAttached = false;
  #closed = false;
  databaseAttached(active: boolean) {this.#databaseAttached = active;}
  async command<T>(command: PhaseCommand, work: () => Promise<T>): Promise<T> {
    if (this.#closed) return work();
    if (command !== 'internal' && !ROOM_COMMANDS.includes(command)) command = 'internal';
    const context: CommandContext = {command, lifetime: {active: true}, totals: Object.fromEntries(ROOM_PHASES.map(phase => [phase, 0])) as Record<RoomPhase, number>, stack: new Set(), databaseErrors: 0, unsupportedDatabaseCalls: 0};
    let outcome = 'OK';
    return this.#context.run(context, () => withDatabaseObservation({active: () => context.lifetime.active, record: (kind, ms, failed) => {if (Number.isFinite(ms) && ms >= 0) context.totals[kind === 'query' ? 'db_query' : 'db_pool_wait'] += ms; context.databaseErrors += Number(failed);}, unsupported: () => {context.unsupportedDatabaseCalls++;}}, async () => {
      try {return await work();}
      catch (error) {let code: unknown; try {code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;} catch { /* Preserve the original exception. */ } outcome = typeof code === 'string' && outcomes.has(code) ? code : 'INTERNAL_ERROR'; throw error;}
      finally {
        context.lifetime.active = false;
        // Fixed command/outcome keys and fixed buckets; never retain individual samples or inputs.
        const key = command + ':' + outcome; let series = this.#phases.get(key);
        if (!series) {series = {command, outcome, timings: Object.fromEntries(ROOM_PHASES.map(phase => [phase, {count: 0, totalMs: 0, maxMs: 0, buckets: buckets.map(() => 0)}])) as Record<RoomPhase, Timing>, databaseErrors: 0, unsupportedDatabaseCalls: 0}; this.#phases.set(key, series);}
        series.databaseErrors += context.databaseErrors; series.unsupportedDatabaseCalls += context.unsupportedDatabaseCalls;
        for (const phase of ROOM_PHASES) {const ms = context.totals[phase], timing = series.timings[phase]; timing.count++; timing.totalMs += ms; timing.maxMs = Math.max(timing.maxMs, ms); timing.buckets[buckets.findIndex(bound => ms <= bound)]++;}
      }
    }));
  }
  recordPhase(phase: RoomPhase, ms: number) {
    const context = this.#context.getStore();
    if (context?.lifetime.active && ROOM_PHASES.includes(phase) && Number.isFinite(ms) && ms >= 0) context.totals[phase] += ms;
  }
  async phase<T>(phase: RoomPhase, work: () => Promise<T>): Promise<T> {
    const context = this.#context.getStore(); if (!context || context.stack.has(phase)) return work();
    const started = performance.now();
    try {return await this.#context.run({...context, stack: new Set([...context.stack, phase])}, work);}
    finally {this.recordPhase(phase, performance.now() - started);}
  }
  syncPhase<T>(phase: RoomPhase, work: () => T): T {
    const started = performance.now(); try {return work();} finally {this.recordPhase(phase, performance.now() - started);}
  }
  observeEventLoop() {
    if (this.#closed) return () => {};
    if (!this.#eventLoop) {this.#eventLoop = monitorEventLoopDelay({resolution: 20}); this.#eventLoop.enable();}
    return () => {this.#eventLoop?.disable(); this.#eventLoop = undefined;};
  }
  close() {this.#closed = true; this.#eventLoop?.disable(); this.#eventLoop = undefined; this.#context.disable();}
  #commands = new Map(ROOM_COMMANDS.map(name => [name, { count: 0, errors: {} as Record<string, number>, buckets: buckets.map(() => 0), totalMs: 0, maxMs: 0 }]));
  #pending = 0;
  #pendingPeak = 0;
  #dropped = 0;
  #slowDisconnected = 0;
  begin() {
    const started = performance.now(); this.#pending++; this.#pendingPeak = Math.max(this.#pendingPeak, this.#pending);
    let finished = false;
    return (name: RoomCommandName, code: string) => {
      if (finished) return; finished = true; this.#pending--;
      this.observe(name, code, performance.now() - started);
    };
  }
  observe(name: RoomCommandName, code: string, ms: number) {
    const item = this.#commands.get(name)!; const outcome = outcomes.has(code) ? code : 'INTERNAL_ERROR';
    item.count++; item.errors[outcome] = (item.errors[outcome] ?? 0) + 1;
    item.totalMs += ms; item.maxMs = Math.max(item.maxMs, ms);
    item.buckets[buckets.findIndex(bound => ms <= bound)]++;
  }
  dropDelta(disconnected: boolean) { this.#dropped++; if (disconnected) this.#slowDisconnected++; }
  snapshot() {
    const loop = this.#eventLoop, count = loop?.count ?? 0;
    return {
      phases: [...this.#phases.values()].map(series => ({...series, timings: Object.fromEntries(ROOM_PHASES.map(phase => {const item = series.timings[phase]; return [phase, {...item, buckets: item.buckets.map((count, index) => ({upperMs: Number.isFinite(buckets[index]) ? buckets[index] : null, count}))}];}))})),
      phaseScope: 'Six public room-command owner contexts only; nested projection/execution contain DB spans; do not add phases or infer CPU/network from residuals',
      databaseObservation: {status: this.#databaseAttached ? 'active' : 'not_attached', scope: 'Initiated pg calls in owner-work context; unsupported call counts mark incomplete coverage'},
      eventLoop: {status: loop ? count ? 'available' : 'warming' : 'not_started', source: 'node:perf_hooks.monitorEventLoopDelay', resolutionMs: 20, count, p50Ms: count ? loop!.percentile(50) / 1e6 : null, p95Ms: count ? loop!.percentile(95) / 1e6 : null, p99Ms: count ? loop!.percentile(99) / 1e6 : null, maxMs: count ? loop!.max / 1e6 : null},
      pendingCommands: this.#pending, peakPendingCommands: this.#pendingPeak,
      droppedDeltas: this.#dropped, slowConsumerDisconnects: this.#slowDisconnected,
      commands: Object.fromEntries([...this.#commands].map(([name, value]) => [name, {
        ...value, errors: { ...value.errors },
        buckets: value.buckets.map((count, i) => ({ upperMs: Number.isFinite(buckets[i]) ? buckets[i] : null, count })),
      }])),
    };
  }
}
