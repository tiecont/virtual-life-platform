# M23 — Release Trains, Rollback & Community Operations

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M15, M16, M21, M22  
**Domain ownership:** Release controls, incident operations, staged rollout, manual approvals.  

## Outcome / user value

Phát hành từng wave khi đủ acceptance, quyền owner, safety/on-call và khả năng khôi phục. Báo cáo trung thực trạng thái.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M23-01 | Define wave-based release checklist and feature flag inventory with owners. | W2 Deadline/Maid can ship separately from later worlds; dating flag OFF until operator gate. |
| M23-02 | Create migration release runbook with preflight backup, canary and rollback. | Drill on staging demonstrates rollback of app and compatible DB; irreversible changes documented. |
| M23-03 | Create incident and safety runbooks (abuse, data leak, room crash, performance). | Contact/on-duty owner assigned for public social launch, emergency world/chat kill switch tested. |
| M23-04 | Run end-to-end staging smoke and release rehearsal. | Verified transitions, report/block, guest signout, backup restore, access controls; evidence attached. |
| M23-05 | Request explicit owner approvals and record release decision. | When missing domain/credentials/legal/media approval, mark BLOCKED_EXTERNAL and do not declare public release. |
| M23-06 | Prepare launch/post-release metrics monitoring and truthful handoff report. | Logs of errors, occupancy, retention, safety, costs; final report enumerates VERIFIED vs NOT DONE worlds. |

## Contracts & module boundaries

`WorldReleaseFlag`, `KillSwitch`, `DeploymentVersion`, operational incident identifiers; human approval is not an automated event.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Deploy logs, audit of approvals, backup artifacts; do not write operator credentials into repo.

## Failure and abuse scenarios — must test

Premature public dating, expired license, inaccessible backend, corrupted migration, no moderator staffing, user content abuse.

## Safety, privacy & release gate

Safety and privacy incidents prioritize immediate containment; dating/Lounge separate release decision, no inherited W2 permission.

## Excluded work

No claim that plans alone deploy or operate platform; no auto-release without explicit approval.

## Required deliverables & Definition of Done

Release runbooks, signoff log, staging smoke results, restore drills and exact production status report.

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
Module: M23
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
