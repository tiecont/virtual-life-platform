# virtual-life-platform

Continue from the [VirtualLife v1.1 Desktop First master](docs/plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First/START-HERE.md) and [live execution workspace](docs/plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First/.agent-runtime/README.md). Agent 1 coordinates Rust/backend; Agent 2 owns Unity/Desktop/frontend. The [source reconciliation](docs/execution/desktop-first/README.md) preserves Mxx/Nxx/PA/Lodge evidence and separates historical browser checks from future Windows verification. No public/store release is approved.

Use the [current documentation index](docs/README.md) and [clean-checkout procedure](docs/operations/CLEAN-CHECKOUT.md). Historical raw outputs now live in the original private Git revision and an additional authenticated archive; [indexed retrieval](docs/evidence/README.md) preserves their hashes without requiring author artifacts. Git history is retained.

The module notes below retain their Mxx checkpoint scope, including earlier offline-only hosted-CI observations. Use the current architecture map and dated Nxx evidence for later local/hosted outcomes and remaining work.

[Release trains](docs/operations/RELEASE-TRAINS.md) enumerate independently assessed waves,flag ownership and unassigned public responsibilities. `node scripts/verify-release.mjs` audits the offline candidate;all public gates remain closed.

[Offline handoff](docs/agent/OFFLINE-HANDOFF.md) records the final local scope and remaining external gates. `node scripts/ops-watch.mjs` reports current task/world status and measured local observations with explicit unknown retention/costs. No public release or live monitoring is installed.

[Private operational telemetry](docs/operations/OBSERVABILITY.md) provides bounded process-local traces, metrics and sanitized logs. Collection defaults OFF; operator endpoints require an independent secret and stay outside the public edge. External monitoring is not provisioned.

[Deployment recovery](docs/operations/DEPLOYMENT-RECOVERY.md) adds bounded exact-migration/single-owner readiness and irreversible HTTP/socket drain. The disposable local TLS harness can exercise API rollback between explicitly selected images with identical migration manifests. Production rollout and schema rollback remain gated.

[PostgreSQL recovery](docs/operations/POSTGRES-RECOVERY.md) provides authenticated encrypted backups, guarded empty disposable restore and private disk/connection metrics. Run `node --import tsx scripts/backup-smoke.mjs` for the local recovery exercise. Production scheduling, offsite storage, key custody and alert delivery remain unconfigured.

[Resource budgets](docs/operations/RESOURCE-BUDGETS.md) define unpriced spending/resource ceilings and measured investigation thresholds. `pnpm infra:check` rejects over-allocation or silent activation of purchases,Redis or multiple Room owners;no infrastructure is provisioned.

The [isolated quality harness](docs/architecture/TEST-HARNESS.md) uses fresh fixture keys and strict local test DB targets. `node scripts/test-harness-smoke.mjs` verifies parallel seed isolation,external ownership and failed/cancelled child cleanup;hosted CI remains unrun offline.

The [concurrency matrix](docs/architecture/CONCURRENCY-VERIFICATION.md) exercises actual socket capacity/seating and TCP order/booking/matching races. It distinguishes invariant checks from the observed100member admission-burst latency failure;capacity targets still require load measurements.

Run `pnpm test:security` for the [security regression matrix](docs/architecture/SECURITY-REGRESSIONS.md): session/CSRF/socket guards,private projections,current restrictions and closed adult access. Local protocol tests do not establish real eligibility or public release approval.

The [city load profiles](docs/architecture/CITY-LOAD-PROFILES.md) run guarded local ramp/stress/soak experiments with `pnpm bench:city --clients=100 --soak=120` or1000clients. Reports separate socket connections from admitted players and preserve configured capacity limits;read the hypothesis result as well as the command exit.

The [local accessibility audit](docs/architecture/ACCESSIBILITY-AUDIT.md) records keyboard/native-control,focus,reduced-motion,selected contrast and mobile-target evidence,with explicit remaining human/device/legacy review work.

Project repository: `git@github.com:tiecont/virtual-life-platform.git` (current branch delivery is tracked in the vNext handoff). The Virtual City plan is the product specification.

The [shared hospitality engine](docs/architecture/HOSPITALITY.md) provides private policy-gated orders,atomic claims,voluntary shifts,reusable timed courses,transactional completion hooks and service refusal/block/safety recovery. Optional progression consumers and actual local Maid recipe/service-loop integration are verified in their scoped evidence. No public hospitality world is enabled.

The [event engine](docs/architecture/EVENTS-RESERVATIONS.md) provides policy-gated silent schedules, private RSVPs, explicit calendar download, virtual table holds/check-in/FIFO, consented discovery/invitations and scoped controls/private cancellation notices. Concurrent effects use PostgreSQL transactions. The independent local Restaurant consumes these owners; real event worlds remain disabled.

The optional [progression engine](docs/architecture/PROGRESSION.md) stores private source-unique completion grants, cosmetic entitlements and immutable corrections, with server-approved outfits and a private wardrobe. Progression defaults OFF.

The [city portal](docs/architecture/CITY-PORTAL.md) has original schematic art, catalog-only links, a shared private header and explicit travel confirmation. Bounded discovery suggests occupied places and listed events, with one real fallback for a confirmed empty city. Observed counts expire after30seconds; failed sources stay unknown. Discovery creates no rooms.

The supplied [original master plan](MASTER-AGENT-PLAN.md) has a preserved [Mxx progress ledger](docs/agent/PROGRESS.md) and [offline handoff](docs/agent/HANDOFF.md). Guest/registered identity, renewal, private settings and own-data export/delete are available at `/identity`; consent-based friends, contact codes and blocking at `/social`. Actual local world gameplay is described below. Default rollout flags remain OFF; nothing is publicly deployed or published.

A synthetic cafe scene is available at `/worlds/sdk-sandbox` only with explicit local/test flags. It renders real room presence, original starter avatars and seat state with keyboard controls. Server-approved walking supports floor clicks and keyboard destinations around solid tables/walls. See [scene setup and limitations](docs/architecture/SCENES.md); real world rollout remains OFF.

Owner-selected source snapshots support an optional [offline Deadline guest association](docs/architecture/DEADLINE-IDENTITY.md) in `/identity`. It records private consent after proving the existing source cookie,keeps City login separate and supports independent withdrawal. No legacy history is imported;actual local Deadline room/scene acceptance is recorded below. Local activation defaults OFF and is rejected in production.

The [Deadline Cafe](docs/architecture/DEADLINE-WORLD.md) at `/worlds/deadline` adapts the selected source's30seat IDs/40-place configuration into the shared scene/native shell,with private non-pausable timers and reconnect/retry guards. Portal travel,scene attachment and confirmed leave/return preserve City identity/avatar without duplicating membership. Native controls work if graphics fail. Friend offers require recipient consent and separate travel;private reports/block reuse shared safety without automatic sanctions or exposing focus history. Its independent local installation/registry flags default OFF. Local acceptance covers24desktop/mobile browser executions,a separate40Socket API profile and [non-destructive flag/adapter rollback](docs/operations/DEADLINE-LOCAL-RECOVERY.md);these are scoped local observations,not public release or production capacity certification.

The [Maid adapter](docs/architecture/MAID-IDENTITY-ROLES.md) uses the selected separate foundation and shared City session,voluntary shifts and appearance policy. Customer/Maid are gameplay perspectives;an apron or shift never grants moderation privileges. The native `/worlds/maid` room offers30visitor places/24service chairs/6voluntary workers,original Cafe Sakura art,server-validated ingredient controls,approved greetings and shared private report/block controls under independent default-OFF local flags. Source accounts remain separate because that foundation has no session-proof endpoint. [Compatible local recovery](docs/operations/MAID-LOCAL-RECOVERY.md) preserves history and rejects an older strict workflow reader. All six local Maid tasks pass,including actual Portal service,Deadline/City return,moderation,invitation/travel,asset/performance and compatible flag rollback. Cross-module and release operations remain M22/M23;no public release is claimed.

The independently authored [Eternal Library](docs/architecture/LIBRARY.md) has an original reading-room scene,native desks,the shared private focus timer,silent study RSVPs and opt-in group phase counts at `/worlds/library`. Friends can accept an offer for the same public room and separately confirm travel. Its local module installation and world flag both default OFF;production rejects the local activation option. Reading corner and Study alcove share one quiet layout;no books or audio are distributed. All five local Library tasks now pass,including actual Deadline travel/reconnect/private history;see [verification boundaries](docs/architecture/LIBRARY-VERIFICATION.md).

The original [Central Park](docs/architecture/CENTRAL-PARK.md) scene at `/worlds/park` has shared avatars,four benches/eight native bench choices,a garden and an embedded board of authorized other-world schedules. Observed schedules expire after30seconds;travel is confirmed separately. Scoped approved greetings/emotes reuse the shared safety engine and current room socket,with privacy/block/quota guards and same-request retry. Group offers reuse existing consenting friendships and invitation receipts;each friend decides and confirms travel independently. All five [local Park tasks](docs/architecture/PARK-ACCEPTANCE.md) are verified,including private reporting,cross-world block and the new-visitor event flow. Local installation and registry flag default OFF;production rejects the local option. Public release remains gated.

The local [Grand Restaurant](docs/architecture/RESTAURANT.md) at `/worlds/restaurant` has two four-chair tables in a ten-place room,original dining art,Events-owned virtual bookings and voluntary same-room group check-in. Explicit Server/Cook shifts coordinate a three-course dinner through a course-matching kitchen pass and separate customer acknowledgment. Role switches/stops requeue unfinished work;no client score,time or reward authority exists. Invite-only dinner groups require friend/recipient consent,then separate travel and individual joining. Their party membership/counts are restricted;the shared room,chairs and listed schedule remain public. Native withdrawal/block/confidential contact reports are available;All six M18 tasks are locally verified;[acceptance evidence](docs/architecture/RESTAURANT-VERIFICATION.md) includes18browser cases and a bounded16-actor HTTP contention profile. Reproduce the isolated local measurement with `pnpm bench:restaurant`. Installation and its independent flag default OFF;local activation is rejected in production.

The original starter avatar and outfit/action previews are at `/worlds/sdk-sandbox/avatar-lab`. Regenerate its atlas with `pnpm assets:avatars` after building packages; `pnpm assets:check` verifies reproducibility and provenance. Preview actions do not grant gameplay permissions. Public media/release approval remains pending.

The [Moonlight Lounge](docs/architecture/LOUNGE.md) has a local stage,virtual mocktails and moderated audience reactions at `/worlds/lounge`:ten audience chairs,ticket-free RSVP and an anonymous one-performer logical text/visual slot. Current performer/host/moderator grants,FIFO offers,explicit acceptance,server deadlines and independent Stop use shared owners. Seated customers and voluntary bartenders use Hospitality for two original virtual choices. Clap/Star/Wave counts have strict rate bounds and default OFF;current moderators open them and staff can mute/disable independently. The physical stage stays closed to audience movement. Server-owned media clearance requires reviewed source/scope/expiry and matching evidence hashes;the shipped catalog and provider registry are empty. Playback stays disabled and the browser enforces a silent text/visual fallback. All six M19 tasks have [local acceptance evidence](docs/architecture/LOUNGE-VERIFICATION.md),including confidential reports,atomic cancel,independent emergency recovery and a scoped48socket burst;the [runbook](docs/operations/LOUNGE-RUNBOOK.md) keeps rights/coverage/public gates explicit. Local installation and registry activation default OFF;production rejects the local option.

The scene renderer loads through its explicit client entry and uses a versioned immutable atlas cache. [Measured local scene budgets](docs/architecture/SCENE-PERFORMANCE.md) include real browser CPU/network emulation and lifecycle checks; they are not production or physical-device promises.

The [safety threat model and escalation contract](docs/product/SAFETY-THREAT-MODEL.md) and validated policy have gated local chat/report/moderator/sanction workflows. [Safety verification and remaining limits](docs/architecture/SAFETY-VERIFICATION.md) distinguish implemented behavior from pending privacy, retention and staffed public operations. No public social release is approved.

## Local setup

For fully containerized web/API/PostgreSQL with short `vc-*` names, see
[local Docker setup](docs/operations/LOCAL-DOCKER.md). It uses verified images,
private retained data and loopback HTTPS at `https://localhost:3443`.

Linux, Node **26.9.0** (`.node-version`), pnpm **11.28.5**, Docker Engine + Compose v2. Exact dependency pins and pnpm-lock.yaml are committed. The Node pin describes the verified environment, not an LTS claim.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:up
pnpm build:packages
pnpm db:migrate
pnpm dev
```

Open http://127.0.0.1:3300. API liveness is http://127.0.0.1:4300/health/live; readiness `/health/ready` requires compatible schema v1 and every migration bundled in this API build. Run migrations after pulling schema changes. Setup generates an ignored mode-600 `.env` and refuses to overwrite it. `.env.example` documents fields; never commit local credentials. Compose binds only 127.0.0.1:55452 and owns `virtual-city-dev` resources. Change ports/origins consistently if occupied; do not kill unrelated services. API_INTERNAL_URL is a trusted server-side URL, never browser input.

`pnpm db:stop` stops only city development containers and retains data. Re-run `pnpm db:up` to resume. Normal setup/migrations are additive and idempotent. Do not delete volumes or reset a developer/production database as a debugging step. Migration errors intentionally omit secrets; inspect connectivity, schema/journal and checksums locally without printing credentials.

[Environment and TLS setup](docs/operations/ENVIRONMENTS.md) covers dev/test and independent production-mode staging/prod templates. `pnpm infra:smoke` runs a disposable loopback-only Compose/Caddy TLS stack with actual browser cookies and WebSocket guards;it never deploys publicly or touches the retained dev database. Build its local image first as documented. External staging/production,certificate renewal,release and operator approvals remain separate gates.

## Checks

`test:e2e` runs desktop and mobile in separate API/database lifetimes to keep unrelated device cases from sharing a loopback handshake rate budget. API limits remain unchanged. Reports are under `playwright-report/{desktop,mobile}` and failure artifacts under `test-results/{desktop,mobile}`. Run filtered browser cases with `pnpm test:e2e tests/e2e/scene.spec.ts`.

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm plan:status
pnpm bench:rooms
```

`check` runs governance, ESLint/layer boundaries, strict types, unit tests, **real PostgreSQL integration tests**, and builds. Root `test` contains governance/unit tests; `test:integration` is separate and included in `check`. Without TEST_DATABASE_URL, the test harness creates a unique Compose project, random loopback port/password and tmpfs database, then cleans up its resources on success/failure. An explicit TEST_DATABASE_URL is accepted only for a loopback database named `virtual_city_test` or `virtual_city_test_*`. Never supply production credentials. Integration tests use isolated schemas, apply migrations repeatedly/concurrently, exercise HTTP/TCP readiness and transactional rollback. Test process kill -9 may leave a uniquely named container; inspect that project before manual cleanup.

The [CI contract](docs/operations/CI.md) validates browser-spec coverage and a fail-closed `quality` aggregate, with scoped per-spec/device reports. `pnpm ci:browser private` runs one group after a build. N00-01 observed an existing hosted Quality failure at the pinned baseline, separately from successful fresh local core/legacy checks; see the [current index](docs/architecture/CURRENT-STATE.md). No hosted run, branch-policy change or upload was initiated by that audit.

E2E runs built API/web on local :4300/:3300 with isolated PostgreSQL, covering identity/social/safety, actual room scene, keyboard/mobile controls and synthetic travel/fault recovery. It refuses to reuse existing servers. Screenshots are real local artifacts under ignored `artifacts/`; retained checkpoint copies are in docs/agent/evidence, HTML/traces under ignored playwright-report/test-results. No real legacy integration or public release is inferred.

## Workspace and integration

- apps/platform-api: one Nest/Fastify process, Drizzle-owned schema, SQL journal.
- apps/portal-web: Next.js identity/social/safety UI, local cafe scene and travel confirmation, same-origin API rewrite.
- packages/contracts: strict versioned status, identity, social and world wire shapes.
- packages/world-sdk: definitions, guarded lifecycle/registry, recovery and nonpublic travel preparation for labeled local sandboxes.
- packages/config: shared strict TypeScript baseline.
- scripts/check-boundaries.mjs: static import and manifest-cycle enforcement. No cross-app, cross-world or world-to-domain internals. This supplements TypeScript; it is not a sandbox for arbitrary dynamic code.

Legacy repos remain independent at ../deadline-cafe and ../maid-cafe; they are not workspace dependencies. See [inventory](docs/architecture/repository-inventory.md), [compatibility matrix](docs/architecture/legacy-compatibility.md) and [adapter ADR](docs/adr/0001-adapter-first.md). No legacy .env is read or copied.

## CI and release

.github/workflows/quality.yml runs checks + E2E on pull requests with isolated PostgreSQL and seven-day failure artifacts. The remote already exists; N00-01 read its existing Quality result without triggering it. Required-check/branch-policy configuration is unverified and must be checked before a remote merge. vNext adds build/CD preparation; no production/store publication follows from passing local tests. Current CI has read-only repository permission and no deployment step.

Original code-authored starter avatars/scene fixtures have reproducible provenance; no external media is imported or licensed here. Public release, moderation operations, restricted-world access, production migrations, infrastructure and legal/content approvals remain gated. Read AGENTS.md before resuming. Use `pnpm plan:status` and update evidence/checkpoints after each verified slice.

## Identity usage and limits

Open `/identity` to create a browser guest, set a name/avatar preference, edit private presence choices or export/delete your own data. Upgrade optionally with a separate sign-in name/password to return from another browser with the same account ID. Password recovery is not available. Logging out an unregistered guest can lose access; the UI explains this before upgrade/logout. No legacy guest session is automatically imported or merged.

SESSION_SECRET is required (>=32 random characters). setup:local generates it; existing local .env files must be extended with a freshly generated value without committing it. Cookies are signed, HttpOnly and host-only, with Secure + __Host prefix in production. CSRF/Origin checks guard writes, session tokens are hashed in DB, salted scrypt credentials never enter exports/logs. Rates and concurrent KDF work are bounded. Production TLS/proxy/rate/secret rotation and security review remain future gates. No public release is authorized.

## Social consent

Visit `/social`, share your own contact code privately, and accept or decline offers. No global user search or DM. Opposite explicit requests are mutual consent; block removes friendship and pending offers in both directions, and unblock does not restore friendship. Turn off new requests or replace your code to close pending incoming offers. Live account-scoped notifications contain only a refresh signal; the API applies privacy/block policy before returning data.

PUBLIC_SOCKET_ORIGIN is the trusted browser-reachable Socket.IO origin (default local http://127.0.0.1:4300). Configure it with WEB_ORIGIN/edge TLS for deployment; no production configuration is verified here. Authorized world activity now comes from the room/registry/discovery owners. Synthetic fixtures remain labelled separately from actual integrated journeys. See docs/architecture/SOCIAL-API.md and the current evidence index.

## Room Authority

Room commands use authenticated Socket.IO with authoritative capacity, seats, privacy-filtered snapshots/deltas and bounded reconnect grace. The local sandbox scene reflects these server snapshots. One room owner per database schema is enforced with a dedicated PostgreSQL advisory-lock connection; direct/session-affine DB connections are required. Lock loss interrupts rooms and requires process restart. Multiple API room replicas, transaction-pooling proxies and distributed failover are unsupported. See docs/architecture/ROOMS.md and ADR 0009. `pnpm bench:rooms` runs the measured local real-socket profile; results do not establish production capacity.

## World registry

The home page includes an original [pixel city map and accessible catalog list](docs/architecture/CITY-PORTAL.md). Sign in or create a guest to see places approved for your session. Map selections focus matching list details; existing room/travel flows perform admission checks. The map shows no invented occupancy or hidden destinations, and real world rollout remains closed.

Authenticated GET /v1/worlds returns privacy-safe metadata. SDK Sandbox is registered by default and closed until explicit flags; synthetic travel destinations require an additional local opt-in. Optional WORLD_FLAGS_FILE uses config/world-flags.example.json and the current NODE_ENV; SIGHUP reloads flags in the API process. Sandbox activation is denied in production. Invalid files/unknown flags disable worlds; permissions cannot be supplied by flags. All actual world rollout flags remain OFF. See docs/architecture/WORLD-SDK.md for lifecycle, errors, rollback and legacy adapter sequencing, and TRAVEL.md for current handoff contracts.

M08-02 adds a default-OFF development/test-only [ephemeral chat backend](docs/architecture/CHAT-SAFETY.md) with bounded pre-broadcast moderation. Production chat is closed; related local safety workflows are described below, and public safety approval remains pending.

M08-03 adds [confidential local reports](docs/architecture/REPORTS.md), encrypted evidence, assigned-case staff access and a room report/block dialog. A separate stable local evidence key is required; without it reporting truthfully stays unavailable. No staff is provisioned, and production remains closed.

M08-04 adds [temporary sanctions and private appeals](docs/architecture/SANCTIONS.md). Assigned staff can issue bounded reasoned restrictions; committed bans/mutes apply across sessions at world/room/chat guards. Visit `/safety` for your own decisions and private appeal receipts, including while world access is suspended. Moderator UI and incident controls are in M08-05 below. M09 handoff uses the same safety guard. Public/real-world flags remain OFF.

`pnpm setup:safety` creates an ignored local evidence key without overwriting an existing one. `pnpm dev` loads it for local reports; chat and real world/public flags remain independently closed.

M08-05 adds the local [moderation desk](docs/architecture/MODERATION.md) at `/moderation`, independent appeal disposition and durable scoped incident closure/recovery. Real staff grants are not provisioned by setup or any endpoint. The [runbook](docs/operations/MODERATION-RUNBOOK.md) documents the implemented local workflow and remaining operational gates; public activation remains denied.

M09-01/02 adds [travel lifecycle and scoped authorization](docs/architecture/TRAVEL.md): authenticated short-lived intents, own read/cancel, durable retries and trusted one-time internal redemption. Issuing an intent alone never moves or reserves a room; the subsequent coordinator rechecks access/source/safety/capacity at its actual switch.

M09-03 adds the [invitation inbox](docs/architecture/INVITATIONS.md) at `/invitations`: explicit recipient opt-in, current friendship/block checks, short-lived public-world offers and private live refresh. Accept records consent; your room does not change. Hidden/restricted destinations and arbitrary messages are unavailable. Travel confirmation is a separate action.

M09-04 adds authenticated `travel.request` with separate target preparation and bounded holds before an authoritative room switch. Failed preparation retains source; a historical committed receipt never invents live membership. [Travel protocol and failure limits](docs/architecture/TRAVEL.md) describe the verified single-owner scope.

M09-05 adds bounded group offers in `/invitations`, independent consent and explicit partial outcomes. Offline offers expire without holding seats; interrupted sends resume with durable child keys. Groups may split across available rooms when each member independently travels. No whole-group teleport or guaranteed shared seating is implied.

M09-06 adds `/travel` confirmation, own-room read/rejoin and truthful recovery after a lost acknowledgement. Dedicated Synthetic Deadline/Maid/Portal adapters require `LOCAL_TRAVEL_FIXTURES=1` plus dev/test world flags and are rejected in production. They verify the travel protocol without claiming actual legacy integration or gameplay. Pending capabilities never enter URL/storage; real world rollout stays OFF.

Dating has a verified [closed product/policy definition](docs/product/DATING-GATES.md),`pnpm dating:check`,a [synthetic-only encrypted own profile](docs/architecture/DATING-PROFILES.md),[private logical matching](docs/architecture/DATING-MATCHING.md) and a [native timed private DateRoom](docs/architecture/DATING-DATES.md). Positive access requires guarded test configuration;normal users have no real provider/access. Queue/proposal acceptance and conversation consent are separate choices. Exact original sessions,current proof,safe canned messages,independent Leave/private report/block and bounded private lifecycle are verified locally;generic dating rooms/travel are denied. No global identity/presence disclosure or real world/Pixi integration is implied. [Mutual private connections](docs/architecture/DATING-CONTINUATIONS.md) require two explicit kept choices;meeting again needs two fresh source queues,proposal acceptances and Date entries. Independent revoke/block/profile withdrawal ends access. The [local adversarial matrix](docs/architecture/DATING-VERIFICATION.md) covers malformed proof decisions,HTTP/socket/travel denial,stalking/session guards,friends privacy and held private replies after logout. All real approvals remain false;M20-07 real safety readiness/pilot is BLOCKED_EXTERNAL. Local tests cannot establish age assurance or human/legal signoff.

M10-01 records the [readonly focus compatibility audit](docs/architecture/FOCUS-COMPATIBILITY.md). The legacy source has schema/SQL but no live focus service; the city backend now owns the shared timer. Re-run `node scripts/audit-deadline-focus.mjs` before integrating a changed source revision.

M10 adds the [private persistent focus engine](docs/architecture/FOCUS.md), with trusted seat-authorized start,server deadlines,idempotent completion/cancellation,optional policy-gated pause,bounded own world-scoped history and calendar-day SQL summaries using explicit IANA timezones. SDK Sandbox includes the reusable accessible timer and opt-in duration-only completion summary; its local policy is unpausable. Actual Deadline/Library local integration is verified in M15/M17;public rollout remains gated. No productivity surveillance or rewards are introduced.

M11-01 records the [readonly hospitality compatibility audit](docs/architecture/HOSPITALITY-COMPATIBILITY.md). Maid has menu/schema and command contracts but no live order/shift runtime. Run `node scripts/audit-maid-hospitality.mjs` before a changed-source integration; shared hospitality implementation follows this audit.

M13 adds the optional [private progression and server-approved appearance](docs/architecture/PROGRESSION.md). Rewards default disabled; replay-safe completion grants and non-trading entitlements remain private. Open Your wardrobe in the local cafe to preview styles and equip an owned style through server validation. Current-world outfit/shift rules resolve each participant independently with casual fallback. An apron never grants staff authority. Trusted incorrect-reward corrections preserve original history and abuse budgets; operator registration defaults empty and has no public endpoint. Real world rollout remains closed.
