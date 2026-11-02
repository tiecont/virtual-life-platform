import { randomUUID } from 'node:crypto';
import { RoomJoinSchema, RoomOwnCommandSchema, RoomAckSchema, type RoomJoin, type RoomOwnCommand } from '@virtual-city/contracts';
import { WorldError } from '@virtual-city/world-sdk';
import type { createIdentityGateway } from '../identity/socket';
import { DomainError } from '../common/errors';
import { IdentityError } from '../identity/errors';
import type { RoomService } from './service';

export function registerRoomGateway(gateway: ReturnType<typeof createIdentityGateway>, rooms: RoomService) {
  for (const name of ['room.join', 'room.leave', 'room.snapshot']) gateway.allowCommand(name);
  const unsubscribe = rooms.onEnded((ids, event) => { for (const id of ids) gateway.io.of('/').sockets.get(id)?.emit('room.ended', event); });
  gateway.io.on('connection', socket => {
    let pending = 0;
    function handle<T extends RoomJoin | RoomOwnCommand>(name: string, schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }, run: (credential: string, input: T) => Promise<unknown>) {
      socket.on(name, async (input: unknown, ack: unknown) => {
        if (typeof ack !== 'function') { socket.disconnect(true); return; }
        const parsed = schema.safeParse(input); const requestId = parsed.success ? parsed.data.requestId : randomUUID();
        const reject = (code: string) => ack(RoomAckSchema.parse({ schemaVersion: 1, requestId, ok: false, error: { code, retryable: ['RATE_LIMITED', 'INTERNAL_ERROR', 'WORLD_UNAVAILABLE'].includes(code) } }));
        if (!parsed.success) { reject('INVALID_REQUEST'); return; }
        if (pending >= 8) { reject('RATE_LIMITED'); return; }
        pending++;
        try {
          const result = await gateway.withSession(socket, (_context, credential) => run(credential, parsed.data));
          if (socket.connected) ack(RoomAckSchema.parse({ schemaVersion: 1, requestId, ok: true, result }));
        } catch (error) {
          const code = error instanceof DomainError || error instanceof IdentityError || error instanceof WorldError ? error.code : 'INTERNAL_ERROR';
          reject(code); if (code === 'UNAUTHENTICATED') socket.disconnect(true);
        } finally { pending--; }
      });
    }
    handle('room.join', RoomJoinSchema, (credential, input) => rooms.join(credential, socket.id, input, () => socket.connected));
    handle('room.leave', RoomOwnCommandSchema, (credential, input) => rooms.leave(credential, socket.id, input));
    handle('room.snapshot', RoomOwnCommandSchema, (credential, input) => rooms.snapshot(credential, socket.id, input));
    socket.once('disconnect', () => { void rooms.detach(socket.id); });
  });
  return unsubscribe;
}
