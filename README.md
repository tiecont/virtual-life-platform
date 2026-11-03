# virtual-life-platform

Project repository: `git@github.com:tiecont/virtual-life-platform.git` (configured locally; no push performed). The Virtual City plan is the product specification.

Offline implementation of the supplied [master plan](MASTER-AGENT-PLAN.md). Current features and evidence are in [PROGRESS](docs/agent/PROGRESS.md); resume from [HANDOFF](docs/agent/HANDOFF.md). Guest/registered identity, session renewal, private settings and own-data export/delete are available at `/identity`. Consent-based friends, private contact codes and blocking are available at `/social`. A working identity is not a playable city. All worlds remain closed. Nothing is deployed or published.

A synthetic cafe scene is available at `/worlds/sdk-sandbox` only with explicit local/test flags. It renders real room presence and seat state with keyboard controls. See [scene setup and limitations](docs/architecture/SCENES.md); fixture art is not production avatar art and real world rollout remains OFF.

## Local setup

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

## Checks

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm plan:status
pnpm bench:rooms
```

`check` runs governance, ESLint/layer boundaries, strict types, unit tests, **real PostgreSQL integration tests**, and builds. Root `test` contains governance/unit tests; `test:integration` is separate and included in `check`. Without TEST_DATABASE_URL, the test harness creates a unique Compose project, random loopback port/password and tmpfs database, then cleans up its resources on success/failure. An explicit TEST_DATABASE_URL is accepted only for a loopback database named `virtual_city_test` or `virtual_city_test_*`. Never supply production credentials. Integration tests use isolated schemas, apply migrations repeatedly/concurrently, exercise HTTP/TCP readiness and transactional rollback. Test process kill -9 may leave a uniquely named container; inspect that project before manual cleanup.

E2E runs built API/web on local :4300/:3300 with isolated PostgreSQL, covering real readiness and keyboard/mobile status UI. It refuses to reuse existing servers. Screenshots are real local artifacts under ignored `artifacts/`; HTML/traces under ignored playwright-report/test-results. It verifies the foundation only.

## Workspace and integration

- apps/platform-api: one Nest/Fastify process, Drizzle-owned schema, SQL journal.
- apps/portal-web: Next.js status and identity UI, same-origin API rewrite; worlds/travel are not implemented yet.
- packages/contracts: strict versioned status, identity, social and world wire shapes.
- packages/world-sdk: definitions, guarded lifecycle/registry and a labeled local sandbox; authoritative rooms remain M06.
- packages/config: shared strict TypeScript baseline.
- scripts/check-boundaries.mjs: static import and manifest-cycle enforcement. No cross-app, cross-world or world-to-domain internals. This supplements TypeScript; it is not a sandbox for arbitrary dynamic code.

Legacy repos remain independent at ../deadline-cafe and ../maid-cafe; they are not workspace dependencies. See [inventory](docs/architecture/repository-inventory.md), [compatibility matrix](docs/architecture/legacy-compatibility.md) and [adapter ADR](docs/adr/0001-adapter-first.md). No legacy .env is read or copied.

## CI and release

.github/workflows/quality.yml runs the same checks + E2E on pull requests, with cache, isolated PostgreSQL and seven-day failure artifacts. Per owner instruction, work stays offline: remote PRs, hosted CI and repository required-check settings are not executed here. After creating a remote, configure required status `Quality / quality`, run one failing/passing PR, and verify branch protection before merging. CI has read-only repository permission and no deployment step.

No art/media imported; system fonts and code-native status UI only. Gameplay assets need a provenance manifest in M07. Public release, moderation operations, restricted-world access, production migrations, infrastructure and legal/content approvals remain gated. Read AGENTS.md before resuming. Use `pnpm plan:status` and update evidence/checkpoints after each verified slice.

## Identity usage and limits

Open `/identity` to create a browser guest, set a name/avatar preference, edit private presence choices or export/delete your own data. Upgrade optionally with a separate sign-in name/password to return from another browser with the same account ID. Password recovery is not available. Logging out an unregistered guest can lose access; the UI explains this before upgrade/logout. No legacy guest session is automatically imported or merged.

SESSION_SECRET is required (>=32 random characters). setup:local generates it; existing local .env files must be extended with a freshly generated value without committing it. Cookies are signed, HttpOnly and host-only, with Secure + __Host prefix in production. CSRF/Origin checks guard writes, session tokens are hashed in DB, salted scrypt credentials never enter exports/logs. Rates and concurrent KDF work are bounded. Production TLS/proxy/rate/secret rotation and security review remain future gates. No public release is authorized.

## Social consent

Visit `/social`, share your own contact code privately, and accept or decline offers. No global user search or DM. Opposite explicit requests are mutual consent; block removes friendship and pending offers in both directions, and unblock does not restore friendship. Turn off new requests or replace your code to close pending incoming offers. Live account-scoped notifications contain only a refresh signal; the API applies privacy/block policy before returning data.

PUBLIC_SOCKET_ORIGIN is the trusted browser-reachable Socket.IO origin (default local http://127.0.0.1:4300). Configure it with WEB_ORIGIN/edge TLS in a real deployment; no production configuration is verified here. Current world activity is unavailable until authoritative room/registry integration. Controlled source fixtures in tests are privacy checks, not proof of playable worlds. See docs/architecture/SOCIAL-API.md.

## Room Authority

Room commands use authenticated Socket.IO with authoritative capacity, seats, privacy-filtered snapshots/deltas and bounded reconnect grace. The local sandbox has no browser scene yet. One room owner per database schema is enforced with a dedicated PostgreSQL advisory-lock connection; direct/session-affine DB connections are required. Lock loss interrupts rooms and requires process restart. Multiple API room replicas, transaction-pooling proxies and distributed failover are unsupported. See docs/architecture/ROOMS.md and ADR 0009. `pnpm bench:rooms` runs the measured local real-socket profile; results do not establish production capacity.

## World registry

Authenticated GET /v1/worlds returns privacy-safe metadata. Only SDK Sandbox (local test world) is registered; disabled by default, no playable scene/room. Optional WORLD_FLAGS_FILE uses config/world-flags.example.json and the current NODE_ENV; SIGHUP reloads flags in the API process. Sandbox activation is denied in production. Invalid files/unknown flags disable worlds; permissions cannot be supplied by flags. All actual world rollout flags remain OFF. See docs/architecture/WORLD-SDK.md for lifecycle, errors, rollback and legacy adapter sequencing. Room/travel wire contracts remain M06/M09.
