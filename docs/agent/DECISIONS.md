# Decisions

| ID | Decision | Status | Evidence |
|---|---|---|---|
| D-001 | Independent city workspace, adapter-first; preserve both legacy repos and DBs | Accepted local implementation | docs/adr/0001-adapter-first.md |
| D-002 | W0 product defaults: all world flags OFF; public release, dating and Lounge operator gates remain pending | Accepted local defaults | docs/product/CONTENT-POLICY.md, RISKS.md; config/rollout.json |
| D-003 | Governance/architecture modules verified against relevant spec deliverables; no false runtime claims | Accepted task interpretation | ADR 0001; dependencies remain strict including remote PR acceptance |
| D-004 | Offline-only owner scope: implement/verify CI locally; remote PR and required checks later | Explicit owner instruction | ADR 0002 supersedes ADR 0001 remote dependency gate |
| D-005 | Pin installed Node 26.9.0 and audited TS/Nest/Next/Drizzle; separate city PostgreSQL | Accepted local implementation | ADR 0002; m01-check.log |
| D-006 | Single process room authority, Socket.IO when M06 mounts it, PostgreSQL critical transitions; fencing before multiple replicas | Accepted design | ADR 0003; future design is not implemented |
| D-007 | Optional local registered upgrade/sign-in, salted bounded scrypt, same account ID, no recovery promise | Accepted local implementation and verified | ADR 0005; m03-final-checks.json |
| D-008 | Auth-only Socket.IO gateway in M03 meets revocation acceptance; rooms/seat/travel remain separate dependent modules | Implemented and verified over actual network | IDENTITY-SOCKET.md; 29 integration tests |
| D-009 | Project named virtual-life-platform; local origin points to owner-supplied SSH repository; no push/fetch | Owner-directed | ADR 0006; project-name-checks.json |
| D-010 | Private contact codes, explicit reciprocal consent, normalized pair constraints, bilateral block priority and no auth cache | Implemented/verified | ADR 0007; m04-checks.json |
| D-011 | Account-scoped refresh only; no room activity until authoritative source; privacy projections always rechecked | Implemented/verified interface + current HTTP/UI | SOCIAL-API.md; M05/M06 live room source still pending |
| D-012 | Strict SDK v1, independent lifecycle/flags, hidden discovery excluded, runtime membership denies until M06 | Implemented/verified locally | ADR 0008; WORLD-SDK.md; m05-checks.json |
| D-013 | Enforce one room owner per DB schema with a dedicated PostgreSQL advisory lock; irreversible loss, no distributed failover claim | Implemented and verified locally | ADR 0009; m06-owner-checks.json; future lease/fencing remains gated |
