import { randomUUID } from 'node:crypto';
import { ChatSendSchema, ChatMessageSchema, ModerationDecisionSchema, SafetyPolicySchema, WorldSlugSchema, type ChatSend, type ChatMessage, type ChatAccepted, type ChatErrorCode, type SafetyPolicy } from '@virtual-city/contracts';
import type { RoomService } from '../rooms/service';
import type { IdentityService } from '../identity/service';
import { WindowLimiter } from '../identity/limits';
import { LocalChatModerator, normalizeChatText, type ChatModerator } from './moderation';

export class ChatError extends Error { constructor(readonly code: ChatErrorCode) { super(code); } }
type Receipt = { sessionId: string; fingerprint: string; until: number; result: ChatAccepted };
type Pending = { sessionId: string; fingerprint: string; promise: Promise<ChatAccepted> };
export interface ChatOptions { evidence?: { record(event: ChatMessage, viewerId: string, worldSlug: string): void }; enabled?: boolean; quickOnlyWorlds?:readonly string[]; quickAccess?:(worldSlug:string)=>boolean; policy: unknown; moderator?: ChatModerator }
function freezePolicy<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freezePolicy); Object.freeze(value); } return value; }
export class ChatService {
  readonly policy: SafetyPolicy;
  #enabled: boolean; #globalEnabled:boolean; #quickOnly:Set<string>; #closed = false; #receipts = new Map<string, Receipt>(); #pending = new Map<string, Pending>();
  #accounts = new Map<string, number>(); #workers = new Set<AbortController>(); #limits: WindowLimiter; #moderator: ChatModerator;
  #outcomes = { accepted: 0, rejected: 0, unavailable: 0, droppedRecipients: 0 };
  #moderatorUnavailable = false;
  #evidence?: ChatOptions['evidence'];
  #quickAccess?:ChatOptions['quickAccess'];
  constructor(private rooms: RoomService, private identity: IdentityService, environment: 'development' | 'test' | 'production', options: ChatOptions, private now = Date.now) {
    this.policy = freezePolicy(SafetyPolicySchema.parse(options.policy));
    const scopes=options.quickOnlyWorlds??[];
    if(scopes.length>16||new Set(scopes).size!==scopes.length)throw Error('Invalid quick interaction scope');
    this.#quickAccess=options.quickAccess;
    this.#quickOnly=new Set(environment!=='production'||options.quickAccess?scopes.map(value=>WorldSlugSchema.parse(value)):[]);
    this.#globalEnabled=environment!=='production'&&options.enabled===true;
    this.#enabled=this.#globalEnabled||this.#quickOnly.size>0;
    this.#evidence = options.evidence; this.#moderator = options.moderator ?? new LocalChatModerator(); this.#limits = new WindowLimiter(now);
  }
  #quickPermits(world:string){try{return this.#quickAccess===undefined||this.#quickAccess(world)===true;}catch{return false;}}
  #allows(world:string,kind:ChatSend['content']['kind']){if(this.#quickOnly.has(world))return kind!=='text'&&this.#quickPermits(world);return this.#globalEnabled;}
  diagnostics() { return { enabled: this.#enabled && !this.#closed&&(this.#globalEnabled||[...this.#quickOnly].some(world=>this.#quickPermits(world))), moderationAvailable: !this.#moderatorUnavailable, pending: this.#pending.size, workerSlots: this.#workers.size, receipts: this.#receipts.size, ...this.#outcomes }; }
  dropRecipient() { this.#outcomes.droppedRecipients++; }
  async #inspect(text: string) {
    if (this.#workers.size >= 4) { this.#moderatorUnavailable = true; throw new ChatError('MODERATION_UNAVAILABLE'); }
    const controller = new AbortController(); this.#workers.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined; let abort: (() => void) | undefined;
    const work = Promise.resolve().then(() => this.#moderator.inspect(text, controller.signal));
    // Retain a slot until the underlying provider actually settles, even after a
    // timeout. An uncooperative provider cannot create unbounded detached work.
    void work.then(() => this.#workers.delete(controller), () => this.#workers.delete(controller));
    try {
      const deadline = new Promise<never>((_resolve, reject) => {
        abort = () => reject(new ChatError('MODERATION_UNAVAILABLE')); controller.signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => controller.abort(), 500); timer.unref();
      });
      const decision = ModerationDecisionSchema.parse(await Promise.race([work, deadline]));
      this.#moderatorUnavailable = false;
      if (decision.decision !== 'allow') throw new ChatError('CONTENT_REJECTED');
    } catch (error) { if (error instanceof ChatError && error.code === 'CONTENT_REJECTED') throw error; this.#moderatorUnavailable = true; throw new ChatError('MODERATION_UNAVAILABLE'); }
    finally { if (timer) clearTimeout(timer); if (abort) controller.signal.removeEventListener('abort', abort); }
  }
  async send(credential: string, connectionId: string, raw: ChatSend, emit: (connectionId: string, event: ChatMessage) => boolean | void): Promise<ChatAccepted> {
    const input = ChatSendSchema.parse(raw);
    if (!this.#enabled || this.#closed) throw new ChatError('FORBIDDEN');
    const { actor, worldSlug } = await this.rooms.authorizeChat(credential, connectionId, input);
    if(!this.#allows(worldSlug,input.content.kind))throw new ChatError('FORBIDDEN');
    const rule = this.policy.contexts[worldSlug];
    if (!rule || rule.mode === 'silent' || rule.liveOperatorRequired || rule.reviewedAdultRequired || rule.audience !== 'room') throw new ChatError('FORBIDDEN');
    for (const [key, receipt] of this.#receipts) if (receipt.until <= this.now()) this.#receipts.delete(key);
    const key = actor.accountId + ':' + input.requestId; const fingerprint = this.identity.fingerprint(input);
    const old = this.#receipts.get(key) ?? this.#pending.get(key);
    if (old && (old.sessionId !== actor.sessionId || old.fingerprint !== fingerprint)) throw new ChatError('IDEMPOTENCY_CONFLICT');
    if (old) return 'result' in old ? structuredClone(old.result) : old.promise;
    if (this.#receipts.size >= 10000 || this.#pending.size >= 64 || (this.#accounts.get(actor.accountId) ?? 0) >= 2 || !this.#limits.take(actor.accountId, 6, 10000)) throw new ChatError('RATE_LIMITED');
    this.#accounts.set(actor.accountId, (this.#accounts.get(actor.accountId) ?? 0) + 1);
    const promise = this.#deliver(credential, connectionId, input, worldSlug, emit).then(result => {
      if (this.#closed) throw new ChatError('WORLD_UNAVAILABLE');
      this.#receipts.set(key, { sessionId: actor.sessionId, fingerprint, until: this.now() + 300000, result }); this.#outcomes.accepted++; return structuredClone(result);
    }).catch(error => {
      if (error instanceof ChatError && error.code === 'MODERATION_UNAVAILABLE') this.#outcomes.unavailable++; else this.#outcomes.rejected++;
      throw error;
    }).finally(() => { this.#pending.delete(key); const count = (this.#accounts.get(actor.accountId) ?? 1) - 1; if (count) this.#accounts.set(actor.accountId, count); else this.#accounts.delete(actor.accountId); });
    this.#pending.set(key, { sessionId: actor.sessionId, fingerprint, promise }); return promise;
  }
  async #deliver(credential: string, connectionId: string, input: ChatSend, worldSlug: string, emit: (connectionId: string, event: ChatMessage) => boolean | void): Promise<ChatAccepted> {
    const rule = this.policy.contexts[worldSlug]; let content: ChatMessage['content'];
    if (input.content.kind === 'text') {
      if (rule.mode !== 'moderated') throw new ChatError('FORBIDDEN');
      let text: string; try { text = normalizeChatText(input.content.text); } catch { throw new ChatError('INVALID_REQUEST'); }
      await this.#inspect(text); content = { kind: 'text', text };
    } else if (input.content.kind === 'canned') {
      if (this.#moderatorUnavailable && rule.fallback === 'deny') throw new ChatError('MODERATION_UNAVAILABLE');
      if (!rule.cannedIds.includes(input.content.id)) throw new ChatError('FORBIDDEN');
      const phrases = { hello: 'Xin chào!', thanks: 'Cảm ơn!', 'need-help': 'Tôi cần hỗ trợ.', bye: 'Tạm biệt!' };
      content = { kind: 'canned', id: input.content.id, text: phrases[input.content.id] };
    } else { if (this.#moderatorUnavailable && rule.fallback === 'deny') throw new ChatError('MODERATION_UNAVAILABLE'); content = input.content; }
    if (this.#closed) throw new ChatError('WORLD_UNAVAILABLE');
    if(!this.#allows(worldSlug,input.content.kind))throw new ChatError('FORBIDDEN');
    const result: ChatAccepted = { type: 'accepted', messageId: randomUUID(), createdAt: new Date(this.now()).toISOString() };
    await this.rooms.publishChat(credential, connectionId, input, recipient => {
      if (this.#closed) return;
      if(!this.#allows(worldSlug,input.content.kind))throw new ChatError('FORBIDDEN');
      const message = ChatMessageSchema.parse({ schemaVersion: 1, messageId: result.messageId, epoch: input.epoch, roomId: input.roomId, createdAt: result.createdAt, sender: recipient.profile, content });
      try { const delivered = emit(recipient.connectionId, message); if (delivered !== false) this.#evidence?.record(message, recipient.accountId, recipient.worldSlug); } catch { this.dropRecipient(); }
    });
    return result;
  }
  close() { this.#closed = true; for (const controller of this.#workers) controller.abort(); this.#receipts.clear(); }
}
