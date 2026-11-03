import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { EvidenceCipher, MessageEvidenceCache } from './evidence';
import type { ChatMessage } from '@virtual-city/contracts';

it('AES-GCM rejects modified ciphertext, key identity, swapped context and wrong keys', () => {
  const cipher = new EvidenceCipher('12'.repeat(32), 'test-v1'); const sealed = cipher.seal('case:one', { note: 'Private evidence' });
  expect(sealed.ciphertext.includes(Buffer.from('Private evidence'))).toBe(false);
  expect(cipher.open('case:one', sealed)).toEqual({ note: 'Private evidence' });
  expect(() => cipher.open('case:two', sealed)).toThrow();
  expect(() => new EvidenceCipher('23'.repeat(32), 'test-v1').open('case:one', sealed)).toThrow();
  expect(() => cipher.open('case:one', { ...sealed, keyId: 'different' })).toThrow();
  const changed = Buffer.from(sealed.ciphertext); changed[0] ^= 1;
  expect(() => cipher.open('case:one', { ...sealed, ciphertext: changed })).toThrow();
});

it('volatile message evidence requires an actual projected recipient, expires and can be forgotten', () => {
  let now = 100; const cipher = new EvidenceCipher('34'.repeat(32), 'test-v1'); const cache = new MessageEvidenceCache(cipher, () => now);
  const viewer = randomUUID(), sender = randomUUID();
  const event: ChatMessage = { schemaVersion: 1, messageId: randomUUID(), epoch: randomUUID(), roomId: randomUUID(), createdAt: new Date().toISOString(), sender: { id: sender, displayName: 'Visitor', avatarKey: 'mint' }, content: { kind: 'text', text: 'Xin chào' } };
  cache.record(event, viewer, 'maid');
  expect(cache.read(viewer, [event.messageId]).messages).toEqual([event]);
  expect(() => cache.read(randomUUID(), [event.messageId])).toThrow();
  expect(() => cache.read(sender, [event.messageId])).toThrow();
  now += 300000; expect(() => cache.read(viewer, [event.messageId])).toThrow();
  cache.record({ ...event, messageId: randomUUID() }, viewer, 'maid'); cache.forget(sender);
  expect(() => cache.read(viewer, [event.messageId])).toThrow(); cache.close();
});
