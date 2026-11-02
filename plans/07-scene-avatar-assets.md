# M07 — Pixi Scene Engine, Avatars & Art Pipeline

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M05, M06  
**Domain ownership:** Client renderer, scene loading, animation, asset manifest, keyboard/mobile UX.  

## Outcome / user value

Xây rendering 2D, asset packs có giấy phép, avatar dùng chung với đồng phục world-scoped và UX thay thế cho canvas.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M07-01 | Define isometric/2D coordinate/tile/map scene spec and collision zones. | Sample city/test cafe renders reproducibly with entity positions and accessible non-canvas controls. |
| M07-02 | Implement Pixi scene loader, camera, sprite lifecycle and event-driven state render. | Join/leave/animation state sync from snapshot/delta; no duplicated avatars after reconnect. |
| M07-03 | Implement avatar core + world outfit variants with a legal asset manifest. | At least one original cohesive avatar sprite with idle/walk/sit/serve and theme variant; no copyright copy. |
| M07-04 | Implement destination click, path validation, movement interpolation. | Invalid destination and click-through wall rejected; server validates interaction points. |
| M07-05 | Implement accessibility/responsive fallback UI. | Seat/room/services reachable via keyboard/list UI, scaling works on mobile, reduced-motion option. |
| M07-06 | Optimize asset bundles/loading/perf. | Performance budgets documented, scene assets cached, placeholders not labeled final art. |

## Contracts & module boundaries

`SceneManifest`, `AvatarAppearance`, `InteractionTarget`, `AnimationState`; engine renders server-approved scene events without direct DB calls.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Asset provenance manifest, dimensions, source/license/attribution; cosmetic ownership server-side and selected appearance validated.

## Failure and abuse scenarios — must test

FPS regression on low-end mobile, sprite memory leaks, incorrect z-index, inaccessible clickable-only controls, unlicensed music/assets.

## Safety, privacy & release gate

No mandatory photos/videos; no tracking device precise location; low motion and silent mode included.

## Excluded work

No full MMO pathfinding/combat or user-uploaded assets at first beta.

## Required deliverables & Definition of Done

Pixi renderer package, asset pipeline, original starter art, responsive and keyboard smoke evidence.

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
Module: M07
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
