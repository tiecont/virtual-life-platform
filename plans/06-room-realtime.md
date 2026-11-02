# M06 — Room Engine, Seats, Presence & Reconnect

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M03, M05  
**Domain ownership:** Authoritative room state; join/leave; seat/presence event contracts; performance behavior.  

## Outcome / user value

Server-authoritative multiplayer foundation for all worlds: room ownership, seats, membership, presence, versions and recovery.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M06-01 | Implement room lifecycle/allocator with max capacity and admission policy. | Concurrent 100 join attempts never exceed capacity; no orphan room leaks after eviction. |
| M06-02 | Implement atomic seat claim/release, ownership and grace period. | 100 simultaneous claims for one seat produce exactly one owner; disconnect/grace rules tested. |
| M06-03 | Implement Socket.IO auth at handshake AND each command; validation envelope+ACK. | Forged roomId, role, action, stale token and command replay rejected server-side. |
| M06-04 | Implement per-room snapshots/versioned deltas and gap detection. | Client detects missed sequence and resyncs, handles out-of-order/double events without corruption. |
| M06-05 | Implement disconnect/reconnect and multi-tab semantics. | No phantom user, double active seat or stale room after socket loss/restart; user sees recoverable state. |
| M06-06 | Add metric instrumentation, rate limits, bounded queues and load harness. | Benchmark documents CCU/socket count, p95 join latency, CPU/memory; no hardcoded 10K claims. |
| M06-07 | Document multi-instance ownership/fencing alternative (implement only when justified). | Simulated split-brain fails safe; Redis adapter alone not claimed as authority or recovery solution. |

## Contracts & module boundaries

`room.join`, `room.snapshot`, `room.delta`, `seat.claim`, `seat.release`, `presence.changed`; `requestId`, server ACK, `roomVersion`.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Runtime room owner in memory initial; persistent records only if domain needs them; future Redis TTL/presence + ownership fencing; stable room ID design.

## Failure and abuse scenarios — must test

Double-seat, overcapacity, reconnect racing role switch, stale/out-of-order deltas, slow consumers, backend crash, reconnect storm.

## Safety, privacy & release gate

No client authoritative location/order/seat; rate limits, auth on socket events, origin checks, block policy on room interactions.

## Excluded work

No broadcast at 60 fps for static seated avatars; no cross-world shared giant room.

## Required deliverables & Definition of Done

Room domain, realtime gateway, client sync adapter, concurrency tests, reconnect tests and a documented benchmark baseline.

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
Module: M06
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
