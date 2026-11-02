import { it, expect } from 'vitest';
import { applyRoomDelta, applyRoomSnapshot } from '../src';
const base = { schemaVersion: 1, type: 'snapshot', epoch: '00000000-0000-4000-8000-000000000001', roomId: '00000000-0000-4000-8000-000000000002', worldSlug: 'sdk-sandbox', roomVersion: 1, capacity: 8, occupancy: 1, membershipId: '00000000-0000-4000-8000-000000000003', self: { accountId: '00000000-0000-4000-8000-000000000004', seatId: null }, seats: [{ seatId: 'seat-1', state: 'available', mine: false }], participants: [] } as const;
it('applies only contiguous deltas and reports a gap for resync', () => {
  const current = applyRoomSnapshot(base); const next = { ...base, roomVersion: 2, seats: [{ seatId: 'seat-1', state: 'occupied', mine: true }], self: { ...base.self, seatId: 'seat-1' } };
  expect(applyRoomDelta(current, { schemaVersion: 1, type: 'delta', fromVersion: 1, state: next }).applied).toBe(true);
  expect(applyRoomDelta(current, { schemaVersion: 1, type: 'delta', fromVersion: 0, state: next }).gap).toBe(true);
  expect(applyRoomDelta(current, { schemaVersion: 1, type: 'delta', fromVersion: 1, state: { ...next, roomVersion: 1 } }).applied).toBe(false);
});
it('rejects old room/world context and non-advancing delta envelopes', () => {
  const current = applyRoomSnapshot(base);
  expect(() => applyRoomDelta(current, { schemaVersion: 1, type: 'delta', fromVersion: 1, state: { ...base, roomVersion: 2, roomId: '00000000-0000-4000-8000-000000000005' } })).toThrow('ROOM_CONTEXT_MISMATCH');
  expect(applyRoomDelta(current, { schemaVersion: 1, type: 'delta', fromVersion: 2, state: { ...base, roomVersion: 2 } }).gap).toBe(true);
});
