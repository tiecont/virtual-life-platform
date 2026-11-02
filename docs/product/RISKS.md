# Risks, release gates and rollback

| Risk | Impact / mitigation | Gate / owner |
|---|---|---|
| Dirty legacy snapshots | moving interfaces; adapters only after re-audit and pinned revisions | M15/M16, repository owner |
| Missing code license | no assumed redistribution permission | integrations, project owner |
| Empty rooms | honest counts, route to occupied eligible rooms/events; avoid excess allocation | M06/M14, product |
| Onboarding friction | minimal guest path, preserve input on failure, never false shared login | M03/M14, product |
| Harassment/child safety | deny restricted access, moderate before broadcast, reports/block/coverage | W1/W2, safety operator |
| Identity takeover | host-only distinct cookies; proof exchange; no name linking | M03/M15/M16, engineering |
| Double presence/orders | single owner, atomic transitions, idempotent persistence | M06/M09/M11, engineering |
| Split brain | single API instance now; ownership/fencing before replicas | M02/M21, engineering |
| Media infringement | original asset ledger; text-only Lounge | every world, owner |
| Scope explosion | W2 first; higher waves flags OFF; non-goals enforced | product owner |
| Restore/deploy failure | isolated restore drill, health/readiness, feature rollback | M21/M23, operator |

Default release state: NOT_LIVE. Every world flag starts OFF. Kill switch must deny new admissions and gracefully route existing members to safe lobby; preserve critical persistent activity as interrupted rather than successful. Flag re-enable requires relevant tests. No production action, domain purchase, credential setup, data destruction or public release performed by W0.

Pending owner decisions: repository licensing; stable integration commits; age policy/jurisdiction/privacy contact/retention; moderator identities/coverage/appeal contact; domain/VPS/secrets; approved dating verification provider/process; per-world release authorization. These block corresponding integration/release gates, not independent foundation work. Approval evidence must identify approver, date, environment, scope and rollback owner; a developer boolean alone is not signoff.
