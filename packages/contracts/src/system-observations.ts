import {z} from 'zod';
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),time=count;
const unknown={status:z.literal('UNKNOWN'),sampledAt:z.null(),value:z.null()};
const DatabaseSource=z.discriminatedUnion('status',[z.strictObject(unknown),z.strictObject({status:z.literal('OBSERVED'),sampledAt:time,value:z.strictObject({responding:z.literal(true)})})]);
export const BacklogValueSchema=z.strictObject({pendingDeliveries:count,oldestAgeMs:count.nullable(),consumerCount:count.min(1).max(8)}).superRefine((value,ctx)=>{if(value.pendingDeliveries===0?value.oldestAgeMs!==null:value.oldestAgeMs===null)ctx.addIssue({code:'custom',message:'Backlog count and age must agree'});});
export const SystemObservationSchema=z.strictObject({schemaVersion:z.literal(1),source:z.literal('platform-api'),scope:z.literal('LOCAL_API_PROCESS'),sampledAt:time,
 database:DatabaseSource,pool:z.discriminatedUnion('status',[z.strictObject({status:z.literal('OBSERVED'),sampledAt:time,total:count,idle:count,waiting:count}),z.strictObject({status:z.literal('UNKNOWN'),sampledAt:z.null(),total:z.null(),idle:z.null(),waiting:z.null()})]),
 backlog:z.discriminatedUnion('status',[z.strictObject(unknown),z.strictObject({...unknown,status:z.literal('NOT_CONFIGURED')}),z.strictObject({status:z.literal('OBSERVED'),sampledAt:time,value:BacklogValueSchema})]),
 workerLiveness:z.literal('UNKNOWN'),authority:z.strictObject({configuredOwners:z.literal(1),state:z.enum(['idle','held','blocked','lost','closed'])}),
 versions:z.strictObject({expectedSchemaVersion:z.literal(1),expectedMigrationCount:count,releaseVersion:count.nullable(),artifactRevision:z.null()}),platformQueue:z.literal('NOT_IMPLEMENTED'),
});
export const OperatorSystemViewSchema=z.strictObject({schemaVersion:z.literal(1),source:z.literal('platform-api'),status:z.enum(['FRESH','STALE','UNKNOWN']),sampledAt:time.nullable(),system:SystemObservationSchema.nullable()}).superRefine((value,ctx)=>{if(value.status==='UNKNOWN'?value.system!==null||value.sampledAt!==null:!value.system||value.sampledAt!==value.system.sampledAt)ctx.addIssue({code:'custom',message:'System source and availability must agree'});});
export type SystemObservation=z.infer<typeof SystemObservationSchema>;
export type OperatorSystemView=z.infer<typeof OperatorSystemViewSchema>;
