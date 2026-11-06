import {z} from 'zod';
export const RuntimeControlWorldSchema=z.enum(['deadline','maid','library','restaurant','park','lounge','dating']);
export const RuntimePausedWorldsSchema=z.strictObject({deadline:z.boolean(),maid:z.boolean(),library:z.boolean(),restaurant:z.boolean(),park:z.boolean(),lounge:z.boolean(),dating:z.boolean()});
const hash=z.string().regex(/^[a-f0-9]{64}$/),revision=z.number().int().nonnegative().max(2147483646),id=z.uuid().transform(value=>value.toLowerCase());
export const RuntimeControlSnapshotSchema=z.strictObject({revision,releaseHash:hash,maintenance:z.boolean(),paused:RuntimePausedWorldsSchema});
export type RuntimeControlSnapshot=z.infer<typeof RuntimeControlSnapshotSchema>;
export const RuntimeControlContextSchema=z.strictObject({environment:z.enum(['development','test','staging','production']),releaseHash:hash,releaseVersion:z.number().int().positive(),runtimeFileVersion:z.number().int().positive().nullable(),baseMaintenance:z.boolean().nullable(),projection:z.enum(['APPLIED','PENDING','FAILED','STALE']),appliedRevision:revision.nullable(),worlds:z.array(z.strictObject({slug:RuntimeControlWorldSchema,installed:z.boolean(),entitled:z.boolean(),baseEnabled:z.boolean().nullable(),available:z.boolean()})).length(7).refine(rows=>new Set(rows.map(row=>row.slug)).size===7)});
export const RuntimeControlViewSchema=z.discriminatedUnion('supported',[z.strictObject({supported:z.literal(false)}),RuntimeControlContextSchema.extend({supported:z.literal(true),desired:RuntimeControlSnapshotSchema})]);
const common={requestId:id,expectedRevision:revision,expectedReleaseHash:hash},reason=z.enum(['MAINTENANCE_WINDOW','SERVICE_PROTECTION','RECOVERY']);
export const RuntimeControlCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({...common,action:z.literal('maintenance'),paused:z.boolean(),reason}),
 z.strictObject({...common,action:z.literal('world'),worldSlug:RuntimeControlWorldSchema,paused:z.boolean(),reason}),
 z.strictObject({...common,action:z.literal('adopt'),reason:z.literal('RELEASE_RECONCILIATION')}),
]);
export const RuntimeControlResultSchema=z.strictObject({requestId:id,before:RuntimeControlSnapshotSchema,after:RuntimeControlSnapshotSchema});
export const RuntimeControlAuditSchema=z.strictObject({events:z.array(z.strictObject({requestId:id,action:z.enum(['maintenance','world','adopt']),reason:z.enum(['MAINTENANCE_WINDOW','SERVICE_PROTECTION','RECOVERY','RELEASE_RECONCILIATION']),before:RuntimeControlSnapshotSchema,after:RuntimeControlSnapshotSchema,occurredAt:z.iso.datetime(),previousHash:hash,eventHash:hash})).max(20)});
