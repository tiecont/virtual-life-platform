# M08 — Trust, Safety & Moderation Platform

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M03, M04, M06  
**Domain ownership:** Cross-world moderation policy, reports, privileged workflows, incident controls.  

## Outcome / user value

Một hệ thống Safety thống nhất: chat guard, report, block, sanctions, mod dashboard và event audit xuyên world.

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M08-01 | Define content, harassment and privacy threat model by world, plus escalation protocol. | Policy supports case categories, severity, sanctions, appeals, retention; dating/lounges higher gate. |
| M08-02 | Implement server-side chat/emote/moderation pipeline. | Validation/rate limiting/moderation before broadcast; explicit fallback if classifier unavailable. |
| M08-03 | Implement reporting with minimal evidence, immutable audit log and access RBAC. | Users report/block; moderator can review within role; target never sees reporter identity. |
| M08-04 | Implement sanction lifecycle, cross-world enforcement and appeal intake. | Mute/ban instantly prevents socket bypass or travel bypass; expired sanctions release safely. |
| M08-05 | Build moderator UI, kill switches and operational runbook. | Human mod can search assigned cases, sanction and document reason; admin can disable chat/world in emergency. |
| M08-06 | Test false positive handling, rate limits, privacy access and response latencies. | Regression suite for Vietnamese slang/unaccented variants, message flood, block effects and moderator permission boundaries. |

## Contracts & module boundaries

`ChatPolicy.canSend`, `ModerationDecision`, `POST /v1/reports`, admin `cases/*`, `sanction.changed`; event delivery cannot bypass guard.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

ChatMessages short retention if retained, Reports, ReportEvidence, Sanctions, Appeals, AuditEvents, WorldContentRules; encrypt sensitive evidence.

## Failure and abuse scenarios — must test

Reporter leakage, auto-sanction false positives, moderation outage, spam via quick chat, cross-world bypass, privileged abuse.

## Safety, privacy & release gate

Human moderation/on-call needed for riskier worlds. Fail closed or restrict to safe canned interactions when necessary; never make unreviewed dating chat public.

## Excluded work

No auto-ban solely on unreviewed AI classification for ambiguous content; no unmoderated DMs.

## Required deliverables & Definition of Done

Policies, functional report/block/mod screens, moderator auth, test fixtures, incident playbook and retention settings.

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
Module: M08
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
