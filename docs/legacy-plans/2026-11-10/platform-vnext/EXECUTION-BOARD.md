# Execution Board — vNext

> Current owner policy (2026-11-09): **web/server/platform first; native mobile deferred**. See [revision 2.4](REVISION-2.4-WEB-FIRST.md). Physical devices/APK/AVD/store work do not block web features. Responsive browser quality and supported-client compatibility gates remain. Earlier Android-first wording below is historical where not explicitly revised.

**15 workstreams · 77 tasks (76 trước đó + N10-06 native follow-up).** Implementation 0 VERIFIED là snapshot tại generation, không phải tiến độ hiện hành. Snapshot baseline: `cef7dc17172f7c6cda930c99648a5e3ad609cc55`. Trạng thái hiện hành chỉ nằm trong [state/task-state.json](state/task-state.json); bảng này là kế hoạch tại lúc tạo. [Owner3D update](architecture/07-3D-FUR-AND-EMULATOR.md) giữ evidence cũ và thêm gates, chưa là3D PASS.

## Waves và demo phải có

| Wave | Phạm vi chính | Kết quả có thể review |
|---|---|---|
| R0 — baseline | N00 | Source/CI/evidence hiện hành và quyết định kiến trúc rõ |
| R1 — nền tảng, thiết kế sớm | N01, N02; N06-01/02, N10-01 song song | Repo gọn có restore; boundaries; UX prototype và mobile feasibility scope |
| R2 — artifact và runtime | N03, N04, N05 | Image thật, Argo staging, authority/drain/rollback đã thử |
| R3 — chơi và vận hành | N06, N07, N08, N09 | Hai vòng chơi polished + admin live + capacity report + queue |
| R4 — Web/Lantern Lodge | N06, N15–N19 web scope | Creator, polished 3D worlds, complete web game modes/QA/ops |
| R5 — web readiness/release | N12 web scope | Regression + recovery + candidate cụ thể; deploy khi được phép |
| R6 — conditional scale | N13 | Chỉ khi benchmark chứng minh singleton không đáp ứng mục tiêu |
| Mobile later — deferred by owner | N10/N11/N12-03/N14/N19-04 | macOS/Xcode, iPhone thật, iOS compatibility và TestFlight; không phải chờ N13 |

Đây là thứ tự phụ thuộc, không là cam kết ngày hoàn thành. Chia mỗi task lớn thành PR nhỏ giữ acceptance nguyên vẹn. Không làm R6 để trì hoãn một beta tốt. Web release có thể độc lập với mobile release nếu dossier ghi đúng phạm vi.

## Scheduling

Chạy `node tools/next-task.mjs` từ gói để xem ready tasks. Helper chỉ coi dependency VERIFIED là thỏa; DEFERRED_APPROVED không tự bỏ dependency. N12-01/04/05 có Android gate N12-03 và iOS gate N14-04 theo platform context true/unknown. Platform false chỉ khi chưa có binary supported/distributed. N13 và N14 mặc định CONDITIONAL_NOT_ACTIVE; activation cần evidence phù hợp (capacity đối với N13, resource access đối với N14). Xem [profile CachyOS](architecture/05-CACHYOS-ANDROID-FIRST.md).

| ID | Task | Depends on | Owner lane | Plan |
|---|---|---|---|---|
| N00-01 | Xác minh baseline tại HEAD đang làm | — | Coordinator | [N00](plans/N00-baseline.md) |
| N00-02 | Tích hợp plan vNext và sửa docs drift | N00-01 | Coordinator | [N00](plans/N00-baseline.md) |
| N00-03 | Inventory môi trường đích và assumptions | N00-01 | Coordinator | [N00](plans/N00-baseline.md) |
| N00-04 | Ghi ADR baseline và ownership | N00-02 | Coordinator | [N00](plans/N00-baseline.md) |
| N01-01 | Phân loại file và consumer map | N00-01 | Foundation | [N01](plans/N01-repository.md) |
| N01-02 | Thiết kế evidence index và archive/restore | N01-01 | Foundation | [N01](plans/N01-repository.md) |
| N01-03 | Chuyển validators sang evidence index | N01-02 | Foundation | [N01](plans/N01-repository.md) |
| N01-04 | Bỏ output đã archive khỏi current tree | N01-03 | Foundation | [N01](plans/N01-repository.md) |
| N01-05 | Chứng minh clean checkout và docs hiện hành | N01-04 | Foundation | [N01](plans/N01-repository.md) |
| N02-01 | Lập module API và dependency graph | N00-04 | Runtime + Coordinator | [N02](plans/N02-boundaries.md) |
| N02-02 | Refactor module từng vertical slice | N02-01 | Runtime + Coordinator | [N02](plans/N02-boundaries.md) |
| N02-03 | Chuyển offline guards thành policy theo environment | N02-01 | Runtime + Coordinator | [N02](plans/N02-boundaries.md) |
| N02-04 | Schema compatibility cho migration và rollback | N02-01 | Runtime + Coordinator | [N02](plans/N02-boundaries.md) |
| N03-01 | Pin và tái lập toolchain/build graph | N01-05, N02-02 | Foundation/CI | [N03](plans/N03-build-ci.md) |
| N03-02 | Harden API image và migrator target | N03-01 | Foundation/CI | [N03](plans/N03-build-ci.md) |
| N03-03 | Harden portal web image | N03-01 | Foundation/CI | [N03](plans/N03-build-ci.md) |
| N03-04 | Quality CI, registry publish và release manifest | N03-02, N03-03 | Foundation/CI | [N03](plans/N03-build-ci.md) |
| N03-05 | Thêm admin build vào cùng quality contract | N03-04, N07-02 | Foundation/CI | [N03](plans/N03-build-ci.md) |
| N04-01 | Kustomize base/overlays và cluster preflight | N03-04, N02-03, N02-04 | Foundation/CI | [N04](plans/N04-argocd.md) |
| N04-02 | Promotion digest trong cùng repo không loop | N04-01 | Foundation/CI | [N04](plans/N04-argocd.md) |
| N04-03 | Full sync lifecycle và singleton drain | N04-02, N05-04 | Foundation/CI | [N04](plans/N04-argocd.md) |
| N04-04 | Chạy staging deployment thật và ghi release evidence | N04-03 | Foundation/CI | [N04](plans/N04-argocd.md) |
| N05-01 | Khóa invariants và contract envelope | N02-01 | Runtime | [N05](plans/N05-authority.md) |
| N05-02 | Instrument queue wait, fanout và event-loop | N05-01 | Runtime | [N05](plans/N05-authority.md) |
| N05-03 | Tối ưu theo profiling và giữ consistency | N05-02 | Runtime | [N05](plans/N05-authority.md) |
| N05-04 | Drain, owner loss và reconnect recovery | N05-01, N02-04 | Runtime | [N05](plans/N05-authority.md) |
| N05-05 | Tách durable worker bootstrap | N02-02, N05-01 | Runtime | [N05](plans/N05-authority.md) |
| N05-06 | Protocol/content compatibility cho client N và N-1 | N05-01, N02-04 | Runtime | [N05](plans/N05-authority.md) |
| N06-01 | Product journey và art direction | N00-02 | Experience | [N06](plans/N06-ux.md) |
| N06-02 | Design system và prototype có trạng thái lỗi | N06-01 | Experience | [N06](plans/N06-ux.md) |
| N06-03 | Implement shared game shell và điều hướng | N06-02, N05-06, N06-06 | Experience | [N06](plans/N06-ux.md) |
| N06-04 | Polish hai vòng chơi Deadline/Maid | N06-03, N05-04, N06-07, N06-08 | Experience | [N06](plans/N06-ux.md) |
| N06-05 | Usability, accessibility và product instrumentation | N06-04, N06-09 | Experience | [N06](plans/N06-ux.md) |
| N07-01 | Operator identity, MFA và audit | N02-03, N05-01 | Admin + Runtime | [N07](plans/N07-admin.md) |
| N07-02 | Admin shell và backend proxy boundaries | N07-01, N06-02 | Admin + Runtime | [N07](plans/N07-admin.md) |
| N07-03 | Events/accounts/runtime controls | N07-01, N02-03 | Admin + Runtime | [N07](plans/N07-admin.md) |
| N07-04 | Overview, live system map và traffic | N07-02, N08-01 | Admin + Runtime | [N07](plans/N07-admin.md) |
| N07-05 | Triển khai admin riêng với access boundary | N03-05, N04-04, N07-03, N07-04 | Admin + Runtime | [N07](plans/N07-admin.md) |
| N08-01 | Metrics/traces/logs contracts có freshness | N05-02, N02-03 | Operations + Runtime | [N08](plans/N08-capacity.md) |
| N08-02 | Collector, dashboards, alerts và backup visibility | N08-01, N04-04 | Operations + Runtime | [N08](plans/N08-capacity.md) |
| N08-03 | Load runner và admin launch controls | N07-01, N08-01, N04-04, N07-02 | Operations + Runtime | [N08](plans/N08-capacity.md) |
| N08-04 | Đo mixed workload trên môi trường mục tiêu | N08-02, N08-03, N05-03, N05-05 | Operations + Runtime | [N08](plans/N08-capacity.md) |
| N08-05 | Capacity recommendation có version và expiry | N08-04 | Operations + Runtime | [N08](plans/N08-capacity.md) |
| N09-01 | Contract queue/lease và capacity state machine | N05-01, N08-01 | Runtime + Experience | [N09](plans/N09-admission.md) |
| N09-02 | PostgreSQL queue và atomic grant | N09-01, N05-04 | Runtime + Experience | [N09](plans/N09-admission.md) |
| N09-03 | Queue UX web/mobile và reconnect states | N09-02, N06-03 | Runtime + Experience | [N09](plans/N09-admission.md) |
| N09-04 | Admin cap policy và queue controls | N09-02, N07-03, N08-05 | Runtime + Experience | [N09](plans/N09-admission.md) |
| N09-05 | Fault/concurrency/load acceptance | N09-03, N09-04, N05-04 | Runtime + Experience | [N09](plans/N09-admission.md) |
| N10-01 | Thiết kế spike và device/performance budgets | N00-04, N06-01 | Experience/Mobile | [N10](plans/N10-mobile-spike.md) |
| N10-02 | Tách browser-only game client và bundle mobile đầu tiên | N10-01, N02-02, N06-02 | Experience/Mobile | [N10](plans/N10-mobile-spike.md) |
| N10-03 | Native sessions và one-time socket ticket | N10-02, N05-06, N02-03 | Experience/Mobile | [N10](plans/N10-mobile-spike.md) |
| N10-04 | Physical Android spike và quyết định kiến trúc theo thiết bị | N10-03, N06-04, N05-04, N06-09, N10-06 | Experience/Mobile | [N10](plans/N10-mobile-spike.md) |
| N11-01 | Android signed build pipeline và artifact traceability | N10-04, N03-04 | Mobile | [N11](plans/N11-mobile-release.md) |
| N11-02 | Android interaction và lifecycle hoàn chỉnh | N10-04, N09-03 | Mobile | [N11](plans/N11-mobile-release.md) |
| N11-03 | Account deletion, UGC và Google Play dossier | N07-03, N10-03 | Mobile | [N11](plans/N11-mobile-release.md) |
| N11-04 | Android internal/closed beta và review findings | N11-01, N11-02, N11-03, N06-05, N12-03 | Mobile | [N11](plans/N11-mobile-release.md) |
| N12-01 | Deployment regression end-to-end | N04-04, N05-04, N07-05, N09-05 | Coordinator + QA/Operations | [N12](plans/N12-release-regression.md) |
| N12-02 | Backup restore, failure drills và operational handoff | N08-05, N12-01, N05-05 | Coordinator + QA/Operations | [N12](plans/N12-release-regression.md) |
| N12-03 | Android/server version compatibility gate | N11-01, N11-02, N11-03 | Coordinator + QA/Operations | [N12](plans/N12-release-regression.md) |
| N12-04 | Web beta/production readiness dossier | N06-05, N12-02, N09-05 | Coordinator + QA/Operations | [N12](plans/N12-release-regression.md) |
| N12-05 | Phát hành có scope và theo dõi sau deploy | N12-04 | Coordinator + QA/Operations | [N12](plans/N12-release-regression.md) |
| N13-01 | Xác nhận trigger và ADR split runtime | N08-05, N12-02 | Runtime/Operations | [N13](plans/N13-scaling.md) |
| N13-02 | Room directory, routing và fencing | N13-01 | Runtime/Operations | [N13](plans/N13-scaling.md) |
| N13-03 | Shard/load/rolling failure acceptance | N13-02 | Runtime/Operations | [N13](plans/N13-scaling.md) |
| N14-01 | Xác minh macOS/Xcode, signing và iPhone access | N10-01 | Mobile/Operations | [N14](plans/N14-ios-release.md) |
| N14-02 | iOS native adapters và signed build trên macOS | N14-01, N10-03, N11-01 | Mobile/Operations | [N14](plans/N14-ios-release.md) |
| N14-03 | Physical iPhone spike và iOS UX/lifecycle gate | N14-02, N10-04, N11-02 | Mobile/Operations | [N14](plans/N14-ios-release.md) |
| N14-04 | iOS/server version compatibility gate | N14-03, N11-03 | Mobile/Operations | [N14](plans/N14-ios-release.md) |
| N14-05 | TestFlight, App Store dossier và review findings | N14-04, N06-05 | Mobile/Operations | [N14](plans/N14-ios-release.md) |
| N06-06 | Animal art direction, modular rig/catalog và landscape storyboard | N06-02 | Experience | [N06](plans/N06-ux.md) |
| N06-07 | Modular animal creator, authoritative appearance và shared rendering | N06-03, N06-06, N02-04, N05-06, N06-11 | Experience | [N06](plans/N06-ux.md) |
| N06-08 | Landscape web gameplay shell và accessible fallback; native orientation deferred | N06-03, N06-06 | Experience | [N06](plans/N06-ux.md) |
| N06-09 | Animal/landscape visual qualification và asset performance evidence | N06-04, N06-07, N06-08, N06-11 | Experience | [N06](plans/N06-ux.md) |
| N06-10 | Art direction3D, fur/rig pipeline và budgets trước đo | N06-06, N06-08 | Experience | [N06](plans/N06-ux.md) |
| N06-11 | Shared3D renderer spike, rig/fur và phòng đại diện | N06-10, N06-08 | Experience | [N06](plans/N06-ux.md) |
| N10-05 | Android Emulator độc lập cho development và regression | N10-02 | Experience/Mobile | [N10](plans/N10-mobile-spike.md) |
| N10-06 | Native creator/world qualification sau platform web | N10-03, N10-05, N06-09 | Experience/Mobile | [N10](plans/N10-mobile-spike.md) |
