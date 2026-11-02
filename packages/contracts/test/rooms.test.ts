import { it, expect } from 'vitest';
import { RoomSnapshotSchema } from '../src';
const fixture = {
  schemaVersion: 1, type: 'snapshot', epoch: '00000000-0000-4000-8000-000000000001', roomId: '00000000-0000-4000-8000-000000000002', worldSlug: 'sdk-sandbox', roomVersion: 1,
  capacity: 8, occupancy: 1, membershipId: '00000000-0000-4000-8000-000000000003', self: { accountId: '00000000-0000-4000-8000-000000000004', seatId: null }, seats: [{ seatId: 'seat-1', state: 'available', mine: false }],
};
it('rejects inconsistent capacity, duplicate seats and a forged self-seat projection', () => {
  expect(RoomSnapshotSchema.safeParse(fixture).success).toBe(true);
  for (const change of [{ occupancy: 9 }, { seats: [fixture.seats[0], fixture.seats[0]] }, { seats: [{ seatId: 'seat-1', state: 'occupied', mine: true }] }, { self: { ...fixture.self, seatId: 'missing-seat' } }]) expect(RoomSnapshotSchema.safeParse({ ...fixture, ...change }).success).toBe(false);
});
