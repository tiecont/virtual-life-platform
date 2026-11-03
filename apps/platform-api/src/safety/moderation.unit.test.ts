import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { LocalChatModerator, normalizeChatText, inspectionKey } from './moderation';

const corpus = z.array(z.strictObject({ id: z.string(), text: z.string(), decision: z.enum(['allow', 'reject', 'review', 'invalid']), limitation: z.string().optional() })).parse(JSON.parse(readFileSync('tests/fixtures/chat-moderation-corpus.json', 'utf8')));

it.each(corpus)('local language regression: $id -> $decision', async row => {
  if (row.decision === 'invalid') { expect(() => normalizeChatText(row.text)).toThrow('INVALID_CHAT_TEXT'); return; }
  const moderator = new LocalChatModerator();
  expect(await moderator.inspect(normalizeChatText(row.text), new AbortController().signal)).toEqual({ decision: row.decision });
});

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
