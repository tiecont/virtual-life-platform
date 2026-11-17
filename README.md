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

After building the Linux development player and native backend, `pnpm play:linux`
opens Pet Arena with disposable loopback Nest/Rust/PostgreSQL services. The
launcher prints the path to a private local login file. Closing the player
removes those services and the disposable match. See the Unity README for build
prerequisites and controls.

## Local UI Preview

Run the existing server runtimes together on an isolated local database:

```sh
pnpm preview:prepare
pnpm preview:up
pnpm preview:status
pnpm preview:test
```

The first build includes Node and Rust dependencies. Open the Aetheria VI/EN
preview at http://127.0.0.1:4900, the portal at http://127.0.0.1:4800 and the
private console at http://127.0.0.1:4900/admin. The API is on loopback port 4700
and the native foundation on 4600. PostgreSQL, migrations, API, durable worker,
both Next.js apps and the Rust foundation share `infra/compose/preview.yml`.
Desktop/mobile clients are separate builds, not server processes. Native liveness
returns 200; readiness intentionally returns 503 while gameplay is disabled.
The optional `preview:test` browser check requires Playwright Chromium installed
locally (`pnpm exec playwright install chromium`).

This stack uses Next development mode because product routes and concept scenes
remain unavailable in production. Registration and email acceptance remain
unimplemented; native gameplay stays disabled. The worker's local policy accepts
no reward kinds and awards no XP. Operator accounts still require the existing
out-of-band bootstrap CLI and MFA; no default operator credentials are created.

`preview:prepare` creates independent random keys in ignored, private
`artifacts/local-preview/runtime.env` and preserves them on reruns. Edit only its
port values before starting if the defaults are occupied. Use `preview:logs` for
diagnostics, `preview:stop` to pause or `preview:down` to remove this stack's
containers/network while retaining its database volume. Keep its original
environment for that database; do not reuse production data or credentials.
The separate existing `vc-*` production-artifact stack is unaffected.

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

The [V3.1 candidate specification](specs/pet-arena/v3.1.md) adds six Standard S
Pets to the canonical240 draft catalog. Validate with
`python3 scripts/validate-pet-v31.py`; no v3 runtime is enabled.
The offline acquisition projection can be imported into an owned disposable DB
with `node scripts/with-test-db.mjs node --import tsx scripts/pet-acquisition-draft-seed.mjs`
after building packages. Migration 0053 stores 240 draft identities, taxonomy and
acquisition rules; it leaves v2 drafts intact and creates no ownership, purchases
or published content. The importer verifies all candidate manifest hashes and
the actual upstream 114 identities. It does not import combat, art or lore payloads.


Pet Arena expansion contracts and the original 19-element/114-species design
catalog are in [the v2 specification](specs/pet-arena/v2.md) and
[Pet catalog](specs/pet-arena/catalog.md). These are draft content designs, not
implemented v2 gameplay or approved production art. Validate references with
`node scripts/pet-design-check.mjs`.

[Battle art direction](specs/pet-arena/art-direction.md) defines all 19 element
styles and the first six hero/boss asset briefs. After building packages,
`node --import tsx scripts/pet-asset-check.mjs` reports explicit missing art and
animation bindings. A valid draft preflight grants no rights or production status.

The first v2 persistence slice stores unpublished metadata only. After building
packages, seed an owned disposable PostgreSQL database with
`node scripts/with-test-db.mjs node --import tsx scripts/pet-content-draft-seed.mjs`.
It uses migration 0051 and refuses non-test database URLs. It grants no runtime
access, publishes no content and creates no owned player Pets.

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

## Aetheria: Soulbound prelaunch

The public presentation uses the existing `apps/admin-web` runtime. The private
operator login is now `/admin`; `/api/admin/*` retains the existing Nest identity,
session and CSRF boundary. Update operator bookmarks and health probes to
`/admin`. `ADMIN_ORIGIN` remains an origin (no `/admin` path).

For a local, development-only homepage preview, run
`AETHERIA_SITE_PREVIEW=1 pnpm --filter @virtual-city/admin-web dev`.
Vietnamese is the default; `?lang=en` selects English. The homepage and closed
preregistration page return 404 by default and always in production, including
when the preview variable is set. Preview HTML is private/no-store and noindex;
static framework assets retain Next.js caching. There is no signup API, live
email delivery, 3D production asset or deployment authorization in this slice.

VL-163–167 in the master plan track this independent prelaunch workstream.
Existing official-site/download and Windows qualification tasks remain intact.
The owner-requested name does not establish legal clearance. The illustrated preview uses a crop from the owner-supplied AI concept handoff,
not game footage or approved launch media. Its provenance is beside the asset;
`/preview-media/world` serves it only in development. It is not in `public/` or
a static image import, and remains blocked in production.
Production routing/indexing, campaign acceptance and real delivery require
separate owner approval and implementation of the corresponding release gates.

The development preview also includes `/world`, `/pets`, `/pets/:slug`,
`/skills`, `/pet-arena`, `/gacha`, both `/places/*` venues, `/news`, `/faq`,
`/privacy`, `/unsubscribe` and a non-consuming `/preregister/verify` placeholder.
The product catalog is an explicit presentation projection of the V3.1 candidate
from PR32, pinned by source SHA in the catalog JSON; it is not an import into the
game database or a second gameplay authority. Reconcile that projection when the
upstream candidate changes. The 240 count describes designs, not released Pets.

Six Standard S browser motion concepts are original code-authored geometry,
loaded with Three.js only on explicit activation. They are not Unity exports,
finished production models, rigged GLB clips or gameplay simulations. The viewer
caps pixel ratio at 1.5, render dimensions at 960×600, frame rate at 30, uses no
textures/external fetches, pauses offscreen/hidden, disposes resources on close,
and provides keyboard controls, reduced motion and context-loss fallback.
Dedicated Limited clips and the remaining production Pet assets are unavailable;
profiles state this honestly. Gacha is an informational candidate overview:
no paid pulls, item grants, finalized odds or automatic game-account creation.
