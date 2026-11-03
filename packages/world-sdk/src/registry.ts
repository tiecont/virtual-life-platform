import { WorldDefinitionSchema, WorldInvocationSchema, WorldCatalogSchema, type WorldDefinition, type WorldInvocation, type WorldCard, type WorldCatalog } from '@virtual-city/contracts';

export type WorldActor = Readonly<{ accountId: string; sessionId: string; kind: 'guest' | 'registered'; expiresAt: number }>;
export interface WorldPorts {
  authenticate(credential: string): Promise<WorldActor>;
  canAccess(actor: WorldActor, definition: WorldDefinition): Promise<boolean>;
  hasMembership(actor: WorldActor, worldSlug: string, membershipId: string): Promise<boolean>;
}
export type WorldHookContext = Readonly<{ accountId: string; kind: WorldActor['kind']; membershipId: string }>;
export type WorldTravelContext = WorldHookContext & Readonly<{ signal: AbortSignal; expiresAt: number }>;
export interface WorldTravelHooks {
  prepare(context: WorldTravelContext): Promise<void>;
  abort(context: WorldTravelContext): Promise<void>;
  depart(context: WorldTravelContext): Promise<void>;
}
export interface WorldHooks {
  bootstrap(): Promise<void>;
  shutdown(): Promise<void>;
  onJoin(context: WorldHookContext): Promise<void>;
  onLeave(context: WorldHookContext): Promise<void>;
  onCommand(context: WorldHookContext, payload: unknown): Promise<unknown>;
  travel?: WorldTravelHooks;
}
export class WorldError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_REQUEST' | 'WORLD_UNAVAILABLE' | 'WORLD_VERSION_MISMATCH', message: string) { super(message); }
}
const unavailable = () => new WorldError('WORLD_UNAVAILABLE', 'World unavailable');
type Grant = { adapter: WorldAdapter; hook: 'bootstrap' | 'shutdown' | 'prepare' | 'abort' | 'depart' | WorldInvocation['action']; context?: WorldHookContext; travelContext?: WorldTravelContext; payload?: unknown };
const grants = new WeakMap<object, Grant>();
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
// Tokens are single-use, adapter-bound and minted only by the registry after its guards.
export class WorldAdapter {
  readonly definition: WorldDefinition;
  #hooks: WorldHooks;
  constructor(definition: unknown, hooks: WorldHooks) { this.definition = freeze(WorldDefinitionSchema.parse(definition)); this.#hooks = Object.freeze({ ...hooks, ...(hooks.travel ? { travel: Object.freeze({ ...hooks.travel }) } : {}) }); }
  async invoke(token: object): Promise<unknown> {
    const grant = grants.get(token);
    if (!grant || grant.adapter !== this) throw new WorldError('FORBIDDEN', 'Registry authorization required');
    grants.delete(token);
    if (grant.hook === 'bootstrap' || grant.hook === 'shutdown') return this.#hooks[grant.hook]();
    if (grant.hook === 'prepare' || grant.hook === 'abort' || grant.hook === 'depart') {
      if (!this.#hooks.travel || !grant.travelContext) throw unavailable();
      return this.#hooks.travel[grant.hook](grant.travelContext);
    }
    if (!grant.context) throw new WorldError('FORBIDDEN', 'Registry authorization required');
    if (grant.hook === 'join') return this.#hooks.onJoin(grant.context);
    if (grant.hook === 'leave') return this.#hooks.onLeave(grant.context);
    return this.#hooks.onCommand(grant.context, grant.payload);
  }
  get supportsTravel() { return !!this.#hooks.travel; }
}
export const defineWorld = (definition: unknown, hooks: WorldHooks) => new WorldAdapter(definition, hooks);
type Entry = { adapter: WorldAdapter; enabled: boolean; phase: WorldCard['availability']; generation: number; needsCleanup: boolean; cleanupFailed: boolean; travelStalled?: boolean; pending: number; tail: Promise<void> };
export class WorldRegistry {
  #entries = new Map<string, Entry>();
  #revision = 0;
  #closed = false;
  #preparations = new Set<() => void>();
  #closing?: Promise<void>;
  #unavailableListeners = new Set<(slug: string) => void>();
  constructor(readonly environment: 'development' | 'test' | 'production', private ports: WorldPorts) {}
  register(adapter: WorldAdapter) {
    if (this.#closed) throw unavailable();
    const slug = adapter.definition.slug;
    if (this.#entries.has(slug)) throw new Error('Duplicate world slug');
    if (this.#entries.size >= 100) throw new Error('World registry limit reached');
    this.#entries.set(slug, { adapter, enabled: false, phase: 'disabled', generation: 0, needsCleanup: false, cleanupFailed: false, pending: 0, tail: Promise.resolve() }); this.#revision++;
  }
  slugs(): string[] { return [...this.#entries.keys()]; }
  permitsActivityDisclosure(slug: string): boolean {
    const entry = this.#entries.get(slug);
    return Boolean(!this.#closed && entry?.enabled && entry.phase === 'available' && entry.adapter.definition.visibility === 'listed' && entry.adapter.definition.accessPolicy.kind === 'public' && slug !== 'dating');
  }
  onUnavailable(listener: (slug: string) => void) { this.#unavailableListeners.add(listener); return () => { this.#unavailableListeners.delete(listener); }; }
  #notifyUnavailable(entry: Entry) { for (const listener of this.#unavailableListeners) { try { listener(entry.adapter.definition.slug); } catch { /* Access checks remain authoritative if a consumer fails. */ } } }
  #get(slug: string) { const entry = this.#entries.get(slug); if (!entry) throw new WorldError('NOT_FOUND', 'World not found'); return entry; }
  #queue<T>(entry: Entry, work: () => Promise<T>, control = false): Promise<T> {
    if (!control && entry.pending >= 64) return Promise.reject(unavailable());
    entry.pending++;
    const result = entry.tail.then(work).finally(() => { entry.pending--; });
    entry.tail = result.then(() => {}, () => {});
    return result;
  }
  #invoke(entry: Entry, grant: Omit<Grant, 'adapter'>) {
    const token = Object.freeze({}); grants.set(token, { adapter: entry.adapter, ...grant });
    return entry.adapter.invoke(token);
  }
  async #stop(entry: Entry) {
    if (entry.travelStalled) return;
    if (!entry.needsCleanup) return;
    try { await this.#invoke(entry, { hook: 'shutdown' }); entry.needsCleanup = false; }
    catch { entry.cleanupFailed = true; entry.phase = 'offline'; throw unavailable(); }
  }
  async setEnabled(slug: string, enabled: boolean): Promise<void> {
    if (this.#closed) throw unavailable();
    if (typeof enabled !== 'boolean') throw new WorldError('INVALID_REQUEST', 'Expected a boolean flag');
    const entry = this.#get(slug);
    if (entry.travelStalled) { if (enabled) throw unavailable(); entry.enabled = false; this.#notifyUnavailable(entry); return; }
    if (enabled && this.environment === 'production' && entry.adapter.definition.kind === 'sandbox') throw new WorldError('FORBIDDEN', 'Sandbox unavailable in production');
    if (entry.enabled === enabled && ((enabled && entry.phase === 'available') || (!enabled && entry.phase === 'disabled'))) return entry.tail;
    entry.enabled = enabled; entry.phase = enabled ? 'offline' : 'disabled';
    this.#notifyUnavailable(entry);
    const generation = ++entry.generation; this.#revision++;
    return this.#queue(entry, async () => {
      if (entry.generation !== generation) return;
      await this.#stop(entry);
      if (!enabled) return;
      if (entry.cleanupFailed) throw unavailable();
      entry.needsCleanup = true;
      try { await this.#invoke(entry, { hook: 'bootstrap' }); }
      catch { entry.phase = 'offline'; this.#revision++; await this.#stop(entry); throw unavailable(); }
      if (entry.generation !== generation) return;
      entry.phase = 'available'; this.#revision++;
    }, true);
  }
  #ready(entry: Entry) { if (this.#closed || !entry.enabled || entry.phase !== 'available') throw unavailable(); }
  #quarantine(entry: Entry) { entry.cleanupFailed = true; entry.phase = 'offline'; entry.generation++; this.#revision++; this.#notifyUnavailable(entry); }
  // Preparation never calls normal onJoin or supplies active membership authority.
  // Each underlying hook is bounded; an ignored abort quarantines this adapter.
  async #travelHook(entry: Entry, hook: 'prepare' | 'abort' | 'depart', context: WorldTravelContext, controller: AbortController, now: () => number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { entry.travelStalled = true; controller.abort(); this.#quarantine(entry); reject(unavailable()); }, Math.max(1, Math.min(500, context.expiresAt - now()))); });
      await Promise.race([this.#queue(entry, () => {
        if (controller.signal.aborted) throw unavailable();
        return Promise.race([this.#invoke(entry, { hook, travelContext: context }).then(() => {}), timeout]);
      }), timeout]);
    } catch (error) { controller.abort(); if (hook !== 'prepare') this.#quarantine(entry); throw error; }
    finally { if (timer) clearTimeout(timer); }
  }
  async prepareAdmission(credential: string, slug: string, membershipId: string, expiresAt: number, now = Date.now) {
    const { actor } = await this.authorizeWorld(credential, slug), entry = this.#get(slug), generation = entry.generation;
    if (!entry.adapter.supportsTravel || expiresAt <= now()) throw unavailable();
    const controller = new AbortController(), context = Object.freeze({ accountId: actor.accountId, kind: actor.kind, membershipId, expiresAt, signal: controller.signal });
    const cancel = () => controller.abort(); this.#preparations.add(cancel); let finished = false;
    const abort = async () => {
      if (finished) return; finished = true; cancel(); this.#preparations.delete(cancel);
      // A stuck underlying preparation owns its queue slot; never queue more
      // resource work behind it. Quarantine requires operator restart/cleanup.
      if (entry.cleanupFailed) return;
      const cleanup = new AbortController();
      await this.#travelHook(entry, 'abort', Object.freeze({ ...context, signal: cleanup.signal, expiresAt: now() + 500 }), cleanup, now);
    };
    try { await this.#travelHook(entry, 'prepare', context, controller, now); }
    catch (error) { await abort(); throw error; }
    return Object.freeze({
      valid: () => !finished && !controller.signal.aborted && !this.#closed && entry.enabled && entry.phase === 'available' && entry.generation === generation && now() < expiresAt,
      abort,
      complete: () => { if (finished || controller.signal.aborted || entry.generation !== generation || now() >= expiresAt) throw unavailable(); finished = true; this.#preparations.delete(cancel); },
    });
  }
  async prepareDeparture(credential: string, slug: string, membershipId: string, now = Date.now) {
    const { actor } = await this.authorizeWorld(credential, slug), entry = this.#get(slug);
    if (!entry.adapter.supportsTravel || !await this.ports.hasMembership(actor, slug, membershipId)) throw new WorldError('FORBIDDEN', 'Travel lifecycle required');
    let used = false;
    return async () => {
      if (used) return; used = true; const controller = new AbortController();
      await this.#travelHook(entry, 'depart', Object.freeze({ accountId: actor.accountId, kind: actor.kind, membershipId, expiresAt: now() + 500, signal: controller.signal }), controller, now);
    };
  }
  async authorizeWorld(credential: string, slug: string) {
    const actor = await this.ports.authenticate(credential); const entry = this.#get(slug);
    if (!await this.ports.canAccess(actor, entry.adapter.definition)) throw new WorldError('NOT_FOUND', 'World not found');
    this.#ready(entry);
    return { actor, definition: entry.adapter.definition };
  }
  async authorizedContext<T>(credential: string, slug: string, work: (actor: WorldActor, definition: WorldDefinition, valid: () => boolean) => Promise<T>): Promise<T> {
    const entry = this.#get(slug), generation = entry.generation, { actor, definition } = await this.authorizeWorld(credential, slug);
    const valid = () => !this.#closed && entry.enabled && entry.phase === 'available' && entry.generation === generation;
    if (!valid()) throw unavailable();
    return work(actor, definition, valid);
  }
  projectionContext(slug: string) { const entry=this.#get(slug);this.#ready(entry);const generation=entry.generation;return {definition:entry.adapter.definition,valid:()=>!this.#closed&&entry.enabled&&entry.phase==='available'&&entry.generation===generation}; }
  #card(entry: Entry): WorldCard {
    const world = entry.adapter.definition;
    return {
      slug: world.slug, version: world.version, title: world.title, kind: world.kind, sceneRef: world.sceneRef,
      capacity: world.capacity, capabilities: world.capabilities, map: world.map,
      accessHint: world.accessPolicy.kind === 'public' ? 'session-required' : world.accessPolicy.kind === 'private' ? 'permission-required' : 'reviewed-access-required',
      availability: entry.phase, discoverability: 'listed',
    };
  }
  async catalog(credential: string): Promise<WorldCatalog> {
    if (this.#closed) throw unavailable();
    const actor = await this.ports.authenticate(credential); const entries: Entry[] = [];
    for (const entry of this.#entries.values()) {
      if (entry.adapter.definition.visibility === 'listed' && !(this.environment === 'production' && entry.adapter.definition.kind === 'sandbox') && await this.ports.canAccess(actor, entry.adapter.definition)) entries.push(entry);
    }
    return WorldCatalogSchema.parse({ schemaVersion: 1, revision: this.#revision, worlds: entries.map(entry => this.#card(entry)).sort((a, b) => a.slug.localeCompare(b.slug)) });
  }
  async dispatch(credential: string, slug: string, input: unknown): Promise<unknown> {
    const initial = await this.ports.authenticate(credential); const entry = this.#get(slug);
    if (!await this.ports.canAccess(initial, entry.adapter.definition)) throw new WorldError('NOT_FOUND', 'World not found');
    this.#ready(entry);
    const parsed = WorldInvocationSchema.safeParse(input);
    if (!parsed.success) throw new WorldError('INVALID_REQUEST', 'Invalid world invocation');
    let invocation: WorldInvocation;
    try { invocation = structuredClone(parsed.data); } catch { throw new WorldError('INVALID_REQUEST', 'Invalid world invocation'); }
    const generation = entry.generation;
    return this.#queue(entry, async () => {
      this.#ready(entry);
      const actor = await this.ports.authenticate(credential);
      if (!await this.ports.canAccess(actor, entry.adapter.definition)) throw new WorldError('NOT_FOUND', 'World not found');
      const world = entry.adapter.definition;
      if (invocation.worldVersion !== world.version || invocation.sceneVersion !== world.sceneRef.version) throw new WorldError('WORLD_VERSION_MISMATCH', 'Refresh world assets');
      if (!await this.ports.hasMembership(actor, slug, invocation.membershipId)) throw new WorldError('FORBIDDEN', 'World membership required');
      this.#ready(entry); if (entry.generation !== generation) throw unavailable();
      const context = Object.freeze({ accountId: actor.accountId, kind: actor.kind, membershipId: invocation.membershipId });
      let result: unknown;
      try { result = await this.#invoke(entry, { hook: invocation.action, context, payload: invocation.payload }); }
      catch (error) {
        if (error instanceof WorldError && ['INVALID_REQUEST', 'FORBIDDEN'].includes(error.code)) throw error;
        entry.phase = 'offline'; this.#revision++; this.#notifyUnavailable(entry); await this.#stop(entry); throw unavailable();
      }
      this.#ready(entry); if (entry.generation !== generation) throw unavailable();
      return result;
    });
  }
  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    for (const cancel of this.#preparations) cancel(); this.#preparations.clear();
    const stops = this.slugs().map(slug => this.setEnabled(slug, false)); this.#closed = true;
    this.#closing = Promise.allSettled(stops).then(results => { if (results.some(result => result.status === 'rejected')) throw unavailable(); });
    return this.#closing;
  }
}
