# Deadline integration audit — M15-01

Readonly observation on2026-11-03UTC/2026-11-04Asia_Ho_Chi_Minh, from city7abe23e. `node scripts/audit-legacy-integration.mjs deadline` records52source/manifest/SQL/test/asset hashes,12API source files,9route references and the current expanded Git status. HEAD remains `f9475b4caa65813e9351aaa4598663df538116a3` on main. All8files from M10-01 retain their hashes. A second hash/status/HEAD pass detected no changes during inspection. This is a working-tree observation, not a clean approved integration pin.

The API/backend is committed; current dirty/untracked work is primarily the web experience and its tests/assets. Preserve that distinction: a dirty web tree does not prove the backend is broken, and a backend commit does not pin the full world scene. No legacy file, process, database, migration, cookie or media was copied or changed.

| Reference / boundary | Actual source | Required integration work |
| --- | --- | --- |
| Identity / guest upgrade | `/api/v1/guests/session`, GET/PATCH/DELETE `/api/v1/me`; host-only `deadline_session`, random32byte token, SHA256lookup,30day expiry, Origin and CSRF. No registered upgrade/link/proof exchange found. | Explicit possession-proven legacy->city account map; never merge by display name, avatar or supplied UUID. Preserve old guest access/history until verified opt-in migration/rollback. |
| Catalog | `/api/v1/cafes`, `/cafes/:slug/rooms`, `/rooms/:id`; separate city registry contract. | Allowlisted IDs, capacity and version translation. Catalog occupancy is not an authoritative room owner. |
| Realtime / seats | No ws/Socket.IO/Nest websocket imports in the12API source files; modules are guests/catalog. Scene-data provides30coordinates; SQL defines room capacity. | Mount or bridge an actual room authority and test seat races, disconnect/takeover and exact version/error mapping. No active listener/seat gameplay is verified by this audit. |
| Focus | SQL has focus_sessions,15/25/50min constraints,oneactive/guest and guest/key uniqueness; no start/finish route. FocusPanel start remains disabled,stats empty. | Use verified M10owner ports with current seat/origin context; no copying timer state or creating a second completion authority. Import history only with identity proof, backup, uniqueness and approved policy. |
| Scene / shared shell | CafeShell explicitly renders a connection-under-construction scene; original SVG/CSS artwork has a local provenance ledger. | No playable legacy scene exists to embed unchanged. Preserve current UI work and author an adapter-backed scene behind a flag after the integration pin. Rights review precedes asset redistribution. |
| Social / safety | No live invitation,block,report or moderation handlers in audited runtime. Reference keeps task text local/private. | Connect M04/M08/M09ports; never project task notes or private focus history into presence/invites. Test actual cross-world contact withdrawal. |
| Tests / operations | Current test inventory includes guest integration,contract/time unit tests and onboarding browser scenario. Root runtime asks Node26.13.x,city verified26.9.0. | Do not infer gameplay coverage from test filenames or a green build. Record actual adapter tests and runtime compatibility separately. |

## Dated baseline, not a fresh runtime result

AUD-07 logs dated2026-11-02 remain available: `pnpm lint` exit1(521generated `.next-e2e` errors);typecheck/test/build exit0. Tests were1contract+2web time+4API unit cases;scene-data explicitly had no tests. Root test did not run Deadline PostgreSQL integration or browser tests. These commands were not rerun in M15-01 and no new legacy runtime/DB/E2E success is claimed. Current source/AST/hash inspection and city script syntax/lint checks are the new evidence.

## Gates and exact resumption

Subsequent owner decision2026-11-05:reuse rights andcurrentworking-source copy selected explicitly. ADR0085 supplies cleanindependentpin6d2ca6a4e00505b2df1d6f41f1041fa14a227c5b/88files withoriginalrepo untouched. The gate description below is historical;offlineM15-02..06 can nowresume against that archive,not the mutable original tree. No runtime/gameplay success follows from the pin.

ADR0001 requires an exact clean integration revision before adapter implementation. B-001 remains for the full Deadline world worktree,including untracked web/tests. B-002 concerns redistribution and does not bar local audit. M15-02..06 remain BLOCKED_EXTERNAL at this integration boundary; source feature gaps above are future implementation work, not evidence of a working world.

Resume by receiving/selecting the owner's clean committed full-world snapshot,rerun this read-only audit against it,confirm code/media reuse scope,and update the compatibility ADR before implementing possession-proven identity,room/focus bridges and shell integration. Do not auto-commit another active worktree or replace its source with the synthetic travel fixture. Rollback today is unchanged: real Deadline flag OFF,legacy app/DB untouched. No import,DDL or backup operation occurred. Independent M16audit and M17Library work can proceed now.
