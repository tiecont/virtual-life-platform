import { expect, it } from 'vitest';
import { EventScheduleSchema, EventCapacityPolicySchema, EventPhaseSchema, ReservationPhaseSchema } from '@virtual-city/contracts';
import { createEvent, advanceEvent, createReservation, advanceReservation, availableCapacity, formatEventSchedule, EventStateSchema, ReservationStateSchema } from './lifecycle';

const schedule = { schemaVersion: 1 as const, timeZone: 'Asia/Ho_Chi_Minh', opensAt: '2026-11-03T09:00:00.000Z', startsAt: '2026-11-03T10:00:00.000Z', checkInClosesAt: '2026-11-03T10:15:00.000Z', endsAt: '2026-11-03T11:00:00.000Z' };
const at = (value: string) => Date.parse(value), before = at(schedule.opensAt) - 1000;
const policy = { schemaVersion: 1 as const, capacity: 2, maxPartySize: 2, holdSeconds: 60, overbooking: 0 as const, waitlist: 'fifo' as const };
const event = () => createEvent(schedule, before);
const hold = () => createReservation(schedule, policy, 1, at(schedule.opensAt));

it('observes exact event boundaries, skipped phases and terminal cancellation without extending time', () => {
  const initial = event(); expect(initial.phase).toBe('SCHEDULED');
  const open = advanceEvent(initial, 'observe', at(schedule.opensAt)); expect(open.phase).toBe('OPEN');
  expect(advanceEvent(open, 'observe', at(schedule.startsAt)).phase).toBe('LIVE');
  const ended = advanceEvent(initial, 'cancel', at(schedule.endsAt) + 1000); expect(ended).toMatchObject({ phase: 'ENDED', changedAt: at(schedule.endsAt) });
  expect(advanceEvent(ended, 'cancel', at(schedule.endsAt) + 2000)).toEqual(ended);
  for (const time of [before, at(schedule.opensAt), at(schedule.startsAt)]) {
    const cancelled = advanceEvent(initial, 'cancel', time); expect(cancelled.phase).toBe('CANCELLED');
    expect(advanceEvent(cancelled, 'observe', at(schedule.endsAt) + 1000)).toEqual(cancelled);
  }
  expect(advanceEvent(open, 'observe', at(schedule.opensAt) + 1)).toEqual(open);
});

it('confirms only within the original hold and never renews deadlines on retry', () => {
  const held = hold(), confirmed = advanceReservation(held, 'confirm', held.createdAt + 1, 'OPEN');
  expect(confirmed.phase).toBe('CONFIRMED'); expect(confirmed.holdExpiresAt).toBe(held.holdExpiresAt);
  expect(advanceReservation(confirmed, 'confirm', held.holdExpiresAt + 1, 'OPEN')).toEqual(confirmed);
  expect(advanceReservation(held, 'confirm', held.holdExpiresAt, 'OPEN')).toMatchObject({ phase: 'EXPIRED', changedAt: held.holdExpiresAt });
  const nearStart = createReservation(schedule, policy, 1, at(schedule.startsAt) - 1000); expect(nearStart.holdExpiresAt).toBe(at(schedule.startsAt));
  expect(() => createReservation(schedule, policy, 1, at(schedule.startsAt))).toThrow();
});

it('check-in requires confirmation and exact open interval, and late actions expire before taking effect', () => {
  const held = hold(); expect(() => advanceReservation(held, 'check-in', held.createdAt, 'OPEN')).toThrow();
  const early = createReservation(schedule, policy, 1, before), confirmedEarly = advanceReservation(early, 'confirm', before, 'SCHEDULED');
  expect(() => advanceReservation(confirmedEarly, 'check-in', before, 'SCHEDULED')).toThrow();
  const confirmed = advanceReservation(held, 'confirm', held.createdAt, 'OPEN');
  const checked = advanceReservation(confirmed, 'check-in', at(schedule.opensAt), 'OPEN'); expect(checked.phase).toBe('CHECKED_IN');
  expect(advanceReservation(checked, 'check-in', at(schedule.startsAt), 'LIVE')).toEqual(checked);
  for (const action of ['confirm', 'check-in', 'cancel', 'observe'] as const) expect(advanceReservation(confirmed, action, at(schedule.checkInClosesAt), 'LIVE')).toMatchObject({ phase: 'EXPIRED', changedAt: at(schedule.checkInClosesAt) });
});

it.each(ReservationPhaseSchema.options)('event cancellation releases %s without resurrecting expired or cancelled work', phase => {
  const held = hold(), confirmed = advanceReservation(held, 'confirm', held.createdAt, 'OPEN');
  const state = phase === 'HELD' ? held : phase === 'CONFIRMED' ? confirmed : phase === 'CHECKED_IN' ? advanceReservation(confirmed, 'check-in', held.createdAt, 'OPEN') : phase === 'EXPIRED' ? advanceReservation(held, 'observe', held.holdExpiresAt, 'OPEN') : advanceReservation(held, 'cancel', held.createdAt, 'OPEN');
  const result = advanceReservation(state, 'observe', held.holdExpiresAt + 1000, 'CANCELLED');
  expect(result.phase).toBe(phase === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED');
  expect(advanceReservation(result, 'confirm', at(schedule.startsAt), 'LIVE')).toEqual(result);
});

it('ended events expire outstanding reservations but retain historical attendance', () => {
  const held = hold(), confirmed = advanceReservation(held, 'confirm', held.createdAt, 'OPEN');
  expect(advanceReservation(confirmed, 'observe', at(schedule.endsAt), 'ENDED').phase).toBe('EXPIRED');
  const checked = advanceReservation(confirmed, 'check-in', held.createdAt, 'OPEN'); expect(advanceReservation(checked, 'observe', at(schedule.endsAt), 'ENDED')).toEqual(checked);
});

it('requires literal zero overbooking, bounded party and capacity, and accounts for whole parties', () => {
  expect(availableCapacity(policy, [1])).toBe(1); expect(availableCapacity(policy, [2])).toBe(0);
  for (const usage of [[2, 1], [-1], [0], [.5], [NaN]]) expect(() => availableCapacity(policy, usage)).toThrow();
  for (const patch of [{ capacity: 0 }, { capacity: 101 }, { overbooking: 1 }, { maxPartySize: 3 }, { holdSeconds: 0 }, { holdSeconds: 301 }, { waitlist: 'random' }]) expect(EventCapacityPolicySchema.safeParse({ ...policy, ...patch }).success).toBe(false);
  for (const party of [0, -1, 3, .5, Infinity]) expect(() => createReservation(schedule, policy, party, before)).toThrow();
});

it('keeps absolute UTC instants and explicit IANA offsets through spring gaps and repeated fall hours', () => {
  const spring = { ...schedule, timeZone: 'America/New_York', opensAt: '2026-03-08T06:00:00.000Z', startsAt: '2026-03-08T06:30:00.000Z', checkInClosesAt: '2026-03-08T07:15:00.000Z', endsAt: '2026-03-08T07:30:00.000Z' };
  const springLabels = formatEventSchedule(spring); expect(springLabels.startsLabel).toContain('01:30:00'); expect(springLabels.startsLabel).toContain('GMT-05:00'); expect(springLabels.endsLabel).toContain('03:30:00'); expect(springLabels.endsLabel).toContain('GMT-04:00');
  expect(at(spring.endsAt) - at(spring.startsAt)).toBe(3600000);
  const fall = { ...spring, opensAt: '2026-11-01T05:00:00.000Z', startsAt: '2026-11-01T05:30:00.000Z', checkInClosesAt: '2026-11-01T06:15:00.000Z', endsAt: '2026-11-01T06:30:00.000Z' };
  const labels = formatEventSchedule(fall); expect(labels.startsLabel).toContain('01:30:00'); expect(labels.endsLabel).toContain('01:30:00'); expect(labels.startsLabel).toContain('GMT-04:00'); expect(labels.endsLabel).toContain('GMT-05:00'); expect(labels.timeZone).toBe('America/New_York');
  expect(formatEventSchedule(schedule).startsLabel).toContain('17:00:00');
});

it('rejects ambiguous local input, offset-only zones, invalid dates, unsafe state and clock rollback', () => {
  for (const patch of [{ timeZone: 'Invalid/Zone' }, { timeZone: '+07:00' }, { timeZone: 'EST' }, { startsAt: '2026-11-03T10:00:00' }, { startsAt: '2026-02-30T10:00:00.000Z' }, { startsAt: schedule.endsAt }, { checkInClosesAt: schedule.startsAt }, { opensAt: schedule.endsAt }, { role: 'organizer' }]) expect(EventScheduleSchema.safeParse({ ...schedule, ...patch }).success).toBe(false);
  const initial = event(); expect(Object.isFrozen(initial.schedule)).toBe(true);
  expect(() => advanceEvent(initial, 'observe', before - 1)).toThrow(); expect(() => advanceReservation(hold(), 'confirm', before, 'OPEN')).toThrow();
  for (const phase of EventPhaseSchema.options) if (phase !== 'SCHEDULED' && phase !== 'CANCELLED') expect(EventStateSchema.safeParse({ ...initial, phase }).success).toBe(false);
  expect(ReservationStateSchema.safeParse({ ...hold(), holdExpiresAt: at(schedule.endsAt) }).success).toBe(false);
  expect(() => advanceEvent(initial, 'force' as 'observe', before)).toThrow();
});
