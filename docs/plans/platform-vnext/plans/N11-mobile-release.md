# N11 — Android app và Google Play release lane

**Owner lane:** Mobile  
**Activation:** active · **Implementation:** TODO  
**Goal:** Từ Android spike sang app dùng hàng ngày, signed artifacts và Play beta; phân biệt local install, store testing và public approval.

## Phạm vi file dự kiến

- `apps/mobile/*`
- `.github/workflows/*`
- `packages/client-sdk/*`
- `apps/platform-api/src/identity/*`
- `docs/runbooks/*`

Path mới là đề xuất; kiểm HEAD và consumers trước khi thay đổi. Chỉ coordinator thay contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

- [CachyOS và Android-first](../architecture/05-CACHYOS-ANDROID-FIRST.md)

## Tasks

### N11-01 — Android signed build pipeline và artifact traceability

**Depends on:** N10-04, N03-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 120

**Deliverables**

- Linux CI tạo signed APK để cài thử và signed AAB candidate cho Google Play; build/protocol/assets/source mapping

**Acceptance / Definition of done**

- Signing keys protected; pinned toolchain và least privilege.
- Mobile binary/client protocol/assets linked to backend release compatibility.
- Argo/GHCR không được dùng để gọi mobile store đã deploy.
- Local APK/AAB build không phụ thuộc Play account hay macOS. Signing identity phải được quản lý bền vững; chưa gọi artifact là Play-distributed hoặc Play-approved.
- Kiểm APKs sinh từ AAB bằng bundletool hoặc Play test delivery khi có access; không adb install AAB. Install/update evidence ghi signing track; local APK và Play App Signing có thể khác certificate.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm mobile:verify`

Scenario / evidence:

- Signed APK install/update trên Android; kiểm AAB artifact/signature/mapping. Play account/track access chỉ cần ở N11-04; missing secrets của signing CI chỉ chặn bước tương ứng.

**Rollback / recovery:** Revoke compromised signing access per provider procedure; retain previous signed releases.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N11-02 — Android interaction và lifecycle hoàn chỉnh

**Depends on:** N10-04, N09-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 121

**Deliverables**

- Safearea/keyboard/back/deeplinks, notifications opt-in nếu cần, cache/error UX

**Acceptance / Definition of done**

- Không remote-website wrapper đơn thuần; gameplay local bundle hoạt động app-like.
- Foreground session refresh/resync, offline truth, stale asset fallback, memory cleanup.
- External URL/deep link allowlist; unsupported old client upgrade flow rõ.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm mobile:smoke`

Scenario / evidence:

- Android thật: keyboard/back/safe area/TalkBack, denied permissions, airplane mode, low-memory/process kill và suspended timer; iOS behavior thuộc N14.

**Rollback / recovery:** Feature flags/previous compatible binary; server retains old client support window.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N11-03 — Account deletion, UGC và Google Play dossier

**Depends on:** N07-03, N10-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 122

**Deliverables**

- In-app deletion request + web resource, report/block, privacy/data safety/age policy docs

**Acceptance / Definition of done**

- Users có report/block và enforcement thật; deletion status/timeline/required retention disclosed.
- Rating/privacy/permission manifest phù hợp features thật; review current store docs tại submission.
- Dating/random matching giữ ngoài initial mobile public scope cho tới gate riêng; không chỉ bật remote flag.
- Kiểm loại/ngày tạo Play account và testing requirements hiện hành. Chưa có account/testers không chặn local Android development; ghi đúng blocker cho store production access.

**Verification**

Scripts/commands đã có ở baseline; xác minh lại tại HEAD:

- `pnpm test:security`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:mobile-policy`

Scenario / evidence:

- Owner validates actual disclosures/assets/support details; no invented legal approvals.

**Rollback / recovery:** Keep restricted features off; correct docs/workflows before submission.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N11-04 — Android internal/closed beta và review findings

**Depends on:** N11-01, N11-02, N11-03, N06-05, N12-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 123

**Deliverables**

- Google Play internal/closed track artifacts khi có quyền; Android crash/perf/UX findings, tested-device matrix và release decision

**Acceptance / Definition of done**

- Build install/update, login/delete/report/block/queue/background flows pass trên Android thật. Coverage bổ sung qua emulator/beta users hoặc device service theo support claim; một máy không chứng nhận toàn bộ hệ Android.
- Owner/store access explicit at actual upload; no hidden purchase/submission.
- Beta delivered khác store approved/public launched; record exact statuses.
- Ngay khi phân phối Android binary đầu tiên cho tester/user (kể cả private APK), đặt android_clients_distributed=true và mobile_clients_distributed=true; không chờ task VERIFIED. Record build/support window; ios_clients_distributed vẫn false khi chưa có iOS được phân phối.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm mobile:verify`

Scenario / evidence:

- Play test track khi đã được phép; local APK install được ghi riêng, không thay bằng chứng Play beta. Ghi tester eligibility/opt-in requirements từ Play Console khi tới public release.

**Rollback / recovery:** Halt rollout/test track, retain backend protocol for installed clients.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.
