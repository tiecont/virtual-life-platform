# ADR0102 — shared DOM/Pixi client and an Android-first spike

Date 2026-11-05. Status: **Accepted experiment design**, conditional on the actual N10-04 physical result. No Android/iOS implementation or store release is certified by this ADR.

Keep current backend authority/contracts and use browser-only React DOM/Pixi packages shared by Next and a local Vite/Capacitor Android bundle. Preserve accessible controls, renderer suspension/cleanup and current privacy/safety guards. Avoid a Next server inside a WebView and avoid a parallel mobile copy of room/business state.

Capacitor reuses existing DOM/Pixi with a native platform bridge, but installed origin/session/storage/lifecycle differ from browser/SSR. N10-03 must implement Android secure credential custody and atomic socket tickets while browser Origin/CSRF remain unchanged. Target APIs, bridge surface, signing and server compatibility need real execution.

React Native does not directly run the existing DOM/Pixi renderer as native views; Expo DOM introduces a WebView/JS boundary, so either is a separate migration experiment. Godot/Unity entail renderer/asset/tooling migration while the current room/service protocol remains reusable. Do not select a rewrite solely because the development host is Linux or the first device is one Android. [React Native native components](https://reactnative.dev/docs/intro-react-native-components), [Expo DOM](https://docs.expo.dev/guides/dom-components/).

Use proposed Capacitor 8.6.0 pins verified against official registry/template bytes, with the source, device baseline, workload and thresholds locked in [the spike plan](../mobile/ANDROID-SPIKE.md) and [machine-readable lock](../mobile/android-spike.json). No hidden installer or native project was run as part of this decision. Local package preparation and signed local install remain separate from Play distribution.

Reconsider after two bounded optimization/profiling rounds if the same physical workload fails frame-time, lifecycle, memory/energy or accessibility targets, or if product requirements shift materially. Compare alternatives with the same backend and explicit migration/rollback cost; keep original failures. Roll back the shell experiment without changing account/room/order authority or weakening browser auth.

iOS stays in conditional N14, with its own Keychain, WKWebView, lifecycle, physical iPhone and TestFlight matrix. Missing Mac/iPhone does not block Android/web, and Android PASS cannot satisfy iOS gates. N10-01 design verification is actual host/template inspection and evidence validation; physical acceptance remains NOT_RUN.
