# Virtual City

Offline implementation of the supplied [master plan](MASTER-AGENT-PLAN.md). Current features and evidence are in [PROGRESS](docs/agent/PROGRESS.md); resume from [HANDOFF](docs/agent/HANDOFF.md). A status page is a foundation slice, not a playable city. All worlds remain closed. Nothing is deployed or published.

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

Open http://127.0.0.1:3300. API liveness is http://127.0.0.1:4300/health/live; readiness `/health/ready` requires the migrated schema v1. Setup generates an ignored mode-600 `.env` and refuses to overwrite it. `.env.example` documents fields; never commit local credentials. Compose binds only 127.0.0.1:55452 and owns `virtual-city-dev` resources. Change ports/origins consistently if occupied; do not kill unrelated services. API_INTERNAL_URL is a trusted server-side URL, never browser input.

`pnpm db:stop` stops only city development containers and retains data. Re-run `pnpm db:up` to resume. Normal setup/migrations are additive and idempotent. Do not delete volumes or reset a developer/production database as a debugging step. Migration errors intentionally omit secrets; inspect connectivity, schema/journal and checksums locally without printing credentials.

## Checks

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm plan:status
```

`check` runs governance, ESLint/layer boundaries, strict types, unit tests, **real PostgreSQL integration tests**, and builds. Root `test` contains governance/unit tests; `test:integration` is separate and included in `check`. Without TEST_DATABASE_URL, the test harness creates a unique Compose project, random loopback port/password and tmpfs database, then cleans up its resources on success/failure. An explicit TEST_DATABASE_URL is accepted only for a loopback database named `virtual_city_test` or `virtual_city_test_*`. Never supply production credentials. Integration tests use isolated schemas, apply migrations repeatedly/concurrently, exercise HTTP/TCP readiness and transactional rollback. Test process kill -9 may leave a uniquely named container; inspect that project before manual cleanup.

E2E runs built API/web on local :4300/:3300 with isolated PostgreSQL, covering real readiness and keyboard/mobile status UI. It refuses to reuse existing servers. Screenshots are real local artifacts under ignored `artifacts/`; HTML/traces under ignored playwright-report/test-results. It verifies the foundation only.

## Workspace and integration

- apps/platform-api: one Nest/Fastify process, Drizzle-owned schema, SQL journal.
- apps/portal-web: Next.js status page; no identity/travel UI until dependencies unlock.
- packages/contracts: strict versioned foundation status/error wire shapes.
- packages/world-sdk: version compatibility only; M05 owns world lifecycle/registry.
- packages/config: shared strict TypeScript baseline.
- scripts/check-boundaries.mjs: static import and manifest-cycle enforcement. No cross-app, cross-world or world-to-domain internals. This supplements TypeScript; it is not a sandbox for arbitrary dynamic code.

Legacy repos remain independent at ../deadline-cafe and ../maid-cafe; they are not workspace dependencies. See [inventory](docs/architecture/repository-inventory.md), [compatibility matrix](docs/architecture/legacy-compatibility.md) and [adapter ADR](docs/adr/0001-adapter-first.md). No legacy .env is read or copied.

## CI and release

.github/workflows/quality.yml runs the same checks + E2E on pull requests, with cache, isolated PostgreSQL and seven-day failure artifacts. Per owner instruction, work stays offline: remote PRs, hosted CI and repository required-check settings are not executed here. After creating a remote, configure required status `Quality / quality`, run one failing/passing PR, and verify branch protection before merging. CI has read-only repository permission and no deployment step.

No art/media imported; system fonts and code-native status UI only. Gameplay assets need a provenance manifest in M07. Public release, moderation operations, restricted-world access, production migrations, infrastructure and legal/content approvals remain gated. Read AGENTS.md before resuming. Use `pnpm plan:status` and update evidence/checkpoints after each verified slice.
