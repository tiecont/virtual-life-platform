# M24 — Central Park — Public Social Commons

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M04, M05, M06, M07, M08, M09, M14  
**Domain ownership:** Park scene and safe public encounters.  

## Outcome / user value

Không gian xã hội nhẹ, trung lập, giúp người mới làm quen và tìm hoạt động trước khi đi các quán; không biến thành chatroom hỗn loạn.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M24-01 | Design original park scene with benches, activity boards and portal destinations. | Mobile/keyboard usable; world discoverable and matches shared avatar/scene standard. |
| M24-02 | Implement public park room allocation and lightweight safe interactions. | Capacity enforced; emotes and quick chat passed through centralized moderation and rate limits. |
| M24-03 | Implement activity discovery board for events in other worlds. | Scheduled events are accurate, private/gated events hidden from ineligible users; no fake online stats. |
| M24-04 | Implement consenting group invite and world travel from the park. | Group transfers respect party choices, blocking, room capacity and failure recovery. |
| M24-05 | Test public-space harassment protections, cold-start UX and safe event flow. | Report/block works across worlds; quick interaction is possible without sharing contact info. |

## Contracts & module boundaries

`ParkWorldAdapter`, `ActivityBoard`, `PartyInvite`, `PortalDestination`; reuse all core platform contracts.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Park owns only scene/config and lightweight world-specific emotes; no separate account database or social graph.

## Failure and abuse scenarios — must test

Empty park, chat flood, public personal-info leakage, forced contact, portal into a gated world, crowded main map.

## Safety, privacy & release gate

No unrestricted DMs/voice. Community rules and reporting as strict as any public world, with staffing appropriate to usage.

## Excluded work

No permanent personal location tracking or proximity-based real-world location inference.

## Required deliverables & Definition of Done

Playable park scene, discovery/invitation flow, moderation integration and cold-start tests.

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
Module: M24
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
