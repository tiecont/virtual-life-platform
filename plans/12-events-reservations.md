# M12 — Events, Performances & Reservations

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M04, M05, M06, M08  
**Domain ownership:** Scheduled activity lifecycle, reservation inventory, staff event controls.  

## Outcome / user value

Shared schedules, RSVPs, limited capacity, table reservations, queues and event governance across Library, Restaurant and Lounge.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M12-01 | Define event and reservation state machines with timezone/overbooking policy. | Event scheduled/open/live/ended/cancelled; reservation held/confirmed/expired/checked-in/cancelled. |
| M12-02 | Implement scheduled events/catalog and RSVP with capacity checks. | Concurrent RSVP never oversells; calendar invites are opt-in, exact timezone displayed. |
| M12-03 | Implement reservation holds/expiry/check-in/waitlist policy. | Competing restaurant table bookings produce one confirmed slot, TTL expires and releases capacity. |
| M12-04 | Implement organizer/performer/mod permissions and cancel notifications. | Only authorized organizer can adjust event; cancellation releases reservations and notifies participants. |
| M12-05 | Implement event discovery and invitations with privacy restrictions. | Public events listed; private sessions hidden; dating events never appear to ineligible users. |
| M12-06 | Write concurrency and timezone integration tests. | Two devices race same table, time changed across DST zone, expired booking cannot check in. |

## Contracts & module boundaries

`GET /v1/events`, `POST /v1/events/:id/rsvp`, `POST /v1/reservations`, `reservation.confirmed/expired`, `event.started/cancelled`.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Events, EventRsvps, ReservationHolds, ReservationSlots, Waitlist, OrganizerRoles; DB uniqueness/exclusion/transaction per resource.

## Failure and abuse scenarios — must test

Overbooking, stale holds, room full during check-in, organizer cancellation, spam bookings, wrong timezone, double notification.

## Safety, privacy & release gate

No collection of real-world addresses for virtual table booking; mandatory moderator approval for events involving live audience interaction.

## Excluded work

No integrated ticket sales/fees, licensed broadcasts or external restaurant reservations.

## Required deliverables & Definition of Done

Event/calendar API, table slot allocator, moderation hooks, tests and operational cancel/reschedule runbook.

1. Các task tương ứng đã **implement bằng code chạy được**, không chỉ thêm TODO, mocks hoặc UI tĩnh.
2. Tests/verification liên quan được **thực thi thực tế**; ghi lệnh, exit code, commit SHA, môi trường và artifacts tại `docs/agent/PROGRESS.md`.
3. Integration/cross-world contracts, access policy và edge cases của module này đã được kiểm tra; nếu chưa pass thì ghi BLOCKED, không đánh dấu VERIFIED.
4. Changes có migration/rollback hoặc compatibility note nếu ảnh hưởng API/DB/state hiện có.
5. README/ADR và `docs/agent/HANDOFF.md` cập nhật với **Next exact action**.

## Suggested test matrix (adapt after audit)

- Positive scenario: core journey end-to-end with actual UI/API/socket and persisted effects when required.
- Negative scenario: forged identity/role, invalid payload and expired session are rejected.
- Concurrency/retry scenario: duplicate request or simultaneous operations do not break invariants.
- Network scenario: disconnect/reconnect/slow client behaves predictably with truthful UI.
- Privacy scenario: viewer with insufficient permission cannot read another user’s hidden data.
- Accessibility scenario: primary action reachable by keyboard or documented equivalent.

## Evidence template for final module handoff

```text
Module: M12
Tasks VERIFIED: [IDs] ; BLOCKED: [IDs]
Repository/branch/SHA:
Code paths changed:
Tests actually executed (command → exit code):
Relevant screenshots/logs/traces (real artifact paths):
DB migrations & rollback:
Security/privacy findings:
External approval required:
Next exact task/action:
```
