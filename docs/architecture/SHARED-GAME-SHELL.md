# Shared scene-first shell — N06-03

The Next room adapter can opt into the shared scene-first hierarchy with the build-time `NEXT_PUBLIC_VLP_SCENE_FIRST=1` flag. The default remains classic. `WorldRoomPanel` also accepts a `sceneFirst` presentation prop for composition/test adapters. No API or module entitlement changes with this flag; it does not enable a world.

The opt-in shell moves the single connection/error presentation and confirmed identity/entry/leave controls into a compact HUD, keeps the scene before visit options at narrow widths, and provides keyboard-native activity/options/travel shortcuts and an optional New here disclosure. All authoritative values still come from the existing `RoomRecovery`, `me` and socket snapshots; no parallel occupancy, inventory, timer, queue or visit store exists. Current scene geometry/art is retained until N06-04/07/09; the animal SVG study is not used as production artwork here.

Focus, wardrobe, hospitality child content, events, invitation and safety widgets keep their existing keys, requests and lifetime. Entry/seat/movement/leave compatibility, lost-ACK/sequence recovery and delayed identity rejection are unchanged. No optional UI panel unmounts a pending widget. Asset failure leaves native DOM controls accessible. Full-room errors use actual existing outcomes; global admission queue rank/ETA remain N09-03 work, never fabricated by the shell.

Next-only navigation uses `next/navigation` in the portal adapter. The shared browser platform sanitizes a relative internal path before invoking that injected router; the shared package never imports Next. The classic adapter retains document navigation. Confirmed return still awaits the server-owned leave; client navigation cannot bypass an uncertain departure. Account/privacy/token custody and browser cookie/Origin/CSRF remain with their existing owners. Mobile keeps its independently qualified platform bridge and logged-out preview until native-auth/business integration is ready.

## Reproduce and roll back

From the repo root, build with `NEXT_PUBLIC_VLP_SCENE_FIRST=1 pnpm build`, then run `pnpm test:ux-core`. The test command checks the actual rendered mode and fails if the build disagrees. It starts only isolated loopback API/web and disposable test DB lifetimes, using existing world fixtures; it does not alter retained development/production data. Each invocation uses a unique artifact/report scope and validates its actual browser-batch results.

For classic rollback qualification, build with `NEXT_PUBLIC_VLP_SCENE_FIRST=0 pnpm --filter @virtual-city/portal-web build`, then run `pnpm test:ux-core --classic`. This is a build-time flag: changing a running server variable does not transform an existing client artifact. Future deployment must pin and qualify the exact chosen web digest under the release gates; this task does not promote an image.

`ux-core.spec.ts` covers pending/anonymous identity, real Deadline seat/focus/confirmed return, asset failure with actual seat/leave controls, late identity responses after logout, transport interruption/resync and confirmed departure. It runs for desktop and Chromium mobile emulation; it does not establish physical Android/iOS, final landscape/orientation, human usability, performance or production art acceptance. The CI study group includes this spec, with classic mode as the default for ordinary unflagged CI builds. A release enabling the new flag requires its matching opt-in qualification.

The test environment only propagates a reviewed `classic | scene-first` expectation and an eight-hex run id; arbitrary values/path traversal and inherited runtime/public flags remain rejected/stripped. The matching build flag is deliberately not inherited into backend fixture policy. Current release/distribution contexts remain unchanged.

N06-08 adds actual landscape viewport/orientation and recovery layout; N06-07 adds server-owned modular animal appearance after N10-03, and N06-04/09 polish and qualify actual scenes. N14 remains conditional and cannot use Android/browser results as iPhone evidence.
