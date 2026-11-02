import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldCatalogSchema, MeSchema, type WorldDefinition } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';

let pool: Pool; let admin: Pool; let app: Awaited<ReturnType<typeof createApp>>; let url: string; let directory: string; let flagsFile: string; let offset = 0;
const schema = 'worlds_test_' + randomUUID().replaceAll('-', '');
const origin = 'http://127.0.0.1:3300'; const now = () => Date.now() + offset;
const base: WorldDefinition = { schemaVersion: 1, apiVersion: 1, slug: 'policy-fixture', version: '1.0.0', title: 'Policy Fixture (not a playable world)', kind: 'sandbox', sceneRef: { key: 'policy-fixture', version: '1.0.0' }, capacity: 8, capabilities: ['presence'], seatIds: [], accessPolicy: { kind: 'private', policyKey: 'fixture.private' }, visibility: 'listed', map: { region: 'sandbox', position: { x: 0.5, y: 0.5 }, icon: 'flask' } };
const hooks = { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => ({ controlledPolicyFixture: true }) };
const invocation = { schemaVersion: 1, worldVersion: '1.0.0', sceneVersion: '1.0.0', action: 'command', membershipId: 'controlled-m06-port-fixture', payload: { type: 'inspect' } };
const grants = new Set<string>(); const members = new Set<string>();
const flags = (development: Record<string, boolean> = {}, test: Record<string, boolean> = {}) => ({ schemaVersion: 1, environments: { development, test, production: {} } });
const config = () => readConfig({ NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, SESSION_SECRET: 'worlds-test-only-session-secret-00000001', WORLD_FLAGS_FILE: flagsFile });
beforeAll(async () => {
  const connection = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || !/^virtual_city_test(?:_|$)/.test(connection.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: connection.toString() }); await admin.query(`CREATE SCHEMA "${schema}"`);
  connection.searchParams.set('options', '-c search_path=' + schema); pool = new Pool({ connectionString: connection.toString() }); await migrate(pool);
  directory = await mkdtemp(join(tmpdir(), 'city-world-flags-')); flagsFile = join(directory, 'flags.json'); await writeFile(flagsFile, JSON.stringify(flags()));
  app = await createApp(config(), pool, false, { now, worlds: {
    modules: [defineWorld(base, hooks), defineWorld({ ...base, slug: 'hidden-fixture', visibility: 'hidden' }, hooks), defineWorld({ ...base, slug: 'dating', visibility: 'hidden', accessPolicy: { kind: 'restricted', policyKey: 'fixture.adult', requiresAdult: true } }, hooks)],
    policy: { permits: async actor => grants.has(actor.accountId) },
    membership: { permits: async (actor, _slug, id) => members.has(actor.sessionId) && id === invocation.membershipId },
  } });
  await app.app.listen(0, '127.0.0.1'); url = await app.app.getUrl();
});
afterAll(async () => { await app?.app.close(); await pool?.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } if (directory) await rm(directory, { recursive: true, force: true }); });
async function guest() {
  const response = await app.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, payload: { requestId: randomUUID(), displayName: 'Registry Visitor', avatarKey: 'mint' } }); expect(response.statusCode).toBe(201);
  const cookie = String(response.headers['set-cookie']).split(';')[0]; const me = MeSchema.parse(response.json());
  return { cookie, me };
}
async function credential(cookie: string) {
  const signed = app.http.parseCookie(cookie).city_session; const result = app.http.unsignCookie(signed);
  if (!result.valid || !result.value) throw new Error('Invalid test credential'); return result.value;
}
const catalog = async (cookie: string) => {
  const response = await fetch(url + '/v1/worlds', { headers: { cookie } }); expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store'); return WorldCatalogSchema.parse(await response.json());
};
describe('M05 real HTTP/session/PG registry, explicit controlled membership port (not M06 rooms)', () => {
  it('requires real signed sessions, rejects forged query claims and never exposes player data', async () => {
    expect((await fetch(url + '/v1/worlds')).status).toBe(401);
    expect((await app.http.inject({ url: '/v1/worlds', headers: { cookie: 'deadline_session=legacy' } })).statusCode).toBe(401);
    const user = await guest(); const listed = await catalog(user.cookie);
    expect(listed.worlds.map(world => [world.slug, world.availability])).toEqual([['sdk-sandbox', 'disabled']]);
    expect(JSON.stringify(listed)).not.toMatch(/Registry Visitor|accountId|sessionId|policyKey|dating|hidden-fixture|policy-fixture/);
    expect((await app.http.inject({ url: '/v1/worlds?role=admin&age=99', headers: { cookie: user.cookie } })).statusCode).toBe(422);
    expect((await app.http.inject({ url: '/v1/worlds/dating', headers: { cookie: user.cookie } })).statusCode).toBe(404);
  });
  it('reloads per-environment per-world flags without restarting HTTP and rejects stale cards', async () => {
    const user = await guest(); const token = await credential(user.cookie);
    await writeFile(flagsFile, JSON.stringify(flags({ 'sdk-sandbox': true }))); await app.worlds.reloadFlags();
    expect((await catalog(user.cookie)).worlds[0].availability).toBe('disabled');
    await writeFile(flagsFile, JSON.stringify(flags({}, { 'sdk-sandbox': true }))); await app.worlds.reloadFlags();
    const enabled = await catalog(user.cookie); expect(enabled.worlds[0].availability).toBe('available');
    await expect(app.worlds.registry.dispatch(token, 'sdk-sandbox', invocation)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const actor = await app.identity.authenticate(token); members.add(actor.sessionId);
    expect(await app.worlds.registry.dispatch(token, 'sdk-sandbox', invocation)).toMatchObject({ sandbox: true });
    await writeFile(flagsFile, JSON.stringify(flags())); await app.worlds.reloadFlags();
    expect((await catalog(user.cookie)).revision).toBeGreaterThan(enabled.revision);
    await expect(app.worlds.registry.dispatch(token, 'sdk-sandbox', invocation)).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' });
    members.delete(actor.sessionId);
  });
  it('enforces trusted private permission on hooks and hides hidden/restricted world metadata', async () => {
    const user = await guest(); const token = await credential(user.cookie); const actor = await app.identity.authenticate(token);
    await writeFile(flagsFile, JSON.stringify(flags({}, { 'policy-fixture': true, 'hidden-fixture': true, dating: true }))); await app.worlds.reloadFlags();
    await expect(app.worlds.registry.dispatch(token, 'policy-fixture', invocation)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    grants.add(actor.accountId); members.add(actor.sessionId);
    const visible = await catalog(user.cookie); expect(visible.worlds.some(world => world.slug === 'policy-fixture')).toBe(true);
    expect(JSON.stringify(visible)).not.toMatch(/dating|hidden-fixture|policyKey/);
    expect(await app.worlds.registry.dispatch(token, 'hidden-fixture', invocation)).toEqual({ controlledPolicyFixture: true });
    await expect(app.worlds.registry.dispatch(token, 'dating', invocation)).rejects.toMatchObject({ code: 'NOT_FOUND' }); // no adult-proof provider
    grants.delete(actor.accountId);
    await expect(app.worlds.registry.dispatch(token, 'hidden-fixture', invocation)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    members.delete(actor.sessionId);
  });
  it('fails closed on unreadable, invalid and unknown flags and can reload a corrected file', async () => {
    const user = await guest();
    for (const invalid of ['{not-json', JSON.stringify({ ...flags(), extra: true }), JSON.stringify(flags({}, { unknown: true }))]) {
      await writeFile(flagsFile, invalid); await expect(app.worlds.reloadFlags()).rejects.toThrow('worlds disabled');
      expect((await catalog(user.cookie)).worlds.every(world => world.availability !== 'available')).toBe(true);
    }
    await rm(flagsFile); await expect(app.worlds.reloadFlags()).rejects.toThrow('worlds disabled');
    await writeFile(flagsFile, JSON.stringify(flags({}, { 'sdk-sandbox': true }))); await app.worlds.reloadFlags();
    expect((await catalog(user.cookie)).worlds[0].availability).toBe('available');
  });
  it('rejects expired/revoked real sessions even when a controlled membership fixture remains', async () => {
    const user = await guest(); const token = await credential(user.cookie); const actor = await app.identity.authenticate(token); members.add(actor.sessionId);
    await pool.query('UPDATE identity_sessions SET revoked_at=now() WHERE id=$1', [actor.sessionId]);
    await expect(app.worlds.registry.dispatch(token, 'sdk-sandbox', invocation)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect((await fetch(url + '/v1/worlds', { headers: { cookie: user.cookie } })).status).toBe(401);
    const expired = await guest(); offset = 2600000000;
    expect((await fetch(url + '/v1/worlds', { headers: { cookie: expired.cookie } })).status).toBe(401); offset = 0;
    members.delete(actor.sessionId);
  });
});
