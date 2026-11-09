# VirtualLife v1.1 — complete agent task catalog (110 tasks)

All tasks TODO / proposal only. Legacy Nxx/PA/Lodge ledgers remain separate. Execution priorities are **graph-driven**, not by increasing numeric task ID.

## G0

### VL-001 — Source HEAD and ledger audit
- **Lane:** `A0-Coordinator` · **Depends on:** none
- **Objective:** Compare live HEAD with archived N/PA/Lodge status, migrations, renderer, open worktrees, active N06 owner.
- **Acceptance:** SHA and dirty-path inventory recorded | 44/4/0 verified archived counts reconciled to live state without writing them
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-002 — Approve desktop-first ADR-003 and one-authority architecture
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-001`
- **Objective:** Owner approves Rust gameplay authority, Unity Windows primary client and Next.js official portal. Resolve N06 in-flight/legacy source ownership before code.
- **Acceptance:** Signed ADR-003 and v1.1 scope supersession recorded | One-writer-per-world/domain matrix, explicit rollback and N06-04 handoff policy approved
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-003 — Current DB/identity contracts inventory
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-001`
- **Objective:** Read real auth/session/CSRF/rooms/PG migrations and find safe Rust integration seam.
- **Acceptance:** Diagram existing callers+DB ownership | migration number reserved through current journal and no new autoschema race
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-004 — Rust workspace and version pin
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-002`, `VL-003`
- **Objective:** Build minimal game runtime executable, cargo workspace, formatter, CI and Docker.
- **Acceptance:** cargo fmt/check/clippy unit clean | OCI health endpoint and pinned toolchain built in CI
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-005 — Preserve legacy N06 Web renderer audit and isolate optional teaser
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-001`
- **Objective:** Read existing Three/Pixi/N06 renderer traces and source ownership; preserve VERIFIED work but remove full web 3D from Windows release critical path.
- **Acceptance:** Baseline measurements and no-loss fallback demonstrated | N06-04 ownership checkpoint collected before touching files
- **External/manual gates:** N06-04 active lane source handoff
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-006 — VirtualLife visual brand review
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-001`
- **Objective:** Convert logo/key-art concept into owner-approved style sheet and source asset checklist.
- **Acceptance:** wordmark spelling VirtualLife and icon rights reviewed | palette contrast assessed, art concepts explicitly nonproduction
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-007 — Lock Windows PC hardware + Web Vitals QA harness
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-001`
- **Objective:** Define physical Windows device tier matrix, GPU perf routes/driver logging, plus separate official-site Core Web Vitals instrumentation.
- **Acceptance:** Named Windows CPU/GPU/VRAM/SSD/driver matrix and 3 routes agreed | Distinct profiler p95/p99 frame and site LCP/INP/CLS metrics specified
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-008 — Threat model and failure taxonomy
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-002`, `VL-003`
- **Objective:** Threat model tickets, direct WSS, venue state, hidden hand, game reward and teleport.
- **Acceptance:** security reviewer signs attack tree | negative test map for replay/ID collision/policy revoke/DB crash
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-009 — Existing plan crosswalk decision
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-001`, `VL-002`
- **Objective:** Obtain formal scheduling checkpoint N06→PA→Lodge; route VL tasks without changing other ledgers.
- **Acceptance:** file reservation/handoff documented | legacy task IDs/verified evidence unchanged
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-010 — Desktop-first vertical slice and playable floorplan
- **Lane:** `A6-Gameplay` · **Depends on:** `VL-002`, `VL-006`
- **Objective:** Define one district, two avatar variants, walk-in cafe/card/Pet flow, M map/teleport and point-click navigation; site is separate publishing portal.
- **Acceptance:** clickable user flow accepted | scope ceiling excludes infinite city/AAA release claims
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-077 — Desktop-first roadmap and old-plan handoff decision
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-001`, `VL-002`
- **Objective:** Owner approves Windows-native as release product, browser portal as public site; map N06/PA/Lodge effects.
- **Acceptance:** Desktop ADR-003 signed with exceptions | Legacy plan N06 owner/handoff and file reservation documented
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-078 — Unity Windows hardware/licenses/build capability audit
- **Lane:** `A5-Native` · **Depends on:** `VL-001`, `VL-007`
- **Objective:** Enumerate supported test PCs GPU/driver, Unity seats/CI, build runner and legal signing needs.
- **Acceptance:** Named physical Win PC low/balanced/ultra list or recorded external blockers | Unity build/license/CI requirements written without inventing compliance
- **External/manual gates:** Windows real GPU devices; Unity editor/license terms review
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-079 — Official VirtualLife portal IA and hero media direction
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-006`, `VL-010`
- **Objective:** Define website download/account/news/gallery/support structure without open world browser shader requirement.
- **Acceptance:** IA/content/design + reduced-motion and mobile poster strategy reviewed | Download page fields and media provenance requirements specified
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-108 — Autonomous NPC behaviors and click-to-move navigation design
- **Lane:** `A6-Gameplay` · **Depends on:** `VL-010`
- **Objective:** Specify what Rust must validate vs decorative city movement done by Unity.
- **Acceptance:** Click-to-move vs teleport, NPC interactive vs ambient state machines reviewed | Server navmesh/target privacy/attack surface and UX route IDs specified
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

## G1

### VL-011 — Unity URP production renderer spike + optional web teaser cost
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-005`, `VL-007`, `VL-006`, `VL-080`, `VL-082`
- **Objective:** Run compiled Windows Unity anime-stylized shader test on named GPU against original art; preserve web renderer optional as N06 compatibility.
- **Acceptance:** Compiled Windows native scene has recorded p95/p99 GPU+CPU/VRAM/shader logs with hardware profile | One-page decision shows native URP suitability and web teaser not on game critical path
- **External/manual gates:** N06-04 worktree checkout handoff
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-012 — Versioned proto and client binding tooling
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-004`, `VL-008`
- **Objective:** Define public WSS envelope and internal tonic gRPC, TS and C# generation boundaries.
- **Acceptance:** backward compatibility test and valid sample exchange | invalid version/oversize rejected
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-013 — Rust ticket trust and policy generations
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-003`, `VL-008`, `VL-012`
- **Objective:** Nest issues short-lived tickets; Rust verifies scope/aud/nonce/policy freshness before writes.
- **Acceptance:** expired/forged/replayed/revoked negatives pass | no unauthorized game command persisted
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-014 — Windows native and Rust performance baseline lock
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-007`, `VL-011`
- **Objective:** Instrument compiled Windows player and Rust session baseline separately; record cold/warm load, shader hitch, p95/p99, VRAM, tick overrun, reconnection.
- **Acceptance:** Three golden scene routes and target Windows hardware/driver locked in checked-in manifest | Repeatable profiler and server tick load harness outputs real data fields, no synthetic values promoted
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-015 — Pure game reducer and canonical RNG
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-004`, `VL-012`
- **Objective:** Implement deterministic action reducer with versioned content and fixed-point arithmetic.
- **Acceptance:** same event stream/replay hashes across runs | property tests invalid actions and edge cases pass
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-016 — Game schema, receipts and migration
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-003`, `VL-012`, `VL-015`
- **Objective:** Add game schema/state/event/outbox with uniqueness/fencing, single shared DB migration journal.
- **Acceptance:** real PG concurrency test only one settlement | migration expand/rollback compatibility report
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-017 — Game turn orchestration and persistence
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-013`, `VL-015`, `VL-016`
- **Objective:** Execute per-match commands, transactional version check+commit then ACK/projection.
- **Acceptance:** unknown-ACK retrieval returns same receipt | game restarts with authoritative snapshot and valid turn order
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-018 — Outbox/inbox and platform reward ledger
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-016`, `VL-017`
- **Objective:** Implement game settlement event and dedupe in Nest worker/platform ledger.
- **Acceptance:** same event retry results one grant | late worker shows REWARD_PENDING then reconciles
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-019 — World actor and AOI prototype
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-012`, `VL-013`
- **Objective:** Build Rust per-zone actor/AOI live state prototype independent of any client shader benchmark or web screenshot.
- **Acceptance:** 20 scripted actors stable bounded queues | no DB per-frame writes | trace tick p95 and overrun measured
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-020 — Private projection by actor/viewer
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-013`, `VL-017`
- **Objective:** Ensure one private hand/viewer, public spectator view, zero information in generic logs.
- **Acceptance:** negative multiuser scope test passes | seeds/cards not leaked to other recipients
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-021 — Replay/crash chaos suite
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-017`, `VL-018`, `VL-020`
- **Objective:** Kill runtime pre/post commit, replay duplications, validate restore and version fences.
- **Acceptance:** zero duplicate effects, deterministic hash restored | restart journal/incompatibility outcomes documented
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-022 — Direct WSS authoritative gateway
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-012`, `VL-013`, `VL-019`
- **Objective:** Issue world ticket from Nest then WSS connect Rust; verify ACK/seq/resync and overload.
- **Acceptance:** real browser and Rust integration test | replayed/expired tickets and oversized packets rejected
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-023 — G1 signoff: headless game vertical slice
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-017`, `VL-018`, `VL-020`, `VL-021`, `VL-022`
- **Objective:** Review command/transaction/secret/protocol and rollback evidence.
- **Acceptance:** G1 decision record with attached test artifacts | no release status changed without reviewer
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-080 — Pinned Unity URP Windows project scaffolding and CI smoke
- **Lane:** `A5-Native` · **Depends on:** `VL-077`, `VL-078`
- **Objective:** Create Unity LTS project, asmdefs, URP presets and standalone Windows build scripts.
- **Acceptance:** Pinned Unity exact editor and package lock + URP Windows player build CI artifact | Headless/runner limitations recorded, real player opens a simple scene
- **External/manual gates:** Windows-capable build runner; Unity licensing if applicable
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-081 — Native Unity ↔ Rust generated C# protocol and login proof
- **Lane:** `A5-Native` · **Depends on:** `VL-080`, `VL-012`, `VL-013`
- **Objective:** Generate C# from proto and connect Unity client to Rust WSS scoped ticket, reconnect.
- **Acceptance:** Real native Unity login and scoped WSS roundtrip with traced server receipt | Schema mismatch, timeout, expired ticket and reconnect tested
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-082 — URP anime shader/lighting GPU proof on Windows
- **Lane:** `A5-Native` · **Depends on:** `VL-080`, `VL-105`
- **Objective:** Prototype face/hair/eye/toon outlines and one plaza/café lighting sample with profiles.
- **Acceptance:** Golden scene screenshots/video from compiled Win build and shader variant log | CPU/GPU/VRAM p95/p99 baseline on named Windows GPU or external gate blocker
- **External/manual gates:** Named Windows test GPU
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-083 — Next.js official website shell with accessible hero/download routes
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-079`, `VL-002`
- **Objective:** Build site routes, asset strategy, account integration placeholder and localized structure.
- **Acceptance:** Landing/news/world/download/support routes render mobile and desktop | No full game WebGL bundle or fake working download; accessible keyboard and reduced-motion
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-105 — Blender→Unity rig and per-scene shader/material/LOD budgets
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-006`, `VL-078`
- **Objective:** Define texture, bone, draw, materials and shader keyword budget for first 3 golden scenes.
- **Acceptance:** Signed art/tech-art scale/rig/material/LOD authoring conventions | Shader variant and VRAM audit fields documented
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

## G2

### VL-024 — Native Aurora Plaza blockout, scale & navmesh authoring
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-010`, `VL-023`
- **Objective:** Blender/Unity scale/navmesh anchors and walkable blockout for a single compact district plus portals/café sit anchors.
- **Acceptance:** geometry GUID manifest and server simplified collision exported | walk path from spawn to café and Arena reachable
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-025 — Pilot anthro rig skeleton, ears and tail
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-006`, `VL-010`
- **Objective:** Create production-candidate original cat/fox parts for one shared body rig.
- **Acceptance:** Blender source+license manifest, rig deformation test | LOD 0/1/2 export to web baseline
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-026 — Facial morph, emote, sit and IK authoring
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-025`
- **Objective:** Produce 12+ facial expressions and 8–12 emotes on approved pilot character.
- **Acceptance:** near/mid pose screenshot, eye blink, tail-chair clearance | no unreviewed clipping on sit/drink
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-027 — Unity Windows Aurora Plaza first rendered district
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-024`, `VL-025`, `VL-080`, `VL-082`, `VL-105`
- **Objective:** Implement compiled Windows Unity URP plaza native scene, asset streaming and LOD budget; Three.js is optional prior-art adapter.
- **Acceptance:** desktop browser usable on real machine | web-lite fallback and measured size/GPU budget
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-028 — Movement and collision server authority
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-019`, `VL-022`, `VL-024`
- **Objective:** Validate speed/nav bounds/proximity, per actor reconciliation and area interest.
- **Acceptance:** client cannot teleport via position spoof | network jitter test movement reconciles
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-029 — Unity native third-person camera and player control
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-027`, `VL-028`, `VL-084`
- **Objective:** WASD, mouse/gamepad, motion sensitivity, M key focus policy, Rust-authorized move with local smoothing and click-to-move override.
- **Acceptance:** 30/60fps target profiled by device | input latency, pause, scroll, alt-tab, focus handled
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-030 — Unity native avatar builder and expression showcase
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-025`, `VL-026`, `VL-027`, `VL-086`
- **Objective:** Editable, entitlement-scoped anthro avatar looks with face/ear/tail animation preview; shared source rig no character duplication.
- **Acceptance:** authenticated save projection and retry | old v1 appearance loads with explicit mapping
- **External/manual gates:** N06-07 creator compatibility verified in source
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-031 — Windows native M-map basic HUD and POI preview
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-027`, `VL-010`
- **Objective:** Unity M-map main screen, input focus, original city map art and safe semantic POI preview; no free client coordinate teleport.
- **Acceptance:** M/Esc toggles with focus correctly, chat input not hijacked | mobile map icon + keyboard navigation pass
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-032 — Unity city ambience/NPC schedule visuals and distant LOD
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-024`, `VL-085`, `VL-104`
- **Objective:** Render client-only trees/wind/ambient crowd; Rust-owned interactive NPC goals; batch/LOD and day/night animation budgets.
- **Acceptance:** desktop/mobile web shader frame/memory visual capture | interactive NPC separated from cosmetic loops
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-033 — Compiled Windows Aurora City visual/perf acceptance
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-026`, `VL-027`, `VL-029`, `VL-030`, `VL-032`, `VL-087`
- **Objective:** Test city/camera/avatar/animation on actual Windows PCs with profiles, frame hitches, facial and outfit clipping; no web 3D parity requirement.
- **Acceptance:** Compiled Windows player captured for Aurora Noon/Sunset and avatar closeup with real p95/p99/VRAM stats | Art/animation review and accessibility plus tier downgrade measured, no frame screenshots treated as performance proof
- **External/manual gates:** N06-09 web gate before integrated acceptance
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-034 — G2 signoff: expressive walkable Unity Windows Aurora City
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-028`, `VL-030`, `VL-031`, `VL-033`, `VL-088`
- **Objective:** Coordinator certifies one district and safe Rust-authoritative movement/interactions using native Windows player.
- **Acceptance:** world run reproducible browser demo and privacy projection | source-bound performance report and art signoff
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-084 — Unity local movement prediction + Rust reconciliation
- **Lane:** `A5-Native` · **Depends on:** `VL-081`, `VL-028`, `VL-027`
- **Objective:** Client inputs immediate, smooth corrections and packet-loss/reconnect safety.
- **Acceptance:** Local control responsive under 40/80/150ms RTT injected tests | Rust rejects speedhack and client resync is stable, profiler output attached
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-085 — Unity city scene streaming, camera framing and visual continuity
- **Lane:** `A5-Native` · **Depends on:** `VL-024`, `VL-027`, `VL-082`
- **Objective:** Addressables district cell/chunk prefetch, bake/probes, day-sunset scenario, transitions.
- **Acceptance:** Compiled native Aurora Plaza loads/evicts scenes without missing assets or authority loss | Golden noon/dusk scene profiles and stream hitch count captured
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-086 — Unity native facial animation, ear/tail and sit IK integration
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-026`, `VL-027`, `VL-082`
- **Objective:** Connect Blender rig morphs/emotes to native Blend Tree/Animation Rigging and close/mid/far LOD.
- **Acceptance:** 12+ semantic expression channels and hair/ear/tail mood QA on actual model | Sitting/hand/drink no major clipping with quality tiers and reduced motion
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-087 — Windows graphics profiles + shader prewarm + GPU telemetry
- **Lane:** `A5-Native` · **Depends on:** `VL-085`, `VL-086`, `VL-014`
- **Objective:** Dynamic resolution/LOD/shadows/postFX profiles and shader warmup, persisted safe defaults.
- **Acceptance:** Low/Balanced/Ultra profiles selectable and automatic safe tier discovery | GPU/p95/p99, variant count and frame hitch logs from compiled player
- **External/manual gates:** Named Windows test PCs
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-088 — Unity HUD/M-map focus, UI and controls integration
- **Lane:** `A5-Native` · **Depends on:** `VL-031`, `VL-081`, `VL-085`
- **Objective:** Desktop gamepad/keyboard chat focus, M map, POI cards and UI render quality.
- **Acceptance:** M/map/escape/chat focus/rebind and controller flows tested | No map input steals chat text; meaningful preview and teleport permissions
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-104 — Animate ambient city wind, signs, crowd and safe NPC life
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-085`, `VL-087`
- **Objective:** Create local foliage/banner shader animation, instanced ambient crowds and interactive NPC server schedule split.
- **Acceptance:** Ambient motion visible with near/far LOD and no server leaf/wind state | Client-only NPC effects never imply interactable authority; GPU budget measured
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

## G3

### VL-035 — Place catalog and destination entitlement
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-023`, `VL-031`
- **Objective:** Versioned map POI and scoped access/capacity/private status.
- **Acceptance:** schema validation and unauthorized private locations absent | stale POI never confers permission
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-036 — Teleport reservation/commit saga
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-019`, `VL-028`, `VL-035`
- **Objective:** Rust owns allowlisted target hold, source release, epoch fencing, safe rollback.
- **Acceptance:** target full, timeouts, duplicate clicks and concurrent transfer no ghost membership
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-037 — Unity native M-map teleport preview and confirmation UI
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-031`, `VL-035`, `VL-036`, `VL-088`
- **Objective:** Full POI map with place images and explicit Navigate vs Teleport; client preloads target only after Rust reservation.
- **Acceptance:** keyboard/mobile usable, destination image + label | client only moves after authoritative receipt
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-038 — Café interior, doors, tables and seat anchors
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-024`, `VL-026`
- **Objective:** Produce Café Lumi interior with 4 seat anchors, appropriate camera/sit alignment.
- **Acceptance:** reviewed scene and anchor GUID export | chair collisions/animation pose verified
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-039 — Venue entry and seat activity FSM
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-028`, `VL-036`, `VL-038`
- **Objective:** Implement proximity/enter/reserve/sit/stand/forfeit and exclusive seat lease.
- **Acceptance:** 2-user seat race one owner | disconnect/block/account-switch cleanup and TTL proven
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-040 — Unity native café walk-in/seat/standing scene and UI
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-037`, `VL-038`, `VL-039`, `VL-089`
- **Objective:** Café scene transition, camera, hand/seat IK with Rust hold/commit and optional game overlay; handle failure gracefully.
- **Acceptance:** visual E/tap affordance, genuine seat ACK before sit | network unknown state resumes correctly
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-041 — Board game v1 rules and privacy adapter
- **Lane:** `A6-Gameplay` · **Depends on:** `VL-017`, `VL-020`, `VL-039`
- **Objective:** Implement one small ruleset and route original N15 journal compatibility, no secret spectator projection.
- **Acceptance:** 2-player complete round+restart, hidden hand test, old journal fixture unchanged
- **External/manual gates:** N15-05/N16 product scheduling and ownership handoff
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-042 — Table invitation and game session host
- **Lane:** `A6-Gameplay` · **Depends on:** `VL-039`, `VL-041`
- **Objective:** Invite/ready/decline/timeout, owner seat checks and match-reconnect, spectator policy.
- **Acceptance:** 2 real clients join and play seated | forfeit/abort one receipt, no phantom continuation
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-043 — Pet Arena new ruleset content
- **Lane:** `A6-Gameplay` · **Depends on:** `VL-015`, `VL-023`
- **Objective:** Design 8 Pet/6 stage/boss first pass with fixed-point, seeds, status examples.
- **Acceptance:** unit fixture 100% reproducible, content id/version pinned | negative invalid swap+telegraph tests
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-044 — Pet Arena Rust combat and AI
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-017`, `VL-043`
- **Objective:** Implement board generator/cascades/combo/skill/AI in Rust reducer, replay.
- **Acceptance:** one full PvE match in Rust with restart/seed hash | no client damage calculation
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-045 — Pet District and training arena visuals
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-024`, `VL-043`
- **Objective:** Small Pet lobby, arena summon pad, 3 hero Pet representations and attack FX.
- **Acceptance:** original source art provenance and low/high fidelity exports | damage FX driven by canonical event IDs
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-046 — Unity native Pet District roam and battle HUD
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-037`, `VL-044`, `VL-045`, `VL-091`
- **Objective:** Move into Pet Arena from city then overlay tactical match-3 + Pet animation/VFX in Unity; Rust computes results.
- **Acceptance:** real browser completes match and resumes same authorized world | reduced motion and web-lite gameplay
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-047 — Real reward settlement with platform inbox
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-018`, `VL-044`
- **Objective:** Reward proposal after accepted result, ledger pending/committed read API and account scoping.
- **Acceptance:** server results only, retry settlement no duplicate platform grant | forged client rewards denied
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-048 — Rust + compiled Windows client e2e city/café/card/Pet Arena
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-037`, `VL-040`, `VL-042`, `VL-046`, `VL-047`, `VL-090`, `VL-091`, `VL-109`
- **Objective:** E2E native two-player seat/private game and Pet Arena transition with teleport, reconnect, ledger settlement, no duplicate rewards.
- **Acceptance:** all user paths pass incl account block/revoke | teleport and game state one writer each
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-049 — G3 acceptance playable vertical slice
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-048`
- **Objective:** Sign complete world+game slice with ticket/actor/DB receipts and real web demo.
- **Acceptance:** G3 report references PA-017 evidence separately | no legacy plan status fabricated
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-089 — Unity café enter/seat/stand animation and runtime session adapter
- **Lane:** `A5-Native` · **Depends on:** `VL-038`, `VL-039`, `VL-085`, `VL-086`
- **Objective:** Café interior and IK/chair with Rust seat reservation and content hash gating.
- **Acceptance:** Two players cannot own same seat; animation matches canonical seat anchor | Disconnect/blocked seat and return to walkable world tested
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-090 — Unity in-world private card table UI with spectator mode
- **Lane:** `A5-Native` · **Depends on:** `VL-041`, `VL-042`, `VL-089`
- **Objective:** Render table mini-game in café and reliable projection-aware hidden hands.
- **Acceptance:** Owner sees private cards and spectator cannot via renderer or logs | Invite/start/forfeit/leave/reconnect works without world ghost avatar
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-091 — Unity Pet Arena walk-in training PvE and match-3 board
- **Lane:** `A5-Native` · **Depends on:** `VL-044`, `VL-045`, `VL-085`
- **Objective:** Native world arena gate + tactical combat board and safe cinematic VFX, Rust rules.
- **Acceptance:** Arena stage from city gate playable in Win build with deterministic result | Hero VFX meets flash/readability constraints and returns to free roaming
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-092 — VirtualLife official promotional pages and character gallery
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-083`, `VL-079`
- **Objective:** High-impact original preview media, clear Windows CTA and launch community funnels.
- **Acceptance:** Website shows world/characters/activities/news/support/download states | Responsive image/video reduced-motion and correct concept-vs-gameplay labeling
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-093 — Windows release manifest, immutable bundle and distribution design
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-080`, `VL-083`
- **Objective:** Define executable manifest signing, content catalog hashing, CDN and release channels.
- **Acceptance:** Example signed schema/CI restricts secrets and includes rollback design | Installer/game vs launcher update distinction and threat model reviewed
- **External/manual gates:** Windows signing environment and official publisher verification
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-109 — Rust auto-navigation target and interaction path validation
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-028`, `VL-039`, `VL-108`
- **Objective:** Server authorizes POI pathing, cancels on manual control and prevents moving into locked venues.
- **Acceptance:** Path intent reaches legal target and fails clearly on obstacle/closed POI | Speedhack/teleport spoof and seat transition policy negative tests
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

## G4

### VL-050 — Revocation, report/block, age and consent integration
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-049`, `VL-008`
- **Objective:** Runtime enforces current platform safety generation at command and recipient projection.
- **Acceptance:** stale permissions mid-seat/teleport/settlement rejected | moderation UI same platform policy
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-051 — Load/stress and memory leak profiling
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-049`, `VL-014`
- **Objective:** Run defined city activities for 30 min across desktop and mobile web tier.
- **Acceptance:** actual p95 frametime tick/queue/DB metrics | no OOM, sustainable degraded tier and resource report
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-052 — Polish final art and appearance clipping
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-034`, `VL-048`
- **Objective:** Repair clothing/tail/ears/fur, lighting, VFX/readability in day/evening and café.
- **Acceptance:** art director signoff with annotated approved comparisons | asset provenance verified before release
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-053 — Windows native HUD/input/accessibility/localization pass
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-040`, `VL-046`, `VL-088`
- **Objective:** Font/contrast/control focus/reduced motion, controller mapping and Vietnamese/English for map/chat/card/pet interfaces.
- **Acceptance:** keyboard/touch/gamepad paths tested | contrast/scale & 16:9, 19.5:9, portrait fallback report
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-054 — Usability cohort and game fun audit
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-049`, `VL-053`
- **Objective:** Observe player first-play, map discovery, café sitting and Pet Arena, track confusion.
- **Acceptance:** real participant notes and anonymized metrics | backlog prioritized, no simulated playtest claims
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-055 — Durable backup, privacy and hidden data recovery
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-021`, `VL-041`, `VL-050`
- **Objective:** Restore game schema and legacy Lodge encrypted history under account privacy.
- **Acceptance:** restore/hash tests pass, keyless abort truthful | delete/export retention risk reviewed
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-056 — Unity native shader/animation/transition polish and GPU fallback
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-051`, `VL-052`, `VL-053`, `VL-087`
- **Objective:** Profile and polish shaders, eyes/hair/fur, scene streaming hitches, indoor lighting, low/medium/ultra visual degradation.
- **Acceptance:** browser device quality auto detected/overridable | no black screen on unsupported GPUs
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-057 — Security penetration and game adversarial suite
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-050`, `VL-055`
- **Objective:** Threat automation: counterfeit tickets, replay, colluding game clients, spam, content mismatch.
- **Acceptance:** all critical negative tests execute with artifact hashes | finding register and zero unmitigated CRITICAL
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-058 — G4 Windows native closed-beta readiness decision
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-051`, `VL-052`, `VL-054`, `VL-056`, `VL-057`, `VL-095`, `VL-096`, `VL-097`, `VL-098`, `VL-103`, `VL-106`
- **Objective:** Sign off Rust authority correctness, Unity compiled performance/safety and signed Windows release flow with official site.
- **Acceptance:** Owner-reviewed Windows native profile, source hashes, legal/art and security QA gate recorded | Signed installer update/rollback and website download/account UX tested before closed beta
- **External/manual gates:** N06-09 web qualification verified; human art/UX review
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-094 — Signed Windows install/clean machine and crash report pilot
- **Lane:** `A5-Native` · **Depends on:** `VL-093`, `VL-087`
- **Objective:** Package Win player with verified publisher/signature, version metadata, safe crash telemetry.
- **Acceptance:** Win10/11 clean install/uninstall, hash signature validation and crash restart proof | No private hands/auth tokens in diagnostics and non-admin scenario tested
- **External/manual gates:** Windows code signing materials
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-095 — Native G4 GPU/art/performance certification
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-087`, `VL-089`, `VL-091`, `VL-104`
- **Objective:** Capture 3 golden scene profiles on named GPUs after warm/cold runs and soak.
- **Acceptance:** p50/p95/p99 CPU+GPU/VRAM/GC/hitches across 3 scenarios documented | Human art/perf signoff with hardware/driver/build source and profile hashes
- **External/manual gates:** Physical Windows GPU tiers
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-096 — Rust+Unity E2E privacy/reconnect/ownership stress suite
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-048`, `VL-090`, `VL-091`, `VL-081`
- **Objective:** Test native compiled game with lost/duplicate packets, failed transfer, private cards and ledger.
- **Acceptance:** Native test user can city→cafe→card→Pet and back across reconnect | No double settlement, hidden card leak, ghost seat or unauthorized teleport
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-097 — Windows binary/asset updater and rollback drills
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-093`, `VL-094`
- **Objective:** Test launcher candidate if approved or signed installer-only upgrade; distinguish Unity Addressables.
- **Acceptance:** Interrupted download/disk-full/invalid signature cannot compromise previous install | Executable/version and content catalog rollback tested with incompatible schema path
- **External/manual gates:** Restricted signing pipeline
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-098 — Official website security/Web Vitals/download funnel acceptance
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-092`, `VL-094`, `VL-110`
- **Objective:** Measure real responsive pages, safe auth/deeplink and signed Windows download.
- **Acceptance:** Core Web Vitals p75 and accessibility with device/network profile reported | Signed Windows asset link/version/hash verified; support/legal/version compatibility flows pass
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-099 — Desktop first Windows closed-beta independently reviewed G4 gate
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-058`, `VL-095`, `VL-096`, `VL-097`, `VL-098`
- **Objective:** Owner reviews all native client, Rust correctness, website, signing and visual evidence.
- **Acceptance:** Independent source-bound pass/no-go with open blockers and supported GPU list | Windows beta evidence bundle not based on key-art/mock UI
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-103 — Keyboard/controller accessibility and motion comfort pass
- **Lane:** `A5-Native` · **Depends on:** `VL-053`, `VL-087`
- **Objective:** Remap keys, camera sensitivity, subtitle and no-shake controls in native HUD.
- **Acceptance:** Reduced-motion removes optional camera shake/particles and fast flashes | Controller/keyboard/chat map focus tested with QA report
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-106 — Desktop accessibility and localized brand copy cross-check
- **Lane:** `A3-Web-UX` · **Depends on:** `VL-053`, `VL-098`, `VL-103`
- **Objective:** Validate client and portal shared language tokens, safety UX, and card/map contrast.
- **Acceptance:** Reviewed vi/en strings and contrast/keyboard focus for game+site | No risky emotes/flash in reduced-motion setting
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-110 — Actual Windows gameplay capture and launch-media provenance
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-095`, `VL-052`
- **Objective:** Capture launch-ready windows build screenshots and hero video from real app after graphics QA.
- **Acceptance:** Source/build hash and signed art rights attached to actual capture | Website clearly labels approved gameplay vs remaining concept art
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

## G5

### VL-059 — G5 optional macOS/mobile port approval and device/license audit
- **Lane:** `A5-Native` · **Depends on:** `VL-099`
- **Objective:** After Windows gate, review actual demand, Apple hardware/accounts, Android physical devices and native cross-platform scope.
- **Acceptance:** signed ADR with license/OS/team/toolchain assumptions | conditional native original plan not bypassed
- **External/manual gates:** owner activates native workstream
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-060 — Unity macOS/mobile conditional cross-platform proof
- **Lane:** `A5-Native` · **Depends on:** `VL-059`, `VL-022`, `VL-025`
- **Objective:** Use pinned existing Windows Unity project/rig/proto and renderer tiers for real macOS or mobile build pilots; do not duplicate engine.
- **Acceptance:** Android install/test with real server ACK | no native gameplay authority/damage duplication
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-061 — Cross-platform asset/rig/material parity proof after Windows
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-060`, `VL-052`
- **Objective:** Verify subset of Windows-approved facial/rig, content bundles and quality tier on activated macOS/mobile platform.
- **Acceptance:** annotated cross renderer screenshots and animation parity | per-platform LOD budgets exposed
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-062 — Android physical device controls and 30min thermal pilot
- **Lane:** `A5-Native` · **Depends on:** `VL-060`, `VL-061`
- **Objective:** Adapt gameplay input and URP quality for actual Android devices; only after G5 approval.
- **Acceptance:** real Android physical device profiler with 30m traces | WSS reconnect and scene loading tests
- **External/manual gates:** physical Android device and owner authorization
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-063 — iOS pilot conditional on Mac/Xcode/Apple devices
- **Lane:** `A5-Native` · **Depends on:** `VL-060`, `VL-061`
- **Objective:** Compile and profile real iPhone iOS Unity build with consent and entitlements; no claim based on emulator.
- **Acceptance:** Mac/Xcode + physical iPhone evidence; if not, BLOCKED_EXTERNAL truthful
- **External/manual gates:** Mac/Xcode/Apple team/iPhone resources
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-064 — G5 platform port go/no-go independent of Windows release
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-062`
- **Objective:** Evaluate activated port quality and business need; Windows launch remains independent.
- **Acceptance:** explicit decision/rollback and device table | no store release without N11/N14 actual gates
- **External/manual gates:** N10/N11/N14 original release approval
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-100 — macOS Apple Silicon candidate build and Metal shader check
- **Lane:** `A5-Native` · **Depends on:** `VL-059`, `VL-061`
- **Objective:** Prove macOS Unity app + networking/input + signature/notarization if funded.
- **Acceptance:** Mac build/render/driver QA or clear BLOCKED_EXTERNAL if no Mac/license | Profile named Apple Silicon with account/login and avatar scene
- **External/manual gates:** Mac hardware, Apple signing/notarization resources
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

### VL-101 — Android/iOS candidate economic performance decision
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-062`, `VL-064`
- **Objective:** Compare app size/thermal/art adaptation and market need; Android/iOS separate release gates.
- **Acceptance:** Real device metrics with cost/scope and quality downgrade matrix | Owner records go/no-go independent from Windows desktop release
- **External/manual gates:** Physical mobile devices
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

## G6

### VL-065 — CI/CD, game runtime deployment and telemetry
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-023`, `VL-049`
- **Objective:** Use existing Argo/GHCR tooling, readiness, WSS draining and safe migrations.
- **Acceptance:** staging deploy with versioned digest and trace correlation | one writer and legacy route unaffected
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-066 — Production-grade operational security
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-050`, `VL-055`, `VL-065`
- **Objective:** Verify mTLS/internal identity, secrets, CSP/WSS ingress, abuse and data deletion path.
- **Acceptance:** security signoff, compliant retention and no exposed internal endpoints
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-067 — Disaster rollback drill and game reconciliation
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-055`, `VL-065`
- **Objective:** Kill workloads, force backup restore and rollback under versions/active games.
- **Acceptance:** real staging report RTO/RPO measured | no double membership/currency/hidden info loss
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-068 — Live events and transparent progression
- **Lane:** `A6-Gameplay` · **Depends on:** `VL-047`, `VL-058`
- **Objective:** Implement small café festival + cosmetic achievement loop with anti-pay-to-win gating.
- **Acceptance:** event config from signed catalog and ledger only | no score/currency client authority
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-069 — Public Windows official release legal/site/support security signoff
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-058`, `VL-066`, `VL-098`
- **Objective:** Confirm brand/trademark/rights, privacy/moderation/support, stable website/download funnel, signed release and legal obligations.
- **Acceptance:** owner-approved compliance/provenance checklist | unknowns listed no false approvals
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-070 — Windows native + Rust official-release canary/monitoring
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-067`, `VL-068`, `VL-069`, `VL-102`
- **Objective:** Canary users install signed Windows client from official site, play Rust game, safely rollback service/asset/client version.
- **Acceptance:** dashboard SLO, alerts, rollback drill and player reporting proven | go/no-go recorded
- **External/manual gates:** staging/hosting credentials and human beta consent
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-102 — Production official portal + signed Windows client release certification
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-099`, `VL-094`, `VL-098`, `VL-067`
- **Objective:** Prepare staged download, version compatibility, backend canary, status and rollback.
- **Acceptance:** Public release site points to verified signed installer with live version/size/checksum | Canary and rollback with Rust/PG restore and support runbook approved
- **External/manual gates:** Owner/legal/signing/CDN production gate
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release

## G7

### VL-071 — Zone lease/epoch model for multiple owners
- **Lane:** `A1-Rust-Game-Core` · **Depends on:** `VL-070`
- **Objective:** Implement fenced instance directory and takeover on observed scale need.
- **Acceptance:** network partition cannot create two successful writers | epoch and membership replay tested
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-072 — Legacy RoomAuthority Rust cutover pilot
- **Lane:** `A2-Persistence-Security` · **Depends on:** `VL-071`, `VL-055`
- **Objective:** Migrate **one** legacy world with full travel/seat/safety and journal compatible adapter.
- **Acceptance:** old N05/N15 fixtures pass real recovery and rollback | at most one authority and no privacy regressions
- **External/manual gates:** owner approves legacy cutover ADR
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-073 — Scale capacity tests and autoscaling decision
- **Lane:** `A7-QA-SRE` · **Depends on:** `VL-071`, `VL-072`
- **Objective:** Benchmark 2+ owner workloads, AOI fanout, persistence and routing costs.
- **Acceptance:** measured saturation and partition chaos pass | HPA decision based on data not assumption
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-074 — Expand city districts and activities
- **Lane:** `A6-Gameplay` · **Depends on:** `VL-070`, `VL-073`
- **Objective:** Ship one new district+1 venue+1 game through same content/contract pipeline.
- **Acceptance:** no contract forks, safe map target and deterministic game acceptance
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-075 — Next species/outfit expansion on approved Unity avatar rig
- **Lane:** `A4-Avatar-Art` · **Depends on:** `VL-061`, `VL-070`
- **Objective:** Grow avatar variants without changing game collision stats; maintain approved Windows profile and future mobile parity.
- **Acceptance:** new species fits chair/emotes/LOD, license manifest and device metrics pass
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-076 — Creator/community roadmap and tech debt re-evaluation
- **Lane:** `A0-Coordinator` · **Depends on:** `VL-073`, `VL-074`, `VL-075`
- **Objective:** Review traction, moderation cost, runtime ops and native decision before opening UGC.
- **Acceptance:** prioritized ADRs backed by usage/perf data | no arbitrary untrusted scripts enabled
- **Evidence:** PR commit SHA, reproducible test log, reviewer signoff

### VL-107 — Native photo mode and creator district expansion evaluation
- **Lane:** `A6-Gameplay` · **Depends on:** `VL-070`, `VL-075`
- **Objective:** Only after successful Windows release, test low-risk social/photo/UGC alternatives.
- **Acceptance:** Value/cost hypothesis and game privacy/screenshot policy documented | No automatic UGC store publication without moderation controls
- **Evidence:** PR/source SHA; runnable test and source-bound logs; named review owner; real Windows build/device profile if rendering; signatures if release
