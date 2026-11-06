import {z} from 'zod';
import {OrderPhaseSchema} from './hospitality';
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),ms=z.number().finite().nonnegative(),stamp=count;
export const ObservationRouteGroups=['identity','social','world','travel','hospitality','focus','events','progression','safety','health','unknown'] as const;
export const ObservationMethods=['GET','POST','PUT','PATCH','DELETE','HEAD','OTHER'] as const;
export const ObservationRoomCommands=['room.join','room.leave','room.snapshot','seat.claim','seat.release','room.move'] as const;
export const ObservationOutcomes=['OK','INVALID_REQUEST','UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','RATE_LIMITED','INTERNAL_ERROR','WORLD_UNAVAILABLE','WORLD_VERSION_MISMATCH','ROOM_FULL','ALREADY_IN_ROOM','NOT_IN_ROOM','IDEMPOTENCY_CONFLICT','SEAT_TAKEN','ALREADY_SEATED'] as const;
const bucket=z.strictObject({upperMs:ms.nullable(),count});
export const ObservationHistogramSchema=z.strictObject({count,totalMs:ms,buckets:z.array(bucket).length(12),p95UpperBoundMs:ms.nullable()}).superRefine((value,ctx)=>{
 const bounds=[1,5,10,25,50,100,250,500,1000,2500,5000,null];let total=0,upper:number|null=null,found=false;
 for(const [i,b] of value.buckets.entries()){if(b.upperMs!==bounds[i])ctx.addIssue({code:'custom',message:'Unexpected fixed histogram bound'});total+=b.count;if(!found&&total>=Math.ceil(value.count*.95)&&value.count>0){upper=b.upperMs;found=true;}}
 if(total!==value.count||value.p95UpperBoundMs!==upper||value.count===0&&value.totalMs!==0)ctx.addIssue({code:'custom',message:'Inconsistent histogram observation'});
});
export const OperationalObservationSchema=z.strictObject({
 schemaVersion:z.literal(2),source:z.literal('platform-api'),scope:z.literal('PROCESS_LOCAL'),sampledAt:stamp,processStartedAt:stamp,
 coverage:z.strictObject({dating:z.literal('EXCLUDED'),cluster:z.literal('NOT_OBSERVED'),databaseHealth:z.literal('NOT_OBSERVED'),workerBacklog:z.literal('NOT_OBSERVED')}),
 durations:z.strictObject({method:z.literal('FIXED_BUCKET_UPPER_BOUND_APPROXIMATION'),window:z.literal('PROCESS_LIFETIME'),overflow:z.literal('NULL_UPPER_BOUND'),since:stamp}),
 http:z.strictObject({requests:count,errors:count,series:z.array(z.strictObject({group:z.enum(ObservationRouteGroups),method:z.enum(ObservationMethods),errors:count,histogram:ObservationHistogramSchema})).max(77)}),
 rooms:z.strictObject({commands:z.array(z.strictObject({command:z.enum(ObservationRoomCommands),outcomes:z.array(z.strictObject({outcome:z.enum(ObservationOutcomes),count})).max(17),histogram:ObservationHistogramSchema})).length(6),pendingCommands:count,droppedDeltas:count,slowConsumerDisconnects:count}),
 eventLoop:z.strictObject({status:z.enum(['available','warming','not_started']),source:z.literal('node:perf_hooks.monitorEventLoopDelay'),method:z.literal('NODE_HISTOGRAM_APPROXIMATION'),window:z.literal('MONITOR_LIFETIME'),resolutionMs:z.literal(20),samples:count,p95Ms:ms.nullable()}),
 online:z.strictObject({rooms:count,memberships:count,retainedMemberships:count,connections:count,occupiedSeats:count,graceMemberships:count}),
 orders:z.strictObject({sampledAt:stamp,phases:z.array(z.strictObject({phase:OrderPhaseSchema,count})).max(7)}),
 tracing:z.strictObject({retentionMs:z.literal(300000),maxCompleted:z.literal(100),maxInFlight:z.literal(128),active:count,dropped:count,identifiersInMetricLabels:z.literal(false)}),
});
export type OperationalObservation=z.infer<typeof OperationalObservationSchema>;

export const OperatorObservationViewSchema=z.strictObject({schemaVersion:z.literal(1),source:z.literal('platform-api'),status:z.enum(['FRESH','STALE','UNKNOWN']),sampledAt:stamp.nullable(),observation:OperationalObservationSchema.nullable()}).superRefine((value,ctx)=>{
 if(value.status==='UNKNOWN'?value.observation!==null||value.sampledAt!==null:!value.observation||value.sampledAt!==value.observation.sampledAt)ctx.addIssue({code:'custom',message:'Observation availability and sample must agree'});
});
export type OperatorObservationView=z.infer<typeof OperatorObservationViewSchema>;
