# M11 — Shared Hospitality: Menu, Orders, Staff, Service

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M02, M06, M08  
**Domain ownership:** Menu/order state machine, staff shifts, inventory-free virtual service and idempotent rewards.  

## Outcome / user value

Tách vòng lặp order/serve từ Maid để dùng tại Restaurant và Lounge mà không ép mọi world cùng luật chơi.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M11-01 | Audit legacy Maid order/shift semantics, extract shared vs maid-only behaviors. | Compatibility map shows no rewrite of current order API without adapter/tests. |
| M11-02 | Implement core order state machine and atomic claim with per-world policy. | 20 staff claiming same order → exactly one assignee; invalid transitions rejected. |
| M11-03 | Implement staff shift, role permissions and reassignment on disconnect. | Staff off shift cannot claim; dropped order requeues after grace period; no item duplication. |
| M11-04 | Implement menu/catalog and service actions extensible per world. | Maid simple coffee, Restaurant multi-course, Lounge mocktails use same core interfaces with policies. |
| M11-05 | Add transaction/idempotency for order complete and progress hooks. | Exactly-once business effect in DB despite at-least-once client retries; event emitted via safe mechanism. |
| M11-06 | Test moderation of staff/customer interactions and service refusal. | Customer cannot coerce service; block or sanction stops interaction and reassigns outstanding orders. |

## Contracts & module boundaries

`order.place/claim/prepare/serve/cancel`, `staff.shift.start/end`, `MenuPolicy`, `OrderWorkflowStrategy` and `OrderCompleted` event.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Menus, MenuItems, Orders, OrderHistory, StaffShifts, OrderIdempotency; no real inventory/payment in MVP.

## Failure and abuse scenarios — must test

Concurrent claims, stale assigned order, customer leaves, role change mid-action, duplicate reward, fake server step via client.

## Safety, privacy & release gate

Virtual service must not require romantic roleplay; no tip-for-attention mechanics; harassment reports integrated.

## Excluded work

No paid orders, cash tips, real alcohol service, delivery or food vendor integrations.

## Required deliverables & Definition of Done

Hospitality engine implementation, adapters for Maid, configurable world workflows, transaction/concurrency tests.

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
Module: M11
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
