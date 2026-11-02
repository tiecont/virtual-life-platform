import { it, expect } from 'vitest';
import { WorldDefinitionSchema, WorldInvocationSchema } from '@virtual-city/contracts';
import { supportsContract } from '../src';

// Hand-authored wire-shape fixtures from the recorded audit, not legacy source imports.
it('does not mistake a Deadline HTTP room summary for a world manifest or hook authorization', () => {
  const room = { id: '00000000-0000-4000-8000-000000000001', publicCode: 'fixture', cafeId: '00000000-0000-4000-8000-000000000002', capacity: 40, seatCapacity: 30, occupancy: 0, claimedSeats: 0 };
  expect(WorldDefinitionSchema.safeParse(room).success).toBe(false);
  expect(WorldInvocationSchema.safeParse(room).success).toBe(false);
});
it('rejects a Maid versionless envelope instead of silently reinterpreting it', () => {
  const envelope = { requestId: '00000000-0000-4000-8000-000000000003', roomId: 'fixture-room', expectedVersion: 3, payload: { role: 'customer' } };
  expect(WorldInvocationSchema.safeParse(envelope).success).toBe(false);
  expect(WorldInvocationSchema.safeParse({ ...envelope, schemaVersion: 1 }).success).toBe(false);
  expect(supportsContract(0)).toBe(false); expect(supportsContract(1)).toBe(true); expect(supportsContract(2)).toBe(false);
});
