# Architectural invariants and verification map

| Invariant | W0 evidence / future runtime gate |
|---|---|
| Contracts below SDK/apps, no cycles | check-boundaries.mjs + real import/cycle negative fixtures |
| Separate legacy histories/DBs preserved | inventory JSON, adapter ADR and no source imports |
| Current SQL table has one owner | ownership.json + architecture checker reads actual SQL |
| Source room released only after target confirmation | M09 runtime gate; not implemented in W0 |
| One active room and seat per actor | M06 concurrency/reconnect gate; not implemented in W0 |
| No client-provided identity/role authority | M03/M06 guards; not implemented in W0 |
| Dating presence/private preferences never implicitly public | M03/M04/M08/M20 privacy/access tests; flags OFF now |
| Critical persistent transition idempotent | M10/M11/M12 DB race tests; not implemented in W0 |
| Interrupted process is not successful activity | M06/M09/engine restart gates |

Architecture checker is consistency evidence, not evidence of those future runtime invariants. Service port responsibilities and current-vs-target context are in ARCHITECTURE.md; DB order/rollback in PERSISTENCE.md; concrete source contract differences in legacy-compatibility.md; transport/authority decisions in ADR 0003; fencing alternative in FUTURE-OWNERSHIP.md.
