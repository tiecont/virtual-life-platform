# ADR0129 — Shared3D animals through a scoped renderer adapter

Date:2026-11-06. Status: accepted for a bounded technical spike; production renderer/art/performance promotion pending. Owner explicitly replaces pixel/2D direction with animated3D animals/detailed fur for web/mobile and authorizes Android Emulator development. This ADR does not assert owner approval of a particular reference image or model.

## Evidence and problem

At29b0eee/a9c913c the live room uses Pixi `createCafeScene`, a32×48starter atlas with nearest filtering,2D Graphics interiors and y-sorted sprites. `packages/game-client/src/renderer.ts` accepts a named/default factory but returns the concrete Pixi function type; `WorldRoomPanel` derives its handle from that type. The shared boundary is not yet engine-neutral. Actual handle methods are update(snapshot|null),suspend(),setReducedMotion(bool),destroy(); options pass AbortSignal/theme/outfit/onMove. Existing `sceneEntities`,RoomSnapshot and server motion/floor/seat IDs already separate presentation from authoritative intent. These are suitable preservation points; a3D scene is not currently present.

N06-08 landscape/controller/native orientation and N10-05 emulator are separately qualified. The current AVD boots with host AMD GLES3.1 and WebView124; the physical Xiaomi has WebView156. Neither establishes a new3D shader/model/performance result. Native sessions remain N10-03. Baseline Android thresholds are immutable; current3D measured results are null.

## Decision

Keep Next/React DOM,Vite/Capacitor,server ownership,identity,inventory and2D authoritative floor. Isolate3D presentation in a new renderer package behind an explicit handle/factory port extracted without engine imports. Preserve existing Pixi adapter/flags/v1 data as rollback, releasing GPU resources before switching. Do not build parallel identity,RoomAuthority or simulation/physics authority. Floor coordinate projection/raycast only yields the existing validated move/seat intents.

Use Three.js WebGL2/glTF2 as the first N06-11 **spike candidate**, pinned with registry integrity after dependency audit. Do not introduce WebGPU as a support requirement or silently mark Pixi proof as Three proof. [Three WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) uses WebGL2, so feature/context-loss fallback is mandatory. [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) supports rigged assets/extensions; decoder/texture/imported resources require explicit local allowlist/version/hash and disposal. No arbitrary appearance URL/remote decoder injection.

Create original rigged meshes/material/groom assets with versioned authoring/export provenance. Share appearance catalog/composer among creator,world andthumbnail; v1 mapping never overwrites original profile. Use groom cards,normal/roughness/anisotropic response and authored fur direction, with LOD/quality tiers. Do not promise strand-simulated cinematic fur on the phone. Creator close-up and gameplay readability must be reviewed separately against the reference and locked budgets. A primitive test mesh can debug a shader but cannot qualify final animal art.

Three/renderer dependencies stay outside contracts,server and static route/auth code. Animation follows committed state/interpolation, with in-place/root-motion policy and blend/anchor validation. Hidden recipients remain filtered before the renderer, including Lodge roles/hands/targets. Context loss/suspend/dispose cannot restore an old account or block DOM report/leave. Native storage/auth/compatibility and iOS execution remain independent gates.

## Alternatives and tradeoffs

Keeping pixel/SVG as final conflicts with the new request. Rewriting the full platform in Unity/Godot/native3D would duplicate verified web/room/business paths without evidence and is rejected for this slice. A standalone Blender/cinematic render alone cannot prove interactive gameplay. WebGPU/strand simulation can be evaluated later if explicit measured benefit outweighs device support/complexity; neither is required to create a beautiful groomed stylized animal.

Three retains the shared delivery model but adds WebGL2,mesh/rig/shader/disposal/asset tooling and mobile overdraw risks. New package API closure and new asset formats need explicit boundary/provenance checks. Native RSS384MiB and framep95≤33.4ms may be difficult with20avatars; fail honestly and optimize/reduce detail within the locked quality tiers before promotion. Do not raise the old threshold after a failure.

## Promotion and rollback

N06-11 must show actual interactive rig/fur/room/camera/lifecycle/failure behavior on web,packaged Android Emulator and physical Android at source/asset/GPU hashes. N06-07 then adds authoritative creator/save/entitlements with actual native auth; N06-04 polishes both loops; N06-09 qualifies final visuals/performance and owner-review status. N10-04 still runs physical30minutes. If the candidate fails, preserve failed outputs and current clients/data, keep3D flag off and revisit the bounded renderer/asset choice via ADR rather than rewriting old ledgers.
