import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ChatMessageSchema, type ChatMessage } from '@virtual-city/contracts';
import { DomainError } from '../../../../../shared/common/errors';
export type SealedEvidence = { keyId: string; iv: Buffer; tag: Buffer; ciphertext: Buffer };
export class EvidenceCipher {
  #key: Buffer;
  constructor(key: string, readonly keyId: string) { if (!/^[a-f0-9]{64}$/i.test(key) || !/^[a-z0-9-]{1,32}$/.test(keyId)) throw new Error('Invalid safety evidence key'); this.#key = Buffer.from(key, 'hex'); }
  seal(context: string, value: unknown): SealedEvidence {
    const plain = Buffer.from(JSON.stringify(value)); if (plain.length > 32768) throw new DomainError('INVALID_REQUEST', 422, 'Evidence exceeds the supported size');
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.#key, iv); cipher.setAAD(Buffer.from('safety:v1:' + this.keyId + ':' + context));
    return { keyId: this.keyId, iv, ciphertext: Buffer.concat([cipher.update(plain), cipher.final()]), tag: cipher.getAuthTag() };
  }
  open(context: string, sealed: SealedEvidence): unknown {
    if (sealed.keyId !== this.keyId) throw new Error('Evidence key unavailable');
    const cipher = createDecipheriv('aes-256-gcm', this.#key, sealed.iv); cipher.setAAD(Buffer.from('safety:v1:' + this.keyId + ':' + context)); cipher.setAuthTag(sealed.tag);
    return JSON.parse(Buffer.concat([cipher.update(sealed.ciphertext), cipher.final()]).toString('utf8'));
  }
}
type Reference = { sealed: SealedEvidence; readers: Set<string>; subjectId: string; worldSlug: string; until: number };
// Encrypted volatile delivery-attempt references, not durable ordinary chat history.
export class MessageEvidenceCache {
  #items = new Map<string, Reference>();
  constructor(private cipher: EvidenceCipher, private now = Date.now) {}
  #sweep() { for (const [id, item] of this.#items) if (item.until <= this.now()) this.#items.delete(id); }
  maintain() { this.#sweep(); }
  record(event: ChatMessage, viewerId: string, worldSlug: string) {
    this.#sweep(); let item = this.#items.get(event.messageId);
    if (!item) {
      if (this.#items.size >= 1000) this.#items.delete(this.#items.keys().next().value!);
      item = { sealed: this.cipher.seal('message:' + event.messageId, ChatMessageSchema.parse(event)), readers: new Set(), subjectId: event.sender.id, worldSlug, until: this.now() + 300000 }; this.#items.set(event.messageId, item);
    }
    if (item.readers.size < 100) item.readers.add(viewerId);
  }
  read(viewerId: string, ids: string[]) {
    this.#sweep(); const events = ids.map(id => {
      const item = this.#items.get(id); if (!item?.readers.has(viewerId) || item.subjectId === viewerId) throw new DomainError('NOT_AVAILABLE', 404, 'Report context is unavailable');
      return ChatMessageSchema.parse(this.cipher.open('message:' + id, item.sealed));
    });
    if (events.some(event => event.sender.id !== events[0].sender.id || event.roomId !== events[0].roomId || event.epoch !== events[0].epoch)) throw new DomainError('INVALID_REQUEST', 422, 'Use one reported participant and room per report');
    return { messages: events, worldSlug: this.#items.get(ids[0])!.worldSlug };
  }
  forget(accountId: string) { for (const [id, item] of this.#items) { item.readers.delete(accountId); if (item.subjectId === accountId || !item.readers.size) this.#items.delete(id); } }
  close() { this.#items.clear(); }
}
