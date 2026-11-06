# Virtual Life Platform — Master Agent Plan vNext

**Revision:** 2.2-animal-landscape · **Baseline audit:** `cef7dc17172f7c6cda930c99648a5e3ad609cc55` · **Requirement update:** 2026-11-06
**Scope:** Nâng nền tảng hiện hữu thành sản phẩm dễ chơi, triển khai được, đo được, có mobile và admin.  
**Implementation state:** Các task Nxx khởi tạo TODO. Tạo gói thiết kế không đồng nghĩa thực thi task.

## 1. Yêu cầu đã có của chủ dự án

- Một monorepo, nhiều bản build/deployable; CI phù hợp và ArgoCD trên server riêng.
- Repo sạch, bố cục dễ phát triển, bỏ output không cần trong source tree bằng migration an toàn.
- UI/UX là trục chính của sản phẩm, không chỉ đủ form và API.
- Gameplay màn hình ngang, chủ đề animals cho toàn Virtual Life, tạo nhân vật theo từng bộ phận và ưu tiên đồ họa đẹp mắt. [Đặc tả mới](architecture/06-LANDSCAPE-ANIMAL-VISUAL-DIRECTION.md) bổ sung N06-06..09 và gates cho UX/mobile/Lodge; chưa phải artwork hay implementation đã nghiệm thu.
- Server-authoritative; lựa chọn giao thức phục vụ gameplay và vận hành.
- App cho Google Play và App Store; chọn kiến trúc dựa trên source và phép thử thực tế. Profile mới: CachyOS + một Android vật lý; Android trước, iOS N14 conditional với macOS/iPhone testing access sau.
- Admin dashboard cho đúng một tài khoản operator: events, accounts, metrics, capacity/load tests, queue, trạng thái hệ thống và traffic.
- Ưu tiên tốc độ và đơn giản; chấp nhận thêm một thành phần kiến trúc khi nó làm nghiệp vụ hoặc consistency rõ ràng hơn.

Các yêu cầu này đủ để thiết kế và làm công việc chuẩn bị. Không cần hỏi lại các lựa chọn implementation thông thường. Chỉ hỏi khi thiếu quyết định có hậu quả đáng kể hoặc quyền truy cập thật; luôn hoàn thành phần độc lập trước.

## 2. Những quyết định kỹ thuật làm baseline

| Chủ đề | Baseline vNext | Điều kiện xem lại |
|---|---|---|
| Runtime | Modular monolith Nest/Fastify + Socket.IO; một room owner ban đầu | Load thực tế vượt giới hạn sau profiling/optimization |
| Database | PostgreSQL là nguồn dữ liệu bền vững, migration ledger duy nhất | Có bottleneck đo được; không chia DB theo world sớm |
| Worker | Entry point riêng, dùng image API, chỉ durable jobs | Tách image nếu dependency/security/performance thật sự khác |
| Build | Web/API/admin images; shared packages build nội bộ | Thêm deployable chỉ khi có vòng đời độc lập |
| CD | Argo Application theo môi trường trong cùng repo; Git pin digest | Nhiều cluster/tenant mới cân nhắc ApplicationSet |
| Realtime | Socket.IO qua WSS và HTTPS; contract không phụ thuộc renderer | Tính năng action cần transport khác sau benchmark |
| UX | Shared landscape game shell, modular animal avatar; một cảnh/vòng chơi polished trước mở rộng world | Visual QA, device budgets và usability có evidence |
| Mobile | Shared React DOM/Pixi + Vite/Capacitor; Android trước, iOS N14 riêng | Physical spike của platform không đạt hoặc hướng game thay đổi |
| Operator | Một danh tính admin, MFA/passkey và audit; service identities riêng | Chủ dự án yêu cầu thêm người vận hành |
| Admission | Queue PostgreSQL bền vững; active/reserved slots nguyên tử | Queue throughput/latency thực sự cần Redis |
| Observability | Metrics + logs + traces có kiểm soát, dashboard có freshness | Retention/cost/traffic cần pipeline lớn hơn |

Các ADR vNext là quyết định thiết kế đề xuất dùng cho scope mới. Không ghi rằng chủ dự án đã duyệt release, cung cấp secrets hoặc chấp nhận benchmark chưa chạy.

## 3. Tiếp nối kế hoạch cũ

Kế hoạch cũ có M00–M24, source hiện có 151 task với 148 VERIFIED và 3 BLOCKED_EXTERNAL trong ledger được commit. Đó là trạng thái lịch sử của phạm vi kiểm thử offline. Giữ nguyên IDs, evidence và các public/restricted gates còn đúng.

Nxx là namespace mới. M00/M01/M02 được tiếp nối bởi N00–N02; M06 bởi N05/N09; M07/M14 bởi N06/N10; M21 bởi N03/N04/N08; M22/M23 bởi N12; phần operator mở rộng M08/M12. M15–M20/M24 giữ nghiệp vụ hiện có; mọi refactor phải chạy regression tương ứng. [LEGACY-PLAN-MAPPING.md](LEGACY-PLAN-MAPPING.md) có mapping đầy đủ.

Có docs drift: tài liệu kiến trúc đầu kỳ vẫn nói “chưa mount Pixi”, trong khi handoff mới có gameplay integration. N00 tạo một bản trạng thái hiện hành dựa trên code + bằng chứng tại SHA cụ thể, giữ lịch sử có nhãn.

## 4. Trình tự thực thi

[PLAN-MANIFEST.json](PLAN-MANIFEST.json) là nguồn duy nhất của task IDs và dependency DAG. [EXECUTION-BOARD.md](EXECUTION-BOARD.md) là view để đọc. Module plan chứa lý do, phạm vi file, output, scenario nghiệm thu và rollback.

Ưu tiên theo các nhánh song song:

1. **Baseline:** N00, sau đó N01 cleanup + N02 boundaries.
2. **Sản phẩm sớm:** N06-01/N06-02 và N10-01 spike được mở sau baseline cần thiết; không chờ toàn bộ hạ tầng mới bắt đầu UX/mobile.
   Bổ sung owner 2026-11-06: giữ evidence N06-01/02 lịch sử, thực hiện N06-06 art/rig/landscape brief → N06-03 shell → N06-08 landscape và N06-07 animal creator → N06-04 polish → N06-09 visual qualification. N10-02 đang IN_PROGRESS phải checkpoint trước chuyển source slice; không lấy preview cũ chứng minh hướng mới.
3. **Nền triển khai:** N03 build/CI → N04 Argo staging; N05 authority/transport song song.
4. **Vận hành:** N07 admin → N08 observability/capacity → N09 admission/queue.
5. **Android:** N10 shared-client/physical spike → N11 Android release lane, dựa trên UX/protocol ổn định. N14 iOS là nhánh conditional độc lập, không chặn Android/web.
6. **Nghiệm thu:** N12 deployment, recovery, regression và quyết định release cụ thể.
7. **Tăng quy mô:** N13 chỉ kích hoạt khi benchmark chứng minh nhu cầu; không là điều kiện beta.

Dependency ở cấp task và conditional client-support gates quyết định có được chạy hay không; không suy ra rằng mọi task trong một module phải chờ tất cả module khác hoàn thành. Agent có thể làm nhiều nhánh không xung đột.

## 5. Boot protocol

1. Đọc AGENTS đang áp dụng, `git status`, branch/HEAD; giữ dirty changes.
2. Đọc master này, `state/task-state.json`, `state/HANDOFF.md`, blocker và ADR liên quan.
3. Đối chiếu HEAD hiện tại với SHA audit; khác SHA thì audit delta, không ép repo trở về snapshot.
4. Xác minh Node/pnpm theo repo, scripts thật và Docker/DB/browser/Android trên CachyOS. Đọc [execution profile](architecture/05-CACHYOS-ANDROID-FIRST.md); iOS runner/device availability chỉ là prerequisite cho N14.
5. Chạy validator của gói; lấy task ready từ helper. Đọc module plan và dependency evidence.
6. Đặt task IN_PROGRESS với owner/branch. Nêu acceptance cần chứng minh trước khi sửa.
7. Mỗi PR chỉ chứa một thay đổi có thể đánh giá; không trộn cleanup hàng nghìn file với đổi protocol hoặc migration.
8. Thực thi/checkpoint theo vòng dưới.

## 6. Vòng làm việc của coding agent

- Chọn task dependency-ready có priority cao; chỉ dùng task-state làm scheduler, không tự đánh VERIFIED bằng prose.
- Đọc source, tests và consumers trước khi rename/remove.
- Implement end-to-end tối thiểu để đáp ứng acceptance. Với rủi ro concurrency/security/migration, viết test failure trước. Với docs/refactor nhỏ, dùng validation phù hợp, không tạo test mô phỏng implementation để làm đẹp số lượng.
- Chạy checks của phần đổi; khi chạm contracts/db/authority/release phải chạy matrix liên quan rộng hơn.
- Phân biệt lỗi có sẵn, lỗi do change và lỗi môi trường; không bỏ gate hoặc sửa số đo để xanh.
- Cập nhật evidence: SHA hoặc workspace diff hash, command, exit code, môi trường, timestamp, test reports, hạn chế.
- Đánh VERIFIED chỉ nếu acceptance thực sự đạt. Exit code 0 của benchmark chưa đủ: đọc cả kết luận hypothesis và accepted/rejected workload.
- Cập nhật handoff và bước tiếp theo chính xác. Tiếp tục task độc lập khi một task bị chặn bởi device/server credentials.
- Commit/draft PR khi scope thực thi cho phép. Không tự merge/deploy public chỉ để đóng checklist.

Task code và gate release khác nhau: một implementation có thể VERIFIED trong staging trong khi `releaseStatus=NOT_REQUESTED` hoặc `TECHNICALLY_READY`. Store submission thành công cũng không chứng minh được store approval.

## 7. Phối hợp nhiều agent

Một coordinator giữ `PLAN-MANIFEST.json`, `state/*`, root package scripts, migration numbering, public contracts và composition roots. Agent khác sở hữu file/domain giới hạn, báo thay đổi cần coordination.

| Lane | Quyền sửa chính | Điểm cần phối hợp |
|---|---|---|
| Foundation/CI | infra, workflows, scripts kiểm tra, documentation index | package scripts, migration hooks |
| Runtime | API modules, authority, durable jobs, admission | contracts, migrations, native auth |
| Experience | game-client, portal, design tokens, scenes | contracts, asset manifest |
| Mobile/admin | mobile shell hoặc admin UI theo task reservation | identity, metrics API, build matrix |

Mỗi agent dùng worktree/branch riêng nếu có Git clone. Không chạy hai migration authors vào cùng sequence; không hai agent cùng sửa app.ts hoặc lockfile không có reservation. Merge từng PR với CI mới trên base mới. Không coi subagent report là evidence test nếu report không có kết quả thật.

## 8. Quy tắc giữ chất lượng

- Không làm giảm safety/privacy chỉ để giảm latency; cache quyền phải invalidation đúng khi block/revoke.
- Không tăng API replicas vì Kubernetes cho phép; room authority hiện chỉ một owner.
- Không gắn worker vào createApp có RoomAuthority. Không đưa workload load generation vào API production.
- Không biến cap room hay 1.000 socket thành số CCU server đã chứng minh.
- Không nâng giới hạn tự động khi metric thiếu/stale. Gate fail closed, UI báo không rõ thay vì khỏe giả.
- Không tắt browser Origin/CSRF để app native kết nối; native có contract auth riêng.
- Không xóa evidence/raw assets/license/migrations/test fixtures trước khi consumer chuyển và restore được.
- Không export telemetry bearer token, DB credential, Argo admin token ra browser.
- Không đẩy health/schema/Postgres details vào hành trình chơi.
- Không dùng `latest` cho deployment; pin digest và promote đúng artifact đã test.
- Mobile packages và API hỗ trợ compatibility window có test; upgrade client là rollout riêng.

## 9. Evidence và trạng thái

Các trạng thái task: `TODO`, `IN_PROGRESS`, `VERIFIED`, `BLOCKED_TECHNICAL`, `BLOCKED_EXTERNAL`, `DEFERRED_APPROVED`. Chỉ dùng trạng thái cuối khi owner thực sự chấp thuận defer; không dùng để che lỗi.

Mỗi VERIFIED phải tham chiếu ít nhất một evidence object có `taskId`, `sourceRevision`, `environment`, `executedAt`, `commands` (exit code thật), `artifacts`, `acceptance`, `limitations`. Không ghi secrets/PII. VERIFIED luôn gắn revision: khi source/config/hardware thay đổi có ảnh hưởng, coordinator revalidate và chạy lại gates liên quan trước khi dùng cho release; không coi trạng thái ấy còn đúng vô thời hạn. SourceRevision có thể là diff hash khi chưa commit, nhưng release evidence phải pin Git SHA + image digests.

Raw logs/screenshots nằm trong artifact storage có kiểm soát; repository giữ index/hash và acceptance summaries nhỏ. Một artifact GitHub Actions có retention hữu hạn không tự nó là archive lâu dài.

## 10. Những việc thiếu dữ liệu nhưng không chặn phần thiết kế

- CPU/RAM/disk/IOPS/uplink, máy riêng hay nhiều node; Kubernetes/k3s và ingress hiện có.
- Region người chơi, model/OS của Android hiện có, CPU/RAM/GPU máy CachyOS, mức room occupancy/CCU mong muốn; iPhone target/access thu thập ở N14.
- Domain, storage/backup ngoài host, Apple/Google signing accounts và quyền truy cập khi tới release.
- Art direction cuối cùng và asset rights; trial UI có thể dùng asset sở hữu hiện tại.

N00/N04/N08/N10 thu thập đúng lúc cần. Không dùng các câu hỏi này làm lý do dừng cleanup, design, local regression hoặc plan.

## 11. Điều kiện kết thúc một đợt

Báo theo format:

~~~text
Baseline HEAD / branch:
Task IDs và scope:
Files và thay đổi hành vi:
Commands đã chạy + exit codes:
Acceptance đạt/chưa đạt:
Ảnh/artifact/digest liên quan:
Database/protocol compatibility:
Blockers và rủi ro còn lại:
Public/store release status:
Next exact action:
~~~

Không báo “hoàn thành platform” chỉ vì hoàn thành bộ plan. Không hứa chạy nền giữa các phiên. [QUALITY-GATES.md](QUALITY-GATES.md) định nghĩa lúc nào được gọi ready cho internal beta, mobile beta và production.
