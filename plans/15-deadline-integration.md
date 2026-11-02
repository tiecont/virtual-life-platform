# M15 — Existing Deadline Cafe Integration

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** AUD-01..08, M06, M07, M09, M10, M14  
**Domain ownership:** Deadline adapter, compatibility migration, UI shell integration and verified existing features.  

## Outcome / user value

Đưa Deadline Cafe hiện hữu vào Virtual City, giữ gameplay Pomodoro và trải nghiệm ổn định, không scaffold lại từ đầu.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M15-01 | Audit actual Deadline source and compare to reference plan. | Map existing repos/branch/commits, API, WS, guest, DB, assets, tests; unverified features listed explicitly. |
| M15-02 | Implement platform identity/session adapter preserving existing guest upgrades. | User can enter from portal; existing users not silently orphaned or logged into wrong account. |
| M15-03 | Bridge room/seat and focus events to shared contracts. | Existing seat concurrency and Pomodoro cases remain green; adapter contract tests pass. |
| M15-04 | Embed Deadline scene in shared game shell and avatar/portal actions. | Portal → Deadline → Portal with identity/avatar retained, no accidental duplicated room session. |
| M15-05 | Integrate invitations, privacy and moderation hooks. | Cross-world invite works; block prevents harassment; focus task notes remain private. |
| M15-06 | Performance, accessibility, migration and rollback. | Browser/E2E tests pass; feature flag rollback restores prior experience if present. |

## Contracts & module boundaries

Legacy Deadline API/WS → `DeadlineWorldAdapter`; engine ports `FocusEngine`, `RoomAuthority`, `AvatarAppearance`.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Legacy focus users/sessions migrated non-destructively or left behind adapter until approved; unique IDs and mapping verified.

## Failure and abuse scenarios — must test

Migration loses guest progress, duplicate seats, timer resets, mismatched socket formats, inaccessible canvas, wrong avatar state.

## Safety, privacy & release gate

Existing plan is specification only; actual code quality must be verified. Do not expose task descriptions via public presence.

## Excluded work

No deleting legacy project or forcing schema rewrite without owner signoff.

## Required deliverables & Definition of Done

Playable integrated Deadline world, migration/rollback notes, test baselines and cross-world E2E evidence.

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
Module: M15
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
