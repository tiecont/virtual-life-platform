# M01 — Repository & Developer Foundation

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M00  
**Domain ownership:** Workspace, package boundaries, scripts, test baseline, tooling.  

## Outcome / user value

Tạo công cụ monorepo và workflow ổn định, nhưng trước tiên phải xác định khả năng giữ nguyên hai codebase đang tồn tại.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M01-01 | Inspect repositories and choose integration topology (single monorepo, git submodules, adapter façade) via ADR. | ADR ghi risk của migration, package scripts & version, bảo toàn lịch sử; không ghi đè scaffold. |
| M01-02 | Initialize pnpm workspaces, runtime versions, CI quality scripts only where missing. | Fresh clone cài được theo lockfile; `lint`, `typecheck`, `test`, `build` root scripts có implementation thật. |
| M01-03 | Create `packages/contracts`, `world-sdk`, shared config and convention for domain imports. | Dependency boundaries enforced bằng ESLint/project references hoặc tương đương; sample compile. |
| M01-04 | Create local development stack and reproducible env examples. | Docker Compose boot Postgres; health checks and migrations work on clean local database; no secrets committed. |
| M01-05 | Add CI on PR + required checks, caches and artifact outputs. | Test PR demonstrates failure blocks merge; no test bypass with `|| true`. |
| M01-06 | Document onboarding for other agents and human developers. | README includes exact commands, supported OS/runtime, integration setup, non-destructive reset and debugging. |

## Contracts & module boundaries

Build commands and workspace API; versioned contracts consumed by apps/world modules, not cyclic imports.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

DB migrations live in appropriate backend package; CI uses isolated ephemeral Postgres rather than developer VPS database.

## Failure and abuse scenarios — must test

Existing repos use incompatible TS/ORM versions; dependencies drift; CI expects credentials; shadow duplicate package configs.

## Safety, privacy & release gate

`.env.example` only dummy secrets; secret scan; build pipeline must not accidentally deploy production.

## Excluded work

No reformatting the entire legacy repos as side effect of foundation setup.

## Required deliverables & Definition of Done

Working workspace source; lockfile; CI config; compose; first green baseline evidence or accurately recorded blockers.

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
Module: M01
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
