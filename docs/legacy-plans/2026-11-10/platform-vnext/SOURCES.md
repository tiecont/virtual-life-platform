# Nguồn và phạm vi bằng chứng

**As of:** 2026-11-05, Asia/Saigon. **Repo snapshot:** `cef7dc17172f7c6cda930c99648a5e3ad609cc55`.

Danh mục hợp nhất nguồn thực tế đã dùng trong ba nhánh rà soát: CI/build/ArgoCD/cleanup; runtime/admin/capacity; UX/mobile. URL tài liệu bên ngoài là nguồn primary của dự án hoặc nhà cung cấp. Chúng có thể cập nhật sau ngày rà soát; khi thực thi, kiểm đúng version/toolchain đã chọn. Các link GitHub bên dưới ghim commit để không trôi theo `main`.

## 1. Đầu vào và cách diễn giải

- Repo: [tree tại SHA audit](https://github.com/tiecont/virtual-life-platform/tree/cef7dc17172f7c6cda930c99648a5e3ad609cc55).
- File người dùng cung cấp: `VIRTUAL-CITY-AGENT-PLAN-PACK.zip`, gồm master, manifest, M00–M24 và hai reference plans. SHA-256 của ZIP đã đọc: `65665a312b0e9d9e7402ceefac995d6aabe065ae1ca4b6f2731269a3af1a126d`.
- [Quality run #1](https://github.com/tiecont/virtual-life-platform/actions/runs/42037215254) gắn SHA audit. Trạng thái run là dữ liệu thời điểm đọc; không dùng status cũ hoặc log offline để suy ra CI đã hoàn tất xanh.

**Source observed** là code/config đã đọc ở snapshot. **Reported evidence** là kết quả lịch sử ghi trong repo, chưa được chạy lại trong lượt lập kế hoạch. **Proposed design** là quyết định, ngưỡng thử nghiệm hoặc task mới; không phải tính năng/capacity đã đạt. Benchmark local, emulation và screenshot lịch sử không chứng minh server thật, physical mobile hoặc production release.

## 2. Source repo trọng yếu

| Mã | Chủ đề dùng để đối chiếu | Source ghim SHA |
|---|---|---|
| R01 | Current handoff, trạng thái 151 task và giới hạn offline | [docs/agent/HANDOFF.md](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/HANDOFF.md) |
| R02 | Workflow quality và gates thực thi | [.github/workflows/quality.yml](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/.github/workflows/quality.yml) |
| R03 | Phân bố unit/integration/security projects | [vitest.config.mts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/vitest.config.mts) |
| R04 | Docker build/runtime hiện tại | [infra/docker/Dockerfile](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/infra/docker/Dockerfile) |
| R05 | Một app image dùng cho API/web/migrate | [infra/compose/stack.yml](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/infra/compose/stack.yml) |
| R06 | Build-context exclusions | [.dockerignore](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/.dockerignore) |
| R07 | Migration checksums, journal và advisory lock | [apps/platform-api/src/db/migrations.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/db/migrations.ts) |
| R08 | Readiness và schema compatibility hiện tại | [apps/platform-api/src/operations/readiness.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/operations/readiness.ts) |
| R09 | Single-process authority guard | [apps/platform-api/src/rooms/authority.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/authority.ts) |
| R10 | Room mutations, capacity, serialized work và snapshots | [apps/platform-api/src/rooms/service.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/service.ts) |
| R11 | Socket gateway và room event payload | [apps/platform-api/src/rooms/socket.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/socket.ts) |
| R12 | Browser socket Origin/cookie/CSRF, session authorization | [apps/platform-api/src/identity/socket.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/identity/socket.ts) |
| R13 | Runtime composition, API guards và shutdown | [apps/platform-api/src/app.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/app.ts) |
| R14 | Maintenance loop và drain deadline | [apps/platform-api/src/main.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/main.ts) |
| R15 | Telemetry instrumentation, labels và sampling | [apps/platform-api/src/operations/telemetry.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/operations/telemetry.ts) |
| R16 | Hospitality transactional outbox | [apps/platform-api/src/hospitality/outbox.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/hospitality/outbox.ts) |
| R17 | Governance assertions của offline scope | [scripts/verify-governance.mjs](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/verify-governance.mjs) |
| R18 | Release assertions và evidence consumers | [scripts/verify-release.mjs](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/verify-release.mjs) |
| R19 | Operations report và evidence readers | [scripts/ops-watch.mjs](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/ops-watch.mjs) |
| R20 | Prometheus configuration template | [infra/monitoring/prometheus.yml](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/infra/monitoring/prometheus.yml) |
| R21 | Deployment/rollback evidence scope | [docs/operations/DEPLOYMENT-RECOVERY.md](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/operations/DEPLOYMENT-RECOVERY.md) |
| R22 | Staging/recovery harness | [scripts/staging-smoke.mjs](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/staging-smoke.mjs) |
| R23 | Snapshot loader/hash verification | [scripts/legacy-snapshots.mjs](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/legacy-snapshots.mjs) |
| R24 | Immutable legacy fixture provenance | [integrations/legacy-snapshots/README.md](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/integrations/legacy-snapshots/README.md) |
| R25 | Các load profile và kết luận local đã ghi | [docs/architecture/CITY-LOAD-PROFILES.md](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/architecture/CITY-LOAD-PROFILES.md) |
| R26 | Phân biệt current singleton và future ownership | [docs/architecture/FUTURE-OWNERSHIP.md](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/architecture/FUTURE-OWNERSHIP.md) |
| R27 | Observability hiện hữu và các giới hạn | [docs/operations/OBSERVABILITY.md](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/operations/OBSERVABILITY.md) |
| R28 | Frontend package/runtime declarations | [apps/portal-web/package.json](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/package.json) |
| R29 | Player home và development-status content | [apps/portal-web/app/page.tsx](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/app/page.tsx) |
| R30 | Next server rewrites/config | [apps/portal-web/next.config.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/next.config.ts) |
| R31 | Room UI, reconnect, native controls và shared-shell extraction | [apps/portal-web/app/components/WorldRoomPanel.tsx](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/app/components/WorldRoomPanel.tsx) |
| R32 | Pixi renderer, lifecycle và reduced motion | [packages/pixi-scene/src/renderer.ts](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/packages/pixi-scene/src/renderer.ts) |
| R33 | Accessibility evidence và gate còn thiếu | [docs/architecture/ACCESSIBILITY-AUDIT.md](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/architecture/ACCESSIBILITY-AUDIT.md) |
| R34 | Scene benchmark scope và emulation limitations | [docs/architecture/SCENE-PERFORMANCE.md](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/architecture/SCENE-PERFORMANCE.md) |

Các source links trên là căn cứ cho nhận xét hiện trạng. Tài liệu future design trong repo không đồng nghĩa implementation đã tồn tại. Khi tài liệu kiến trúc cũ mâu thuẫn current handoff, đối chiếu code và evidence index có SHA; không chỉ chọn đoạn prose thuận tiện.

## 3. Tài liệu primary bên ngoài

| Mã | Chủ đề | Tài liệu | Nội dung hỗ trợ |
|---|---|---|---|
| S01 | Argo CD | [Automated Sync](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/) | Native reconciliation, auto-sync, self-heal/prune và rollback caveat. |
| S02 | Argo CD | [Webhook configuration](https://argo-cd.readthedocs.io/en/stable/operator-manual/webhook/) | Refresh theo webhook; đối chiếu polling và security cấu hình. |
| S03 | Argo CD | [Sync phases and waves](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/) | PreSync/PostSync, hook ordering và selective-sync caveat. |
| S04 | GitHub Actions | [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token) | Permissions và hành vi trigger workflow; kiểm lại khi chọn promotion bot. |
| S05 | GitHub Actions | [Skipping workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs) | Required checks có thể Pending khi workflow bị skip. |
| S06 | GHCR | [Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) | Image repositories, publish/pull authentication và registry usage. |
| S07 | Kubernetes | [Recreate Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#recreate-deployment) | Rollout strategy; không thay thế authority guard của ứng dụng. |
| S08 | Socket.IO | [Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/) | Delivery semantics; application cần idempotency/recovery theo nghiệp vụ. |
| S09 | Socket.IO | [Using multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/) | Transport/load balancing/adapters; phân biệt với room ownership. |
| S10 | Socket.IO | [Connection state recovery](https://socket.io/docs/v4/connection-state-recovery/) | Recovery limits, adapter support và nhu cầu snapshot/resync. |
| S11 | OWASP | [WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) | Origin validation, session lifecycle và message authorization. |
| S12 | PostgreSQL | [Explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html) | Row locks, advisory locks và lifetime theo session/transaction. |
| S13 | Prometheus | [Histograms and summaries](https://prometheus.io/docs/practices/histograms/) | Windowed quantiles và aggregation; không average percentile gauges. |
| S14 | Capacitor | [Introduction](https://capacitorjs.com/docs) | Web runtime/native-container model. |
| S15 | Capacitor | [Installing Capacitor](https://capacitorjs.com/docs/getting-started) | Built web assets, index.html, webDir và bundle sync. |
| S16 | Expo | [DOM components](https://docs.expo.dev/guides/dom-components/) | WebView, separate JS engines, bridge và RSC limitations. |
| S17 | React Native | [Core/native components](https://reactnative.dev/docs/intro-react-native-components) | Native component model khác React DOM. |
| S18 | Godot | [Stable web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) | WASM/WebGL2, renderer và mobile/web-export constraints. |
| S19 | Unity | [6000.5 browser compatibility](https://docs.unity.com/en-us/engine/6000.5/manual/platform-specific/webgl/intro/browsercompatibility) | Version-specific desktop/mobile browser support; không dùng kết luận từ docs cũ. |
| S20 | Capacitor | [App API](https://capacitorjs.com/docs/apis/app) | App state, resume/pause, deep link và back-button hooks. |
| S21 | Capacitor | [iOS setup](https://capacitorjs.com/docs/ios) | Native iOS tooling/runtime; kiểm SDK/Xcode requirements khi build. |
| S22 | Apple | [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) | UGC safeguards (1.2), app quality (4.2), account deletion (5.1.1). |
| S23 | Google Play | [User Generated Content](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en) | Moderation, report/block và yêu cầu theo loại UGC. |
| S24 | Google Play | [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111) | Account creation cần deletion path trong app và web resource. |

## 4. Những kết luận cần phép đo hoặc quyết định mới

Không nguồn nào trong danh mục này xác nhận capacity của server người dùng, số CCU production, retention, tuổi thọ pin mobile, zero-downtime hoặc store approval. Những mục tiêu như first action dưới 60 giây, support N/N−1, headroom capacity và profile FPS là yêu cầu thiết kế cần kiểm chứng. N00/N08/N10/N12 tạo evidence tương ứng; release phải tham chiếu chính SHA/digest/binary đã kiểm.

Không gắn external-doc citation vào lựa chọn riêng của dự án như thể nhà cung cấp khuyến nghị đúng kiến trúc này. Tài liệu primary giải thích khả năng/giới hạn; lựa chọn modular monolith, queue PostgreSQL và Capacitor là suy luận từ source, scope và mục tiêu được nêu trong các chương kiến trúc.



## Bổ sung cho revision 2.1 — CachyOS/Android-first

Tra cứu 05/11/2026; nguồn nền tảng có thể thay đổi, kiểm lại toolchain/store rules lúc thực thi. Không coi số phiên bản xuất hiện trên trang web là yêu cầu tự nâng dependencies của repo.

- [Android Studio Linux requirements](https://developer.android.com/studio/install).
- [Android physical device / ADB](https://developer.android.com/studio/run/device).
- [Android emulator acceleration / Linux KVM](https://developer.android.com/studio/run/emulator-acceleration).
- [Capacitor environment: Android vs macOS/Xcode](https://capacitorjs.com/docs/getting-started/environment-setup).
- [Xcode system requirements](https://developer.apple.com/xcode/system-requirements).
- [GitHub-hosted runners including macOS](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
- [Android signing](https://developer.android.com/studio/publish/app-signing).
- [bundletool / local AAB testing](https://developer.android.com/tools/bundletool).
- [Google Play personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
