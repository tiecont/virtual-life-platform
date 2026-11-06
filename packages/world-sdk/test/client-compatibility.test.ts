import {expect, it} from 'vitest';
import {resolveClientCompatibility, createClientProtocolOffer, acceptSessionCompatibility} from '../src';
import {CURRENT_CLIENT_COMPATIBILITY, negotiateClientProtocol} from '@virtual-city/contracts';
const nonce = '00000000-0000-4000-8000-000000000001';
it('falls back only for an absent discovery route and fails closed for unsupported or malformed servers', () => {
  expect(resolveClientCompatibility(404)).toEqual({mode: 'legacy'});
  expect(resolveClientCompatibility(200, CURRENT_CLIENT_COMPATIBILITY).mode).toBe('negotiated');
  for (const [status, value] of [[503, undefined], [200, {...CURRENT_CLIENT_COMPATIBILITY, protocolVersions: [2]}], [200, {...CURRENT_CLIENT_COMPATIBILITY, sceneSchemaVersions: [2]}], [200, {...CURRENT_CLIENT_COMPATIBILITY, capabilities: []}], [200, {schemaVersion: 99}] ] as const) expect(() => resolveClientCompatibility(status, value)).toThrow();
});
it('accepts only the current offered session and does not treat negotiation or retries as authority/exactly-once', () => {
  const offer = createClientProtocolOffer(nonce), selected = negotiateClientProtocol(offer)!;
  expect(acceptSessionCompatibility(offer, selected)).toEqual(selected);
  expect(acceptSessionCompatibility(offer, {...selected, nonce: '00000000-0000-4000-8000-000000000002'})).toBeNull();
  expect(() => acceptSessionCompatibility(offer, {...selected, protocolVersion: 2})).toThrow();
  expect(() => acceptSessionCompatibility(offer, {...selected, capabilities: []})).toThrow();
});
