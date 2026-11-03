import { z } from 'zod';

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
