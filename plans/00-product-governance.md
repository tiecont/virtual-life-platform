# M00 — Product Vision, UX & Governance

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** AUD-01..08  
**Domain ownership:** Product specifications, experience policy, scope control.  

## Outcome / user value

Chốt PRD thành phố, personas, phân đoạn public vs adult, tiêu chí retention và phạm vi từng wave mà không biến dự án thành metaverse quá khổ.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M00-01 | Tạo PRD: north-star, personas (student, developer, casual visitor, host, staff, mod, adult dater), user journeys. | PRD có entry/exit, hành vi và success/failure cho từng persona; review consistency với hai plan cũ. |
| M00-02 | Lập world matrix cho Deadline/Maid/Library/Restaurant/Lounge/Dating/Park. | Mỗi world có feature scope, roles, age/access, social/privacy, gameplay loop, dependencies và release flag. |
| M00-03 | Định nghĩa UX design tokens, tone, a11y/mobile; first-time onboarding không cần hứa account liên thông nếu chưa tích hợp. | Wireflows cho onboarding, city map, enter/leave, group invitation, report/block; state empty/loading/error. |
| M00-04 | Định nghĩa product analytics và privacy-friendly events. | Event taxonomy có consent/retention/aggregation và không ghi raw nội dung chat/dating preferences. |
| M00-05 | Lập product risk register, phase-bound scope và release operator signoff. | Có danh sách hard exclusions, gated world checklist, rollback/kill switch và các quyết định cần chủ repo. |

## Contracts & module boundaries

PRD là nguồn cho `WorldDefinition`, `AccessPolicy`, `InvitationPolicy`, `AnalyticsEvent`; không chốt schema bằng UI mockup.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Không trực tiếp sở hữu DB; định nghĩa dữ liệu nào public/private/ephemeral và thời gian retention mục tiêu để domain implement.

## Failure and abuse scenarios — must test

User có ít người online; tách quá nhiều phòng làm loãng; onboarding dài gây drop; nội dung / media không có quyền.

## Safety, privacy & release gate

Dating 18+ không đặt mặc định public; cá nhân có thể ẩn sự hiện diện; không ép tương tác roleplay; quyền người chơi không phụ thuộc giới.

## Excluded work

Không triển khai thanh toán, VR, voice, user-generated scenes hoặc AI companion ở wave đầu.

## Required deliverables & Definition of Done

`docs/product/PRD.md`, `docs/product/WORLD-MATRIX.md`, `docs/product/JOURNEYS.md`, `docs/product/CONTENT-POLICY.md`, accepted ADR for explicit trade-offs.

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
Module: M00
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
