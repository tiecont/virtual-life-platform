# M16 — Existing Maid Cafe Social Integration

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** AUD-01..08, M06, M07, M08, M09, M11, M14  
**Domain ownership:** Maid adapter, order migration and in-world safety  

## Outcome / user value

Đưa Maid Cafe hiện hữu vào Virtual City với gameplay Customer/Maid, order atomicity, moderation và role transitions.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M16-01 | Audit actual Maid repo vs original master plan and baseline tests. | Mark which modules are implemented, mocked, incomplete; capture current order/shift/role/safety behaviors. |
| M16-02 | Bridge Maid identity/session, roles and avatars to platform. | Customer/Maid are gameplay roles not admin privileges; cross-world avatar/outfit switch works. |
| M16-03 | Bridge order lifecycle/shift to shared hospitality engine. | Concurrent order claim still exactly one staff owner; no duplicate reward or abandoned order. |
| M16-04 | Integrate platform chat/report/block/sanction with existing UX. | Moderator console affects active Maid rooms; blocked accounts cannot contact via alternate world. |
| M16-05 | Integrate invitation/travel with role/shift cleanup rules. | Leaving while on shift requeues assigned orders per policy; no ghost Maid and no world stuck. |
| M16-06 | Run E2E, asset/legal audit, rollback & release gate. | One customer and maid complete service loop from City Portal; CI evidences and known limitations logged. |

## Contracts & module boundaries

Legacy Maid API/WS ↔ `MaidWorldAdapter`; hospitality workflows, room-authoritative role/seat, moderation hooks.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Preserve order history and existing rewards; migration or adapter migration maps IDs. Do not mutate order state in two services simultaneously.

## Failure and abuse scenarios — must test

Shift abandoned, role privilege escalation, duplicate claims, forced romantic roleplay, report bypass, guest lost on travel.

## Safety, privacy & release gate

Maid is a player role with refusal right; no private unsolicited contact, sexualized interaction or pay-to-demand attention.

## Excluded work

No live performer/AI Maid unless separately specified and approved.

## Required deliverables & Definition of Done

Playable integrated Maid world, legacy comparison, migration notes, concurrency/moderation E2E, safe rollback.

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
Module: M16
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
