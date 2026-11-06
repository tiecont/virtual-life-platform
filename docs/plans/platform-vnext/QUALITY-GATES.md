# Quality gates — từ source tới release có bằng chứng

**Trạng thái:** tiêu chí nghiệm thu đề xuất; tài liệu này không chứng nhận test/build/deploy đã pass.  
**Baseline:** `cef7dc17172f7c6cda930c99648a5e3ad609cc55`. Khi thực thi trên HEAD mới, audit delta và giữ kết quả lỗi có sẵn. Chỉ chạy phạm vi đủ giải quyết rủi ro của change; contract, database, authority và release cần ma trận rộng hơn một sửa UI nhỏ.

## 1. Commands hiện hữu và harness cần bổ sung

Các lệnh sau có trong [package.json tại SHA audit](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/package.json). Chúng cần môi trường/prerequisites thật; không suy từ sự tồn tại của script rằng đã chạy thành công.

| Phạm vi | Lệnh hiện hữu | Cần ghi nhận |
|---|---|---|
| Install/build | `pnpm install --frozen-lockfile`, `pnpm build:packages`, `pnpm build` | Node/pnpm đúng repo, lockfile không trôi, fresh build |
| Static/unit | `pnpm lint`, `pnpm typecheck`, `pnpm test` | Boundary/type/domain assertions, không chỉ số lượng tests |
| Baseline tổng hợp | `pnpm check` | Có governance/CI/infra/legacy/architecture/assets, unit/integration/build; không thay toàn bộ E2E/deployment gate |
| DB/security | `pnpm test:integration`, `pnpm test:security` | DB cô lập; selected security lane có thể trùng integration, không cần chạy lặp vô ích |
| Browser | `pnpm test:e2e`, hoặc `pnpm ci:browser` theo workflow | Browser groups, actual version, scenario/report |
| Infra | `pnpm infra:check`, `pnpm infra:smoke` | Static validation khác image/TLS stack smoke |
| Load cũ | `pnpm bench:rooms`, `pnpm bench:city --clients=100 --soak=120` | Outcome của hypothesis, admitted/rejected, cleanup; không coi là production capacity |
| Domain load | `pnpm bench:deadline`, `pnpm bench:restaurant`, `pnpm bench:lounge` | Profile và domain được kiểm, không suy rộng sang mọi world |

Node/pnpm tại snapshot được pin trong repo; xác nhận lại khi chạy, không tự đổi major. Baseline cũ của city chỉ nhận những profile/duration đã định nghĩa: không truyền `--soak=7200` rồi giả định nó được hỗ trợ.

Các tên **đề xuất, phải implement trước khi dùng**: `test:contracts:compat`, `images:verify`, `test:deployment`, `test:admission`, `bench:capacity`, `test:mobile:device`. Module task có thể chọn tên khác nhưng phải khai báo command thật, fixture cleanup, failure output và CI entrypoint. File plan hoặc shell stub in “PASS” không đạt gate.

## 2. Gate code, package, image và contract

- Change giữ import ownership; world không truy cập SQL/domain private của world khác. `game-client` không có Next server/Node/secrets; mobile và portal dùng chung contract, không copy business authority.
- Shared package/schema/lockfile changes build và test mọi consumer bị ảnh hưởng. Chỉ đổi web presentation có thể dùng phạm vi hẹp; không bỏ API contract checks khi schema đổi.
- Web/API/admin image chạy production mode từ fresh context; runtime nonroot, writable paths tối thiểu, không secrets/test artifacts/dependencies build dư. Worker/migrator dùng API digest với entrypoint riêng; worker không acquire room owner lock.
- Release manifest pin source SHA, digest từng image và asset/protocol/schema revisions. Staging và production promote cùng artifact; không rebuild để có “cùng tag”.
- Contract compatibility gồm API N/client N, API N/client N−1 trong support window, asset/scene revision và graceful unsupported-client response. Test auth, reconnect, travel và payload thực; typecheck hai đầu chưa chứng minh wire compatibility.

UI gate kiểm layout desktop/mobile, keyboard/screen reader alternatives, safe area, loading/error/offline/queue states và reduced motion. Screenshot đẹp không thay tương tác; E2E pass cũng không thay usability. Chương [UX/mobile](architecture/04-UX-MOBILE.md) giữ budget và scenario thiết bị.

Owner update 2026-11-06 thêm gate [landscape/animal/visual](architecture/06-LANDSCAPE-ANIMAL-VISUAL-DIRECTION.md): N06-06..09 phải có scene và creator từng bộ phận tương tác thật, appearance server-validated/compatible, landscape web/Android cùng portrait fallback và provenance/visual rubric có findings. N06-05 và N10-04 chờ N06-09; fresh physical spike phải dùng build/assets mới. Technical visual QA, owner art approval và usability là ba kết luận riêng. Không sửa thresholds cũ hoặc coi historical prototype đã đạt yêu cầu mới.

## 3. Deployment, dữ liệu và authoritative correctness

Ma trận chính thức là **CD-01 đến CD-15** ở [chương CI/CD, mục 7](architecture/02-CI-CD-ARGOCD.md#7-ma-trận-deployment-regression). Staging-ready cần outcome/evidence cho đủ 15 scenario; không chép một checklist mới rồi bỏ qua failure paths.

Các invariant quyết định pass:

1. Empty DB/current DB lên candidate, migrate rerun và checksum failure đều có kết quả rõ. Historical SQL không bị sửa. Binary N−1 được thử trên DB expand N trước khi gọi rollback an toàn; schema incompatible phải dừng hoặc roll-forward theo runbook.
2. Hai API process cạnh tranh không tạo hai owners. Lock loss, DB outage, crash hoặc stale epoch làm command từ chối đúng; không ACK thành công sau khi mất authority. Chưa có fenced multi-owner thì `replicas=1` là release constraint.
3. Drain dừng admission/work mới, xử lý pending trung thực và đóng socket đúng hạn. Restart mất room memory phải dẫn tới fresh membership/resync; durable identity/order/reward không biến mất hoặc tự hoàn tất.
4. Seat/order/reward/travel races, duplicate request, lost ACK và retry không nhân đôi effect. Permission/block/consent bị revoke lúc request đang chờ vẫn có hiệu lực trước publication/commit liên quan.
5. Ingress/TLS, proxy header, browser Origin/cookie/CSRF, native ticket và internal-route protection đều được thử qua đường network triển khai thật.
6. Failed smoke/migration/health giữ admission đóng. PostSync failure không được ghi là automatic rollback; revert dùng compatible digest hoặc roll-forward, không tự down-migrate DB.

Backup restore rehearsal dùng target cô lập, kiểm dữ liệu/keys và thời gian phục hồi. Routine rollback không restore backup cũ làm mất giao dịch hoặc phục hồi consent đã rút.

## 4. Demo staging tối thiểu end-to-end

Demo dùng release set được pin, accounts/fixtures test và API thật; không nối những mock screen rời rạc rồi gọi playable.

| Luồng | Bằng chứng tối thiểu |
|---|---|
| Player mới | Chọn avatar → vào Deadline → chọn ghế → focus; UI rõ hành động và kết quả server |
| Hai player | Tranh một ghế; chỉ một owner, người còn lại có phản hồi và đường tiếp tục |
| Maid | Khách đặt order, người phục vụ tự nguyện nhận/phục vụ; retry không double-complete/reward |
| Travel/recovery | Deadline → Maid → city; mất mạng trước/sau ACK, destination đầy và restart không tạo hai active worlds |
| Safety | Report/block/revoke có hiệu lực phía server và across travel, không chỉ ẩn nút |
| Queue | Cap nhỏ trong test environment, người dư vào FIFO; expiry/replay/multi-tab/reconnect không tạo slot thừa |
| Operator | Một admin MFA đăng nhập, tạo/schedule event, xem metric, hạ target cap, audit before/after và reason |
| Operations | Collector mất tín hiệu thành stale/unknown; no traffic khác backend down; bounded staging load Job cancel/cleanup được |

User thường phải bị deny mọi admin read/write. Screenshot/video chỉ lưu dữ liệu synthetic; kèm logs và outcome. Mobile beta chạy lại luồng phù hợp trên app cài thật; emulated mobile browser không đủ.

## 5. Admission và capacity qualification

Đếm các tập loại trừ nhau: `occupied = active + reconnect_grace + unexpired_reserved`. Một account chỉ có một slot; reconnect trong grace tái dùng slot, hết grace phải qua admission lại. Travel giữ platform slot và chỉ reserve room đích.

Invariant: `occupied <= C_hard <= C_sustainable`; `C_target <= C_hard`. Grant mới chỉ khi `occupied + 1 <= C_target`. Mặc định đề xuất `C_recommended = floor(C_sustainable × 0.70)` và `C_target = C_recommended`. Hạ target dưới occupancy tạo `DRAINING_LIMIT`, không grant mới hoặc kick người đang chơi. Hạ hard bound là pending policy cho đến khi occupancy vừa bound mới.

Test đồng thời last-slot, nhiều allocators, expired/reserved token, duplicate tabs, session revoke, DB failure, worker/process restart, cap change và grace expiry. FIFO, deadline và idempotency phải được quan sát từ outcome; timer cleanup đơn lẻ không chứng minh correctness. Thiếu capacity/authority signal thì fail closed đối với grant mới; recommendation không tự nâng quota.

Capacity candidate phải có **ít nhất 30 phút steady-state với active gameplay mix và ít nhất 2 giờ soak**; đây là mục tiêu đề xuất cho harness mới. CI regression nhỏ không cần chạy full soak mỗi commit. Thử trên hardware/cgroup/topology tương đương server, load generator tách và được đo riêng; thêm TLS/WAN profile, movement/chat/focus/orders/travel, reconnect storm/slow reader/NAT và dependency delay.

Report tách connection, admitted, active action, rejected và timeout; có latency của successful requests và all attempts, p95/p99, queue-wait, event-loop, DB wait, memory/backlog, release digest và cleanup. Áp mục tiêu đề xuất trong [chương runtime, mục 5](architecture/03-RUNTIME-ADMIN-CAPACITY.md#5-capacity-đo-khuyến-nghị-và-điều-khiển); chốt profile trước đo, mọi đổi threshold có lý do/version.

**Exit 0** chỉ có thể nghĩa harness hoàn tất. Gate capacity còn đọc `outcome/hypothesis`, số admitted và SLO. Không dùng 1.000 idle sockets, fast rejection hoặc 120 giây local để tuyên bố maximum CCU. `C_sustainable` là mức cao nhất đã chứng minh trong profile cụ thể, không giới hạn phổ quát cho mọi workload.

## 6. Admin, metric freshness và load controls

Admin session/MFA/recovery/revoke và step-up có negative tests. Metric proxy query allowlist/read-only, không lộ bearer token trong bundle/network response. Action có optimistic version, reason, audit và scope; runtime DB-owned flags/quota không patch K8s phía sau Argo.

Metric chứa observation time/source/revision. Thiếu sample, reset counter, collector outage và DB summary failure không thành số 0; windowed histogram phân biệt server fault với policy denial. Traffic animation chỉ phản ánh rate thật. Alert route phải thử delivery, không chỉ validate YAML. Không account/chat/private dating data trong labels.

Load runner chỉ nhận image/profile/namespace/target staging allowlisted, có quotas/deadline/NetworkPolicy, cancel và cleanup. Invalid URL/image/shell phải bị reject. Không có cluster-admin trong browser; production test cần scope riêng đã xác định.

## 7. Native app và store gates

Physical gates độc lập: N10-04 dùng Android thật hiện có; N14-03 dùng iPhone khi iOS lane được kích hoạt. Ghi build/model/OS/WebView/network, 30 phút chơi, cold/warm start, FPS/frame-time, native/JS memory, thermal/battery, 20 enter/leave và 10 background/resume. Keyboard/safe area/TalkBack kiểm Android; VoiceOver kiểm iOS riêng. N10-04 là device-baseline, không chứng nhận mọi Android hoặc support floor chưa đo. Mac/iPhone thiếu không chặn Android; task iOS thiếu prerequisite sau activation ghi BLOCKED_EXTERNAL. Emulator không thay physical PASS. Xem [CachyOS profile](architecture/05-CACHYOS-ANDROID-FIRST.md).

Kiểm native auth từ secure credential storage tới HTTPS exchange và single-use socket ticket: expired/replay/wrong audience, refresh rotation, logout/revoke, process kill, đổi Wi-Fi/cellular, sleep/resume. Sau reconnect phải resync trước mutation; browser Origin/CSRF vẫn hoạt động. API candidate và rollback đều thử với mobile binary còn lưu hành N−1.

Android-beta-ready cần signed Android artifacts và Play test-track journeys đã kiểm; local APK-ready là mốc riêng không cần Play account. iOS-beta-ready cần signed archive/IPA, iPhone journeys và TestFlight tại N14. Không yêu cầu iOS để công nhận Android beta trong scope Android. Store candidate còn cần privacy disclosures, account deletion, UGC filtering/report/block và support vận hành, assets có rights, gameplay hữu ích và lifecycle hoàn chỉnh. Apple có yêu cầu về UGC, deletion và giá trị vượt website đóng gói; Google yêu cầu đường deletion trong app/web và moderation phù hợp. Kiểm lại quy định khi nộp. [Apple](https://developer.apple.com/app-store/review/guidelines/), [Google deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [Google UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).

Dating/random matching giữ gated ngoài initial mobile release như chương UX. Binary ký/build thành công không chứng minh store approval; submission, approved và published là các trạng thái riêng.

## 8. Evidence và cách gọi ready

Mỗi evidence ghi task/scenario ID, source SHA hoặc diff hash, image/app digests, environment/device, timestamp, commands và exit codes thật, expected/actual, outcome, artifacts/hash và limitations. Raw logs/screenshots/reports được archive có access/retention rõ; repo giữ summary/index nhỏ. Trước khi bỏ raw evidence khỏi source, xác minh hash, khả năng retrieve/restore và chuyển verifier consumers; artifact CI có expiry không tự là archive bền vững.

`VERIFIED` chỉ áp cho task có đủ acceptance evidence hiện hành. `NOT_RUN`, fail và blocked phải giữ rõ; không lấy status historical ledger hoặc subagent prose thay test. Plan validation không đổi implementation tasks từ TODO sang VERIFIED.

- **Internal beta ready:** gameplay slice, authority/safety, staging deployment và operator/queue demo đạt trong scope công bố.
- **Android beta ready:** thêm Android physical/auth/lifecycle/performance và Play signed distribution, chưa là store approval.
- **iOS beta ready:** gate N14 tương ứng có evidence iPhone và TestFlight; Android beta không bị chặn bởi iOS chưa triển khai.
- **Production candidate:** exact release set qua CD-01…15, measured capacity policy, backup/restore, live monitoring/alert, compatibility và rollback/roll-forward evidence còn hiệu lực.

Production/public/store publication vẫn là quyết định release cụ thể. Báo riêng technical readiness, blockers và release state; không ghi “platform hoàn thành” hoặc “đã live” vì gói plan đầy đủ.


## Applicability cho web release trước mobile

CD-10 đánh applicability theo platform: Android chưa phân phối/hỗ trợ thì Android subcases NOT_APPLICABLE; iOS tương tự. Ngay lần trao Android binary đầu cho tester/user đặt android_clients_distributed=true; iOS đặt ios_clients_distributed=true. Aggregate mobile_clients_distributed được cập nhật theo hai field. N12-01/04/05 yêu cầu N12-03 cho Android true/unknown, N14-04 cho iOS true/unknown. Không reset false khi còn supported clients; cập nhật supported-build inventory và evidence theo từng candidate. First release chưa có N−1 thật ghi previous-release case NOT_APPLICABLE và lưu baseline, không tạo gate bất khả thi. Gọi một đợt là web release không bỏ compatibility với mobile đã lưu hành.
