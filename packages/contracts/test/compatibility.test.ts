import {expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {SessionHandshakeSchema, RoomJoinSchema, ClientProtocolOfferSchema, CURRENT_CLIENT_COMPATIBILITY, negotiateClientProtocol, canonicalSceneManifest, sceneManifestHash} from '../src';
const nonce = '00000000-0000-4000-8000-000000000001';
const offer = () => ({nonce, versions: [1], sceneSchemaVersions: [1], requiredCapabilities: ['room-snapshot-v1', 'room-client-sequence-v1', 'scene-manifest-sha256-v1']});
const scene = {schemaVersion: 1, key: 'fixture', version: '1.0.0', projection: 'orthogonal', tileSize: 16, columns: 4, rows: 4, spawn: {x: 0, y: 0}, collisionZones: [], seats: []};
it('preserves the exact legacy handshake and join shapes and admits bounded opt-in negotiation', () => {
  const legacy = {schemaVersion: 1, csrfToken: 'a'.repeat(64)};
  expect(SessionHandshakeSchema.parse(legacy)).toEqual(legacy);
  expect(SessionHandshakeSchema.parse({...legacy, protocol: offer()}).protocol).toEqual(offer());
  const join = {schemaVersion: 1, requestId: nonce, worldSlug: 'sdk-sandbox', worldVersion: '1.0.0', sceneVersion: '1.0.0'};
  expect(RoomJoinSchema.parse(join)).toEqual(join);
  expect(RoomJoinSchema.parse({...join, sceneIdentity: {schemaVersion: 1, sha256: 'b'.repeat(64)}}).sceneIdentity?.sha256).toBe('b'.repeat(64));
  for (const extra of [{role: 'admin'}, {actorId: nonce}, {protocol: {...offer(), versions: [1, 1]}}, {protocol: {...offer(), requiredCapabilities: ['x'.repeat(100)]}}]) expect(SessionHandshakeSchema.safeParse({...legacy, ...extra}).success).toBe(false);
});
it('selects supported protocol/content schema independently and returns an explicit unsupported result', () => {
  expect(negotiateClientProtocol(offer())).toMatchObject({schemaVersion: 1, nonce, protocolVersion: 1, sceneSchemaVersion: 1, roomDelta: 'full-snapshot'});
  for (const request of [{...offer(), versions: [2]}, {...offer(), sceneSchemaVersions: [2]}, {...offer(), requiredCapabilities: ['sparse-delta-v2']}]) expect(negotiateClientProtocol(request)).toBeNull();
  expect(CURRENT_CLIENT_COMPATIBILITY.protocolVersions).toEqual([1]); expect(CURRENT_CLIENT_COMPATIBILITY.sceneSchemaVersions).toEqual([1]);
  expect(ClientProtocolOfferSchema.safeParse({...offer(), versions: Array(5).fill(1)}).success).toBe(false);
});
it('hashes the validated canonical scene description independently of versions and object insertion order', async () => {
  const canonical = '{"collisionZones":[],"columns":4,"key":"fixture","projection":"orthogonal","rows":4,"schemaVersion":1,"seats":[],"spawn":{"x":0,"y":0},"tileSize":16,"version":"1.0.0"}';
  expect(canonicalSceneManifest(scene)).toBe(canonical); expect(canonicalSceneManifest(Object.fromEntries(Object.entries(scene).reverse()))).toBe(canonical);
  const digest = await sceneManifestHash(scene); expect(digest).toBe(createHash('sha256').update(canonical).digest('hex'));
  expect(await sceneManifestHash({...scene, tileSize: 32})).not.toBe(digest);
  await expect(sceneManifestHash({...scene, schemaVersion: 2})).rejects.toThrow();
});
