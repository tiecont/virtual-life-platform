# M14 — City Portal, World Map & Discovery

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M05, M07, M09  
**Domain ownership:** Portal UI and discovery queries, not authoritative game data.  

## Outcome / user value

Tạo city home dùng chung, biết world nào có hoạt động, tìm người/nhóm theo quyền riêng tư, chuyển world liền mạch.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M14-01 | Create original pixel-art city map with clickable world hotspots and accessible text list. | Desktop/mobile plus keyboard alternatives; every hotspot has correct world slug/access state. |
| M14-02 | Build world detail cards with safe occupancy and schedules. | Do not fake live counts; show unknown/offline accurately; no protected world disclosed without authorization. |
| M14-03 | Integrate shared header, avatar, current world, friend/invite center. | One identity persists across portal and rooms; blocked users not shown as contact suggestions. |
| M14-04 | Build route/portal UX (loading, full room, forbidden, cancelled, reconnect). | Travel confirmation and fallback; no blank loading spinner on error. |
| M14-05 | Add initial activation strategy to concentrate activity. | Discovery ranks scheduled/occupied rooms; no creation of many empty rooms to inflate world size. |

## Contracts & module boundaries

Consumes `WorldRegistry`, `RoomDirectory`, `EventCatalog`, `InvitationService`; direct Pixi scene events not DB writes.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Portal does not own account/order data; occupancy from room service with freshness indicator/caching policy.

## Failure and abuse scenarios — must test

Broken world deep link, stale occupancy, blank map on mobile, profile leakage via status, concurrent portal navigation.

## Safety, privacy & release gate

Restricted dating card visibility private or generic opt-in; accessibility fallback mandatory for all world entry.

## Excluded work

No full seamless world streaming, global always-on location tracker or full MMO world physics.

## Required deliverables & Definition of Done

City map, world list, shared shell, navigation UI, screenshots, Playwright journey tests.

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
Module: M14
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
