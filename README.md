# Aetheria: SoulBound

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

## Engineering Harness

Use the [engineering harness runbook](specs/engineering/harness.md) to start a
Codex session, run scoped verification workflows, or recover a task after a
restart. The workflow and recovery CLIs also run directly under other harnesses.

## Local UI Preview

Run the existing server runtimes together on an isolated local database:

```sh
pnpm preview:prepare
pnpm preview:up
pnpm preview:status
pnpm preview:test
```

The first build includes Node and Rust dependencies. Open the Aetheria: SoulBound VI/EN
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
The separate existing `aetheria-*` production-artifact stack is unaffected.

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

Aetheria is managed as one MVP program in [config/development-plan.json](config/development-plan.json).
The program has seven milestones; tasks carry `mvpMilestone`, `mvpCriticalPath`,
`mvpScope` and `deferredExpansion` fields. Deferred work keeps its design history
and task IDs but is not an implementation or qualification dependency of the MVP.

| Milestone | Exit focus | State |
| --- | --- | --- |
| **M0** Scope, rules and catalog | One 8x8 ruleset boundary, canonical 55-Pet roster, six gated Off-rate candidates, explicit deferred list | IN_PROGRESS |
| **M1** Playable combat and progression | Deterministic 8x8 Rust combat, Artifact inventory/equipment/upgrades, authoritative settlement | IN_PROGRESS |
| **M2** Character, environment, audio and visual foundations | Icarus game-ready path, reusable morphology intakes, Fire/Water arenas, AudioMixer/VFX | IN_PROGRESS |
| **M3** Integrated playable vertical slice | Session → Pet → real 8x8 battle → reward → Artifact equip → observable stat change → restart recovery | TODO |
| **M4** Full MVP content production | All 55 active Pets, six maps and approved art/audio content | TODO |
| **M5** Human playtesting, balance and polish | Measured fun, clarity, accessibility and balance; no silent candidate-value promotion | TODO |
| **M6** Windows qualification and closed-beta readiness | Physical Windows build qualification, legal/privacy/signing and explicit release authorization | TODO |

**Current Wave A** targets **M0–M2**, with **M3** as the integration goal:
a new versioned **8×8** tactical ruleset in Rust (frozen V1/V3 and the 6×6 legacy
board remain untouched), a three-slot **Core/Aegis/Rune** Artifact loop, a
canonical **55 active Pet / 61 candidate** roster (the six Off-rate S identities
are gated, not a silent banner replacement), Icarus plus six Dragon and six Bird
families, Unity 8×8/collection/Artifact presentation, and Fire/Water arena plus
audio/VFX foundations. The ten shared race bases are presentation bases, not
extra collectible Pets. See [the Wave A specification](specs/pet-arena/mvp-wave-a.md).

**Operating rule:** future development requests are executed as substantial,
coordinated development waves. Each wave names its MVP milestone, file-owned
workstreams, integration owner, measurable acceptance and exact-source checks.
Do not substitute an audit, a specification or an isolated micro-fix for
playable progress when independent MVP work remains executable.

**Deferred from MVP:** the five additional Limited S characters, 19-map/19-element
expansion, the 240-Pet catalog, permanent fusion, ranked PvP, weekly bosses,
Maid Café/Card Lounge/social-world expansion and mobile/macOS ports. These remain
designed and classified in the backlog; none blocks M0–M3.

The repository has two canonical 3D-production skills. Use
[Aetheria Hero Character VRM](.agents/skills/aetheria-hero-character-vrm/SKILL.md)
with `$aetheria-hero-character-vrm` for flagship/Limited S humanoids and key NPCs
needing high-likeness faces, expressions, VRM Humanoid rigs, modular accessories,
and owner-gated Unity URP delivery. Use
[Aetheria Standard Asset 3D](.agents/skills/aetheria-standard-asset-3d/SKILL.md)
with `$aetheria-standard-asset-3d` for detached accessories, standard/common
Pets, weapons, environments, and props. The two skills describe their required
provider, Blender, budget, SHA-256, and Unity-admission gates. Their presence
does not establish an accepted art benchmark, rights, or a finished asset.

The [owner-design intake](specs/pet-arena/meshy-character-pipeline.md) preserves
Icarus's original sheet and immutable native crops. Its later V3 production
record separately pins the owner's design/spending authorization and actual
Meshy pilot. The resulting Blender/Unity review remains ART_REVISION_REQUIRED;
it is not an accepted production model or public-release approval.

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

The separate [Limited asset pipeline](specs/pet-arena/limited-asset-pipeline.md)
uses `--limited-v31` for canonical Limited identities and hashed authoring
bindings. Add `--require-complete` with an authored manifest to reject missing
bindings; byte validation alone is not model, Unity or rendered acceptance.

The first v2 persistence slice stores unpublished metadata only. After building
packages, seed an owned disposable PostgreSQL database with
`node scripts/with-test-db.mjs node --import tsx scripts/pet-content-draft-seed.mjs`.
It uses migration 0051 and refuses non-test database URLs. It grants no runtime
access, publishes no content and creates no owned player Pets.

Private R2/t3 art delivery tooling and its separate reviewed-art upload gate are
documented in [private art delivery](specs/media/private-art-delivery.md). Local
staging never grants art acceptance or public publication.

config/development-plan.json is the sole active backlog. Run `pnpm plan:status`
for ready tasks and progress. Explicit multi-agent work uses file-owned scopes
and a single integrator. Character art requires owner approval at H1 through
H4 before dependent stages proceed. Any ready task may proceed with one agent;
there are no reservations or mandatory independent-agent handoffs. Dependency
edges describe needed implementations. Qualification dependencies describe later
hardware, rights, signing or release acceptance and do not block implementation.

Historical completion is preserved with its original source revision. It is not
a fresh verification of the refactored checkout. Previous plans, journals and
reviews are available in Git at `archive/pre-cleanup-2026-11-10`.

Public rollout, production operations, restricted worlds, content clearance and
signing require their existing explicit approvals. Merging source does not turn
those features on.

## Aetheria: SoulBound prelaunch

The public presentation uses the existing `apps/admin-web` runtime. The private
operator login is now `/admin`; `/api/admin/*` retains the existing Nest identity,
session and CSRF boundary. Update operator bookmarks and health probes to
`/admin`. `ADMIN_ORIGIN` remains an origin (no `/admin` path).

For a local, development-only homepage preview, run
`AETHERIA_SITE_PREVIEW=1 pnpm --filter @aetheria/admin-web dev`.
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
