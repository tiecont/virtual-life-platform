import { RoomDeltaSchema, RoomSnapshotSchema, RoomEndedSchema, type RoomDelta, type RoomSnapshot } from '@virtual-city/contracts';

export type RoomSyncResult = { state: RoomSnapshot; applied: boolean; gap: boolean };
export function applyRoomSnapshot(input: unknown): RoomSnapshot {
  return RoomSnapshotSchema.parse(input);
}
export function applyRoomDelta(current: RoomSnapshot, input: unknown): RoomSyncResult {
  const delta: RoomDelta = RoomDeltaSchema.parse(input);
  if (delta.state.epoch !== current.epoch || delta.state.roomId !== current.roomId || delta.state.worldSlug !== current.worldSlug || delta.state.membershipId !== current.membershipId || delta.state.self.accountId !== current.self.accountId) throw new Error('ROOM_CONTEXT_MISMATCH');
  if (delta.state.roomVersion <= current.roomVersion) return { state: current, applied: false, gap: false };
  if (delta.fromVersion !== current.roomVersion) return { state: current, applied: false, gap: true };
  return { state: delta.state, applied: true, gap: false };
}

export type RoomRecoveryView = {
  status: 'idle' | 'syncing' | 'active' | 'reconnecting' | 'interrupted';
  snapshot: RoomSnapshot | null;
  reason: 'transport-lost' | 'sequence-gap' | 'membership-reset' | 'world-unavailable' | 'server-stopping' | 'disconnected' | null;
};

// Sync tickets invalidate late ACKs from a transport or membership that has ended.
export class RoomRecovery {
  #generation = 0;
  #last: RoomSnapshot | null = null;
  #view: RoomRecoveryView = { status: 'idle', snapshot: null, reason: null };
  get view(): RoomRecoveryView { return structuredClone(this.#view); }
  beginSync() {
    this.#view = { status: 'syncing', snapshot: null, reason: this.#view.reason };
    return ++this.#generation;
  }
  acceptSnapshot(ticket: number, input: unknown): boolean {
    if (ticket !== this.#generation || this.#view.status !== 'syncing') return false;
    const snapshot = applyRoomSnapshot(input);
    const reset = this.#last && (this.#last.epoch !== snapshot.epoch || this.#last.membershipId !== snapshot.membershipId);
    this.#last = snapshot;
    this.#view = { status: 'active', snapshot, reason: reset ? 'membership-reset' : null };
    return true;
  }
  disconnect() {
    this.#generation++;
    // Never let a cached seat or peer projection look live while offline.
    if (this.#view.status !== 'idle' && this.#view.status !== 'interrupted') this.#view = { status: 'reconnecting', snapshot: null, reason: 'transport-lost' };
  }
  ended(input: unknown) {
    const event = RoomEndedSchema.parse(input);
    if (!this.#last || event.epoch !== this.#last.epoch || event.roomId !== this.#last.roomId) return;
    this.#generation++;
    this.#view = { status: event.reason === 'left' ? 'idle' : 'interrupted', snapshot: null, reason: event.reason === 'left' ? null : event.reason };
  }
  delta(input: unknown): boolean {
    if (this.#view.status !== 'active' || !this.#view.snapshot) return false;
    const result = applyRoomDelta(this.#view.snapshot, input);
    if (result.gap) {
      this.#generation++;
      this.#view = { status: 'syncing', snapshot: null, reason: 'sequence-gap' };
      return true;
    }
    this.#last = result.state;
    this.#view = { ...this.#view, snapshot: result.state };
    return false;
  }
}
