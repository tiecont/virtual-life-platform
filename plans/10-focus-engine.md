# M10 — Focus/Pomodoro Engine Shared by Cafe & Library

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M02, M03  
**Domain ownership:** Focus timer domain and history; no duplicate timer implementations.  

## Outcome / user value

Extract a reusable focus lifecycle without breaking Deadline semantics, enabling both coworking and silent library use.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M10-01 | Compare legacy Deadline focus contracts and persistence. | Document existing semantics, idempotency, timezone and planned adapter. |
| M10-02 | Implement trusted start/pause/finish/cancel rules with deterministic server clock. | Timer accurate after browser sleeps and reconnect; repeated finish awards/stats only once. |
| M10-03 | Implement room/world-scoped session association and privacy. | Can start focus from Deadline and Library; session summary respects world/user visibility settings. |
| M10-04 | Provide accessible timer UI package and shareable completion summary. | UI works without animation or sound; share card opt-in with no accidental private task text. |
| M10-05 | Add SQL queries/retention for daily summaries and test DST/timezone edge cases. | Summary tests cover 23:59 boundary Asia/Ho_Chi_Minh and UTC storage; no per-second writes. |

## Contracts & module boundaries

`focus.start`, `focus.finish`, `focus.cancel`, optional `focus.pause`; server stores `startedAt/endsAt` and session outcome.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

FocusSessions, FocusPreferences, FocusDailyAggregates optional; unique completion idempotency; owner user/account.

## Failure and abuse scenarios — must test

Browser sleeps, duplicate callbacks, disconnect mid-session, multi-tab conflicting sessions, reward farming, time skew.

## Safety, privacy & release gate

User’s task note private by default; no public productivity leaderboard without consent.

## Excluded work

No real-money reward for focus, no screenshot/activity surveillance.

## Required deliverables & Definition of Done

Focus engine tests, history query, deadline adapter and reusable library UI.

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
Module: M10
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
