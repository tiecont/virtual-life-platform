import {z} from 'zod';
import {OwnRoomSchema} from './travel';

// Public safety state only; this never contains native bearer/refresh grants.
export const NativeSafetyStateSchema=z.strictObject({
 schemaVersion:z.literal(1),accountId:z.uuid(),visit:OwnRoomSchema,reportsAvailable:z.boolean(),
 blocks:z.array(z.strictObject({targetId:z.uuid(),label:z.string().nullable()})).max(500),
}).refine(value=>!value.visit.snapshot||value.visit.snapshot.self.accountId===value.accountId,'Safety account changed');
export type NativeSafetyState=z.infer<typeof NativeSafetyStateSchema>;
