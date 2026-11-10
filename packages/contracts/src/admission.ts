import {z} from 'zod';
const bounded=z.number().int().nonnegative().max(100000),version=z.number().int().min(1).max(2147483646),id=z.uuid().transform(value=>value.toLowerCase());
export const AdmissionPolicySchema=z.strictObject({schemaVersion:z.literal(1),version,hard:bounded,target:bounded,paused:z.boolean(),offerTtlMs:z.number().int().min(1000).max(60000),graceTtlMs:z.number().int().min(1000).max(120000),ticketTtlMs:z.number().int().min(1000).max(900000),maxTickets:z.number().int().min(1).max(10000)}).refine(value=>value.target<=value.hard,'Target exceeds hard bound');
export const AdmissionPolicyChangeSchema=z.strictObject({expectedVersion:version,hard:bounded,target:bounded,paused:z.boolean()}).refine(value=>value.target<=value.hard,'Target exceeds requested hard bound');
export const AdmissionCapacitySchema=z.strictObject({schemaVersion:z.literal(1),policyVersion:version,hard:bounded,target:bounded,pendingHard:bounded.nullable(),paused:z.boolean(),active:bounded,reconnectGrace:bounded,reserved:bounded,occupancy:bounded,queued:z.number().int().nonnegative().max(10000),mode:z.enum(['OPEN','FULL','CLOSED','DRAINING_LIMIT','PAUSED'])}).superRefine((value,ctx)=>{
 const mode=value.occupancy>value.target?'DRAINING_LIMIT':value.paused?'PAUSED':value.target===0?'CLOSED':value.occupancy>=value.target?'FULL':'OPEN';
 if(value.active+value.reconnectGrace+value.reserved!==value.occupancy||value.occupancy>value.hard||value.target>value.hard||value.pendingHard!==null&&(value.pendingHard>=value.hard||value.target>value.pendingHard||value.occupancy<=value.pendingHard)||value.mode!==mode)ctx.addIssue({code:'custom',message:'Invalid disjoint capacity observation'});
});
const own={schemaVersion:z.literal(1),policyVersion:version,version,id,observedAt:z.iso.datetime()};
export const AdmissionOwnStateSchema=z.discriminatedUnion('state',[
 z.strictObject({...own,state:z.literal('WAITING'),expiresAt:z.iso.datetime(),position:z.number().int().min(1).max(10000)}),
 z.strictObject({...own,state:z.literal('RESERVED'),expiresAt:z.iso.datetime()}),
 z.strictObject({...own,state:z.literal('ACTIVE'),expiresAt:z.null()}),
 z.strictObject({...own,state:z.literal('RECONNECT_GRACE'),expiresAt:z.iso.datetime()}),
]);
export const AdmissionCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({schemaVersion:z.literal(1),requestId:id,action:z.literal('enqueue')}),
 z.strictObject({schemaVersion:z.literal(1),requestId:id,action:z.literal('claim'),offerId:id,expectedVersion:version}),
 z.strictObject({schemaVersion:z.literal(1),requestId:id,action:z.literal('leave'),id,expectedVersion:version}),
]);
export type AdmissionPolicy=z.infer<typeof AdmissionPolicySchema>;
export type AdmissionOwnState=z.infer<typeof AdmissionOwnStateSchema>;
