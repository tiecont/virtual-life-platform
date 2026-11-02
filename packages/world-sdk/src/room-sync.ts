import { RoomDeltaSchema, RoomSnapshotSchema, type RoomDelta, type RoomSnapshot } from '@virtual-city/contracts';

export type RoomSyncResult = { state: RoomSnapshot; applied: boolean; gap: boolean };
export function applyRoomSnapshot(input: unknown): RoomSnapshot {
  return RoomSnapshotSchema.parse(input);
}
export function applyRoomDelta(current: RoomSnapshot, input: unknown): RoomSyncResult {
  const delta: RoomDelta = RoomDeltaSchema.parse(input);
  if (delta.state.epoch !== current.epoch || delta.state.roomId !== current.roomId || delta.state.worldSlug !== current.worldSlug) throw new Error('ROOM_CONTEXT_MISMATCH');
  if (delta.state.roomVersion <= current.roomVersion) return { state: current, applied: false, gap: false };
  if (delta.fromVersion !== current.roomVersion) return { state: current, applied: false, gap: true };
  return { state: delta.state, applied: true, gap: false };
}
