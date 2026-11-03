import { randomUUID } from 'node:crypto';
import { ChatSendSchema, ChatAckSchema, ChatErrorCodeSchema } from '@virtual-city/contracts';
import type { createIdentityGateway } from '../identity/socket';
import { DomainError } from '../common/errors';
import { ChatService, ChatError } from './chat';

export function registerChatGateway(gateway: ReturnType<typeof createIdentityGateway>, chat: ChatService) {
  gateway.allowCommand('chat.send');
  gateway.io.on('connection', socket => {
    let pending = 0;
    socket.on('chat.send', async (raw: unknown, ack: unknown) => {
      if (typeof ack !== 'function') { socket.disconnect(true); return; }
      const reply = ack;
      const parsed = ChatSendSchema.safeParse(raw); const requestId = parsed.success ? parsed.data.requestId : randomUUID();
      function reject(code: string) {
        if (socket.connected) reply(ChatAckSchema.parse({ schemaVersion: 1, requestId, ok: false, error: { code, retryable: ['RATE_LIMITED', 'MODERATION_UNAVAILABLE', 'WORLD_UNAVAILABLE', 'INTERNAL_ERROR'].includes(code) } }));
      }
      if (!parsed.success) { reject('INVALID_REQUEST'); return; }
      if (pending >= 8) { reject('RATE_LIMITED'); return; }
      pending++;
      try {
        const result = await gateway.withSession(socket, (_context, credential) => chat.send(credential, socket.id, parsed.data, (id, event) => {
          const recipient = gateway.io.of('/').sockets.get(id);
          if (!recipient?.connected || !recipient.conn.transport.writable) { chat.dropRecipient(); return false; }
          // Ephemeral delivery has no offline history or per-recipient guarantee;
          // replaceable transport buffers must not grow for a slow observer.
          recipient.volatile.emit('chat.message', event); return true;
        }));
        if (socket.connected) reply(ChatAckSchema.parse({ schemaVersion: 1, requestId, ok: true, result }));
      } catch (error) {
        const rawCode = error instanceof ChatError || error instanceof DomainError ? error.code : 'INTERNAL_ERROR';
        const code = ChatErrorCodeSchema.safeParse(rawCode); reject(code.success ? code.data : 'INTERNAL_ERROR');
        if (rawCode === 'UNAUTHENTICATED') gateway.endSession(socket);
      } finally { pending--; }
    });
  });
}
