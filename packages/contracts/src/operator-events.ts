import {z} from 'zod';
import {EventScheduleInputSchema,EventScheduleSchema,EventPhaseSchema} from './events';
const id=z.uuid().transform(value=>value.toLowerCase()),version=z.number().int().nonnegative().max(2147483646),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const OperatorEventConfigSchema=z.strictObject({organizerId:id,event:EventScheduleInputSchema});
export const OperatorEventRangeSchema=z.strictObject({from:z.iso.datetime(),until:z.iso.datetime()}).refine(value=>Date.parse(value.until)>Date.parse(value.from)&&Date.parse(value.until)-Date.parse(value.from)<=31*86400000,'A positive range of at most31days is required');
export const OperatorEventQuerySchema=z.strictObject({draftId:id});
export const OperatorEventLiveSchema=z.strictObject({id,phase:EventPhaseSchema,version});
export const OperatorEventDraftSchema=z.strictObject({id,version,state:z.enum(['DRAFT','PUBLISHED','CANCELLED']),config:OperatorEventConfigSchema,live:OperatorEventLiveSchema.nullable(),createdAt:z.iso.datetime(),changedAt:z.iso.datetime(),retainedUntil:z.iso.datetime()});
export const OperatorEventCalendarSchema=z.strictObject({drafts:z.array(OperatorEventDraftSchema).max(50),truncated:z.boolean()});
export const OperatorEventSnapshotSchema=z.strictObject({version,state:z.enum(['DRAFT','PUBLISHED','CANCELLED']),organizerRef:hash,titleRef:hash,worldSlug:EventScheduleInputSchema.shape.worldSlug,visibility:z.enum(['listed','private']),capacity:z.number().int().min(1).max(100),schedule:EventScheduleSchema,live:OperatorEventLiveSchema.nullable()});
const common={requestId:id,draftId:id,expectedVersion:version};
export const OperatorEventCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({...common,action:z.literal('save'),reason:z.enum(['SCHEDULE_PLANNING','CORRECTION']),config:OperatorEventConfigSchema}),
 z.strictObject({...common,action:z.literal('publish'),reason:z.literal('SCHEDULE_CONFIRMED')}),
 z.strictObject({...common,action:z.literal('cancel'),reason:z.enum(['OPERATOR_CANCELLATION','CORRECTION']),expectedEventVersion:version.nullable()}),
]);
export const OperatorEventReceiptSchema=z.strictObject({requestId:id,draftId:id,before:OperatorEventSnapshotSchema.nullable(),after:OperatorEventSnapshotSchema});
export const OperatorEventAuditSchema=z.strictObject({events:z.array(z.strictObject({requestId:id,action:z.enum(['save','publish','cancel']),reason:z.enum(['SCHEDULE_PLANNING','CORRECTION','SCHEDULE_CONFIRMED','OPERATOR_CANCELLATION']),before:OperatorEventSnapshotSchema.nullable(),after:OperatorEventSnapshotSchema,occurredAt:z.iso.datetime(),previousHash:hash,eventHash:hash})).max(20)});
