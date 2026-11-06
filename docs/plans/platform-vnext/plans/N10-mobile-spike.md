# N10 — Shared client và Android architecture spike

**Owner lane:** Experience/Mobile  
**Activation:** active · **Implementation:** TODO  
**Goal:** Chốt shared React/Pixi + Capacitor trên Android vật lý hiện có; iOS được kiểm chứng riêng ở N14, không chặn nhánh Android.

## Phạm vi file dự kiến

- `packages/game-client/*`
- `packages/client-sdk/*`
- `apps/mobile/*`
- `apps/portal-web/*`
- `apps/platform-api/src/identity/*`
- `packages/contracts/*`

Path mới là đề xuất; kiểm HEAD và consumers trước khi thay đổi. Chỉ coordinator thay contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

- [CachyOS và Android-first](../architecture/05-CACHYOS-ANDROID-FIRST.md)

## Tasks

### N10-01 — Thiết kế spike và device/performance budgets

**Depends on:** N00-04, N06-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 12

**Deliverables**

- CachyOS/Android toolchain inventory, one-device baseline matrix, proposed performance budgets và Capacitor ADR với iOS applicability riêng

**Acceptance / Definition of done**

- Không coi ReactNative chạy native được DOM/Pixi cũ trực tiếp; Expo DOM vẫn có WebView boundary.
- Không assume mobile browser/SSR tương đương bundle cài sẵn.
- FPS/memory/battery/cold-start budgets là proposed và khóa trước đo, không chỉnh sau để xanh.
- Không gọi điện thoại hiện có là support-floor nếu chưa có dữ liệu model/OS; tách device-baseline PASS khỏi broad Android coverage. N14 conditional giữ mục tiêu iOS.

**Verification**

Scenario / evidence:

- Ghi CPU/RAM/GPU, Android Studio/SDK/JDK/Gradle pins, adb authorization và phone model/OS/WebView; emulator/KVM là supplemental. Mac/iPhone access ghi riêng cho N14.

**Rollback / recovery:** Design-only; giữ backend/protocol independent renderer.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N10-02 — Tách browser-only game client và bundle mobile đầu tiên

**Depends on:** N10-01, N02-02, N06-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 111

**Deliverables**

- game-client/client-sdk/platform interfaces; Next mounts package; Vite+Capacitor shell

**Acceptance / Definition of done**

- Shared package không Next/Node/server-env dependencies.
- Local assets bundle includes index.html, lifecycle/navigation adapters và safe fallback.
- Chưa thêm deployment game-web; web behavior không regress.

**Verification**

Scripts/commands đã có ở baseline; xác minh lại tại HEAD:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm mobile:build:dev`
- `pnpm test:client-boundaries`

Scenario / evidence:

- Run browser và Android local bundled build trên Linux/điện thoại hiện có. iOS native build chưa áp dụng ở task này; không ghi iOS PASS.

**Rollback / recovery:** Next adapter keeps previous game paths until shared shell verified.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N10-03 — Native sessions và one-time socket ticket

**Depends on:** N10-02, N05-06, N02-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 112

**Deliverables**

- Versioned native auth/refresh/logout/device-session/ticket contracts

**Acceptance / Definition of done**

- Android refresh credential trong Keystore-backed encrypted storage qua native bridge đã review; tokens không URL/logs/localStorage. Contract có secure-store adapter; iOS Keychain implementation được gate tại N14-02.
- Browser cookie+Origin+CSRF unchanged; ticket bound subject/session/audience/expiry/protocol, atomic single use.
- Session revoke/logout closes access; bridge minimizes credential exposure.

**Verification**

Scripts/commands đã có ở baseline; xác minh lại tại HEAD:

- `pnpm test:security`
- `pnpm test:integration`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:native-auth`

Scenario / evidence:

- Wrong Origin/browser path, replay/expired ticket/stolen refresh rotation/device revoke.

**Rollback / recovery:** Disable native login flag; keep browser auth intact and invalidate native sessions.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N10-04 — Physical Android spike và quyết định kiến trúc theo thiết bị

**Depends on:** N10-03, N06-04, N05-04, N06-09
**Trạng thái ban đầu:** TODO  
**Priority:** 113

**Deliverables**

- Physical Android results với model/OS/WebView/build/source/profile; ADR có phạm vi thiết bị đã chứng minh và iOS chưa kiểm chứng

**Acceptance / Definition of done**

- 30min gameplay,20enter/leave,10background/resume; test keyboard/safeareas/WiFi-cellular/process kill.
- Renderer pauses; focus time from server; resync before commands after foreground.
- Một Android thật đủ cho device-baseline gate; ghi giới hạn coverage, không suy rộng tới mọi Android hoặc iOS. Thiếu iPhone không chặn N10-04; iOS physical gate là N14-03. Nếu fail sau tối ưu có timebox, ADR so sánh renderer theo nhu cầu.

- 30min spike dùng build landscape/animal đã tích hợp, kiểm creator/travel/rotation và asset performance; giữ budgets cũ.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm mobile:smoke`

Scenario / evidence:

- Đo/ghi hình trên Android hiện có; 30 phút chơi, 20 enter/leave, 10 background/resume. Emulator chỉ bổ sung API/screen coverage; không thay số đo nhiệt/pin/GPU thiết bị.

**Rollback / recovery:** Keep shared contracts/backend; discard failed shell spike without rewriting platform.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.
