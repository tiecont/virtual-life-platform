import {beforeAll, afterAll, afterEach, expect, it, vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {io, type Socket} from 'socket.io-client';
import {MeSchema, RoomAckSchema, CURRENT_CLIENT_COMPATIBILITY, sceneManifestHash, type ClientProtocolOffer} from '@virtual-city/contracts';
import {createClientProtocolOffer, sandboxScene} from '@virtual-city/world-sdk';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/config';
import {migrate} from '../../apps/platform-api/src/db/migrations';
import legacyWire from '../fixtures/client-legacy-wire.json';
const origin = 'http://127.0.0.1:3300'; let admin: Pool;
const opened: {app: Awaited<ReturnType<typeof createApp>>; pool: Pool; schema: string}[] = [], sockets = new Set<Socket>();
beforeAll(() => {const url = new URL(process.env.TEST_DATABASE_URL ?? ''); if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw Error('Disposable local database only'); admin = new Pool({connectionString: url.toString()});});
afterEach(async () => {vi.restoreAllMocks(); for (const socket of sockets) socket.close(); sockets.clear(); for (const r of opened.splice(0)) {await r.app.app.close(); await r.pool.end(); await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`);}});
afterAll(async () => {await admin.end();});
async function open() {
  const schema = 'client_compat_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`); const db = new URL(process.env.TEST_DATABASE_URL!); db.searchParams.set('options', '-c search_path=' + schema);
  const pool = new Pool({connectionString: db.toString()}); await migrate(pool); const app = await createApp(readConfig({NODE_ENV: 'test', DATABASE_URL: db.toString(), SESSION_SECRET: randomUUID().repeat(2)}), pool); opened.push({app, pool, schema}); await app.app.listen(0, '127.0.0.1'); await app.worlds.registry.setEnabled('sdk-sandbox', true);
  const url = await app.app.getUrl(), response = await fetch(url + '/v1/session/guest', {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({requestId: randomUUID(), displayName: 'Compatibility fixture', avatarKey: 'mint'})}); expect(response.status).toBe(201);
  return {app, pool, url, cookie: response.headers.getSetCookie()[0].split(';')[0], me: MeSchema.parse(await response.json())};
}
type Runtime = Awaited<ReturnType<typeof open>>;
function client(r: Runtime, protocol?: ClientProtocolOffer, csrf = r.me.csrfToken, requestOrigin = origin) {
  const socket = io(r.url, {forceNew: true, autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: {origin: requestOrigin, cookie: r.cookie}, auth: {schemaVersion: 1, csrfToken: csrf, ...(protocol ? {protocol} : {})}}); sockets.add(socket); const selections: unknown[] = []; socket.on('session.compatibility', value => selections.push(value)); return {socket, selections};
}
async function connect(peer: ReturnType<typeof client>) {await new Promise<void>((ok, no) => {peer.socket.once('connect', ok); peer.socket.once('connect_error', no); peer.socket.connect();}); await peer.socket.timeout(3000).emitWithAck('session.check', {schemaVersion: 1, requestId: randomUUID()}); return peer;}
const join = () => ({schemaVersion: 1, requestId: randomUUID(), worldSlug: 'sdk-sandbox', worldVersion: '1.0.0', sceneVersion: '1.0.0', motionVersion: 1});
it('keeps raw legacy handshake/ACKs unchanged and negotiates the current opt-in client through real TCP', async () => {
  const r = await open(), discovery = await fetch(r.url + '/v1/client-compatibility'); expect(discovery.status).toBe(200); expect(await discovery.json()).toEqual(CURRENT_CLIENT_COMPATIBILITY);
  const legacy = await connect(client(r)); expect(legacy.selections).toEqual([]);
  expect(Object.keys(join()).sort()).toEqual(legacyWire.joinKeys);
  const oldAck = RoomAckSchema.parse(await legacy.socket.timeout(3000).emitWithAck('room.join', join())); expect(oldAck.ok).toBe(true); expect(Object.keys(oldAck).sort()).toEqual(['ok', 'requestId', 'result', 'schemaVersion']);
  if (!oldAck.ok || oldAck.result.type !== 'snapshot') throw Error('Legacy snapshot not returned');
  expect(Object.keys(oldAck.result).sort()).toEqual(legacyWire.snapshotKeys);
  const offer = createClientProtocolOffer(randomUUID()), current = await connect(client(r, offer)); expect(current.selections).toHaveLength(1); expect(current.selections[0]).toMatchObject({nonce: offer.nonce, protocolVersion: 1, sceneSchemaVersion: 1, roomDelta: 'full-snapshot'});
  const ack = RoomAckSchema.parse(await current.socket.timeout(3000).emitWithAck('room.join', {...join(), sceneIdentity: {schemaVersion: 1, sha256: await sceneManifestHash(sandboxScene)}})); expect(ack.ok).toBe(true);
});
it('rejects unsupported protocol/content capabilities explicitly after auth while preserving Origin/CSRF guards', async () => {
  const r = await open();
  for (const protocol of [{...createClientProtocolOffer(randomUUID()), versions: [2]}, {...createClientProtocolOffer(randomUUID()), sceneSchemaVersions: [2]}, {...createClientProtocolOffer(randomUUID()), requiredCapabilities: ['sparse-delta-v2']}]) {
    const peer = client(r, protocol), error = await new Promise<Error>(ok => {peer.socket.once('connect_error', ok); peer.socket.once('connect', () => ok(Error('unexpected-connect'))); peer.socket.connect();});
    expect(error).toMatchObject({message: 'UPGRADE_REQUIRED', data: {code: 'UPGRADE_REQUIRED', retryable: false}}); expect(peer.socket.connected).toBe(false);
  }
  const invalid = client(r, {...createClientProtocolOffer(randomUUID()), versions: [2]}, 'f'.repeat(64)); const error = await new Promise<Error>(ok => {invalid.socket.once('connect_error', ok); invalid.socket.connect();}); expect(error.message).toBe('UNAUTHENTICATED');
  const foreign = client(r, createClientProtocolOffer(randomUUID()), r.me.csrfToken, 'http://evil.invalid'); await expect(connect(foreign)).rejects.toThrow();
  expect(r.app.rooms.diagnostics().memberships).toBe(0);
});
it('checks optional content hash/schema before allocation without changing legacy version errors or ACK shape', async () => {
  const r = await open(), peer = await connect(client(r, createClientProtocolOffer(randomUUID()))), digest = await sceneManifestHash(sandboxScene);
  for (const sceneIdentity of [{schemaVersion: 1, sha256: digest === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64)}, {schemaVersion: 2, sha256: digest}]) {
    const rejected = RoomAckSchema.parse(await peer.socket.timeout(3000).emitWithAck('room.join', {...join(), sceneIdentity})); expect(rejected).toMatchObject({ok: false, error: {code: 'WORLD_VERSION_MISMATCH'}}); expect(r.app.rooms.diagnostics().memberships).toBe(0);
  }
  expect(RoomAckSchema.parse(await peer.socket.timeout(3000).emitWithAck('room.join', {...join(), sceneIdentity: {schemaVersion: 1, sha256: digest}})).ok).toBe(true);
});
it('never publishes or acknowledges a join after session revoke while its real scene hash is pending', async () => {
  const r = await open(), peer = await connect(client(r, createClientProtocolOffer(randomUUID()))), digest = await sceneManifestHash(sandboxScene);
  let hashing = false, release!: () => void, successes = 0, deltas = 0; const paused = new Promise<void>(resolve => {release = resolve;});
  const original = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  const spy = vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, input) => {hashing = true; await paused; return original(algorithm, input);});
  peer.socket.on('room.delta', () => {deltas++;});
  const result = peer.socket.timeout(1500).emitWithAck('room.join', {...join(), sceneIdentity: {schemaVersion: 1, sha256: digest}}).then(ack => {if (RoomAckSchema.parse(ack).ok) successes++;}, () => {});
  try {
    await expect.poll(() => hashing).toBe(true); const loggedOut = await fetch(r.url + '/v1/session/logout', {method: 'POST', headers: {origin, cookie: r.cookie, 'x-csrf-token': r.me.csrfToken, 'idempotency-key': randomUUID(), 'content-type': 'application/json'}, body: '{}'}); expect(loggedOut.status).toBe(200);
  } finally {release(); await result; await r.app.rooms.maintain(); spy.mockRestore();}
  expect(successes).toBe(0); expect(deltas).toBe(0); expect(r.app.rooms.diagnostics().memberships).toBe(0);
});
