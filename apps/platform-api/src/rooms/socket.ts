import { randomUUID } from 'node:crypto';
import { RoomJoinSchema, RoomOwnCommandSchema, RoomAckSchema, SeatClaimSchema, SeatReleaseSchema, type RoomJoin, type RoomOwnCommand, type SeatClaim, type SeatRelease } from '@virtual-city/contracts';
import { WorldError } from '@virtual-city/world-sdk';
import type { createIdentityGateway } from '../identity/socket';
import { DomainError } from '../common/errors';
import { IdentityError } from '../identity/errors';
import type { RoomService } from './service';
import { RoomMetrics, type RoomCommandName } from './metrics';

export function registerRoomGateway(gateway: ReturnType<typeof createIdentityGateway>, rooms: RoomService, metrics = new RoomMetrics()) {
  const stalled = new WeakMap<object, number>();
  for (const name of ['room.join', 'room.leave', 'room.snapshot', 'seat.claim', 'seat.release']) gateway.allowCommand(name);
  const unsubscribe = rooms.onEnded((ids, event) => { for (const id of ids) gateway.io.of('/').sockets.get(id)?.emit('room.ended', event); });
  const unsubscribeChanged = rooms.onChanged(updates => {
    for (const update of updates) {
      const socket = gateway.io.of('/').sockets.get(update.connectionId); if (!socket?.connected) continue;
      // Replaceable deltas may be dropped: the next sequence gap requires snapshot sync.
      if (!socket.conn.transport.writable) {
        const count = (stalled.get(socket) ?? 0) + 1; stalled.set(socket, count);
        metrics.dropDelta(count >= 32); if (count >= 32) socket.disconnect(true); continue;
      }
      stalled.delete(socket);
      socket.volatile.emit('room.delta', { schemaVersion: 1, type: 'delta', fromVersion: update.fromVersion, state: update.snapshot });
    }
  });
  const unsubscribeSessions = gateway.onSessionEnded(context => { void rooms.endSessions(context.accountId, [context.sessionId]); });
  gateway.io.on('connection', socket => {
    let pending = 0;
    function handle<T extends RoomJoin | RoomOwnCommand | SeatClaim | SeatRelease>(name: RoomCommandName, schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }, run: (credential: string, input: T) => Promise<unknown>) {
      socket.on(name, async (input: unknown, ack: unknown) => {
        if (typeof ack !== 'function') { socket.disconnect(true); return; }
        const parsed = schema.safeParse(input); const requestId = parsed.success ? parsed.data.requestId : randomUUID();
        const reject = (code: string) => ack(RoomAckSchema.parse({ schemaVersion: 1, requestId, ok: false, error: { code, retryable: ['RATE_LIMITED', 'INTERNAL_ERROR', 'WORLD_UNAVAILABLE'].includes(code) } }));
        if (!parsed.success) { metrics.observe(name, 'INVALID_REQUEST', 0); reject('INVALID_REQUEST'); return; }
        if (pending >= 8) { metrics.observe(name, 'RATE_LIMITED', 0); reject('RATE_LIMITED'); return; }
        pending++;
        const finish = metrics.begin(); let outcome = 'OK';
        try {
          const result = await gateway.withSession(socket, (_context, credential) => run(credential, parsed.data));
          if (socket.connected) ack(RoomAckSchema.parse({ schemaVersion: 1, requestId, ok: true, result }));
        } catch (error) {
          const code = error instanceof DomainError || error instanceof IdentityError || error instanceof WorldError ? error.code : 'INTERNAL_ERROR';
          outcome = code;
          reject(code); if (code === 'UNAUTHENTICATED') gateway.endSession(socket);
        } finally { pending--; finish(name, outcome); }
      });
    }
    handle('room.join', RoomJoinSchema, (credential, input) => rooms.join(credential, socket.id, input, () => socket.connected));
    handle('room.leave', RoomOwnCommandSchema, (credential, input) => rooms.leave(credential, socket.id, input));
    handle('room.snapshot', RoomOwnCommandSchema, (credential, input) => rooms.snapshot(credential, socket.id, input));
    handle('seat.claim', SeatClaimSchema, (credential, input) => rooms.seat(credential, socket.id, input, 'seat.claim'));
    handle('seat.release', SeatReleaseSchema, (credential, input) => rooms.seat(credential, socket.id, input, 'seat.release'));
    socket.once('disconnect', () => { void rooms.detach(socket.id); });
  });
  return () => { unsubscribe(); unsubscribeChanged(); unsubscribeSessions(); };
}
