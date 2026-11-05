# N10-01 — Android shared-client spike design

Decision date: 2026-11-05; source base `187827b`. This document locks a proposed measurement plan before a native build or physical run. It does not claim installed Android tooling, an APK, device authorization, successful native auth or measured FPS/memory/battery. See [ADR0102](../adr/0102-android-shared-client-spike.md) and [budget/toolchain lock](android-spike.json).

## Current capability and selected toolchain

N00-03 and a fresh read-only N10 inventory confirm CachyOS x86_64, Ryzen 7 4800HS/16 logical CPUs, ~22.9 GiB RAM and RTX 2060 Max-Q/AMD GPU enumeration. Node 26.9.0, pnpm 11.28.5 and Docker are available. Java/Gradle/ADB/Android Studio/SDK were not on PATH or in the inspected standard paths. Phone model, Android/API, WebView, USB authorization and device performance remain **UNKNOWN**. No personal device identifier or keystore was read. N14 macOS/iPhone access is independent and unknown.

Proposed npm pins are core/CLI/Android **8.6.0**, with registry integrity and git revision captured in the lock. Official tarballs were read without package execution, SHA-512 verified and templates inspected: Gradle **8.14.3**, AGP **8.13.0**, compile/target SDK **36**, min SDK **24**, Java source/target **21**. The vendor JDK build and checksum are also proposed inputs, not installation evidence. Android Studio minimum **2025.2.1** is a documented requirement; a concrete installer/checksum must be locked before installation. Build-tools **36.0.0** is the selected explicit candidate; verify generated build compatibility in N10-02 rather than infer it from a JSON pin. [Capacitor environment](https://capacitorjs.com/docs/getting-started/environment-setup), [8.0 migration](https://capacitorjs.com/docs/updating/8-0), [official npm CLI metadata](https://registry.npmjs.org/@capacitor/cli).

Framework API/WebView support is not this product's certified support floor. Record the actual available phone first; narrow findings to that model/OS/WebView/build/network. Emulator coverage supplements screen/API boundaries but cannot prove physical GPU, thermal, energy or OEM background behavior. [Android target documentation](https://capacitorjs.com/docs/android).

## Implementation seams and auth gates

N10-02 extracts browser-only React DOM/Pixi code into game-client/client-sdk with small lifecycle/navigation/HTTP/session adapters. Next retains server fetch/rewrite and server-only environment code; Vite emits local `index.html`, JS/CSS and approved content-addressed assets for Capacitor. Keep existing routes through an adapter until their regression matrix passes. Do not copy business logic or create a game-web deployment.

A local bundle must run without a live Next server. Native auth is separate N10-03 work: Keystore-backed refresh custody, reviewed minimal bridge, short-lived HTTPS access and single-use socket ticket bound to session/audience/protocol/expiry. Preserve browser cookie/Origin/CSRF rules. No wildcard Origin, URL/query secrets, JavaScript localStorage refresh secret, fake eligibility or client-controlled account/role/age authority.

On background suspend renderer and reduce networking; server policy owns presence/seat grace and focus timestamps. Foreground renews/checks current session and obtains a fresh snapshot before mutations. Lost ACK reconciles the same request/receipt. Logout/revoke/kill/restart must not duplicate memberships, orders, rewards or shifts. Cached assets are not offline business authority.

## Physical baseline protocol — not executed

1. Record model, Android/API, WebView, app/source/protocol/asset revisions, native/JDK/Gradle versions, room/peer counts, network RTT/loss, orientation, font size, battery/thermal baseline and device refresh rate. Omit serial/account identifiers. Confirm independent test account and allowlisted nonproduction endpoint.
2. Hold settings constant: Wi-Fi, screen brightness at documented 50%, sound off, no charger during energy comparison, reduced motion state recorded. Run same-duration idle/shell baseline separately. Keep raw thermal/energy observations if sensors are unavailable; never substitute guessed zeros.
3. Measure ten cold and ten warm starts separately. Each ends at an actually interactive room with authoritative controls, not splash completion. Record queue time separately from first action/load.
4. Run 30 minutes with one actual phone and independent browser/protocol peers, aiming for 20 total room visitors within existing caps. Include active movement windows, one private focus lifecycle, one customer/staff service loop, safety/block withdrawal and explicit travel. Do not count idle transports as active gameplay or this local host as qualified production load.
5. Complete 20 enter/leave cycles and 10 background/resume cycles; include screen lock, process kill, Wi-Fi/cellular switching and lost ACK. Compare JS/native memory at consistent checkpoints; explicitly report GC/tool limitations and recovery failures.
6. Exercise keyboard/back, safe areas, Android text scaling, touch targets, TalkBack navigation, dialog close/focus, asset failure and independent Leave/Stop/Report. A browser accessibility snapshot is supplementary and does not replace TalkBack.
7. Test mixed supported binaries when they exist. For first release, N−1 published-binary case is NOT_APPLICABLE with a retained first-build baseline, never fabricated. N12-03 owns the Android/server matrix; N14-04 owns iOS separately.

## Locked hypotheses and decision rule

`android-spike.json` version 1 holds proposed targets and a no-results marker. Cold/warm interactive p75 ≤5s; first meaningful action <60s excluding separately reported queue; active frame-time p95 ≤33.4ms with stalls >250ms reported; 20-cycle JS growth ≤max(16 MiB,20% warm baseline), native RSS ≤384 MiB and growth ≤32 MiB; 30-minute battery drop ≤8 percentage points and active-minus-idle ≤5 points under the controlled profile; severe/critical thermal state or lifecycle/authority invariant violation fails the candidate. These are hypotheses, not achieved or universally appropriate device limits.

Freeze the budget file hash with candidate/source/device before measurements. A justified change gets a new version, reason and new run while retaining the original failure; never edit the old thresholds to relabel an outcome. Report measured/unsupported/unknown sensor values and all success/denial/timeout outcomes. If the available phone cannot measure a required signal, record an external measurement limitation rather than certify it.

Timebox remediation to two bounded profiling/optimization rounds against the same core workload. If the DOM/Pixi/Capacitor slice still fails, compare alternate client renderers using the same backend contracts and workload. Human UX failures also count; a signed build alone cannot approve the architecture.

## Applicability and next work

N10-01 is design/inventory only. N10-02 needs N02-02 and N06-02 before shared-client extraction; no missing phone blocks boundary/repository/image work. Native physical success belongs to N10-04 after actual auth and polished gameplay dependencies. The iOS lifecycle change in newer Capacitor 8 releases requires a separate N14 review when activated; Android results never imply iOS success. [Capacitor 8.5 lifecycle guidance](https://capacitorjs.com/docs/updating/8-5).

Scripts named `mobile:build:dev`, `test:client-boundaries`, `test:native-auth` and `mobile:smoke` are future owner tasks unless actually implemented and executed. The existing `ux:prototype` is a simulated design check, not an Android build, native auth test, phone benchmark or store submission.
