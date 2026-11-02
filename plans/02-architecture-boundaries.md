# M02 — Domain Architecture & ADRs

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M00, M01  
**Domain ownership:** Architecture, domain ownership, migration designs.  

## Outcome / user value

Chốt ranh giới Platform Core, Engines, Worlds và compatibility adapters theo thực tế code, ưu tiên modular monolith.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M02-01 | Document context/container/module architecture and domain ownership (C4 lightweight). | Dependency direction documented; module graph no forbidden cycles; monolith modules not called microservices. |
| M02-02 | Specify DB ownership, module service APIs and transactional boundaries. | No cross-world direct table writes; shared tables owned by platform; event schema/version rules defined. |
| M02-03 | Specify adapter-first integration for two existing projects. | Compatibility matrix references concrete existing files/routes/events and roll-forward/rollback. |
| M02-04 | Create architecture decision records for room authority, transport and persistence. | ADR shows alternatives: in-memory single owner, DB constraints, Redis later; clear tradeoffs and scale triggers. |
| M02-05 | Specify multi-instance design for future use without implementing prematurely. | Ownership leases/fencing, affinity/routing, reconnect/resync and split-brain testing plan documented. |

## Contracts & module boundaries

Core interfaces `IdentityPort`, `RoomAuthority`, `WorldAdapter`, `SocialPolicy`, `EventPublisher`; versioned events.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Postgres schemas per domain where applicable; migrations forward-only in shared environments, idempotent event handlers/outbox for critical cross-service changes.

## Failure and abuse scenarios — must test

Duplicate identity, split-brain rooms, hidden coupling via DB, schema drift, conflicting ORM migrations.

## Safety, privacy & release gate

Threat model/data flows include dating isolation, moderation and access policy across portal travel.

## Excluded work

No Kafka, CQRS infrastructure, microservice explosion or hypothetical 100K CCU architecture.

## Required deliverables & Definition of Done

Architecture diagrams, ADRs, context map, integration matrix, migration order and hard invariants.

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
Module: M02
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
