# Synthetic 20-actor renderer measurement

N06-11 uses the real shared room renderer with a separate, explicitly labelled fixture: four seated, ten walking, six idle, two idle actors reconnecting, eight starter palettes and cafe aprons. These are synthetic RoomSnapshot inputs. They do not create accounts, gameplay sessions, admission capacity, server authority or rewards. The canonical sandbox floor and normal snapshot validation still apply.

The normal app build excludes the fixture. These commands implement the measurement path; their existence is not a passing test result:

```sh
pnpm test:scene3d-workload
pnpm mobile:android:workload
pnpm mobile:emulator:start
pnpm mobile:emulator:workload --apk artifacts/<preserved-workload>/app-debug.apk
pnpm mobile:emulator:stop
pnpm mobile:android:build
pnpm mobile:bundle:smoke
```

Android builds require the already reviewed JDK21/SDK36 environment. Workload mode replaces the local generated bundle and DEBUG APK; preserve and inspect that APK before testing, then restore the normal build with the final commands. This mode is a developer tool, never a store/release candidate. The emulator command retains ownership guards and selects only the own-app localhost DEBUG WebView. It cannot fall back to a USB phone or another app.

[PROFILE.json](../../tests/renderer-workload/PROFILE.json) fixes the mixture, three quality tiers, eight-second windows, two-second warmup and twenty Balanced renderer recreations before the first run. High is a desktop tier; its mobile comparison is an additional diagnostic. All results, including failures, use the unchanged [3D budgets](../design/vnext/animals-3d/budgets-v1.json).

Each run retains source/diff/profile/budget/bundle hashes, actual WebGL renderer, sample peaks, external RAF frame intervals/stalls, screenshots and disposal facts in private artifacts. Resource estimates deduplicate shared geometries/textures/skeletons and include decoded mip chains, padded Three internal morph storage, bone textures and shadow targets. They are scene estimates, not driver residency or native RSS. Drawing-buffer dimensions and Android own-app meminfo are separate. Unknown texture storage fails closed.

Exit zero requires functional checks and observed required-tier limits; exceeding a limit exits one even on a software GPU. Approximate `performance.memory` values and short warm/cold startup samples are retained without claiming a controlled heap-growth or p75 loading qualification. Twenty renderer recreations do not count as twenty authenticated visits. Physical Android thirty-minute/thermal/battery, the existing N10-04 gates, full Deadline/Maid scenes, final artwork and iOS qualification remain separate.
