import {expect, it} from 'vitest';
import {CommandEnvelopeSchema, ChatSendSchema, RoomOwnCommandSchema, RoomMoveSchema, SeatClaimSchema} from '../src';

const own = {schemaVersion: 1, requestId: '00000000-0000-4000-8000-000000000001', epoch: '00000000-0000-4000-8000-000000000002', roomId: '00000000-0000-4000-8000-000000000003', membershipId: '00000000-0000-4000-8000-000000000004'};

it('accepts bounded optional ordering without changing the exact legacy command shape or accepting actor authority', () => {
  expect(RoomOwnCommandSchema.parse(own)).toEqual(own);
  for (const clientSeq of [0, 1, 2147483647]) {
    expect(SeatClaimSchema.safeParse({...own, seatId: 'seat-1', clientSeq}).success).toBe(true);
    expect(RoomMoveSchema.safeParse({...own, destination: {x: 2, y: 3}, clientSeq}).success).toBe(true);
  }
  for (const clientSeq of [-1, 0.5, 2147483648, Number.MAX_SAFE_INTEGER, Infinity, '1', null]) expect(RoomOwnCommandSchema.safeParse({...own, clientSeq}).success).toBe(false);
  for (const extra of [{actorId: own.requestId}, {role: 'admin'}, {serverSeq: 100}, {position: {x: 1, y: 1}}]) expect(SeatClaimSchema.safeParse({...own, seatId: 'seat-1', clientSeq: 0, ...extra}).success).toBe(false);
});

it('keeps the shared envelope strict and does not add ordering to the chat transport', () => {
  const envelope = {schemaVersion: own.schemaVersion, requestId: own.requestId}; expect(CommandEnvelopeSchema.parse(envelope)).toEqual(envelope);
  for (const extra of [{actorId: own.requestId}, {clientSeq: 0}, {schemaVersion: 2}, {requestId: 'latest'}]) expect(CommandEnvelopeSchema.safeParse({...envelope, ...extra}).success).toBe(false);
  const chat = {...own, content: {kind: 'emote', id: 'wave'}};
  expect(ChatSendSchema.safeParse(chat).success).toBe(true); expect(ChatSendSchema.safeParse({...chat, clientSeq: 0}).success).toBe(false);
});
