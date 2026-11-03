# Scene contract and local test cafe

M07-01 defines a versioned orthogonal tile manifest in `packages/contracts/src/scene.ts`. Tiles use integer coordinates from the top left; pixel center is `(tile + 0.5) * tileSize`. Bounds, duplicate collision IDs, duplicate seat IDs/tiles and blocked/outside spawn/seats fail validation. The synthetic SDK cafe is 20 by 14 tiles at 48 pixels per tile with eight server seat IDs. Collision geometry is declarative; authoritative movement is M07-04, not implied by this renderer.

`packages/pixi-scene` uses the cached pinned Pixi 8.22.0. The cafe draws deterministic original geometry and loads a local geometric avatar fixture. No legacy source/art was copied. Source/dimensions/purpose/rights limits are recorded in `apps/portal-web/public/assets/sandbox/provenance.json`; release approval is false. Production avatar actions and outfits remain M07-03.

`/worlds/sdk-sandbox` provides authenticated room entry/exit and seat controls via the M06 Socket.IO contracts and RoomRecovery adapter. Profiles are viewer-filtered on the server; no synthetic peers are added. Self is represented even with hidden presence. Occupied anonymous seats never disclose a hidden occupant. Network loss clears confirmed scene state. A 15-second snapshot refresh reconciles a final dropped delta with no subsequent event. The canvas has an equivalent labeled seat list and visit/participant status outside it. Comprehensive accessibility and performance gates remain open.

The normal registry remains disabled. `tests/fixtures/world-flags.json` opts only synthetic sandbox into development/test; production remains empty. To preview locally, explicitly set `WORLD_FLAGS_FILE` to its absolute path when running `pnpm dev`, after the normal local database setup/migrations. This does not activate a real world or authorize release.

M07-01 verification: `m07-scene-checks.json`, actual browser screenshots and pixel reports under `docs/agent/evidence/m07-01-visual/`. No DB migration; rollback the local commit and reinstall the prior offline lockfile. All backend contracts remain compatible.
