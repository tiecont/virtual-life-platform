# M19 — Moonlight Lounge — Social Stage & Mocktail Bar

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M11, M12, M14, M08  
**Domain ownership:** Stage scheduling, audience capacity, performer moderation and media compliance.  

## Outcome / user value

Tạo không gian sân khấu và sự kiện xã hội an toàn, bắt đầu bằng text/visual performances và mocktails; live media chỉ sau khi được cấp quyền.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M19-01 | Design lounge stage, seating, mocktail counter and event states. | Scene responsive, low-motion and silent mode, stage occupancy limits enforced. |
| M19-02 | Implement performer/host role and stage queue with operator controls. | No ordinary user can hijack stage; timed slot and moderator revocation work. |
| M19-03 | Implement virtual mocktail service via Hospitality Engine. | Bar order/claim/serve works without alcohol transaction and respects role permissions. |
| M19-04 | Integrate ticket-free events/RSVP, crowd reactions and moderation throttles. | Mass audience reaction has bounded load; moderators can mute/disable audience feed immediately. |
| M19-05 | Implement media licensing gate and optional preapproved streaming adapter. | When media rights not documented, no third-party music/video plays; streaming infra not built on Socket.IO messages. |
| M19-06 | Test high fan-out, reports, event cancellation and emergency shutdown. | Benchmark and runbook show recovery; public launch blocked without rights/safety staffing. |

## Contracts & module boundaries

`LoungeWorldAdapter`, `StageSlot`, `PerformerPolicy`, `EventSession`, `MocktailOrder`.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Event data in Events engine; virtual orders in Hospitality; asset/media catalog tracks license/provenance and expiration.

## Failure and abuse scenarios — must test

Unlicensed music, performer harassment, chat spam, large crowd fan-out, live media uplink failure, stage impersonation.

## Safety, privacy & release gate

Choose accessible all-ages mocktail concept first; any adult-themed bar requires distinct age/access review. No real alcohol commerce.

## Excluded work

No automatic livestream user uploads, no karaoke of copyrighted tracks, no alcohol sales.

## Required deliverables & Definition of Done

Lounge scene, controlled stage interaction, event queue, permission and load tests, media clearance checklist.

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
Module: M19
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
