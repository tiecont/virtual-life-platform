import {ClientCompatibilitySchema, CURRENT_CLIENT_COMPATIBILITY, ClientProtocolOfferSchema, NegotiatedSessionSchema, type ClientProtocolOffer, type NegotiatedSession} from '@virtual-city/contracts';
export type ResolvedClientCompatibility = {mode: 'legacy'} | {mode: 'negotiated'};
export function resolveClientCompatibility(status: number, input?: unknown): ResolvedClientCompatibility {
  if (status === 404) return {mode: 'legacy'};
  if (status !== 200) throw Error('The city is unavailable. Try again shortly.');
  const parsed = ClientCompatibilitySchema.safeParse(input);
  if (!parsed.success) throw Error('The city is unavailable. Reload and try again.');
  const server = parsed.data, client = CURRENT_CLIENT_COMPATIBILITY;
  if (!server.protocolVersions.includes(1) || !server.sceneSchemaVersions.includes(1) || client.capabilities.some(name => !server.capabilities.includes(name))) throw Error('Update this app before entering the city.');
  return {mode: 'negotiated'};
}
export function createClientProtocolOffer(nonce: string): ClientProtocolOffer {return ClientProtocolOfferSchema.parse({nonce, versions: [1], sceneSchemaVersions: [1], requiredCapabilities: [...CURRENT_CLIENT_COMPATIBILITY.capabilities]});}
export function acceptSessionCompatibility(offer: ClientProtocolOffer, input: unknown): NegotiatedSession | null {
  const selected = NegotiatedSessionSchema.parse(input);
  if (selected.nonce !== offer.nonce) return null;
  if (!offer.versions.includes(selected.protocolVersion) || !offer.sceneSchemaVersions.includes(selected.sceneSchemaVersion) || offer.requiredCapabilities.some(name => !selected.capabilities.includes(name))) throw Error('Update this app before entering the city.');
  return selected;
}
