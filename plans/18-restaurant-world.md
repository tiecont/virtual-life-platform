# M18 — Grand Restaurant — Fine-Dining Social World

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M11, M12, M14  
**Domain ownership:** Restaurant-specific booking and hospitality workflows.  

## Outcome / user value

Nhà hàng ảo sang trọng: đặt bàn, dining party, waiter/chef roles, virtual courses and consent-based invitations.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M18-01 | Design restaurant scene, dining zones and role-based UI. | Original upscale 2D art; table inventory mapped to actual room capacity and keyboard controls. |
| M18-02 | Implement virtual table reservation and group check-in. | Double-booking impossible at DB/authority layer; unconfirmed hold expires reliably. |
| M18-03 | Implement waiter/chef shifts using Hospitality Engine. | User can be customer, server, cook; role switching releases pending work and enforces privileges. |
| M18-04 | Implement multi-course menu and coordination minigame. | Full 2-person service loop with served states and idempotent completion. |
| M18-05 | Add dinner invitation, consent, private table policy and report tools. | No forced private dining; block prevents invitation; privacy verified in event discovery. |
| M18-06 | E2E/load and visual/accessibility acceptance. | Two concurrent parties cannot reserve same table; mobile check-in and fallback work. |

## Contracts & module boundaries

`RestaurantWorldAdapter`, `ReservationHold`, `DiningParty`, `CourseOrderWorkflow`, `StaffShift`.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Reservation slots and holds owned by Events engine; orders by Hospitality; Restaurant owns only configurable workflow and decor.

## Failure and abuse scenarios — must test

Overbooked table, one member offline, ghost reservations, waiter leaves, harassment at private table, stale menu.

## Safety, privacy & release gate

Table privacy controls and moderation; all dining items virtual, no collection of physical shipping data.

## Excluded work

No real restaurant booking or real-world food sales.

## Required deliverables & Definition of Done

Restaurant gameplay loop, service and booking integration, full tests and content/asset license manifest.

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
Module: M18
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
