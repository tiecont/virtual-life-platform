# M22 — Quality, Security, Load & Accessibility

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M06, M08, M21  
**Domain ownership:** Test harness, threat-model validation, benchmarks, accessible journeys.  

## Outcome / user value

Thực hiện test pyramid, shared test helpers và cross-world acceptance matrix thật; không coi file test tồn tại là tests pass.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M22-01 | Build isolated unit/contract/integration/E2E test harness with CI wiring. | No shared production DB; test env deterministic, seed cleanup safe. |
| M22-02 | Implement concurrency suite for seats, order claims, room cap, booking and match proposals. | Actual parallel processes/requests assert single winner and no invariant violations. |
| M22-03 | Implement security regression tests for CSRF/socket auth/IDOR/rate limit/privacy/ban/age gating. | Unauthorized direct HTTP and Socket.IO calls fail closed, including deep links and reconnect. |
| M22-04 | Implement browser flows: Portal → Deadline → Maid, Library, Restaurant, return, mobile. | Playwright screenshots/trace for real pages and CI evidence; no fake static image proofs. |
| M22-05 | Implement load profiles for 100/1000 CCU hypotheses (ramp/stress/soak). | Report p50/p95, error, CPU/RAM/egress; real capacity target chosen after measurement. |
| M22-06 | Perform accessibility audits: focus order, keyboard navigation, reduced-motion, color contrast. | Core world interactions accessible without canvas-only action; issues prioritized and tracked. |

## Contracts & module boundaries

Contract snapshots by version; shared `WorldTestHarness`, `RoomRaceHarness`, `PolicyFuzzer` optional.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

No new production data; ephemeral seeded integration fixtures with cleanup, anonymized load datasets.

## Failure and abuse scenarios — must test

Flaky tests, mocks hiding race conditions, 100 CCU ≠ 10k CCU, fail-open safety, untested accessibility, API drift.

## Safety, privacy & release gate

Moderation privacy tests mandatory; simulated underage users cannot access dating endpoints; test data cannot contain real user sensitive records.

## Excluded work

No unconditional pass or blanket skip, no destructive load test against production.

## Required deliverables & Definition of Done

Real test artifacts, security checklist, benchmark report with hardware details and reproducible commands.

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
Module: M22
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
