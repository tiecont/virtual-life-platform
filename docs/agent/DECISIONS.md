# Decisions

| ID | Decision | Status | Evidence |
|---|---|---|---|
| D-001 | Independent city workspace, adapter-first; preserve both legacy repos and DBs | Accepted local implementation | docs/adr/0001-adapter-first.md |
| D-002 | W0 product defaults: all world flags OFF; public release, dating and Lounge operator gates remain pending | Accepted local defaults | docs/product/CONTENT-POLICY.md, RISKS.md; config/rollout.json |
| D-003 | Governance/architecture modules verified against relevant spec deliverables; no false runtime claims | Accepted task interpretation | ADR 0001; dependencies remain strict including remote PR acceptance |
| D-004 | Offline-only owner scope: implement/verify CI locally; remote PR and required checks later | Explicit owner instruction | ADR 0002 supersedes ADR 0001 remote dependency gate |
| D-005 | Pin installed Node 26.9.0 and audited TS/Nest/Next/Drizzle; separate city PostgreSQL | Accepted local implementation | ADR 0002; m01-check.log |
