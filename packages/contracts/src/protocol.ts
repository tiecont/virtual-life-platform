import {z} from 'zod';

// Application protocol fields; authenticated actor authority never comes from this envelope.
export const CommandEnvelopeSchema = z.strictObject({schemaVersion: z.literal(1), requestId: z.uuid()});
export const ROOM_CLIENT_SEQUENCE_MAX = 2147483647;
export const ClientSequenceSchema = z.number().int().min(0).max(ROOM_CLIENT_SEQUENCE_MAX);
