# M03 — Identity, Session, Profile & Privacy

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M02  
**Domain ownership:** Account session issuance/verification, global profile, consent & data minimization.  

## Outcome / user value

Một login/session sử dụng xuyên city, nickname/avatar chung; guest → registered upgrade an toàn; privacy settings theo world.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M03-01 | Audit old guest/token/cookie/session flows; design migration for existing users. | No forced account takeover, cookie collisions, or token leakage; migration compatibility tests. |
| M03-02 | Implement identity endpoints, signed secure cookies, session rotation/logout and optional guest sessions. | Integration tests cover expired/revoked tokens and CSRF/origin rules; idempotent guest upgrade. |
| M03-03 | Implement public user profile (nickname, avatar selection, visibility) and distinct private prefs. | Schema & APIs use allowlisted fields; no cross-world dating/profile overshare. |
| M03-04 | Implement privacy settings and export/delete requests hooks with auditable policy. | Server filters presence/profile payloads by viewer and world; access tests cover private/blocked cases. |
| M03-05 | Add admission/eligibility policy interface for restricted worlds. | Server denies restricted travel/join/deep links unless access proof exists; underage/unknown age never bypass dating gate. |
| M03-06 | Implement abuse-resistant account/session safeguards. | Rate limits guest creation, multiple tab semantics, session revocation propagation across sockets. |

## Contracts & module boundaries

`GET /v1/me`, `PATCH /v1/me`, `POST /v1/session/guest`, `POST /v1/session/logout`; `IdentityContext` issued by server; `canViewPresence(viewer,target,world)` policy.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Accounts, Sessions, Profiles, PrivacyChoices, ConsentRecords; separate restricted dating schema; no raw identity documents by default.

## Failure and abuse scenarios — must test

Session fixation, duplicate guest upgrade, cross-site sockets, blocked user presence leak, multi-tab ghost user, account deletion with data invariants.

## Safety, privacy & release gate

18+ is not solved by self-attestation alone for real public dating; implement deny-by-default gate and require operator-selected, legally reviewed verification path.

## Excluded work

No collecting precise location, real names, photos or payment data unless separately approved.

## Required deliverables & Definition of Done

Identity module, DB migrations, auth guards, migration strategy from prior apps, privacy contract/integration tests.

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
Module: M03
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
