# N14 — iOS toolchain, physical validation và release lane

**Owner lane:** Mobile/Operations  
**Activation:** conditional · **Implementation:** TODO  
**Goal:** Giữ mục tiêu App Store nhưng chỉ thực thi native iOS lane khi có macOS/Xcode access và đường kiểm thử iPhone thật; không chặn Android/web.

## Phạm vi file dự kiến

- `apps/mobile/ios/*`
- `apps/mobile/*`
- `.github/workflows/*`
- `packages/client-sdk/*`
- `docs/runbooks/*`

Path mới là đề xuất; kiểm HEAD và consumers trước khi thay đổi. Chỉ coordinator thay contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

- [CachyOS và Android-first](../architecture/05-CACHYOS-ANDROID-FIRST.md)

## Điều kiện kích hoạt

Mặc định CONDITIONAL_NOT_ACTIVE; task vẫn TODO, không phải VERIFIED hoặc DEFERRED_APPROVED. Coordinator ghi resources/readiness evidence vào task đã active (N10-01 hoặc N00), rồi cập nhật module activation. Thiếu resources không chặn Android/web. Khi có iOS đã phân phối mà context/evidence chưa rõ, backend compatibility gate fail closed; không dùng module inactive để né gate.

## Tasks

### N14-01 — Xác minh macOS/Xcode, signing và iPhone access

**Depends on:** N10-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 211

**Deliverables**

- Environment dossier: macOS local/remote/CI provider, supported Xcode, signing path, physical iPhone/testing access, cost/owner

**Acceptance / Definition of done**

- N14 chỉ ACTIVE khi có evidence về macOS build access và physical-iPhone testing path khả dụng; dùng N10-01 hoặc N00 evidence record để activation, không chờ task trong module tự hoàn tất.
- Linux vẫn là máy viết shared code. Không gọi Linux WebKit/browser simulation là iOS Simulator hoặc physical iPhone.
- Hosted macOS chạy Xcode để build; cần xem quota/cost và account provisioning thật, không tự mua dịch vụ.

**Verification**

Scenario / evidence:

- Kiểm quyền runner/macOS, Xcode matrix, signing/test distribution route và người/thiết bị nhận thử.

**Rollback / recovery:** Chưa đủ resources thì giữ module conditional; Android/web tiếp tục. Không xóa mục tiêu iOS.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N14-02 — iOS native adapters và signed build trên macOS

**Depends on:** N14-01, N10-03, N11-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 212

**Deliverables**

- iOS Capacitor target, Keychain/session bridge, platform lifecycle adapters, signed archive/IPA và source mapping

**Acceptance / Definition of done**

- Pin Xcode/SDK/Capacitor/plugin toolchain; kiểm Keychain, native refresh/ticket, browser Origin/CSRF regression.
- Navigation/safe area/keyboard/deep links/permissions có iOS implementations; không ghi Android PASS thay iOS.
- Signing secrets chỉ trong protected build environment; build artifact không được ghi thành store approval.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm mobile:verify:ios`
- `pnpm test:native-auth`

Scenario / evidence:

- Build/archive/sign bằng macOS Xcode phù hợp; simulator smoke là supplemental, physical gate tiếp theo.

**Rollback / recovery:** Giữ native iOS distribution đóng và backend contracts tương thích; sửa adapter/build mà không chặn Android.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N14-03 — Physical iPhone spike và iOS UX/lifecycle gate

**Depends on:** N14-02, N10-04, N11-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 213

**Deliverables**

- iPhone model/OS/build/source profiles, gameplay/performance/security evidence và iOS architecture ADR

**Acceptance / Definition of done**

- 30 phút gameplay, 20 enter/leave, 10 background/resume; keyboard/safe area/VoiceOver, Wi-Fi-cellular, process kill và foreground resync được kiểm.
- Đo native/JS memory, frame-time, startup và thermal/energy theo device budget chốt trước; thiếu số đo ghi thiếu, không PASS.
- Thiếu physical-iPhone evidence thì gate iOS chưa đạt; kết quả Android hoặc cloud build không thay thế. Bounded optimization trước đổi stack.

- Khi iOS lane có resources: landscape hai chiều, portrait fallback, animal creator/occlusion và VoiceOver với cùng appearance/catalog revision; Android không thay iPhone evidence.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm mobile:smoke:ios`

Scenario / evidence:

- Cài signed app lên iPhone thật, trực tiếp/thiết bị mượn/tester hoặc dịch vụ có đủ thao tác và telemetry; ghi coverage còn thiếu.

**Rollback / recovery:** Dừng phân phối thêm nếu spike fail; giữ hỗ trợ/compatibility cho binary đã trao cho tester, không reset ios_clients_distributed; Android tiếp tục trong scope đã kiểm chứng.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N14-04 — iOS/server version compatibility gate

**Depends on:** N14-03, N11-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 214

**Deliverables**

- iOS supported binary matrix với backend candidate/rollback và content/protocol revisions

**Acceptance / Definition of done**

- Current và mọi client còn trong support window được thử install/update/auth/ticket/reconnect/travel trên iPhone; giữ old protocol/assets khi rollback.
- First iOS release chưa có N-1 thật thì ghi NOT_APPLICABLE có lý do và lưu candidate baseline; không fake previous-release evidence.
- Từ lần phân phối iOS đầu tiên, backend N12-01/04/05 yêu cầu gate này bên cạnh gate Android khi Android còn supported. Evidence phải được revalidate cho release candidate hiện hành.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:protocol`
- `pnpm mobile:verify:ios`

Scenario / evidence:

- Có thể cài signed candidate qua development/ad-hoc route hợp lệ trước TestFlight; không tạo dependency cycle với N14-05.

**Rollback / recovery:** Giữ protocol/assets trước, hoãn breaking backend change cho đến khi installed iOS clients có upgrade window.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N14-05 — TestFlight, App Store dossier và review findings

**Depends on:** N14-04, N06-05  
**Trạng thái ban đầu:** TODO  
**Priority:** 215

**Deliverables**

- TestFlight beta khi được phép, Apple disclosures/UGC/deletion dossier, device coverage và exact store release status

**Acceptance / Definition of done**

- Kiểm chính sách Apple hiện hành, account/support/privacy và gameplay value; Android dossier không thay Apple-specific review.
- Ngay khi gửi iOS binary đầu tiên tới tester/user, đặt ios_clients_distributed=true và mobile_clients_distributed=true, không chờ task VERIFIED.
- Owner/store authorization chỉ cần ở upload/publication thực tế; technical work tiếp tục trước. Beta delivered, review approved và public published được ghi riêng.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm mobile:verify:ios`

Scenario / evidence:

- TestFlight installation/update và feedback từ người thử; QA phạm vi thiết bị trước broad release.

**Rollback / recovery:** Dừng rollout khi cần, giữ backend hỗ trợ installed iOS clients; không thể rollback máy người dùng chỉ bằng Argo.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.
