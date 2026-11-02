# M17 — Eternal Library — Quiet Study World

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M10, M12, M14  
**Domain ownership:** Library map/gameplay and moderation of quiet group spaces.  

## Outcome / user value

World học tập tập trung, sử dụng lại Focus Engine; khác Deadline Cafe ở quiet policies, reading corners, study events.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M17-01 | Design silent library theme, seating map, room categories and access UI. | Original art scene loads responsive and keyboard alternative shows available desks. |
| M17-02 | Reuse platform room/seats and Focus Engine without copying code. | Focus session created in Library has correct scope and progress; concurrent seat tests pass. |
| M17-03 | Implement quiet mode/limited quick-chat and group study event. | No unsolicited emotes or spam during silent session; event RSVP respects room capacity. |
| M17-04 | Implement opt-in group session progress and invitations. | Friends can join same study room by consent; private task descriptions remain hidden. |
| M17-05 | Test portal travel, reconnect, quiet moderation and mobile. | Complete timed session in Library, return to Deadline, see consistent personal history. |

## Contracts & module boundaries

`LibraryWorldAdapter`, `StudyRoomPolicy`, shared `FocusSession`; event RSVP and room seat claims.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

No standalone user account/focus table; world-specific reading goals optional, scoped to account with privacy.

## Failure and abuse scenarios — must test

Noise in quiet room, duplicate timers, deserted study group, access on mobile, copyrighted books.

## Safety, privacy & release gate

No redistributing copyrighted text. Provide public-domain/licensed texts or user-owned notes only with explicit usage permissions.

## Excluded work

No e-book piracy, DRM circumvention, video classroom or forced microphone features.

## Required deliverables & Definition of Done

Library scene and events, shared focus integration, room policy, responsive UI and end-to-end tests.

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
Module: M17
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
