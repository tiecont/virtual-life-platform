# M20 — Heart Garden / Blind Date — Adult-Only World

> **Agent execution module** · Status: SPECIFICATION ONLY / chưa triển khai.  
> Tham chiếu trước: `../MASTER-AGENT-PLAN.md`, `../AGENTS.md`, `../docs/agent/HANDOFF.md`.  
> Nếu module đụng code đã tồn tại, **audit code trước; không tự scaffold đè**.

**Dependencies:** M03, M04, M06, M08, M09, M12, M14  
**Domain ownership:** Restricted matchmaking, consent, private dating data, human safety operations.  

## Outcome / user value

Một world riêng 18+ cho kết nối đồng thuận; ưu tiên an toàn, minh bạch và khả năng rời cuộc hẹn ngay lập tức. **Feature flag OFF by default.**

## Implementation backlog — ordered tasks

| Task ID | Implementation instruction | Acceptance / verification |
|---|---|---|
| M20-01 | Define product and legal/trust-safety gate for adult dating before code release. | Adult eligibility/access verification plan, moderator coverage, content/retention/appeal policy, operator signoff recorded. |
| M20-02 | Implement separate dating profile with mutual preferences and no global visibility. | Dating data never returned through general profile, analytics, presence or global notifications. |
| M20-03 | Implement queue/match proposal and atomic two-party acceptance. | One user never in two matches; accept/decline/expire/retry races resolved atomically. |
| M20-04 | Implement timed private date room, safe quick chat, consent and leave action. | Exit takes effect immediately; report/block is one-click; no requirement to share personal details. |
| M20-05 | Implement mutual-like continuation only after both explicit consent. | No unilateral contact, no public match scoreboard, revoke/block prevents access. |
| M20-06 | Run adversarial tests of deep links, age-gate bypass, stalking and privacy leaks. | Eligibility enforced server-side on HTTP/socket/travel; restricted world stays hidden after logout/denial. |
| M20-07 | Execute operator/real-world safety readiness review and controlled pilot gate. | If required verification/legal/moderation resources absent, maintain OFF and report BLOCKED_EXTERNAL even if tests pass. |

## Contracts & module boundaries

`DatingProfile`, `MatchProposal`, `MutualConsent`, `DateRoom` only through restricted policies; presence opt-in incognito.

**Dependency rule:** dùng interface/contract versioned; module world không truy cập trực tiếp bảng domain khác. Thay đổi API/event đã dùng bởi ứng dụng cũ phải có compatibility tests và ADR.

## State, persistence & lifecycle

Separate dating schema: Eligibility, DatingPreferences, MatchProposals, DateSessions, Consents, Reports, minimal retention; strict access roles.

## Failure and abuse scenarios — must test

Underage user bypass, profile outing, gender/age mismatches, duplicate match, forced chat, harassment, stalking, ban evasion.

## Safety, privacy & release gate

Never expose 18+ dating to minors. Self-reported age cannot be asserted as strong verification. Human/legal/operations review required pre-publication.

## Excluded work

No voice/video, intimate images, pay-for-romance, location tracking or automatic dating disclosure.

## Required deliverables & Definition of Done

Gated dating prototype, restricted services, abuse/security test evidence, independent privacy assessment and explicit launch approval state.

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
Module: M20
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
