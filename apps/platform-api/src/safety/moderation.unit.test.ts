import { it, expect } from 'vitest';
import { LocalChatModerator, normalizeChatText, inspectionKey } from './moderation';

it('normalizes fullwidth/zero-width/whitespace while rejecting oversized controls and markup', () => {
  expect(normalizeChatText('  Ｈｅｌｌｏ\t\u200b friends  ')).toBe('Hello friends');
  expect(inspectionKey('Xin Chào, Mọi Người!')).toBe('xin chao moi nguoi');
  for (const text of [' ', 'hello\u0000', '<script>', '😀'.repeat(257)]) expect(() => normalizeChatText(text)).toThrow('INVALID_CHAT_TEXT');
});
it('allows only curated benign phrases, rejects explicit abuse and holds ambiguous text without issuing sanctions', async () => {
  const moderator = new LocalChatModerator(); const signal = new AbortController().signal;
  expect(await moderator.inspect(normalizeChatText('Xin chào mọi người!'), signal)).toEqual({ decision: 'allow' });
  expect(await moderator.inspect(normalizeChatText('đm'), signal)).toEqual({ decision: 'reject' });
  expect(await moderator.inspect(normalizeChatText('context needs a human'), signal)).toEqual({ decision: 'review' });
  const canceled = new AbortController(); canceled.abort(); await expect(moderator.inspect('hello', canceled.signal)).rejects.toThrow();
});
