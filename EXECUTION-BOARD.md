# Execution Board — current task status in docs/agent/task-state.json

Đây là task registry ban đầu. Khi triển khai, dùng `docs/agent/PROGRESS.md` làm nguồn theo dõi kết quả thực tế. Không đánh dấu task VERIFIED nếu thiếu evidence.

| Module | Task | Status | Verified evidence |
|---|---|---|---|
| M00 | M00-01 · Tạo PRD: north-star, personas (student, developer, casual visitor, host, staff, mod, adult dater), user journeys. | VERIFIED | docs/agent/evidence/m00-review.log |
| M00 | M00-02 · Lập world matrix cho Deadline/Maid/Library/Restaurant/Lounge/Dating/Park. | VERIFIED | docs/agent/evidence/m00-review.log |
| M00 | M00-03 · Định nghĩa UX design tokens, tone, a11y/mobile; first-time onboarding không cần hứa account liên thông nếu chưa tích hợp. | VERIFIED | docs/agent/evidence/m00-review.log |
| M00 | M00-04 · Định nghĩa product analytics và privacy-friendly events. | VERIFIED | docs/agent/evidence/m00-review.log |
| M00 | M00-05 · Lập product risk register, phase-bound scope và release operator signoff. | VERIFIED | docs/agent/evidence/m00-review.log |
| M01 | M01-01 · Inspect repositories and choose integration topology (single monorepo, git submodules, adapter façade) via ADR. | VERIFIED | docs/agent/evidence/m01-check.log (offline scope ADR 0002) |
| M01 | M01-02 · Initialize pnpm workspaces, runtime versions, CI quality scripts only where missing. | VERIFIED | docs/agent/evidence/m01-check.log (offline scope ADR 0002) |
| M01 | M01-03 · Create `packages/contracts`, `world-sdk`, shared config and convention for domain imports. | VERIFIED | docs/agent/evidence/m01-check.log (offline scope ADR 0002) |
| M01 | M01-04 · Create local development stack and reproducible env examples. | VERIFIED | docs/agent/evidence/m01-check.log (offline scope ADR 0002) |
| M01 | M01-05 · Add CI on PR + required checks, caches and artifact outputs. | VERIFIED | docs/agent/evidence/m01-check.log (offline scope ADR 0002) |
| M01 | M01-06 · Document onboarding for other agents and human developers. | VERIFIED | docs/agent/evidence/m01-check.log (offline scope ADR 0002) |
| M02 | M02-01 · Document context/container/module architecture and domain ownership (C4 lightweight). | VERIFIED | docs/agent/evidence/m02-architecture.log |
| M02 | M02-02 · Specify DB ownership, module service APIs and transactional boundaries. | VERIFIED | docs/agent/evidence/m02-architecture.log |
| M02 | M02-03 · Specify adapter-first integration for two existing projects. | VERIFIED | docs/agent/evidence/m02-architecture.log |
| M02 | M02-04 · Create architecture decision records for room authority, transport and persistence. | VERIFIED | docs/agent/evidence/m02-architecture.log |
| M02 | M02-05 · Specify multi-instance design for future use without implementing prematurely. | VERIFIED | docs/agent/evidence/m02-architecture.log |
| M03 | M03-01 · Audit old guest/token/cookie/session flows; design migration for existing users. | VERIFIED | docs/agent/evidence/m03-final-checks.json |
| M03 | M03-02 · Implement identity endpoints, signed secure cookies, session rotation/logout and optional guest sessions. | VERIFIED | docs/agent/evidence/m03-final-checks.json |
| M03 | M03-03 · Implement public user profile (nickname, avatar selection, visibility) and distinct private prefs. | VERIFIED | docs/agent/evidence/m03-final-checks.json |
| M03 | M03-04 · Implement privacy settings and export/delete requests hooks with auditable policy. | VERIFIED | docs/agent/evidence/m03-final-checks.json |
| M03 | M03-05 · Add admission/eligibility policy interface for restricted worlds. | VERIFIED | docs/agent/evidence/m03-final-checks.json |
| M03 | M03-06 · Implement abuse-resistant account/session safeguards. | VERIFIED | docs/agent/evidence/m03-final-checks.json |
| M04 | M04-01 · Define state machines for friend request: PENDING/ACCEPTED/DECLINED/EXPIRED/CANCELLED. | VERIFIED | docs/agent/evidence/m04-checks.json |
| M04 | M04-02 · Implement friend endpoints and atomic reciprocal acceptance. | VERIFIED | docs/agent/evidence/m04-checks.json |
| M04 | M04-03 · Implement block/unblock effects and cache invalidation. | VERIFIED | docs/agent/evidence/m04-checks.json |
| M04 | M04-04 · Implement presence/friends discovery respecting per-world privacy. | VERIFIED | docs/agent/evidence/m04-checks.json |
| M04 | M04-05 · Add social abuse controls for bulk requests and spam. | VERIFIED | docs/agent/evidence/m04-checks.json |
| M05 | M05-01 · Define versioned `WorldDefinition` and required capabilities. | VERIFIED | docs/agent/evidence/m05-checks.json |
| M05 | M05-02 · Implement `WorldRegistry` and feature-flagged activation per environment. | VERIFIED | docs/agent/evidence/m05-checks.json |
| M05 | M05-03 · Define world lifecycle hooks (bootstrap, onJoin, onLeave, onCommand) with permission guard. | VERIFIED | docs/agent/evidence/m05-checks.json; membership integration M06 |
| M05 | M05-04 · Implement server/client shared world map metadata contract. | VERIFIED | docs/agent/evidence/m05-checks.json |
| M05 | M05-05 · Define SDK compatibility strategy for two existing applications. | VERIFIED | WORLD-SDK.md; legacy runtime mapping remains M15/M16 |
| M06 | M06-01 · Implement room lifecycle/allocator with max capacity and admission policy. | VERIFIED | m06-allocator-checks.json; full M06 remains incomplete |
| M06 | M06-02 · Implement atomic seat claim/release, ownership and grace period. | VERIFIED | m06-seats-checks.json; controlled-connection concurrency, actual socket/grace scenarios |
| M06 | M06-03 · Implement Socket.IO auth at handshake AND each command; validation envelope+ACK. | VERIFIED | m06-security-checks.json; other M06 acceptance remains pending |
| M06 | M06-04 · Implement per-room snapshots/versioned deltas and gap detection. | VERIFIED | m06-presence-checks.json; privacy-safe projection and SDK gap reducer |
| M06 | M06-05 · Implement disconnect/reconnect and multi-tab semantics. | VERIFIED | m06-reconnect-checks.json; actual SIGKILL/restart + SDK recoverable state; browser scene remains M07 |
| M06 | M06-06 · Add metric instrumentation, rate limits, bounded queues and load harness. | VERIFIED | m06-metrics-checks.json; actual24socket baseline339.6ms p95join; limited local profile only |
| M06 | M06-07 · Document multi-instance ownership/fencing alternative (implement only when justified). | VERIFIED | m06-owner-checks.json; single-owner PG guard + actual paused-owner/backend-loss tests; distributed replicas prohibited |
| M07 | M07-01 · Define isometric/2D coordinate/tile/map scene spec and collision zones. | VERIFIED | m07-scene-checks.json; actual cafe pixels/keyboard room/seats/privacy desktop+mobile; fixture art only |
| M07 | M07-02 · Implement Pixi scene loader, camera, sprite lifecycle and event-driven state render. | VERIFIED | m07-lifecycle-checks.json; keyed sprites/camera/cancellation and22 E2E; original multi-frame actions remain03 |
| M07 | M07-03 · Implement avatar core + world outfit variants with a legal asset manifest. | VERIFIED | m07-avatar-checks.json; original idle/walk/sit/serve+2outfits,24 E2E; movement/service gameplay not claimed |
| M07 | M07-04 · Implement destination click, path validation, movement interpolation. | VERIFIED | m07-movement-checks.json; final75 integration +26 E2E,server paths/legacy negotiation/privacy/freeze |
| M07 | M07-05 · Implement accessibility/responsive fallback UI. | VERIFIED | m07-accessibility-checks.json;28 E2E,contrast>=5.7288,44px targets,keyboard/focus/low-motion; future service controls gated |
| M07 | M07-06 · Optimize asset bundles/loading/perf. | VERIFIED | m07-performance-checks.json;30 E2E,actual CPU4x/cache/idle/remount profile; M07 local sample task scope complete |
| M08 | M08-01 · Define content, harassment and privacy threat model by world, plus escalation protocol. | VERIFIED | m08-policy-checks.json; audited definition/schema/config with45unit/75integration/builds; runtime02..06 pending |
| M08 | M08-02 · Implement server-side chat/emote/moderation pipeline. | VERIFIED | m08-chat-checks.json; check48unit/89integration,E2E30; defaultOFF |
| M08 | M08-03 · Implement reporting with minimal evidence, immutable audit log and access RBAC. | VERIFIED | m08-reports-checks.json;100integration,E2E32; encrypted local reporting/assigned RBAC |
| M08 | M08-04 · Implement sanction lifecycle, cross-world enforcement and appeal intake. | VERIFIED | m08-sanctions-checks.json; current admission/chat/room/private appeals; actual M09 travel remains gated |
| M08 | M08-05 · Build moderator UI, kill switches and operational runbook. | TODO | — |
| M08 | M08-06 · Test false positive handling, rate limits, privacy access and response latencies. | TODO | — |
| M09 | M09-01 · Define travel intent state machine: CREATED/READY/COMMITTED/EXPIRED/FAILED/CANCELLED. | TODO | — |
| M09 | M09-02 · Implement scoped one-time, short-lived travel intents + validation. | TODO | — |
| M09 | M09-03 · Implement recipient invitation flows and notifications with consent. | TODO | — |
| M09 | M09-04 · Implement handshake across source and destination room owners. | TODO | — |
| M09 | M09-05 · Integrate party/group invite capacity logic and offline handling. | TODO | — |
| M09 | M09-06 · Test cross-world transition with artificial network failure. | TODO | — |
| M10 | M10-01 · Compare legacy Deadline focus contracts and persistence. | TODO | — |
| M10 | M10-02 · Implement trusted start/pause/finish/cancel rules with deterministic server clock. | TODO | — |
| M10 | M10-03 · Implement room/world-scoped session association and privacy. | TODO | — |
| M10 | M10-04 · Provide accessible timer UI package and shareable completion summary. | TODO | — |
| M10 | M10-05 · Add SQL queries/retention for daily summaries and test DST/timezone edge cases. | TODO | — |
| M11 | M11-01 · Audit legacy Maid order/shift semantics, extract shared vs maid-only behaviors. | TODO | — |
| M11 | M11-02 · Implement core order state machine and atomic claim with per-world policy. | TODO | — |
| M11 | M11-03 · Implement staff shift, role permissions and reassignment on disconnect. | TODO | — |
| M11 | M11-04 · Implement menu/catalog and service actions extensible per world. | TODO | — |
| M11 | M11-05 · Add transaction/idempotency for order complete and progress hooks. | TODO | — |
| M11 | M11-06 · Test moderation of staff/customer interactions and service refusal. | TODO | — |
| M12 | M12-01 · Define event and reservation state machines with timezone/overbooking policy. | TODO | — |
| M12 | M12-02 · Implement scheduled events/catalog and RSVP with capacity checks. | TODO | — |
| M12 | M12-03 · Implement reservation holds/expiry/check-in/waitlist policy. | TODO | — |
| M12 | M12-04 · Implement organizer/performer/mod permissions and cancel notifications. | TODO | — |
| M12 | M12-05 · Implement event discovery and invitations with privacy restrictions. | TODO | — |
| M12 | M12-06 · Write concurrency and timezone integration tests. | TODO | — |
| M13 | M13-01 · Define XP and cosmetics policies for each world with cap and abuse prevention. | TODO | — |
| M13 | M13-02 · Implement entitlement service and ledger/unique source id. | TODO | — |
| M13 | M13-03 · Implement world outfit restrictions and appearance validation. | TODO | — |
| M13 | M13-04 · Implement cosmetics UI and non-trading unlocks with accessibility. | TODO | — |
| M13 | M13-05 · Implement abuse tests and rollback for incorrect rewards. | TODO | — |
| M14 | M14-01 · Create original pixel-art city map with clickable world hotspots and accessible text list. | TODO | — |
| M14 | M14-02 · Build world detail cards with safe occupancy and schedules. | TODO | — |
| M14 | M14-03 · Integrate shared header, avatar, current world, friend/invite center. | TODO | — |
| M14 | M14-04 · Build route/portal UX (loading, full room, forbidden, cancelled, reconnect). | TODO | — |
| M14 | M14-05 · Add initial activation strategy to concentrate activity. | TODO | — |
| M15 | M15-01 · Audit actual Deadline source and compare to reference plan. | TODO | — |
| M15 | M15-02 · Implement platform identity/session adapter preserving existing guest upgrades. | TODO | — |
| M15 | M15-03 · Bridge room/seat and focus events to shared contracts. | TODO | — |
| M15 | M15-04 · Embed Deadline scene in shared game shell and avatar/portal actions. | TODO | — |
| M15 | M15-05 · Integrate invitations, privacy and moderation hooks. | TODO | — |
| M15 | M15-06 · Performance, accessibility, migration and rollback. | TODO | — |
| M16 | M16-01 · Audit actual Maid repo vs original master plan and baseline tests. | TODO | — |
| M16 | M16-02 · Bridge Maid identity/session, roles and avatars to platform. | TODO | — |
| M16 | M16-03 · Bridge order lifecycle/shift to shared hospitality engine. | TODO | — |
| M16 | M16-04 · Integrate platform chat/report/block/sanction with existing UX. | TODO | — |
| M16 | M16-05 · Integrate invitation/travel with role/shift cleanup rules. | TODO | — |
| M16 | M16-06 · Run E2E, asset/legal audit, rollback & release gate. | TODO | — |
| M17 | M17-01 · Design silent library theme, seating map, room categories and access UI. | TODO | — |
| M17 | M17-02 · Reuse platform room/seats and Focus Engine without copying code. | TODO | — |
| M17 | M17-03 · Implement quiet mode/limited quick-chat and group study event. | TODO | — |
| M17 | M17-04 · Implement opt-in group session progress and invitations. | TODO | — |
| M17 | M17-05 · Test portal travel, reconnect, quiet moderation and mobile. | TODO | — |
| M18 | M18-01 · Design restaurant scene, dining zones and role-based UI. | TODO | — |
| M18 | M18-02 · Implement virtual table reservation and group check-in. | TODO | — |
| M18 | M18-03 · Implement waiter/chef shifts using Hospitality Engine. | TODO | — |
| M18 | M18-04 · Implement multi-course menu and coordination minigame. | TODO | — |
| M18 | M18-05 · Add dinner invitation, consent, private table policy and report tools. | TODO | — |
| M18 | M18-06 · E2E/load and visual/accessibility acceptance. | TODO | — |
| M19 | M19-01 · Design lounge stage, seating, mocktail counter and event states. | TODO | — |
| M19 | M19-02 · Implement performer/host role and stage queue with operator controls. | TODO | — |
| M19 | M19-03 · Implement virtual mocktail service via Hospitality Engine. | TODO | — |
| M19 | M19-04 · Integrate ticket-free events/RSVP, crowd reactions and moderation throttles. | TODO | — |
| M19 | M19-05 · Implement media licensing gate and optional preapproved streaming adapter. | TODO | — |
| M19 | M19-06 · Test high fan-out, reports, event cancellation and emergency shutdown. | TODO | — |
| M20 | M20-01 · Define product and legal/trust-safety gate for adult dating before code release. | TODO | — |
| M20 | M20-02 · Implement separate dating profile with mutual preferences and no global visibility. | TODO | — |
| M20 | M20-03 · Implement queue/match proposal and atomic two-party acceptance. | TODO | — |
| M20 | M20-04 · Implement timed private date room, safe quick chat, consent and leave action. | TODO | — |
| M20 | M20-05 · Implement mutual-like continuation only after both explicit consent. | TODO | — |
| M20 | M20-06 · Run adversarial tests of deep links, age-gate bypass, stalking and privacy leaks. | TODO | — |
| M20 | M20-07 · Execute operator/real-world safety readiness review and controlled pilot gate. | TODO | — |
| M21 | M21-01 · Create env matrix dev/test/staging/prod and Docker Compose + Caddy config. | TODO | — |
| M21 | M21-02 · Create GitHub Actions lint/typecheck/unit/integration/e2e gates and artifact archival. | TODO | — |
| M21 | M21-03 · Implement structured logs, traces and basic metrics. | TODO | — |
| M21 | M21-04 · Implement health/readiness checks, deploy rollback, graceful socket shutdown. | TODO | — |
| M21 | M21-05 · Configure backup/restore for Postgres and monitor disk space/connection count. | TODO | — |
| M21 | M21-06 · Document cost budgets and thresholds to split services or add Redis. | TODO | — |
| M22 | M22-01 · Build isolated unit/contract/integration/E2E test harness with CI wiring. | TODO | — |
| M22 | M22-02 · Implement concurrency suite for seats, order claims, room cap, booking and match proposals. | TODO | — |
| M22 | M22-03 · Implement security regression tests for CSRF/socket auth/IDOR/rate limit/privacy/ban/age gating. | TODO | — |
| M22 | M22-04 · Implement browser flows: Portal → Deadline → Maid, Library, Restaurant, return, mobile. | TODO | — |
| M22 | M22-05 · Implement load profiles for 100/1000 CCU hypotheses (ramp/stress/soak). | TODO | — |
| M22 | M22-06 · Perform accessibility audits: focus order, keyboard navigation, reduced-motion, color contrast. | TODO | — |
| M23 | M23-01 · Define wave-based release checklist and feature flag inventory with owners. | TODO | — |
| M23 | M23-02 · Create migration release runbook with preflight backup, canary and rollback. | TODO | — |
| M23 | M23-03 · Create incident and safety runbooks (abuse, data leak, room crash, performance). | TODO | — |
| M23 | M23-04 · Run end-to-end staging smoke and release rehearsal. | TODO | — |
| M23 | M23-05 · Request explicit owner approvals and record release decision. | TODO | — |
| M23 | M23-06 · Prepare launch/post-release metrics monitoring and truthful handoff report. | TODO | — |
| M24 | M24-01 · Design original park scene with benches, activity boards and portal destinations. | TODO | — |
| M24 | M24-02 · Implement public park room allocation and lightweight safe interactions. | TODO | — |
| M24 | M24-03 · Implement activity discovery board for events in other worlds. | TODO | — |
| M24 | M24-04 · Implement consenting group invite and world travel from the park. | TODO | — |
| M24 | M24-05 · Test public-space harassment protections, cold-start UX and safe event flow. | TODO | — |
