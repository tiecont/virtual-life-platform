# virtual-life-platform — MASTER AGENT ORCHESTRATOR PLAN

> Current owner policy 2026-11-09: web/server/platform first, native mobile later. See the vNext revision 2.4 and its manifest/state. Physical Android/APK/AVD/Mac/iPhone gates do not block platform web features; responsive browser and supported-client compatibility gates remain. Preserve historical ledgers and evidence.

> **Continuation (2026-11-05):** New work follows the [vNext 2.1 Android-first master](docs/plans/platform-vnext/MASTER-AGENT-PLAN.md), [Nxx state](docs/plans/platform-vnext/state/task-state.json) and [current architecture/evidence index](docs/architecture/CURRENT-STATE.md). This original M00–M24 product/dependency specification and its historical evidence are preserved. vNext adds mobile/Kubernetes scope; public, restricted-world and production-data gates still apply. The old offline handoff is a completed scope checkpoint, not a stop on authorized vNext work.

> **Version:** 1.0 | **Language:** Vietnamese | **Status:** PLAN ONLY — NOT IMPLEMENTED  
> **Role:** Master orchestration contract for a coding agent.  
> **Mission:** Từ hai dự án Deadline Cafe và Maid Cafe Social đang được triển khai, phát triển **Virtual City** — nền tảng thế giới ảo 2D chạy browser với shared identity, world travel, social safety và các world có liên kết; không làm mất công trình hiện hữu.

## 0. ONE-PROMPT ENTRYPOINT — ĐỌC TRƯỚC MỌI THỨ

Sau khi toàn bộ plan pack nằm trong repo, người dùng chỉ cần yêu cầu:

> **Read `MASTER-AGENT-PLAN.md` and execute the Virtual City implementation plan. Audit existing code first, follow the dependency DAG and module plans, implement and verify one vertical slice at a time, update checkpoints and continue to the next unblocked task. Never claim unverified success.**

Điều này là **một lệnh điều phối**, không phải một đảm bảo bất kỳ runtime/agent nào cũng có thể tự chạy không giới hạn. Khi context/usage/quyền truy cập hết, agent phải checkpoint và phiên sau chỉ cần cùng prompt trên.

**TRÁCH NHIỆM AGENT:** đọc code trước khi sửa; không tự suy diễn project cũ có code hoàn chỉnh (chỉ có hai plan reference); chủ động implement những task có điều kiện đủ; report test thật; dừng đúng các operation cần người chủ duyệt.

## 1. PRODUCT CONTRACT

### 1.1 North Star

Một tài khoản có thể vào **City Portal**, di chuyển giữa các world mà không đăng nhập lại, dùng shared avatar và những mối quan hệ xã hội có đồng thuận; mỗi world có gameplay riêng. Giá trị cốt lõi: *cùng hiện diện → cùng hoạt động → gặp lại → khám phá world khác*.

### 1.2 World inventory và trạng thái

| World | Nguồn đầu vào | MVP functionality | Rollout |
|---|---|---|---|
| Deadline Cafe | `reference/DEADLINE-CAFE-ORIGINAL-MASTER-PLAN.md` + repo thực tế sau audit | seats, presence, focus, invite, statistics | W2 |
| Maid Cafe Social | `reference/MAID-CAFE-ORIGINAL-MASTER-PLAN.md` + repo thực tế sau audit | customer/maid, order, shift, chat & moderation | W2 |
| City Portal / Central Park | Platform module | world map, discovery, safe social gathering | W1–W3 |
| Eternal Library | New world | silent seating, study rooms, focus, events | W3 |
| Grand Restaurant | New world | reservation, party dining, staff, service loop | W4 |
| Moonlight Lounge | New world | audience, stage events, mocktail menu, performer controls | W5 gated |
| Heart Garden / Blind Date | New 18+ isolated product | consent-driven timed dates & mutual match | W6 restricted, **not public by default** |

**Non-goals for first integrated public beta:** user-generated uploaded worlds, voice/video/DM, real-world alcohol sales, gambling, real-money economy, copyrighted film/music distribution, mobile native apps, AI companions, Kubernetes/Kafka/Elasticsearch, complex full-city continuous movement, public dating without trust/safety approval.

### 1.3 Product principles

- One identity, **separate context-specific privacy controls**. Shared login != shared disclosure.
- Worlds are **apps/scene modules with explicit contracts**; no world imports another world's database repository.
- Realtime only where it changes user experience; focus timer computed locally from trusted timestamps, not tick broadcasts.
- An empty city is a bad product: lobby routes users to occupied rooms / scheduled events; room limit sized for interaction.
- Accessible, keyboard-friendly alternatives for canvas interactions; mobile support from W1.
- Safety is a release gate, not a postponed backlog item.
- MVP uses visual assets created/owned/licensed for project, plus manifest/provenance; don't copy characters, music or artwork from existing IP.

## 2. MANDATORY PREFLIGHT: AUDIT BEFORE REFACTOR

Execute `AUD-01..AUD-08` before integrating existing apps. If existing repos cannot be accessed, mark integration BLOCKED_EXTERNAL, record explicitly provisional assumptions in ADR, and advance independent platform skeleton tasks (M00–M14 except steps requiring confirmed legacy interfaces).

| ID | Required action | Output & verification |
|---|---|---|
| AUD-01 | Identify actual source repos/branches, dirty changes, licenses | `docs/architecture/repository-inventory.md`; no destructive operations |
| AUD-02 | Identify languages, frameworks, package managers, versions, build scripts | evidence with real commands, no fabricated versions |
| AUD-03 | Map identity, session/cookie scopes, auth flow | current vs target compatibility matrix |
| AUD-04 | Map DB schemas, migrations and data retention | migration strategy / rollback, backup requirements |
| AUD-05 | Map Socket.IO/raw WS protocols, room and seat ownership semantics | contract gaps and possible bridges |
| AUD-06 | Map Pixi/scene assets, render pipelines and license provenance | asset reusable/replace table |
| AUD-07 | Run available lint/typecheck/tests/build; baseline known failures | actual logs, SHA, exit codes |
| AUD-08 | Choose adapter-first vs code migration with ADR | ADR, risk and rollback plan |

**Golden rule:** no mass replacement of existing implementations with new scaffolds; integration via compatible facade/adapter before extracting reusable modules. Preserve original repos and histories if distinct.

## 3. RUNTIME ARCHITECTURE — TARGET, NOT A FORCED REWRITE

```text
                        Next.js Portal / Shared Game Shell
                          + PixiJS Scenes + Zustand
                                    |
                               HTTPS / Socket.IO
                                    |
                         NestJS Modular Monolith
     +----------------------+----------------------+--------------------+
     | PLATFORM CORE        | SHARED ENGINES       | WORLD ADAPTERS     |
     | identity / privacy   | focus engine         | deadline-cafe      |
     | social graph         | hospitality          | maid-cafe          |
     | world registry       | reservations/events  | library            |
     | room/presence        | avatar/scene SDK     | restaurant         |
     | cross-world invites  | notifications        | lounge / dating    |
     | moderation           | safety hooks         |                    |
     +----------------------+----------------------+--------------------+
                          PostgreSQL; Redis when justified
```

**Baseline:** TypeScript monorepo (pnpm), Next.js, PixiJS, NestJS/Fastify, Socket.IO, PostgreSQL, Zod or equivalent schemas, Docker Compose, Caddy, GitHub Actions, OpenTelemetry. Existing viable choices (ORM/test runner) should survive audit; avoid needless ORM rewrites. Initial one-instance room owner in memory. Multi-instance later requires **explicit room ownership/fencing**, not merely Redis Pub/Sub; versioned snapshot/resync on reconnect. Clear command, event and persistent data boundaries.

### 3.1 Namespace/ownership invariants

- Platform: accounts, safety, world catalog, friendships, invitations, notifications, visibility flags.
- Shared engines: generalized reusable state machines, no knowledge of a specific world UI.
- World: rules, art/maps, NPC, quests, world-scoped progression.
- Security: authoritative server checks identity + membership + world permission on *every* command; users never choose server-side authority via client input.
- Persistence: DB transactions/idempotency for orders, reservations and rewards; no critical state stored solely in Socket.IO adapter.
- Observability: room lifecycle, errors, moderation events, latency, active connections, memory; strip PII/secrets from logs.

### 3.2 Cross-world travel contract

1. User clicks portal/invite → server validates access and target capacity.
2. Server issues **short-lived, scoped, one-time travel intent** bound to user, destination, expiry, requestId.
3. Target room confirms admission before source room releases player; if timeout, remain in source or return to safe lobby.
4. Broadcast room leave/join with versioned snapshots; old membership invalidated after confirmed transition.
5. Preserve identity + avatar, but share only **authorized** social/presence data; World Dating must support invisible-to-friends presence.
6. Request duplicate/retry must be idempotent. No arbitrary redirect/open join to private/age-gated rooms.

### 3.3 Shared platform APIs — draft contract

- `GET /v1/worlds`, `GET /v1/worlds/:slug/rooms`, `POST /v1/travel-intents`
- `POST /v1/friends/requests`, `POST /v1/friends/:id/accept`, `POST /v1/blocks`
- `POST /v1/invitations`, `POST /v1/invitations/:id/respond`
- `POST /v1/reports`, `GET /v1/me/privacy`, `PATCH /v1/me/privacy`
- Socket.IO: `room.join`, `room.snapshot`, `room.delta`, `presence.changed`, `travel.request`, `travel.accepted`, `travel.failed`, `invitation.received`
- Every mutation requires auth/guest session, access policy, idempotency, rate limit; all schemas versioned in `packages/contracts`.

**Never silently invent final contracts:** `plans/05-world-sdk-registry.md`, `plans/06-room-realtime.md`, `plans/09-invitations-travel.md` define ownership; implement contract tests before app integration. Document breaking changes and emit adapters for legacy plans.

## 4. MODULAR AGENT PLAN INDEX — AUTHORITATIVE DAG INPUT

Run a module only after dependencies VERIFIED. `Gate` indicates when that module becomes necessary; gated safety modules can be implemented without public release.

| ID | File | Depends on | Gate |
|---|---|---|---|
| M00 | [`plans/00-product-governance.md`](plans/00-product-governance.md) | audit | W0 |
| M01 | [`plans/01-repository-foundation.md`](plans/01-repository-foundation.md) | M00 | W0 |
| M02 | [`plans/02-architecture-boundaries.md`](plans/02-architecture-boundaries.md) | M00, M01 | W0 |
| M03 | [`plans/03-identity-privacy.md`](plans/03-identity-privacy.md) | M02 | W1 |
| M04 | [`plans/04-social-graph.md`](plans/04-social-graph.md) | M03 | W1 |
| M05 | [`plans/05-world-sdk-registry.md`](plans/05-world-sdk-registry.md) | M02, M03 | W1 |
| M06 | [`plans/06-room-realtime.md`](plans/06-room-realtime.md) | M03, M05 | W1 |
| M07 | [`plans/07-scene-avatar-assets.md`](plans/07-scene-avatar-assets.md) | M05, M06 | W1 |
| M08 | [`plans/08-safety-moderation.md`](plans/08-safety-moderation.md) | M03, M04, M06 | W1 mandatory |
| M09 | [`plans/09-invitations-travel.md`](plans/09-invitations-travel.md) | M04, M05, M06, M08 | W1 |
| M10 | [`plans/10-focus-engine.md`](plans/10-focus-engine.md) | M02, M03 | W2 |
| M11 | [`plans/11-hospitality-engine.md`](plans/11-hospitality-engine.md) | M02, M06, M08 | W2 |
| M12 | [`plans/12-events-reservations.md`](plans/12-events-reservations.md) | M04, M05, M06, M08 | W3 |
| M13 | [`plans/13-progression-economy.md`](plans/13-progression-economy.md) | M03, M08 | W3 optional for baseline |
| M14 | [`plans/14-city-portal-discovery.md`](plans/14-city-portal-discovery.md) | M05, M07, M09 | W1 |
| M15 | [`plans/15-deadline-integration.md`](plans/15-deadline-integration.md) | audit, M06, M07, M09, M10, M14 | W2 |
| M16 | [`plans/16-maid-integration.md`](plans/16-maid-integration.md) | audit, M06, M07, M08, M09, M11, M14 | W2 |
| M17 | [`plans/17-library-world.md`](plans/17-library-world.md) | M10, M12, M14 | W3 |
| M18 | [`plans/18-restaurant-world.md`](plans/18-restaurant-world.md) | M11, M12, M14 | W4 |
| M19 | [`plans/19-lounge-world.md`](plans/19-lounge-world.md) | M11, M12, M14, M08 | W5 restricted |
| M20 | [`plans/20-dating-world.md`](plans/20-dating-world.md) | M03, M04, M06, M08, M09, M12, M14 | W6 strictly gated |
| M21 | [`plans/21-infra-observability.md`](plans/21-infra-observability.md) | M01, M02 | W1 continuously |
| M22 | [`plans/22-testing-security-performance.md`](plans/22-testing-security-performance.md) | M06, M08, M21 | continuous |
| M23 | [`plans/23-release-operations.md`](plans/23-release-operations.md) | M15, M16, M21, M22 | W2–W6 |
| M24 | [`plans/24-central-park-world.md`](plans/24-central-park-world.md) | M04, M05, M06, M07, M08, M09, M14 | W3 |

Each module plan defines its exact outputs, tasks, tests, failure cases, prerequisites, gates and expected evidence. Missing files = blocker; **never mark complete because a plan exists**.

## 5. RELEASE WAVES / IMPLEMENTATION ORDER

- **W0 | Inventory & Foundation:** AUD-01..08; M00–M02; establish agent evidence and build baseline. No migration without audit.
- **W1 | City Vertical Slice:** M03–M09, M14 + minimal M21/M22. One portal, one account, safe room join, visible avatars, cross-world transfer mock destinations. Verify privacy, moderation, reconnection. Synthetic world/scene for testing is allowed but must be clearly labeled.
- **W2 | First Integrated Beta:** M10–M11, M15–M16, M23. Real Deadline and Maid worlds travel both directions, identity persists, correct rules and chat safety; feature flags and rollback. **First public beta candidate** subject to acceptance.
- **W3 | Learn & Gather:** M12, optional M13, M17, M24 (Central Park) + event discovery. Library shares focus engine; minimize empty rooms.
- **W4 | Hospitality Expansion:** M18. Restaurant reuses service/order and adds reservations; no cloning Maid code.
- **W5 | Events & Lounge:** M19. Start **silent/text-only stage events / licensed or original media only**; operator moderation on duty. Public launch by explicit approval.
- **W6 | Adult Dating Pilot:** M20. **Separate dating consent/privacy data**, 18+ access controls, matchmaking integrity, anti-harassment and trust/safety operational owner; feature flag OFF by default and explicit legal + operator gate. Implementing code != public release.

**Milestone release check:** W1/W2 must not wait for W5/W6. Higher waves must not delay a coherent two-world beta. Every wave may introduce a new world via configuration flag OFF until verified.

## 6. EXECUTION ALGORITHM — AUTONOMOUS BUT VERIFIABLE

```
BOOT:
  inspect git tree/status + existing repos + actual installed tooling
  read MASTER + docs/agent/*.md + current task module plan
  audit if AUD-01..08 not evidenced
LOOP:
  choose lowest-ID ready task whose dependencies VERIFIED
  write acceptance test(s) or a reproducible verification scenario
  implement smallest end-to-end vertical slice
  run tests + lint + typecheck + build relevant to change
  fix broken checks or record exact reproducible blocker
  record evidence (command, exit code, environment, commit SHA)
  update PROGRESS / DECISIONS / BLOCKERS / HANDOFF
  commit or create PR if authorized and safe; keep branch buildable
  proceed with next unblocked task
STOP:
  no task ready; permissions/credentials needed; release owner gate;
  context/usage exhausted; report current status & resume exact command
```

**Do not spawn parallel agents unless the environment supports it.** Plan files are delegation boundaries, not proof that independent agents exist. If multiple agents are available: reserve domain/file ownership, separate branches, use PR + CI and merge sequentially; avoid concurrent DB schema rewrites.

### 6.1 Task states

`TODO` / `IN_PROGRESS` / `VERIFIED` / `BLOCKED_TECHNICAL` / `BLOCKED_EXTERNAL` / `DEFERRED_APPROVED`.

Evidence fields: taskID, commit SHA or workspace diff, commands and actual exit codes, dated environment, test report paths, screenshot references when appropriate, migration status, risk/open issues, next exact action. No fabricated screenshots, benchmarks or passing logs. If a test is skipped, report it explicitly and do not claim that gate met.

### 6.2 Failure recovery

- Broken existing tests: capture baseline and note if pre-existing; never hide failure.
- Schema migration: back up, version, test up/down where applicable; destructive PROD actions require approval.
- Room crash: clients resync snapshot; in-memory-only state may be lost and must display truthful recovery state.
- CI failure: fix or block, do not greenwash.
- Tool unavailable: persist work and named blocker; continue another independent unblocked task.
- Visual placeholders: label as such, cannot satisfy production art DoD.

### 6.3 Long-run continuation

Read `docs/agent/HANDOFF.md` at every new session. Resume from `Next exact action`; reread the specific module and evidence, not just chat summary. No hidden dependency on conversation memory.

## 7. CROSS-MODULE ACCEPTANCE — MUST VERIFY

| Test ID | Scenario | Expected |
|---|---|---|
| X01 | Guest joins Portal → Deadline → Maid → Portal | consistent identity and avatar without login loop |
| X02 | Room full + simultaneous join | authoritative capacity never exceeded |
| X03 | Concurrent seat claims by many users | one authoritative owner per seat |
| X04 | Concurrent Maid claim of a single order | exactly one assigned Maid; no double rewards |
| X05 | Disconnect/reconnect while moving worlds | never simultaneously active in two world rooms; resync or safe fallback |
| X06 | Guest invites friend from Deadline to Maid | scoped expiry; no bypass of private/age-gated room rules |
| X07 | A blocks B in Maid then B goes to another world | block enforced platform-wide for contact and invitations |
| X08 | Chat moderation rejects abuse and bypass attempts | no unsafe broadcast prior to required validation |
| X09 | Dating world presence incognito | no involuntary reveal in global presence, friends feed or invites |
| X10 | Underage/unverified account attempts dating | rejected by server on HTTP, socket, travel and deep link |
| X11 | Restaurant booking/race cancellation | capacity, reservation TTL & idempotent transitions consistent |
| X12 | Focus session in Deadline & Library | same trusted timer semantics; user stats correctly scoped |
| X13 | Bot spams chat/order/invites | rate limiting enforced server-side; audit trace |
| X14 | Server restart in active room | clear recovery or interruption, no phantom successful order/session |
| X15 | Run accessibility on game shell | keyboard alternative and text descriptions for core actions |
| X16 | Mobile browser | readable/responsive, basic interactions work and no blocked viewport |
| X17 | No licensed media available for Lounge | no unlicensed music/video live playback; fallback text/visual event |
| X18 | Public release gate | secret scan, backups/restores, monitoring, security review, moderator coverage all evidenced |

Add test cases from individual modules and legacy references; these are minimum, not exhaustive. Load objectives are **hypotheses** until k6/Artillery benchmarks document hardware, profile, results and p95 latency.

## 8. REPOSITORY TARGET (ADAPT AFTER AUDIT)

```text
virtual-city/
  AGENTS.md
  MASTER-AGENT-PLAN.md
  plans/*.md
  reference/*.md
  docs/agent/{PROGRESS,DECISIONS,BLOCKERS,HANDOFF}.md
  docs/adr/*.md
  docs/architecture/*.md
  apps/portal-web/
  apps/game-web/
  apps/platform-api/
  packages/contracts/
  packages/world-sdk/
  packages/pixi-scene/
  packages/avatar/
  domains/platform/{identity,social,rooms,presence,invites,moderation}/
  domains/engines/{focus,hospitality,events,progression}/
  worlds/{deadline,maid,library,restaurant,lounge,dating}/
  infra/{compose,caddy,monitoring}/
  tests/{e2e,contract,load,security}/
```

If the user's repos already have valid structure, **do not rename everything immediately**. Implement adapters and document the planned shape. No requirement for separate service/process per folder. Do not fabricate scripts that don't exist; write scripts before reporting they pass.

## 9. SECURITY, PRIVACY, LEGAL, CONTENT AND RELEASE NON-NEGOTIABLES

1. `secure`, `HttpOnly` session cookies in production, CSRF protection where relevant, socket origin and authorization validation, session rotation, TTL, rate limits and scoped RBAC.
2. Moderation policy for public text/chat/emotes plus report, block, mute, moderator actions and immutable/append-only audit trail where appropriate; operational coverage required for high-risk world public launches.
3. Data minimization; deletion/export support by privacy policy; per-world visibility; confidential block/report records. No full chat logging by default; limited retention per policy.
4. **Dating:** separate private profile and opt-in mutual matching; 18+ and effective access controls. Never leak dating preferences/presence to other worlds. No pay-for-affection or compelled interaction; no public launch without human review of safeguards and applicable legal obligations.
5. **Lounge:** no unlicensed songs/audio/video or rebroadcast of third-party streams; if not cleared, operate text/visual-only mocktail lounge initially. Any age-restricted service separated and gated.
6. **Library:** do not distribute full copyrighted books without rights. Begin with user-owned notes, public-domain/licensed material and silent study rooms.
7. User-uploaded photos/voice/video/private DM/monetization disabled until separate safety design and approval.
8. Fraud/abuse: request replay, concurrency, privilege escalation, spam/harassment, bot farms, payment-free virtual rewards; validate every action server-side.
9. Secrets never committed, production backups encrypted and restore tested, destructive changes reviewed, owner approves purchases/deploy/public release.
10. Compliance with applicable law needs human/legal review; plans cannot certify compliance or identity/age verification efficacy.

## 10. RELEASE GATES

### W1 city skeleton VERIFIED when
- Portal, one mock scene, lobby/room presence, join/leave, reconnect and safe moderation hooks work end-to-end.
- Shared identity and avatar persist; tests demonstrate privacy and socket guardrails.
- Core scripts (`lint`, `typecheck`, `test`, `build`) exist and pass for changed packages; limitations disclosed.

### W2 initial two-world beta VERIFIED when
- Deadline and Maid are **actual integrated playable worlds**, not links to unrelated demos.
- Travel both directions preserves session and social policies; no duplicated session/seat/order state.
- Safety/report/block/moderator operation is functional; migration/rollback validated; performance and backup restore tested.
- Operator authorization for production/public access obtained. If absent: `TECHNICALLY_READY_NOT_LIVE`, not `RELEASED`.

### W3–W6 world acceptance
- Each world meets its own DoD + shared security, accessibility, performance, monitoring and content rights gate.
- Date/Lounge stricter operator/age/content review always applies; feature flag stays OFF pending it.

## 11. EXIT CONDITION & REQUIRED FINAL REPORT

Never report “Virtual City completed” if one of the requested worlds remains unimplemented or gated. Say clearly **which waves are VERIFIED, which are BLOCKED/NOT STARTED and whether PUBLIC_RELEASE actually occurred**. A truthful result can be “W2 public beta ready; W3–W6 not finished” rather than pretending the full platform exists.

Final output after each run:

```
Repository / branch / commit:
Current Wave + Task ID:
Implemented features/files:
Tests run and actual outcome (commands, exit codes, environment):
Database changes and migrations:
Visual/asset provenance:
Safety & accessibility checks:
Blocked/external approvals:
Known risks:
Next exact action:
```

Read the linked plans now. Execute `AUD-01` first unless its evidence already exists and is current.
