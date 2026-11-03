# Scene contract and local test cafe

M07-01 defines a versioned orthogonal tile manifest in `packages/contracts/src/scene.ts`. Tiles use integer coordinates from the top left; pixel center is `(tile + 0.5) * tileSize`. Bounds, duplicate collision IDs, duplicate seat IDs/tiles and blocked/outside spawn/seats fail validation. The synthetic SDK cafe is 20 by 14 tiles at 48 pixels per tile with eight server seat IDs. Collision geometry is declarative; authoritative movement is M07-04, not implied by this renderer.

`packages/pixi-scene` uses the cached pinned Pixi 8.22.0. The cafe draws deterministic original geometry and loads a local geometric avatar fixture. No legacy source/art was copied. Source/dimensions/purpose/rights limits are recorded in `apps/portal-web/public/assets/sandbox/provenance.json`; release approval is false. Production avatar actions and outfits remain M07-03.

`/worlds/sdk-sandbox` provides authenticated room entry/exit and seat controls via the M06 Socket.IO contracts and RoomRecovery adapter. Profiles are viewer-filtered on the server; no synthetic peers are added. Self is represented even with hidden presence. Occupied anonymous seats never disclose a hidden occupant. Network loss clears confirmed scene state. A 15-second snapshot refresh reconciles a final dropped delta with no subsequent event. The canvas has an equivalent labeled seat list and visit/participant status outside it. Comprehensive accessibility and performance gates remain open.

The normal registry remains disabled. `tests/fixtures/world-flags.json` opts only synthetic sandbox into development/test; production remains empty. To preview locally, explicitly set `WORLD_FLAGS_FILE` to its absolute path when running `pnpm dev`, after the normal local database setup/migrations. This does not activate a real world or authorize release.

M07-01 verification: `m07-scene-checks.json`, actual browser screenshots and pixel reports under `docs/agent/evidence/m07-01-visual/`. No DB migration; rollback the local commit and reinstall the prior offline lockfile. All backend contracts remain compatible.

## Loader, camera and entity lifetime (M07-02)

The loader accepts an AbortSignal, checks cancellation around asynchronous Pixi/asset initialization, and destroys its own application if canceled. Shared Assets textures stay cached; destroying one scene never destroys a texture used by another scene. Unmount removes the canvas and ResizeObserver and closes the room socket/listeners. Failed assets leave the independent room/seat controls available and explicitly report that rendering failed.

A fit camera scales and centers the complete world in its current viewport; ResizeObserver resizes the backing surface, with device resolution capped at two. No panning or speculative location is introduced. Sprites are keyed by viewer-authorized account ID and reused through same-context snapshots/deltas. Membership/epoch/account changes and disconnect clear old sprites. Hidden peers are never inferred from occupancy. Y position determines avatar depth. Current pose is only idle/sit plus reconnect opacity; original multi-frame animation is M07-03.

During an in-flight authoritative refresh, the layer is hidden and seat interaction disabled while sprite objects are retained for reuse. Transport loss and identity replacement remove that layer's entities. Old ACKs cannot publish over a newer operation or identity. Identity/catalog fetches are abortable; replaced identity clears cached self data and invalidates old operations. Disconnect also clears prior success messages. Camera/entity render occurs only on state/resize; the Pixi ticker remains stopped.

Browser lifecycle verification covers real peer join/seat/release/leave, stable creation counts on state changes, an idle interval without renders, resize, actual WebSocket closure and re-admission, identity replacement and route remount, failed asset loading, and unmount during a delayed real asset load. Entity counters are local diagnostics without account identifiers. They verify object lifetime behavior, not a JavaScript/GPU heap-leak bound or a low-end device FPS budget; M07-06 remains open.
