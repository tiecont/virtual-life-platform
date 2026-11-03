# Optional private progression

M13-01 implements policy/contracts only. DEFAULT_PROGRESSION_POLICY is disabled; no app consumer, ledger, inventory or award route is registered yet. Existing original cosmetics are casual and cafe-apron. This policy neither replaces focus/hospitality outcomes nor grants staff/admission authority.

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

M13-02 must implement immutable source-unique SQL ledger, account-serialized budget queries, current-safety checks, own history/export/erasure and reviewed engine consumers. M13-03 owns appearance restrictions/fallback,04 accessible equip UI,05 compensating revocation/abuse tests. UTC source day and stable consumer/source identities must survive delayed delivery/retry/restart. Policy tests alone do not prove durable grants or anti-collusion enforcement. All real rollout flags remain OFF. See ADR0039 and m13-policy-checks.json.
