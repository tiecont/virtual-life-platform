import { describe, it, expect } from 'vitest';
import { WorldDefinitionSchema, type WorldDefinition, type WorldInvocation } from '@virtual-city/contracts';
import { WorldRegistry, defineWorld, createSandboxWorld, type WorldHooks, type WorldPorts } from '../src';

const definition: WorldDefinition = {
  schemaVersion: 1, apiVersion: 1, slug: 'test-sandbox', version: '1.0.0', title: 'Test Sandbox', kind: 'sandbox',
  sceneRef: { key: 'test-scene', version: '1.0.0' }, capacity: 8, capabilities: ['presence'], seatIds: [],
  accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'test', position: { x: 0.5, y: 0.5 }, icon: 'flask' },
};
const invocation: WorldInvocation = { schemaVersion: 1, worldVersion: '1.0.0', sceneVersion: '1.0.0', action: 'join', membershipId: 'controlled-membership-fixture' };
function fixture(overrides: Partial<WorldHooks> = {}, ports: Partial<WorldPorts> = {}) {
  const calls: string[] = [];
  const adapter = defineWorld(definition, {
    bootstrap: async () => { calls.push('bootstrap'); }, shutdown: async () => { calls.push('shutdown'); },
    onJoin: async () => { calls.push('join'); }, onLeave: async () => { calls.push('leave'); },
    onCommand: async () => { calls.push('command'); return { sandbox: true }; }, ...overrides,
  });
  const registry = new WorldRegistry('test', {
    authenticate: async credential => { if (credential !== 'server-credential') throw new Error('Unauthenticated'); return { accountId: 'fixture-account', sessionId: 'fixture-session', kind: 'guest', expiresAt: Date.now() + 60000 }; },
    canAccess: async () => true, hasMembership: async () => true, ...ports,
  });
  registry.register(adapter);
  return { registry, adapter, calls };
}
describe('M05 strict world definitions', () => {
  it('rejects unknown capabilities, invalid slugs, private missing policy and unsupported versions', () => {
    for (const change of [
      { slug: '../world' }, { slug: 'UpperCase' }, { capabilities: ['presence', 'voice'] }, { capabilities: ['focus'] },
      { capabilities: ['presence', 'presence'] }, { accessPolicy: { kind: 'private' } }, { apiVersion: 2 },
      { schemaVersion: 2 }, { version: 'latest' }, { extra: true }, { visibility: 'hidden' },
      { map: { ...definition.map, position: { x: 2, y: 0 } } },
      { slug: 'dating' },
      { seatIds: ['seat-1'] }, { capabilities: ['presence', 'seating'] },
      { capabilities: ['presence', 'seating'], seatIds: ['seat-1', 'seat-1'] },
    ]) expect(WorldDefinitionSchema.safeParse({ ...definition, ...change }).success).toBe(false);
    expect(WorldDefinitionSchema.parse(definition)).toEqual(definition);
    expect(WorldDefinitionSchema.safeParse({ ...definition, slug: 'dating', visibility: 'hidden', accessPolicy: { kind: 'restricted', policyKey: 'dating.review', requiresAdult: true } }).success).toBe(true);
  });
});
describe('M05 guarded world registry and lifecycle', () => {
  it('runs hooks only through authenticated, policy-checked and membership-checked dispatch', async () => {
    const { registry, adapter, calls } = fixture();
    await expect(adapter.invoke({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await registry.setEnabled(definition.slug, true);
    await expect(registry.dispatch('forged', definition.slug, invocation)).rejects.toThrow('Unauthenticated');
    await registry.dispatch('server-credential', definition.slug, invocation);
    expect(await registry.dispatch('server-credential', definition.slug, { ...invocation, action: 'command' })).toEqual({ sandbox: true });
    await registry.dispatch('server-credential', definition.slug, { ...invocation, action: 'leave' });
    expect(calls).toEqual(['bootstrap', 'join', 'command', 'leave']);
    await registry.close(); expect(calls.at(-1)).toBe('shutdown');
  });
  it('checks permission and membership on every command, not just join', async () => {
    let allowed = true; let member = true;
    const { registry, calls } = fixture({}, { canAccess: async () => allowed, hasMembership: async () => member });
    await registry.setEnabled(definition.slug, true);
    await registry.dispatch('server-credential', definition.slug, invocation);
    allowed = false;
    await expect(registry.dispatch('server-credential', definition.slug, { ...invocation, action: 'command' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    allowed = true; member = false;
    for (const action of ['join', 'command', 'leave'] as const) await expect(registry.dispatch('server-credential', definition.slug, { ...invocation, action })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toEqual(['bootstrap', 'join']); await registry.close();
  });
  it('rejects duplicate slugs, stale assets/world versions, unknown and disabled worlds', async () => {
    const { registry, adapter, calls } = fixture();
    expect(() => registry.register(adapter)).toThrow('Duplicate world');
    await expect(registry.dispatch('server-credential', 'missing', invocation)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(registry.dispatch('server-credential', definition.slug, invocation)).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' });
    await registry.setEnabled(definition.slug, true);
    for (const change of [{ worldVersion: '2.0.0' }, { sceneVersion: '2.0.0' }]) await expect(registry.dispatch('server-credential', definition.slug, { ...invocation, ...change })).rejects.toMatchObject({ code: 'WORLD_VERSION_MISMATCH' });
    expect(calls).toEqual(['bootstrap']); await registry.close();
  });
  it('disables active hooks, rejects stale cards and cleans up before reactivation', async () => {
    const { registry, calls } = fixture(); await registry.setEnabled(definition.slug, true);
    const before = await registry.catalog('server-credential');
    await registry.dispatch('server-credential', definition.slug, invocation);
    await registry.setEnabled(definition.slug, false);
    expect((await registry.catalog('server-credential')).revision).toBeGreaterThan(before.revision);
    await expect(registry.dispatch('server-credential', definition.slug, invocation)).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' });
    await registry.setEnabled(definition.slug, true);
    expect(calls).toEqual(['bootstrap', 'join', 'shutdown', 'bootstrap']); await registry.close();
  });
  it('fails closed on bootstrap/command/shutdown failures without exposing internal messages', async () => {
    for (const hook of ['bootstrap', 'onCommand', 'shutdown'] as const) {
      const { registry } = fixture({ [hook]: async () => { throw new Error('sensitive-internal-fixture'); } });
      if (hook === 'bootstrap') await expect(registry.setEnabled(definition.slug, true)).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE', message: 'World unavailable' });
      else {
        await registry.setEnabled(definition.slug, true);
        if (hook === 'onCommand') await expect(registry.dispatch('server-credential', definition.slug, { ...invocation, action: 'command' })).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE', message: 'World unavailable' });
        else await expect(registry.setEnabled(definition.slug, false)).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' });
      }
      expect((await registry.catalog('server-credential')).worlds[0].availability).not.toBe('available');
      if (hook === 'shutdown') await expect(registry.close()).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' });
      else await registry.close();
    }
  });
  it('hides unauthorized/hidden worlds and projects only catalog metadata', async () => {
    const { registry } = fixture();
    registry.register(defineWorld({ ...definition, slug: 'hidden-world', visibility: 'hidden', accessPolicy: { kind: 'private', policyKey: 'fixture.access' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {} }));
    const catalog = await registry.catalog('server-credential'); expect(catalog.worlds.map(w => w.slug)).toEqual([definition.slug]);
    expect(JSON.stringify(catalog)).not.toMatch(/fixture-account|fixture-session|policyKey|accountId|occupancy|members/);
    const denied = fixture({}, { canAccess: async () => false }); expect((await denied.registry.catalog('server-credential')).worlds).toEqual([]);
    await registry.close(); await denied.registry.close();
  });
  it('isolates environments and rejects sandbox activation in production', async () => {
    const { registry, adapter } = fixture(); const production = new WorldRegistry('production', { authenticate: async () => { throw new Error(); }, canAccess: async () => false, hasMembership: async () => false });
    production.register(adapter); await registry.setEnabled(definition.slug, true);
    await expect(production.setEnabled(definition.slug, true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await registry.close(); await production.close();
  });
  it('drains an in-flight command before shutdown and never acknowledges it after disable', async () => {
    let finish!: () => void; let began!: () => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    const delayed = new Promise<void>(resolve => { finish = resolve; });
    const { registry, calls } = fixture({ onCommand: async () => { began(); await delayed; calls.push('finished'); return { sandbox: true }; } });
    await registry.setEnabled(definition.slug, true);
    const command = registry.dispatch('server-credential', definition.slug, { ...invocation, action: 'command' });
    const rejected = expect(command).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' }); await started;
    const disabled = registry.setEnabled(definition.slug, false);
    expect((await registry.catalog('server-credential')).worlds[0].availability).toBe('disabled');
    finish(); await rejected; await disabled;
    expect(calls).toEqual(['bootstrap', 'finished', 'shutdown']); await registry.close();
  });
  it('bounds queued calls and rechecks revoked sessions before executing queued hooks', async () => {
    let finish!: () => void; let began!: () => void; let valid = true;
    const started = new Promise<void>(resolve => { began = resolve; }); const delayed = new Promise<void>(resolve => { finish = resolve; });
    const { registry, calls } = fixture({ onCommand: async () => { began(); await delayed; calls.push('command'); } }, {
      authenticate: async () => { if (!valid) throw new Error('Session revoked'); return { accountId: 'fixture-account', sessionId: 'fixture-session', kind: 'guest', expiresAt: Date.now() + 10000 }; },
    });
    await registry.setEnabled(definition.slug, true);
    const first = registry.dispatch('server-credential', definition.slug, { ...invocation, action: 'command' }); await started;
    const queued = Array.from({ length: 80 }, () => registry.dispatch('server-credential', definition.slug, invocation));
    const results = Promise.allSettled(queued); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    valid = false; finish(); await first;
    const settled = await results; expect(settled.every(result => result.status === 'rejected')).toBe(true);
    expect(settled.some(result => result.status === 'rejected' && result.reason instanceof Error && result.reason.message === 'World unavailable')).toBe(true);
    expect(calls).toEqual(['bootstrap', 'command']); await registry.close();
  });
  it('rechecks flags after slow permission checks and uses latest concurrent flag intent', async () => {
    let finish!: () => void; let began!: () => void; let count = 0;
    const started = new Promise<void>(resolve => { began = resolve; }); const delayed = new Promise<void>(resolve => { finish = resolve; });
    const { registry, calls } = fixture({}, { hasMembership: async () => { began(); await delayed; return true; } });
    await registry.setEnabled(definition.slug, true);
    const dispatch = registry.dispatch('server-credential', definition.slug, invocation);
    const rejected = expect(dispatch).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' }); await started;
    const changes = [false, true, false].map(flag => { count++; return registry.setEnabled(definition.slug, flag); });
    finish(); await rejected; await Promise.all(changes);
    expect(count).toBe(3); expect(calls).toEqual(['bootstrap', 'shutdown']);
    expect((await registry.catalog('server-credential')).worlds[0].availability).toBe('disabled'); await registry.close();
  });
  it('executes the shipped sandbox and rejects arbitrary commands without marking it offline', async () => {
    const { registry } = fixture(); const sandbox = createSandboxWorld(); registry.register(sandbox); await registry.setEnabled(sandbox.definition.slug, true);
    const envelope = { ...invocation, action: 'command', payload: { type: 'inspect' } };
    expect(await registry.dispatch('server-credential', sandbox.definition.slug, envelope)).toEqual({ sandbox: true, worldVersion: '1.0.0', sceneVersion: '1.0.0' });
    await expect(registry.dispatch('server-credential', sandbox.definition.slug, { ...envelope, payload: { type: 'inspect', accountId: 'forged' } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect((await registry.catalog('server-credential')).worlds.find(world => world.slug === sandbox.definition.slug)?.availability).toBe('available');
    expect(Object.isFrozen(sandbox.definition.map.position)).toBe(true); await registry.close();
  });
});
