# VirtualLife

Shared identity, social safety and activities across virtual worlds. The primary
client direction is Windows Unity/URP, with Rust for new gameplay and NestJS for
the control plane and existing room authority. New native routes are default-off.

## Development

Use Node 26.9.x, pnpm 11.28.5 and the Rust toolchain pinned in rust-toolchain.toml.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:up
pnpm db:migrate
pnpm dev
```

`pnpm check` runs policy, architecture, lint, types, unit/integration tests and
builds. `pnpm ci:browser` runs the CI browser groups. PostgreSQL tests use owned,
disposable databases through scripts/with-test-db.mjs. Git history must be
available for frozen migration and legacy compatibility checks.

Linux playable prototype work uses the existing Unity project and the same native
backend. See [native runtime development](apps/game-runtime/README.md) for actual
Pet Arena process tests and [Unity validation](apps/unity-client/README.md) for
the separately required licensed Editor/player checks.

## Source Layout

```text
apps/
  platform-api/src/
    app.ts, main.ts, worker.ts     composition and process entrypoints
    features/<feature>/modules/<module>/
      domain/                     pure rules and state transitions
      application/                use cases and owner services
      infrastructure/             storage, encryption and external adapters
      presentation/               HTTP and socket adapters
    shared/                       configuration, database journal, common utilities
  portal-web/, admin-web/          Next.js routes and client features
  game-runtime/                   Rust runtime deployment entrypoint
  mobile/                         conditional native client
crates/                           Rust gameplay, transport and persistence modules
packages/                         public contracts, UI, renderers and world packages
contracts/                        protocol definitions and generated client bindings
tests/                            integration, browser, security and compatibility tests
config/, infra/, scripts/          runtime policy, deployment and verification tooling
```

Only populated layers are present. API public entry files and SQL ownership are
enforced by config/architecture/. Cross-feature consumers use those entry files;
world packages cannot import another world's persistence or SQL drivers.

## Work Plan

config/development-plan.json is the sole active backlog. Run `pnpm plan:status`
for ready tasks and progress. Any ready task may proceed with the same agent;
there are no reservations or mandatory independent-agent handoffs. Dependency
edges describe needed implementations. Qualification dependencies describe later
hardware, rights, signing or release acceptance and do not block implementation.

Historical completion is preserved with its original source revision. It is not
a fresh verification of the refactored checkout. Previous plans, journals and
reviews are available in Git at `archive/pre-cleanup-2026-11-10`.

Public rollout, production operations, restricted worlds, content clearance and
signing require their existing explicit approvals. Merging source does not turn
those features on.
