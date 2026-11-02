# M04 — Friends, Blocking & Social Graph

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M03  
**Domain ownership:** Friend requests, relationship state, blocking and social visibility.  

## Outcome / user value

Hỗ trợ quan hệ bạn bè opt-in xuyên world; block/mute cần ưu tiên hơn mọi invitations, DM disabled for MVP.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M04-01 | Define state machines for friend request: PENDING/ACCEPTED/DECLINED/EXPIRED/CANCELLED. | Diagram + SQL constraints for unique active request and cross-direction duplicates. |
| M04-02 | Implement friend endpoints and atomic reciprocal acceptance. | Concurrent opposite requests cannot produce duplicate graph edges; idempotent accepts. |
| M04-03 | Implement block/unblock effects and cache invalidation. | Block overrides friend/invitation/current social interaction across all world modules. |
| M04-04 | Implement presence/friends discovery respecting per-world privacy. | Hidden user or dating visit not disclosed via profile search, friend activity, recommendation or real-time events. |
| M04-05 | Add social abuse controls for bulk requests and spam. | Rate limits, report hooks, optional friend request restriction settings and automated tests. |

## Contracts & module boundaries

`POST /v1/friends/requests`, `/respond`, `/blocks`; emits `friendship.changed` with minimal public data and moderation-safe audit.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

FriendRequests, Friendships, Blocks, SocialPreferences; unique indexes and pair normalization; relationship data has lifecycle/deletion rules.

## Failure and abuse scenarios — must test

Mutual race, invite after block, private presence leak, stale social cache, large friend graph requests.

## Safety, privacy & release gate

No follower counts as success metrics for matching; no unsolicited DM; provide unfriending and visibility controls.

## Excluded work

No global public ranking of romantic relationships, no forced publicly visible dating status.

## Required deliverables & Definition of Done

Social domain with tests, DB migrations and privacy matrix covering all worlds.

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
Module: M04
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
