# M21 — Infrastructure, CI/CD & Observability

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M01, M02  
**Domain ownership:** Build/deploy/monitor/backup paths and cost discipline.  

## Outcome / user value

Cung cấp hạ tầng low-cost, reproducible, secure production staging cho platform; scale chỉ khi có benchmark.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M21-01 | Create env matrix dev/test/staging/prod and Docker Compose + Caddy config. | No committed secrets; HTTPS & forwarded header/cookie behavior tested in staging. |
| M21-02 | Create GitHub Actions lint/typecheck/unit/integration/e2e gates and artifact archival. | CI detects broken PR and does not require production secret for fork/PR; DB via isolated service. |
| M21-03 | Implement structured logs, traces and basic metrics. | Expose req ID, room ID (pseudonymous), p95 latency, online count, orders, error rates; no sensitive chat/dating fields. |
| M21-04 | Implement health/readiness checks, deploy rollback, graceful socket shutdown. | App recovers from deployment; clients resync; no false success when state was lost. |
| M21-05 | Configure backup/restore for Postgres and monitor disk space/connection count. | Prove restore in non-prod; RPO/RTO documented as targets with evidence. |
| M21-06 | Document cost budgets and thresholds to split services or add Redis. | VPS/resource plan with measurable CPU/RAM/network thresholds and monthly ceiling. |

## Contracts & module boundaries

Infra supports HTTP, Socket.IO transport, health endpoints, metrics and event tracing; do not embed business authority in proxy.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

PostgreSQL persistent backups; Redis ephemeral state not sole record for paid/critical effects; migration process controlled.

## Failure and abuse scenarios — must test

Expired TLS, websocket proxy misconfig, failed DB restore, log PII leakage, OOM reconnect surge, CI secrets exposure.

## Safety, privacy & release gate

Production deploy requires owner approval; no automatic spending or purchase; correct asset/music licensing gate remains separate.

## Excluded work

No premature Kubernetes/multi-region, 24/7 on-call promise, untested 10k CCU claims.

## Required deliverables & Definition of Done

Infra manifests, CI, backup/restore report, staging smoke evidence, monitoring dashboard configs and operations runbook.

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
Module: M21
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
