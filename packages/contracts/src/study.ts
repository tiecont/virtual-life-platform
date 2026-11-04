import { z } from 'zod';
import { TravelSourceSchema } from './travel';
const uuid=z.uuid().transform(value=>value.toLowerCase());
export const StudyViewInputSchema=z.strictObject({schemaVersion:z.literal(1),source:TravelSourceSchema,eventId:uuid});
export const StudySharingInputSchema=z.discriminatedUnion('sharing',[
 StudyViewInputSchema.extend({sharing:z.literal(true),expectedRevision:uuid}),
 z.strictObject({schemaVersion:z.literal(1),sharing:z.literal(false)}),
]);
export const StudySharingStateSchema=z.strictObject({schemaVersion:z.literal(1),sharing:z.boolean(),revision:uuid.nullable()});
const counts=z.strictObject({active:z.number().int().min(0).max(8),paused:z.number().int().min(0).max(8),completed:z.number().int().min(0).max(8),idle:z.number().int().min(0).max(8)}).refine(value=>Object.values(value).reduce((sum,n)=>sum+n,0)<=8,'At most eight consenting participants');
export const StudyViewSchema=StudySharingStateSchema.extend({observedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),counts:counts.nullable()}).refine(value=>value.sharing===(value.counts!==null)&&Date.parse(value.expiresAt)>Date.parse(value.observedAt)&&Date.parse(value.expiresAt)-Date.parse(value.observedAt)<=5000,'Bounded consented phase observation');
export type StudySharingInput=z.infer<typeof StudySharingInputSchema>;
export type StudySharingState=z.infer<typeof StudySharingStateSchema>;
export type StudyView=z.infer<typeof StudyViewSchema>;
