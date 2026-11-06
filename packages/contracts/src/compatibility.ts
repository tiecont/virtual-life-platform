import {z} from 'zod';
const versions = z.array(z.number().int().min(1).max(65535)).min(1).max(4).refine(items => new Set(items).size === items.length);
const capability = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const capabilities = z.array(capability).max(8).refine(items => new Set(items).size === items.length);
export const ClientProtocolOfferSchema = z.strictObject({nonce: z.uuid(), versions, sceneSchemaVersions: versions, requiredCapabilities: capabilities});
export type ClientProtocolOffer = z.infer<typeof ClientProtocolOfferSchema>;
export const ClientCompatibilitySchema = z.strictObject({schemaVersion: z.literal(1), protocolVersions: versions, sceneSchemaVersions: versions, capabilities});
export type ClientCompatibility = z.infer<typeof ClientCompatibilitySchema>;
export const NegotiatedSessionSchema = z.strictObject({schemaVersion: z.literal(1), nonce: z.uuid(), protocolVersion: z.literal(1), sceneSchemaVersion: z.literal(1), capabilities, roomDelta: z.literal('full-snapshot')});
export type NegotiatedSession = z.infer<typeof NegotiatedSessionSchema>;
export const CURRENT_CLIENT_COMPATIBILITY: ClientCompatibility = Object.freeze(ClientCompatibilitySchema.parse({schemaVersion: 1, protocolVersions: [1], sceneSchemaVersions: [1], capabilities: ['room-snapshot-v1', 'room-client-sequence-v1', 'scene-manifest-sha256-v1']}));
Object.freeze(CURRENT_CLIENT_COMPATIBILITY.protocolVersions); Object.freeze(CURRENT_CLIENT_COMPATIBILITY.sceneSchemaVersions); Object.freeze(CURRENT_CLIENT_COMPATIBILITY.capabilities);
// Capability negotiation is compatibility metadata, never authentication/permission.
export function negotiateClientProtocol(input: unknown): NegotiatedSession | null {
  const offer = ClientProtocolOfferSchema.parse(input), current = CURRENT_CLIENT_COMPATIBILITY;
  if (!offer.versions.includes(1) || !offer.sceneSchemaVersions.includes(1) || offer.requiredCapabilities.some(name => !current.capabilities.includes(name))) return null;
  return NegotiatedSessionSchema.parse({schemaVersion: 1, nonce: offer.nonce, protocolVersion: 1, sceneSchemaVersion: 1, capabilities: [...current.capabilities], roomDelta: 'full-snapshot'});
}
