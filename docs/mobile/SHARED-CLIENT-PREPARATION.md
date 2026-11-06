# Shared client and Android shell preparation

The browser room component now lives in `packages/game-client`, with explicit `client-sdk` platform ports and the original Next adapter. Room authority, cookie/Origin/CSRF and social/privacy/consent rules remain server-owned. The mobile shell shares this component and the original assets; it currently permits only a local logged-out preview. Login/city visits are unavailable until native auth and complete safety/business adapters are separately qualified. No fake guest, localStorage token, wildcard Origin or hidden remote live-reload URL is used.

Implemented commands:

- `pnpm mobile:build:dev`: compile shared packages and build local Vite web assets. **This produces a web bundle, not an APK/AAB.**
- `pnpm test:client-boundaries`: static shared-source/dependency checks; no native correctness claim.
- `pnpm mobile:bundle:smoke`: serve local bundle on loopback and run real Chromium desktop/360px preview, local navigation, synthetic visibility and missing-asset fallback checks. Synthetic visibility is not a physical background/resume result.
- `pnpm mobile:sync:android`: build local assets and copy/update them into the existing Capacitor Android project. **Copy/sync is not Gradle compile, install or gameplay.**
- `pnpm mobile:preflight --platform=android --require-ready`: read-only resource/gate inventory; nonzero remains expected while native/device qualification is absent.

Android source is generated from pinned Capacitor8.6.0, using the existing proposed SDK/AGP/Gradle pins; Gradle distribution checksum is locked from `https://services.gradle.org/distributions/gradle-8.14.3-all.zip.sha256`. Copied web bundles, generated plugin configuration, Gradle output/caches, local SDK paths, keystores and device captures are excluded from source. Backup and mixed-content access are disabled. Template app identity `life.virtualcity.spike` and icons are local preparation values, not a store-identity or branding approval.

Before completing N10-02: provide the proposed JDK21/SDK36/build-tools setup and authorized ADB access, lock actual installed tool versions, build/install this local bundle and record the real phone model/OS/WebView/source/result. Accept Android SDK licenses through the owner-controlled setup. Keep raw identifiers/logs private. The current workstation's missing Java/ADB and absent physical execution are recorded in the task audit; generated Android files alone cannot satisfy this gate.

Then N10-03 adds reviewed Android Keystore custody, native session/refresh/revoke and one-time socket-ticket adapters while browser auth remains unchanged. N10-04 still requires its full prelocked 30minute/20visit/10background workload and measurements. This preview is not that spike.

N14 remains conditional without Mac/Xcode and physical-iPhone access. The shared bundle, no-eval renderer, lifecycle interface and safe-area CSS are preparation inputs only. Keychain/WKWebView/native archive/signing/device/compatibility/TestFlight remain NOT_RUN. Neither mobile platform has been distributed; release remains NOT_REQUESTED.

## Native debug build command

`pnpm mobile:android:build` builds/syncs the web assets and invokes the existing Gradle wrapper for `assembleDebug`. Set the pinned JDK21 `JAVA_HOME` and SDK36 `ANDROID_SDK_ROOT` in the child environment; the command checks the required platform/build-tools, uses four Gradle workers and writes a hash/source-bound private APK fact record. It does not install an app, upload to a store or establish device acceptance. [Observed local toolchain](ANDROID-TOOLCHAIN.json) records the isolated setup used for native qualification; the original performance budgets remain unchanged.
