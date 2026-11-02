# M09 — Cross-World Invitations, Portal Travel & Party

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M04, M05, M06, M08  
**Domain ownership:** Travel intent, invitations, party coordination, atomic admission and failure recovery.  

## Outcome / user value

Bảo đảm người dùng đi giữa các world/room qua lời mời an toàn, không duplicate membership hay lộ sự hiện diện riêng tư.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M09-01 | Define travel intent state machine: CREATED/READY/COMMITTED/EXPIRED/FAILED/CANCELLED. | Event diagram covers source/target transitions and timeout; no phantom multi-world presence. |
| M09-02 | Implement scoped one-time, short-lived travel intents + validation. | Retry/idempotency works; blocked/private/age-gated target always rejects unauthorized user. |
| M09-03 | Implement recipient invitation flows and notifications with consent. | Invite can accept/decline/expire; notifications respect block, privacy and rate limits. |
| M09-04 | Implement handshake across source and destination room owners. | Target admission succeeds before final source release; timeout returns user safely to original or lobby. |
| M09-05 | Integrate party/group invite capacity logic and offline handling. | Group cannot overfill room; partial acceptance explicit; invite never reserves capacity indefinitely. |
| M09-06 | Test cross-world transition with artificial network failure. | Automated E2E shows Deadline → Maid → Portal and concurrent reconnect; no identity mismatch. |

## Contracts & module boundaries

`POST /v1/travel-intents`, `POST /v1/invitations`, `travel.request/accepted/failed`, `invitation.received/responded`; invite tokens scoped and expire.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Invitations, TravelIntents, PartyMembership optionally; idempotency keys and short TTL; never store secrets in query string logs.

## Failure and abuse scenarios — must test

Double-join, full target, banned target access, source disconnect, stale invite, retry after timeout, privacy leak in invite metadata.

## Safety, privacy & release gate

Dating world cannot be reached via direct invite/portal without 18+ eligibility and explicit consent. Never reveal restricted world location in generic notification.

## Excluded work

No blind teleport or forced friend location tracking.

## Required deliverables & Definition of Done

Travel domain, route UI/confirmation, safe fallback, integration E2E, audit records and rollback docs.

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
Module: M09
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
