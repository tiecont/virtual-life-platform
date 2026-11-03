import { performance } from 'node:perf_hooks';

export const ROOM_COMMANDS = ['room.join', 'room.leave', 'room.snapshot', 'seat.claim', 'seat.release', 'room.move'] as const;
export type RoomCommandName = typeof ROOM_COMMANDS[number];
const buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, Infinity];
const outcomes = new Set(['OK', 'INVALID_REQUEST', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR', 'WORLD_UNAVAILABLE', 'WORLD_VERSION_MISMATCH', 'ROOM_FULL', 'ALREADY_IN_ROOM', 'NOT_IN_ROOM', 'IDEMPOTENCY_CONFLICT', 'SEAT_TAKEN', 'ALREADY_SEATED']);

// Process-local operator diagnostics only: fixed labels, no identities/worlds or raw samples.
export class RoomMetrics {
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
    return {
      pendingCommands: this.#pending, peakPendingCommands: this.#pendingPeak,
      droppedDeltas: this.#dropped, slowConsumerDisconnects: this.#slowDisconnected,
      commands: Object.fromEntries([...this.#commands].map(([name, value]) => [name, {
        ...value, errors: { ...value.errors },
        buckets: value.buckets.map((count, i) => ({ upperMs: Number.isFinite(buckets[i]) ? buckets[i] : null, count })),
      }])),
    };
  }
}
