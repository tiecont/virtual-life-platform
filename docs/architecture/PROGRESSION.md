# Optional private progression

## Source-unique ledger — M13-02

GET `/v1/me/progression` reads own XP/entitlements/history only. POST `/v1/me/progression/claim-focus` accepts schemaVersion/focusId with session/Origin/CSRF; the focus owner verifies an own completed timer and supplies canonical source data inside its transaction. No public endpoint accepts amount,account,partner,world or completion claims. Unique account/kind/source gives idempotency for every repeated claim. Relevant source transition,grant and entitlement changes commit or roll back together.

A reviewed `progression-completion-v1` hospitality sink uses the existing transactional outbox for customer/staff grants. Default policy remains disabled and no sink is registered. Trusted composition may enable it; source observation,account locks,ledger-derived caps and current shared safety then govern grants. Cosmetic unlock is private and does not equip or grant staff authority. M13-03/04/05 still own restrictions,UI and compensating revocation.

Migration0023 owns immutable positive ledger rows,unique entitlements and short-lived FK-linked partner receipts. Ledger updates/truncate reject; account erasure cascades. Counterparty erasure removes pair links without removing the survivor's XP. At most100 partner receipts older than2days are purged per maintenance call. Minimal own grant history/XP persists for account lifetime to preserve replay protection; own history/export bounds100 with truncation and excludes source/peer/session/location identifiers. No public ranking,paid/tradable currency or network exactly-once guarantee. See ADR0040 and m13-ledger-checks.json for verification and remaining limits.

M13-01 defines policy/contracts; M13-02 adds the private ledger/owner-port routes described above. DEFAULT_PROGRESSION_POLICY remains disabled and registers no reward consumer. Existing original cosmetics are casual and cafe-apron. This policy neither replaces focus/hospitality outcomes nor grants staff/admission authority.

| World | Allowed trusted source | XP/completion | XP/world/UTC day |
|---|---|---|---|
| Deadline | focus-completed |2|10|
| Library | focus-completed |2|10|
| Maid | hospitality-completed |2|10|
| Restaurant | hospitality-completed |2|10|
| Lounge | hospitality-completed |2|10|
| Park |none|0|0|
| Dating |none|0|0|

Shared account cap20XP per original completion UTC day; hospitality same-partner cap2completions/day; cooldown60seconds; accepted observation lateness<=24hours. Current safety/eligibility and valid engine-owned source are required. No partial mint at a cap. Messages, presence/online time, invitations/friendship/romantic matches, money/tips or moderation cannot mint XP. Every supplied schema is strict; clients cannot choose amount or authority.

Casual is the free fallback. Cafe-apron uses existing original art with initial10lifetimeXP unlock threshold, no spending/trading; equip must later validate current world/role/shift separately. XP/history stay private, with no public wealth/relationship ranking, cash-out, randomized paid rewards or forced social engagement. Refusal/report/block/consent withdrawal must never punish a participant's earned balance.

M13-02 implements the immutable source-unique SQL ledger, account-serialized budget queries,current-safety checks,own history/export/erasure and reviewed completion ports. M13-03 owns appearance restrictions/fallback,04 accessible equip UI,05 compensating revocation/abuse tests. UTC source day and stable consumer/source identities survive accepted retry/restart. Policy tests alone do not prove durable grants or anti-collusion enforcement; runtime evidence is recorded separately. All real rollout flags remain OFF. See ADR0039/0040 and their evidence files.
