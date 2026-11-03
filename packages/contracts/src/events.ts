import { z } from 'zod';
import { WorldSlugSchema, WorldVersionSchema } from './world-primitives';

export const EventPhaseSchema = z.enum(['SCHEDULED', 'OPEN', 'LIVE', 'ENDED', 'CANCELLED']);
export const ReservationPhaseSchema = z.enum(['HELD', 'CONFIRMED', 'EXPIRED', 'CHECKED_IN', 'CANCELLED']);
export type EventPhase = z.infer<typeof EventPhaseSchema>;
export type ReservationPhase = z.infer<typeof ReservationPhaseSchema>;
export const EventTimeZoneSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_+/-]+$/).refine(value => {
  if (value !== 'UTC' && !value.includes('/')) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: value }); return true; } catch { return false; }
}, 'An IANA timezone or UTC is required');
export const EventScheduleSchema = z.strictObject({
  schemaVersion: z.literal(1), timeZone: EventTimeZoneSchema,
  opensAt: z.iso.datetime({ precision: 3 }), startsAt: z.iso.datetime({ precision: 3 }), checkInClosesAt: z.iso.datetime({ precision: 3 }), endsAt: z.iso.datetime({ precision: 3 }),
}).refine(value => Date.parse(value.opensAt) <= Date.parse(value.startsAt) && Date.parse(value.startsAt) < Date.parse(value.checkInClosesAt) && Date.parse(value.checkInClosesAt) <= Date.parse(value.endsAt)
  && Date.parse(value.endsAt) - Date.parse(value.opensAt) <= 86400000, 'Ordered UTC schedule of at most 24 hours required');
export type EventSchedule = Readonly<z.infer<typeof EventScheduleSchema>>;
export const EventCapacityPolicySchema = z.strictObject({
  schemaVersion: z.literal(1), capacity: z.number().int().min(1).max(100), maxPartySize: z.number().int().min(1).max(100),
  holdSeconds: z.number().int().min(1).max(300), overbooking: z.literal(0), waitlist: z.enum(['disabled', 'fifo']),
}).refine(value => value.maxPartySize <= value.capacity, 'Party size cannot exceed capacity');
export type EventCapacityPolicy = Readonly<z.infer<typeof EventCapacityPolicySchema>>;

const uuid = z.uuid().transform(value => value.toLowerCase());
export const WorldEventPolicySchema = z.strictObject({ schemaVersion: z.literal(1), version: WorldVersionSchema, maxCapacity: z.number().int().min(1).max(100) });
const title = z.string().trim().min(1).max(120).refine(value => ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127), 'Control characters are forbidden');
// Trusted server provisioning only; no public schedule endpoint in M12-02.
export const EventScheduleInputSchema = z.strictObject({ schemaVersion: z.literal(1), worldSlug: WorldSlugSchema, policyVersion: WorldVersionSchema, title, audience: z.literal('silent'), visibility: z.enum(['listed', 'private']), capacity: z.number().int().min(1).max(100), schedule: EventScheduleSchema });
export const EventRsvpInputSchema = z.strictObject({ schemaVersion: z.literal(1) });
export const EventCalendarInputSchema = z.strictObject({ schemaVersion: z.literal(1), optIn: z.literal(true) });
export const EventCatalogQuerySchema = z.strictObject({ worldSlug: WorldSlugSchema });
export const EventRsvpViewSchema = z.strictObject({ id: uuid, phase: z.enum(['CONFIRMED', 'CANCELLED', 'EXPIRED']), createdAt: z.iso.datetime(), changedAt: z.iso.datetime() });
export const EventRsvpResultSchema = z.strictObject({ schemaVersion: z.literal(1), rsvp: EventRsvpViewSchema });
export const EventViewSchema = z.strictObject({ id: uuid, worldSlug: WorldSlugSchema, title, phase: EventPhaseSchema, createdAt: z.iso.datetime(), schedule: EventScheduleSchema, startsLabel: z.string(), endsLabel: z.string(), capacity: z.number().int().min(1).max(100), mine: z.boolean(), rsvp: EventRsvpViewSchema.nullable() });
export const EventResultSchema = z.strictObject({ schemaVersion: z.literal(1), event: EventViewSchema });
export const EventCatalogSchema = z.strictObject({ schemaVersion: z.literal(1), items: z.array(EventViewSchema).max(50), truncated: z.boolean() });
