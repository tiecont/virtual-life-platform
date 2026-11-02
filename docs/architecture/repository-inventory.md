# Repository audit — 2026-11-02

AUD-01..08 concern these local snapshots only. Initial city directory was empty and not a repository. Plan pack copied without removing source. All legacy sources remain in their original directories and histories. Both contain dirty/untracked work; this is not a reproducible integration revision. Re-audit before adapters consume them.

| Source | Branch / HEAD at audit | Observed state | License |
|---|---|---|---|
| `/home/tiecont/Projects/deadline-cafe` | main / f9475b4caa65813e9351aaa4598663df538116a3 | guest/catalog API, web onboarding, placeholder scene; dirty web work | No root code LICENSE found; original-art ledger exists |
| `/home/tiecont/Projects/maid-cafe` | master / 33180a920505a6e0f3998dbf0367be0b72727710 | largely untracked foundation; health, schemas, menu seed, landing | No root code LICENSE found; assets/LICENSES.md states no external assets imported |
| city | new main | plan pack and audit; no pre-existing app to replace | No redistribution license inferred |

Evidence: `../agent/evidence/audit-*-inventory.json`, `audit-*-checks.json` and corresponding logs. Node v26.9.0, pnpm 11.28.5, Git 2.56.0, Docker 29.9.0. Deadline requests Node 26.13.x (mismatch disclosed); Maid allows >=24 <27. Root dependency versions are package manifest observations, not compatibility guarantees.

| Layer | Deadline | Maid | Integration consequence |
|---|---|---|---|
| API | Nest 11.2.8 / Fastify 5.12.8 | Nest 12.3.2 / platform-fastify 12.3.2 | Separate runtime dependencies; do not hoist or copy bootstraps |
| Language/tools | TS 5.9.3 / ESLint 9 / Jest + Vitest 4 | TS 6.0.3 / ESLint 10 / Vitest 5 | City pins audited foundation choices; no legacy upgrade |
| Web | Next 16.4.4, React | Next 16.4.4, React 19.3.1 | Same major does not prove shared session |
| DB | PostgreSQL, Drizzle 0.45.4, generated SQL | PostgreSQL, Drizzle 0.45.4, checksum SQL runner | Separate databases; no shared migration journal |
| Realtime | ws dependency, no runtime gateway found | Socket.IO dependency, command schemas only | Both protocols need implemented adapters; schema is not a working gateway |

AUD-07 results are in checks JSON. Deadline lint fails on generated `.next-e2e` JavaScript (521 errors); do not suppress this baseline or edit another working tree. Its unit suites allow no-tests in some packages; a green root test is not proof of realtime/focus. Maid tests include a disposable Docker PostgreSQL integration run. Legacy E2E and Deadline PostgreSQL integration were not included in initial four-command baseline; no claim about those gates.

## Audit source trace

- Deadline: `apps/api/src/{http.ts,app.ts,modules/guests.ts,modules/catalog.ts,db/schema.ts}`, `apps/api/drizzle/0000_hot_slyde.sql`, `packages/contracts/src/index.ts`, `packages/scene-data/src/index.ts`, `apps/web/src/components/CafeShell.tsx`.
- Maid: `apps/api/src/{app.ts,db/schema.ts,db/migrations.ts,db/migrations/0001_foundation.sql}`, `packages/contracts/src/index.ts`, `assets/{LICENSES,SPECIFICATION}.md`.

Source inspection and actual checks satisfy the audit, including discovered gaps. They do not verify either source application as a complete world.
