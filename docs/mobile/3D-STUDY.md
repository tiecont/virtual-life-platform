# Shared3D study — N06-11, development revision1

Status: IN_PROGRESS technical slice. This is an original procedural rigged cat,
groom and cafe corner shared by Next and Capacitor. It is deliberately labelled
as local look development. It does not save appearance, authenticate a visit or
replace the current authoritative Pixi rooms. It is not final art approval.

## Run locally

Build packages with `pnpm build:packages`. The web route is
`/worlds/sdk-sandbox/3d-study`; the shared component receives its navigation and
lifecycle from each host. For the native preview build with
`VITE_VLP_SCENE3D_STUDY=1 pnpm mobile:android:build` in the reviewed JDK21/SDK36
environment, then select **3D animal studio**. The flag is off by default. The
existing city preview, native Back handler and landscape lease remain available.

`pnpm test:scene3d` checks the actual flag-enabled mobile bundle in Chromium;
build it with `VITE_VLP_SCENE3D_STUDY=1 pnpm --filter @virtual-city/mobile build`
first. It exercises poses/views/quality, module failure, reduced motion,
context-loss recovery, large text and repeated teardown. Chromium SwiftShader
measurements are software-GPU diagnostics, never physical performance evidence.

For the private development AVD use `pnpm mobile:emulator:start`, then
`pnpm mobile:emulator:scene3d --apk <local-debug-apk>`, followed by
`pnpm mobile:emulator:stop`. The implemented smoke independently validates the
owned AVD/PID and emulated serial, installs only the supplied local debug APK,
connects only to this app's debug WebView and removes its own forwarding rule.
It does not connect to USB devices or an unrelated browser/app. It collects
actual context/pose/landscape/Back/Home/recreate measurements and own-window
screenshots privately. A failed run remains evidence, not acceptance.

## Rendering and preservation

`packages/scene3d` pins Three0.187.0 and imports only the reviewed controls and
geometry utilities. The SDK handle/factory contains no engine dependency.
Original24bone geometry, blended continuous limbs, groom cards and fibre normal
texture are authored in source; no downloaded animal/texture/decoder is used.
Geometry/groom/materials are shared per quality tier, skeletons are per avatar,
and attachments are batched with an eye-blink morph. Base triangle caps count
the whole visible model, including face, ears, collar and apron. The immutable
design budgets remain in `docs/design/vnext/animals-3d/budgets-v1.json`.

The renderer stops for document or native lifecycle suspension and reduced
motion, handles WebGL context restoration and releases GPU/DOM/listener/cache
resources on exit or partial initialization failure. Timings sample scheduled
animation frames after a two-second warm-up and reset on quality/outfit or
lifecycle changes; manual redraws are excluded. These bounded diagnostics are
not N10-04's physical30minute test. Existing auth, receipts, appearance v1,
server floor/seat authority, migrations and release/distribution gates retain
their existing behavior.

## Remaining gates

- Review actual images against the reference: silhouette, fur direction/density,
  eye layering, seams, poses and lighting. Source-generated geometry is a
  technical candidate; it does not establish polished final art.
- Implement the authoritative snapshot3D adapter, intent raycasts and distance
  LOD for real room actors. The current study rejects non-null room snapshots;
  it cannot be silently wired in as a completed room renderer.
- Qualify packaged AVD and physical Android separately, including GPU identity,
  source/APK hashes, resource/loading/frame results and preserved failures.
  Check20actors and the existing immutable budgets before promotion.
- N10-03 native auth precedes N06-07 modular creator and actual Save. N06-04/09
  still qualify the two loops and final visuals; N10-04 still needs its real
  physical duration/visit/background matrix. This revision has one cat, not the
  full species/part catalog, an exported glTF asset or completed creator.
- Mac/Xcode/iPhone remain missing for conditional N14. An Android AVD supplies
  no iOS Simulator or iOS evidence. Public/store distribution stays disabled.
