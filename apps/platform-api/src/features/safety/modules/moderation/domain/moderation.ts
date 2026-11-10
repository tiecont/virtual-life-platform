import { ModerationDecisionSchema } from '@virtual-city/contracts';

export interface ChatModerator { inspect(text: string, signal: AbortSignal): Promise<unknown> }
export function normalizeChatText(input: string): string {
  const invalidControl = [...input].some(character => { const code = character.charCodeAt(0); return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127; });
  if (Buffer.byteLength(input, 'utf8') > 1024 || invalidControl || /[<>]/u.test(input)) throw new Error('INVALID_CHAT_TEXT');
  const text = input.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\s+/gu, ' ').trim();
  if (!text || text.length > 280) throw new Error('INVALID_CHAT_TEXT');
  return text;
}
export function inspectionKey(input: string) { return input.normalize('NFKD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase().replace(/[.!?,]+/gu, ' ').replace(/\s+/gu, ' ').trim(); }
// Conservative local gate: approved benign phrases only; unknown/contextual text
// requires review and is not delivered. This is not a general safety classifier.
export class LocalChatModerator implements ChatModerator {
  async inspect(text: string, signal: AbortSignal) {
    signal.throwIfAborted(); const key = inspectionKey(text);
    const approved = new Set(['hello', 'hello friends', 'hi', 'thanks', 'thank you', 'bye', 'xin chao', 'xin chao moi nguoi', 'cam on', 'toi can ho tro', 'tam biet']);
    const rejected = /(?:^|\s)(?:dm|dit|kill yourself)(?:\s|$)/u.test(key);
    return ModerationDecisionSchema.parse({ decision: rejected ? 'reject' : approved.has(key) ? 'allow' : 'review' });
  }
}
