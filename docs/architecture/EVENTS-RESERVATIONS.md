# Events and reservations

M12-01 implements strict time/capacity contracts and pure server lifecycle models. M12-02 adds durable silent schedules, private catalog/RSVP and opt-in calendar API below. Existing registry events capability was audited; there was no pre-existing schedule/RSVP/reservation runtime to replace. Dependencies M04/M05/M06/M08 are locally verified. No event UI or table booking is claimed yet.

```mermaid
stateDiagram-v2
  [*] --> SCHEDULED
  SCHEDULED --> OPEN: opensAt
  OPEN --> LIVE: startsAt
  LIVE --> ENDED: endsAt
  SCHEDULED --> CANCELLED: organizer cancel
  OPEN --> CANCELLED: organizer cancel
  LIVE --> CANCELLED: organizer cancel
```

Observation may skip phases after a pause/restart. At endsAt natural end wins over late cancellation. Terminal states cannot reopen. Schedule inputs are UTC instants with millisecond precision plus explicit IANA timezone/UTC; no offsetless local times. Opens <= starts < check-in-close <= end, at most24hours. Intl displays endpoint offsets independently, including DST changes. No recurrence/local-wall-time inference. Persistence must check PostgreSQL zone availability too.

```mermaid
stateDiagram-v2
  [*] --> HELD
  HELD --> CONFIRMED: before hold expiry
  HELD --> EXPIRED: hold deadline
  CONFIRMED --> CHECKED_IN: current event and admitted participant
  CONFIRMED --> EXPIRED: check-in deadline
  HELD --> CANCELLED: withdrawal or event cancellation
  CONFIRMED --> CANCELLED: withdrawal or event cancellation
  CHECKED_IN --> CANCELLED: event cancellation
```

Hold deadline is min(createdAt + server1..300seconds, startsAt). Confirmation cannot extend it. Check-in requires confirmed state and [opensAt,checkInClosesAt); the model grants no room/seat authority. Exact deadline expiry wins over participant commands. Natural event end expires outstanding reservations and retains historical attendance. Clock rollback rejects transitions; strict persisted-state validation rejects inconsistent deadlines.

Capacity policy has1..100places, bounded whole-party size, zero overbooking and explicit disabled/FIFO waitlist. Held/confirmed/checked-in parties consume places until release; future SQL must lock the same event/resource before expiring/counting/allocating and enforce participant uniqueness. Model arithmetic alone proves no concurrent allocator behavior. Waitlist cannot force attendance. Table overlaps/TTL/check-in are M12-03; actual race/DST integration is M12-06.

M12-04 owns organizer/performer/mod permissions, audience approval and durable cancellation notices. M12-05 owns expanded filtered discovery/invitations. Current identity/registry/safety/block policies guard runtime actions; private/dating event data must not leak in public catalogs. No real addresses, payments, media rights or public event activation. All real flags remain OFF. See ADR0034 and m12-model-checks.json.

## Durable schedules and own RSVP — M12-02

World events capability requires explicit eventPolicy version/maxCapacity <= world capacity. Trusted EventService.schedule authenticates and invokes an internal organizer port (default deny); there is no public schedule route. Only silent audience, UTC schedule and PostgreSQL-supported IANA zone are accepted. OpensAt must be future within30days, at most100 nonterminal schedules/world. No live-audience approval is inferred from permission to create a silent event.

GET `/v1/events?worldSlug=...` returns up to50 listed upcoming projections plus truncation; GET `/v1/events/:id` returns current phase and own RSVP only. Exact IANA zone and independently formatted start/end offsets are supplied. Restricted/private/hidden worlds including dating are closed in this slice. Private events are owner-only; there is no attendee list or raw organizer identity. Current registry generation/policy, shared safety and bilateral organizer blocks guard access.

POST `/v1/events/:id/rsvp|withdraw` uses schemaVersion-only body and Origin/CSRF/key. RSVP reserves one place/account before startsAt. Sorted account locks then event row lock serialize count+allocation+receipt; unique event/account prevents duplicates. At most10 active future RSVPs/account,12 new joins/hour and30 mutation receipts/minute. Exact retries observe canonical state without a second allocation. Withdrawal works outside room/disabled world and returns only own metadata. Block withdraws organizer contact in the same social transaction; failed callback rolls both back. Erasure cascades allocations without a stale capacity counter.

POST `/v1/events/:id/calendar` requires optIn:true, auth/Origin/CSRF/key and current confirmed RSVP. It returns a text/calendar attachment with escaped text,75-octet UTF-8 folding, UTC instants at second precision and IANA/offset labels. UID/creation DTSTAMP are stable; no attendee contacts/secrets/URLs. No automatic send/file/external calendar registration occurs. An RSVP never grants room membership, seat, attendance or rewards.

Migration0019 owns events/RSVPs/mutation receipts and fair recovery sequence. Relevant operations observe server boundaries; three-second maintenance processes20 active events/batch and purges up to100 terminal events older than90days, cascading receipts. Own export is bounded100 per collection and projects elapsed states. DB outages/batching delay observation; no notification SLA. Trusted adapters must respect domain-owned locks and reviewed metadata; all default real-world flags stay OFF. Rollback disables policies/adapters while preserving retained tables. Table slots/holds/check-in/waitlist remain M12-03; operational roles/cancel notifications remain M12-04. See ADR0035 and m12-rsvp-checks.json.
