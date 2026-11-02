# M13 — Cross-World Progression & Cosmetic Economy

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M03, M08  
**Domain ownership:** Non-tradable cosmetic ownership, progression rewards and anti-farm controls.  

## Outcome / user value

Tối thiểu hóa hệ thống EXP/cosmetics chung, có ranh giới world-specific achievements và idempotent ledger.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M13-01 | Define XP and cosmetics policies for each world with cap and abuse prevention. | No paid attention, relationship score or forced social engagement rewards; clear limits per day/event. |
| M13-02 | Implement entitlement service and ledger/unique source id. | Replay reward event never double awards; owner sees immutable history and current balance. |
| M13-03 | Implement world outfit restrictions and appearance validation. | Maid uniform available only in role/shift if policy requires, avatar fallback works in all scenes. |
| M13-04 | Implement cosmetics UI and non-trading unlocks with accessibility. | Preview and equip with server validation; no marketplace or paid currency. |
| M13-05 | Implement abuse tests and rollback for incorrect rewards. | Farm attempts, duplicated events and revoked entitlements do not corrupt balances. |

## Contracts & module boundaries

`RewardEvent {sourceType,sourceId,userId,amount}`, `inventory.unlock`, `cosmetic.equip`; idempotency via unique source keys.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

ProgressionLedger, UserEntitlements, CosmeticsCatalog; no monetary value and no cash-out.

## Failure and abuse scenarios — must test

Duplicate award, job farming collusion, account reset, multi-world unlock mismatch, cosmetics not loaded.

## Safety, privacy & release gate

No pay-for-affection, no social pressure via leaderboard and no wealth profiling.

## Excluded work

No trading, real-money purchases, loot boxes or gambling-like random paid rewards.

## Required deliverables & Definition of Done

Optional shared progression engine, tests, appearance contracts and UX; skip cleanly if W2 gameplay works without it.

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
Module: M13
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
