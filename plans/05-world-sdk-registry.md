# M05 — World SDK, Registry & Lifecycle

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M02, M03  
**Domain ownership:** World manifests, lifecycle hooks, registration and feature flags.  

## Outcome / user value

Tạo API phát triển một world mới mà không sửa lõi identity/presence mỗi lần; đăng ký world metadata, capabilities, access policy và versions.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M05-01 | Define versioned `WorldDefinition` and required capabilities. | Schema rejects unknown capability/invalid slug, private world missing policy, incompatible API versions. |
| M05-02 | Implement `WorldRegistry` and feature-flagged activation per environment. | Can enable/disable world without redeploying all others; unknown/offline world returns documented error. |
| M05-03 | Define world lifecycle hooks (bootstrap, onJoin, onLeave, onCommand) with permission guard. | Contract tests run sample world module and reject direct unauthorized calls. |
| M05-04 | Implement server/client shared world map metadata contract. | World card has title, access hint, availability and discoverability; no player data in registry public response. |
| M05-05 | Define SDK compatibility strategy for two existing applications. | Adapters bridge legacy room IDs/events; no big-bang transport rewrite. |

## Contracts & module boundaries

`WorldDefinition {slug,version,sceneRef,capacity,capabilities,accessPolicy,visibility}` and `WorldAdapter` handlers; `GET /v1/worlds`.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

WorldDefinitions/WorldReleaseFlags, optional runtime config; no source of truth for presence in registry.

## Failure and abuse scenarios — must test

World disabled while sessions active, mismatched client assets, invalid permission, portal stale cards, duplicate slug.

## Safety, privacy & release gate

Access controls enforced server-side, not just card visibility; hidden world not discoverable via API for unauthorized viewer.

## Excluded work

No dynamic remote execution of untrusted user code or upload-any-world features.

## Required deliverables & Definition of Done

`packages/world-sdk`, registry module, sample sandbox world, validators, docs and version contract tests.

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
Module: M05
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
