# N06-08 — landscape window and persistent room panels

The shared scene-first shell now has native HTML room-actions and people/safety dialogs. Closing a dialog keeps its business widgets mounted and preserves pending receipts and the local seat-label filter. Only presentation state is added; membership/seat/focus/inventory remain existing server-owned data. The connection/error surface follows the active dialog so it is not hidden behind an inert backdrop. Escape/Close restore the opener. Native Back dispatches cancellable dialog cancellation before fallback navigation, allowing an interaction to prevent dismissal.

Compact landscape uses a scene frame with a small heading/entry row and a bottom action dock. Existing Pixi camera fit/ResizeObserver centers the original room geometry without stretching it; no server map or original artwork is changed. Portal chrome is hidden only in compact gameplay, with City/Identity/Your circle links retained in the people panel. Portrait has a nonblocking rotate hint and the same accessible controls. Large text may scroll rather than clip; dialogs stay bounded and their close controls remain at the top. Search is local/public-seat-label filtering, not a server request or ownership decision.

## Android boundary

`GameplayOrientationPlugin` only requests this Activity's orientation. The gameplay effect requests sensor landscape by default; Rotate view requests primary/secondary landscape. A serial JS queue and native lease preserve the initial requested policy and prevent an obsolete cleanup from releasing a newer route. Leaving the gameplay route restores that policy; no global auto-rotate setting, bootloader, other app or device security control is changed. Android Activity configChanges keeps the WebView through rotation, and adjustResize is explicit for the virtual keyboard.

An accepted request is not proof that the OS applied it. [Android16 behavior](https://developer.android.com/about/versions/16/behavior-changes-16) changes orientation/resizability constraints on large displays (including exceptions); the app keeps resize/portrait controls usable instead of depending on enforcement or adding an opt-out. Native APIs/registration were checked against installed Capacitor8.6.0 source and the actual Gradle compile. This does not establish coverage on Android16/tablets or iOS.

Mobile local builds use scene-first by default; set `VITE_VLP_SCENE_FIRST=0` when building/syncing to retain the earlier classic preview. Portal remains opt-in via `NEXT_PUBLIC_VLP_SCENE_FIRST=1`; changing that flag requires rebuilding the client. A versioned asset/renderer change is still N06-04/07/09 work.

## Verification boundaries

`pnpm test:ux-core` uses real loopback API/PostgreSQL and desktop/Chromium mobile, including panel nesting, public-seat search, Escape/focus, viewport changes/200% text and retained membership. `pnpm test:ux-core --classic` checks rollback; the new layout-only case explicitly skips on classic. Browser viewport changes/short windows are not a physical keyboard/cutout or sensor certification.

`pnpm mobile:landscape:smoke` is implemented for an owner-controlled installed DEBUG preview, using the reviewed executable in `ADB_PATH`. It requires exactly one authorized USB device and checks our focused app before UI/input. It verifies the installed APK hash, landscape entry, disabled logged-out seats, actual keyboard visibility with a retained filter, both own-Activity landscape policies, fallback/Back and Home/resume. It captures only owned temporary dumps, sanitizes serial-bearing summaries and stores raw output privately. This command must be actually executed and its result read before any native PASS; the script's existence is not evidence.

The app is still an unauthenticated local preview with unavailable native city/sign-in paths. This is not native session/Keystore/ticket acceptance, physical30minute gameplay/performance, real modular-avatar saves, TalkBack/VoiceOver, final art/rights approval or store distribution. Android evidence never substitutes N14's Mac/Xcode/iPhone gates. Original N10-01 performance thresholds stay unchanged.
