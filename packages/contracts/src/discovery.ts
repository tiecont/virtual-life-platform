import { z } from 'zod';
import { WorldSlugSchema } from './world-primitives';
export const DiscoveryViewSchema=z.strictObject({
 schemaVersion:z.literal(1),observedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),schedulesKnown:z.boolean(),
 featured:z.array(z.strictObject({worldSlug:WorldSlugSchema,reason:z.enum(['occupied','scheduled','start-here']),roomCount:z.number().int().min(0).max(32),usedPlaces:z.number().int().min(0).max(3200),roomId:z.uuid().optional(),eventAt:z.iso.datetime().nullable(),eventState:z.enum(['live','upcoming']).nullable()})).max(3),
}).refine(value=>Date.parse(value.expiresAt)-Date.parse(value.observedAt)===30000&&new Set(value.featured.map(item=>item.worldSlug)).size===value.featured.length&&value.featured.every(item=>(item.eventAt===null)===(item.eventState===null)&&(item.usedPlaces===0||item.roomCount>0)&&(!item.roomId||item.roomCount>0)&&(item.reason!=='occupied'||item.usedPlaces>0)&&(item.reason!=='scheduled'||item.eventAt!==null)&&(item.reason!=='start-here'||item.usedPlaces===0&&item.eventAt===null)),'Inconsistent observed discovery');
export type DiscoveryView= z.infer<typeof DiscoveryViewSchema>;
