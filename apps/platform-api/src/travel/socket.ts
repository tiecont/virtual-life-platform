import { randomUUID } from 'node:crypto';
import { TravelRequestSchema, TravelAckSchema } from '@virtual-city/contracts';
import { WorldError } from '@virtual-city/world-sdk';
import type { createIdentityGateway } from '../identity/socket';
import { IdentityError } from '../identity/errors';
import { DomainError } from '../common/errors';
import type { TravelService } from './service';
export function registerTravelGateway(gateway: ReturnType<typeof createIdentityGateway>, travel: TravelService) {
  gateway.allowCommand('travel.request');
  gateway.io.on('connection', socket => {
    let pending = 0;
    socket.on('travel.request', async (raw: unknown, ack: unknown) => {
      if (typeof ack !== 'function') { socket.disconnect(true); return; }
      const parsed = TravelRequestSchema.safeParse(raw), requestId = parsed.success ? parsed.data.requestId : randomUUID();
      const reject = (code: string) => { const error = { code, retryable: ['RATE_LIMITED', 'WORLD_UNAVAILABLE', 'INTERNAL_ERROR'].includes(code) }; ack(TravelAckSchema.parse({ schemaVersion: 1, requestId, ok: false, error })); socket.emit('travel.failed', { schemaVersion: 1, requestId }); };
      if (!parsed.success) { reject('INVALID_REQUEST'); return; }
      if (pending >= 2) { reject('RATE_LIMITED'); return; } pending++;
      try {
        const result = await gateway.withSession(socket, (_actor, token) => travel.request(token, socket.id, parsed.data, () => socket.connected));
        if (socket.connected) { ack(TravelAckSchema.parse({ schemaVersion: 1, requestId, ok: true, result })); socket.emit(result.snapshot ? 'travel.accepted' : 'travel.failed', { schemaVersion: 1, requestId }); }
      } catch (error) {
        reject(error instanceof DomainError || error instanceof IdentityError || error instanceof WorldError ? error.code : 'INTERNAL_ERROR');
        if (error instanceof IdentityError && error.code === 'UNAUTHENTICATED') gateway.endSession(socket);
      } finally { pending--; }
    });
  });
}
