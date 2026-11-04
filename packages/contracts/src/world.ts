import { z } from 'zod';
import { SceneManifestSchema } from './scene';
import { WorldSlugSchema, WorldVersionSchema, SeatIdSchema } from './world-primitives';
import { HospitalityPolicySchema } from './hospitality-policy';
import { WorldEventPolicySchema } from './events';
import { StagePolicySchema } from './stage-policy';
export { WorldSlugSchema, WorldVersionSchema, SeatIdSchema } from './world-primitives';

export const WORLD_API_VERSION = 1 as const;
export const WorldCapabilitySchema = z.enum(['presence', 'seating', 'focus', 'hospitality', 'events', 'chat', 'portals']);
const PolicyKeySchema = z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/);
export const WorldAccessPolicySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('public') }),
  z.strictObject({ kind: z.literal('private'), policyKey: PolicyKeySchema }),
  z.strictObject({ kind: z.literal('restricted'), policyKey: PolicyKeySchema, requiresAdult: z.boolean() }),
]);
export const WorldSceneRefSchema = z.strictObject({ key: WorldSlugSchema, version: WorldVersionSchema });
export const WorldMapSchema = z.strictObject({
  region: WorldSlugSchema,
  position: z.strictObject({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }),
  icon: z.enum(['coffee', 'book', 'utensils', 'trees', 'music', 'heart', 'flask']),
});
export const WorldDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(1), apiVersion: z.literal(WORLD_API_VERSION),
  slug: WorldSlugSchema, version: WorldVersionSchema, title: z.string().trim().min(1).max(80),
  kind: z.enum(['world', 'sandbox']), sceneRef: WorldSceneRefSchema,
  scene: SceneManifestSchema.optional(),
  capacity: z.number().int().min(1).max(100),
  seatIds: z.array(SeatIdSchema).max(100).default([]),
  capabilities: z.array(WorldCapabilitySchema).min(1).max(7)
    .refine(items => new Set(items).size === items.length && items.includes('presence'), 'Unique capabilities including presence required'),
  focusPolicy: z.strictObject({ pauseAllowed: z.boolean() }).optional(),
  hospitalityPolicy: HospitalityPolicySchema.optional(),
  eventPolicy: WorldEventPolicySchema.optional(),
  stagePolicy: StagePolicySchema.optional(),
  appearancePolicy: z.strictObject({ apron: z.enum(['forbidden','allowed','on-shift']) }).optional(),
  accessPolicy: WorldAccessPolicySchema, visibility: z.enum(['listed', 'hidden']), map: WorldMapSchema,
}).superRefine((world, ctx) => {
  if (world.appearancePolicy?.apron === 'on-shift' && !world.hospitalityPolicy?.staffing) ctx.addIssue({ code: 'custom', path: ['appearancePolicy'], message: 'Uniform policy requires explicit voluntary staffing' });
  if (world.capabilities.includes('focus') !== !!world.focusPolicy) ctx.addIssue({ code: 'custom', path: ['focusPolicy'], message: 'Focus capability requires an explicit trusted timer policy' });
  if (world.capabilities.includes('hospitality') !== !!world.hospitalityPolicy) ctx.addIssue({ code: 'custom', path: ['hospitalityPolicy'], message: 'Hospitality capability requires an explicit trusted service policy' });
  if (world.capabilities.includes('events') !== !!world.eventPolicy || world.eventPolicy && world.eventPolicy.maxCapacity > world.capacity) ctx.addIssue({ code: 'custom', path: ['eventPolicy'], message: 'Events require an explicit policy within world capacity' });
  if (world.eventPolicy?.reservations && (world.eventPolicy.reservations.maxPartySize > world.capacity || world.eventPolicy.reservations.resources.some(resource => resource.capacity > world.capacity))) ctx.addIssue({ code: 'custom', path: ['eventPolicy', 'reservations'], message: 'Table policy must fit world capacity' });
  if(world.stagePolicy&&(!world.eventPolicy||!world.scene?.collisionZones.some(zone=>zone.kind==='stage')||world.stagePolicy.maxQueue>world.capacity||world.accessPolicy.kind!=='public'||world.visibility!=='listed'))ctx.addIssue({code:'custom',path:['stagePolicy'],message:'Stage policy requires a public listed event venue,solid stage and bounded room queue'});
  if (world.scene && (world.scene.key !== world.sceneRef.key || world.scene.version !== world.sceneRef.version || [...world.scene.seats.map(seat => seat.seatId)].sort().join(',') !== [...world.seatIds].sort().join(','))) ctx.addIssue({ code: 'custom', path: ['scene'], message: 'Scene geometry must match the versioned world seat contract' });
  if (new Set(world.seatIds).size !== world.seatIds.length || world.seatIds.length > world.capacity || (world.capabilities.includes('seating') !== (world.seatIds.length > 0))) {
    ctx.addIssue({ code: 'custom', path: ['seatIds'], message: 'Unique seat IDs within capacity must match seating capability' });
  }
  if (world.visibility === 'hidden' && world.accessPolicy.kind === 'public') {
    ctx.addIssue({ code: 'custom', path: ['accessPolicy'], message: 'Hidden worlds require an explicit policy' });
  }
  if (world.slug === 'dating' && (world.visibility !== 'hidden' || world.accessPolicy.kind !== 'restricted' || !world.accessPolicy.requiresAdult)) {
    ctx.addIssue({ code: 'custom', path: ['accessPolicy'], message: 'Dating requires hidden adult-restricted access' });
  }
});
export type WorldDefinition = z.infer<typeof WorldDefinitionSchema>;
export const WorldAvailabilitySchema = z.enum(['available', 'disabled', 'offline']);
export const WorldCardSchema = z.strictObject({
  slug: WorldSlugSchema, version: WorldVersionSchema, title: z.string().min(1).max(80), kind: z.enum(['world', 'sandbox']),
  sceneRef: WorldSceneRefSchema, capacity: z.number().int().min(1).max(100),
  capabilities: z.array(WorldCapabilitySchema), map: WorldMapSchema,
  accessHint: z.enum(['session-required', 'permission-required', 'reviewed-access-required']),
  availability: WorldAvailabilitySchema, discoverability: z.literal('listed'),
});
export const WorldCatalogSchema = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), worlds: z.array(WorldCardSchema).max(100) });
export type WorldCard = z.infer<typeof WorldCardSchema>;
export type WorldCatalog = z.infer<typeof WorldCatalogSchema>;
// Internal hook invocation only. Room allocation and wire commands are owned by M06/M09.
export const WorldInvocationSchema = z.strictObject({
  schemaVersion: z.literal(1), worldVersion: WorldVersionSchema, sceneVersion: WorldVersionSchema,
  membershipId: z.string().min(1).max(128), action: z.enum(['join', 'leave', 'command']), payload: z.unknown().optional(),
}).refine(value => value.action === 'command' || value.payload === undefined, 'Only commands accept payloads');
export type WorldInvocation = z.infer<typeof WorldInvocationSchema>;
export const WorldFlagsSchema = z.strictObject({ schemaVersion: z.literal(1), environments: z.strictObject({
  development: z.record(WorldSlugSchema, z.boolean()), test: z.record(WorldSlugSchema, z.boolean()), production: z.record(WorldSlugSchema, z.boolean()),
}) });
export type WorldFlags = z.infer<typeof WorldFlagsSchema>;
export const SandboxCommandSchema = z.strictObject({ type: z.literal('inspect') });
