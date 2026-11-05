# 03 — Runtime authoritative, admission và admin vận hành

**Trạng thái:** Kiến trúc đề xuất để thực thi theo từng phase; chưa triển khai bởi bản kế hoạch này.  
**Baseline đã review:** `tiecont/virtual-life-platform@cef7dc17172f7c6cda930c99648a5e3ad609cc55`, ngày 05/11/2026.  
**Nguyên tắc:** Giữ business rules nhất quán, tối ưu đường xử lý đã đo, tách runtime khi giúp cô lập tải hoặc đơn giản hóa nghiệp vụ.

## 1. Quyết định nền tảng

Giữ TypeScript, Nest/Fastify, Socket.IO và PostgreSQL. API và authoritative room runtime nằm chung một process ở phase đầu. Mỗi world là module hoặc adapter với contract rõ, không mặc định một service riêng. Một account có một membership chơi đang active; avatar/render phía client thể hiện state mà server cho phép.

Source hiện đã kiểm tra membership/epoch/capacity/seat, tính đường đi trên server, giữ receipt chống request lặp và xử lý travel bằng intent bền vững. Việc tiếp theo là cải thiện performance, admission, deployment và trải nghiệm recovery trên nền đó. Không cần viết lại authority bằng game engine. [S1][S2]

| Runtime | Vai trò | Image và quyền |
|---|---|---|
| `portal-web` | Portal, game shell, UI web và scene renderer | Image frontend riêng; không có DB credentials |
| `admin-web` | Một operator đăng nhập, dashboard và UI quản trị | Image riêng; browser không giữ metrics token hoặc Kubernetes credentials |
| `platform-api` | HTTPS, Socket.IO, business modules, admission, owner của rooms | `vlp-api`; một replica cho đến khi gate multi-owner được chứng minh |
| Worker tùy chọn | Outbox, notification, retention, schedule và hậu xử lý report | **Cùng image `vlp-api`, entrypoint/role worker riêng**; không khởi tạo `createApp()` hoặc `RoomAuthority` |
| PostgreSQL | Business state, transactions, admission, jobs, audit | Dịch vụ dữ liệu với backup/restore; không thay ORM/database chỉ vì refactor |

Worker chỉ nhận công việc đã persist và không cần quyền thay đổi room memory. `rooms.maintain()` cùng những thao tác gắn membership ở owner; nếu worker cần tác động room, nó gửi command qua port có kiểm tra owner/epoch. Không chuyển nguyên chuỗi `main.ts` sang worker: hiện chuỗi đó trộn room maintenance và domain jobs. [S3]

PostgreSQL là lựa chọn đầu tiên cho durable queue và transactional outbox. Chưa bắt buộc Redis, Kafka, service mesh hay database cho từng world. Redis chỉ được thêm khi nhu cầu chia sẻ ephemeral state/rate limit/bus giữa nhiều process có bằng chứng và có failure model rõ.

## 2. Single owner và đường mở rộng

### 2.1 Constraint hiện tại phải đi vào manifest triển khai

`RoomAuthority` giữ một PostgreSQL advisory lock bằng dedicated connection theo DB schema. Process thứ hai không trở thành ready trong khi owner cũ giữ lock; mất authority làm rooms dừng và client phải resync. Đây là deployment guard cho một process, chưa phải lease/fencing nhiều room owner. [S1][S4]

Vì vậy phase đầu giữ `replicas=1`, không bật HPA cho API, không dùng rolling strategy đòi pod mới ready trước khi owner cũ rời đi. Controlled replacement gồm ngừng admission, drain, đóng phiên với thông báo rõ, giải phóng owner, start revision mới và reconnect có backoff. Phải đo downtime trên staging; kiến trúc này chưa hứa zero downtime hay high availability khi chỉ có một server.

Đã có drain và deadline shutdown 12 giây trong source. Room state ngắn hạn nằm trong memory; không thể giả định đổi pod sẽ giữ nguyên mọi vị trí/seat. Business state đã commit như order/reward phải còn trong DB; client được thông báo hoạt động nào tiếp tục, hoạt động nào gián đoạn. [S2][S3]

Readiness đang yêu cầu bộ migrations khớp image chính xác. Trước migration expand/rollback, phải đổi sang compatibility policy có version/capability rõ và vẫn kiểm checksum migrations bắt buộc. Image cũ chỉ được chạy trên DB mới khi compatibility test đã chứng minh; không tự bỏ mọi check unknown migrations. [S4]

### 2.2 Tối ưu trước khi tách process

Hiện tất cả rooms đi qua một Promise queue toàn cục. Snapshot được tạo riêng theo viewer và chứa danh sách participants; event tên `room.delta` vẫn mang cả snapshot. Một room chậm có thể giữ queue của room khác, còn fanout dễ tăng mạnh theo room population. Đây là nơi nên đo trước khi kết luận transport hay CPU language là bottleneck. [S2][S5]

Thứ tự tối ưu:

1. Bổ sung `queue_wait`, `command_execution`, `projection`, `db_pool_wait`, bytes/message, event-loop lag; so cùng profile/hardware/digest.
2. Batch reads, bỏ query lặp, cache dữ liệu world/asset tĩnh và projection có invalidation theo privacy/consent generation. Không làm nhanh bằng cách bỏ kiểm quyền.
3. Gửi delta thực cho phần thay đổi, giữ snapshot đầy đủ cho join/resync; giới hạn payload và xử lý slow reader.
4. Khi profiling chứng minh global queue gây contention, chuyển sang mailbox từng room trong cùng process, cộng per-account serialization cho travel. Cross-room coordinator có thứ tự khóa xác định, timeout và compensation; safety revocation có barrier/generation để không broadcast state vừa bị thu hồi.
5. Chỉ sau đó cân nhắc `realtime-server` riêng nếu tải room hoặc yêu cầu availability không còn phù hợp API singleton.

Multi-node cần room directory, lease và monotonic fencing epoch; write cũ bị từ chối sau khi owner đổi. Router đưa command về đúng owner; travel reserve đích trước khi giải phóng nguồn, client bỏ event từ epoch cũ. Gate bắt buộc có partition, SIGSTOP, stale write, duplicate event, destination crash và reconnect storm. Redis adapter giúp chuyển message, không tự giải quyết ownership. [S6][S11]

## 3. Giao thức và consistency

Giữ HTTPS cho identity/admin/config/query và Socket.IO qua WSS cho action/event realtime. Với social 2D click-to-move, server phát path + trusted start time; client nội suy animation. Focus timer cũng tính từ timestamp đã xác nhận, không broadcast tick mỗi giây. Chưa dùng UDP/raw TCP ở phase đầu.

Socket.IO có framing riêng; client raw WebSocket không tự tương thích. Nếu mobile dùng engine khác, cần client Socket.IO đã test hoặc transport adapter giữ cùng application contract. Native app cũng cần auth contract riêng vì gateway hiện chỉ chấp nhận exact `WEB_ORIGIN`, signed cookie và CSRF của web. [S7]

Native auth phải có device session bảo vệ bằng secure storage, exchange qua HTTPS để lấy socket ticket ngắn hạn, scoped, một lần, có version và revoke. Browser tiếp tục Origin allowlist + CSRF. Không bỏ Origin guard hoặc coi header do native tự gửi là bằng chứng danh tính. Token không nằm trong URL/log.

Command chứa `schemaVersion`, `requestId`, room/membership/owner epoch và expected revision khi cần. Actor lấy từ authenticated session. Server kiểm quyền, membership, capacity và rate budget trên từng action. Retry dùng lại `requestId`; cùng ID nhưng payload khác bị reject.

Persistent mutations dùng unique constraint/idempotency receipt cùng transaction với business effect. Room receipt ngắn hạn có scope epoch; sau owner restart phải resync, không áp lại action cũ mù quáng. Event có epoch/sequence; gap thì snapshot. Transport mặc định có thể mất event khi đứt kết nối; không cam kết exactly-once delivery. Effect không lặp nhờ invariant ứng dụng, transaction và outbox. [S10]

Tách delivery thành hai loại:

- Vị trí/presence thay thế được: có thể drop delta khi nghẽn, giữ bản mới và resync.
- Order, reservation, reward, event publish: persist trước, outbox/receipt cho retry và reconciliation, UI hiển thị pending cho tới kết quả authoritative.

Rate budget cũng tách loại: movement, snapshot, chat, travel và business writes. Source đang dùng 60 command/session/phút và 30 handshake/IP/phút; cần kiểm profile chơi thật và nhiều user chung NAT trước khi điều chỉnh, không tăng đồng loạt để benchmark đẹp. [S7]

## 4. Admission queue và giới hạn người chơi

### 4.1 Tách ba loại capacity

**Platform admission** giới hạn account đang dùng tài nguyên chơi, reservation đang giữ và reconnect grace. Một account mở nhiều tab không được tính thành nhiều slot. **Room capacity** bảo vệ gameplay từng phòng, tính cả travel holds. **Event/booking waitlist** quản lý chỗ hẹn trong lịch; không cấp quyền chiếm realtime resource ngay khi đăng ký.

Repo đã có reservation waitlist; nó không thay cho admission queue toàn platform. Khi queue platform chờ, client vẫn xem trạng thái nhẹ bằng polling có backoff hoặc SSE; chưa mở socket gameplay chỉ để giữ vị trí.

### 4.2 State và transaction

| State | Tài nguyên được giữ | Transition hợp lệ |
|---|---|---|
| `WAITING` | Vị trí queue bền vững | `OFFERED`, `CANCELLED`, `EXPIRED` |
| `OFFERED` | Một slot, ticket một lần có TTL | `ACTIVE`, `WAITING`, `EXPIRED`, `CANCELLED` |
| `ACTIVE` | Một slot/account | `GRACE`, `RELEASED` |
| `GRACE` | Slot giữ ngắn hạn cho cùng account/session | `ACTIVE`, `RELEASED` |
| Terminal | Không giữ slot | Không tự phục hồi bằng retry cũ |

Canonical state enums theo [contract registry](../contracts/CONTRACT-REGISTRY.md) là WAITING/OFFERED/ACTIVE/GRACE/CANCELLED/EXPIRED/RELEASED. OFFERED là slot reservation; GRACE là reconnect grace. Token offer hết hạn luôn invalid; missed offer đầu requeue ticket ở cuối hàng với sequence mới, missed offer thứ hai hoặc ticket TTL thì EXPIRED. Revoke/restart do hệ thống không tính là missed offer của user.

Ba tập `active`, `reconnect_grace`, `unexpired_reserved` loại trừ nhau; một account chỉ giữ một slot trong một tập. Đặt `occupied = active + reconnect_grace + unexpired_reserved`. Invariant cứng: `occupied <= C_hard`, với `C_hard <= C_sustainable` đã kiểm chứng. Giới hạn nhận mới là `C_target <= C_hard`; một grant mới chỉ được cấp khi `occupied + 1 <= C_target`.

Queue PostgreSQL có sequence tăng, account/session scope, policy version, expiry, idempotency fingerprint. Transaction ngắn khóa capacity row, chọn đầu FIFO và tạo reservation atomically; unique constraint bảo đảm một slot hoạt động/account. Không giữ lock khi chờ client hoặc socket. Không dùng `SKIP LOCKED` như bằng chứng strict FIFO nếu nhiều dispatcher có thể vượt đầu hàng: phải chứng minh ordering hoặc dùng một serialized allocator.

Ticket được server consume atomically, bound session/device/owner epoch, có TTL và chống replay. Confirm, cancel, release và reclaim đều idempotent. Mutation tự kiểm expiry bằng clock server/DB; correctness không phụ thuộc cron cleanup chạy đúng giây. Khi DB/allocator không xác định được capacity, ngừng grant mới.

Refresh hoặc đổi mạng không làm mất chỗ queue nếu session còn hợp lệ. Reconnect từ grace tái dùng slot đã tính, không chiếm slot mới; hết grace phải qua admission lại. Grace có thời hạn/quota, không ưu tiên vô hạn. Khi hạ `C_target` dưới `occupied`, hệ thống vào `DRAINING_LIMIT`, ngừng grant mới và chờ giảm tự nhiên; không tự đuổi người đang chơi. Yêu cầu hạ `C_hard` chỉ kích hoạt sau khi occupancy nằm trong bound mới, trước đó là pending policy. Admin emergency action khác phải có lý do/audit rõ.

Travel giữ nguyên **platform slot**; chỉ chuyển room reservation/membership. Destination được giữ trước, nguồn được thả khi commit; không có hai committed active worlds/account. Failure giữ source hoặc về lobby đúng sự thật. Owner epoch đổi làm token cũ hết hiệu lực, client lấy authoritative state mới. Room đầy có thể đề xuất phòng khác hoặc queue riêng, không bắt người đang chơi xếp hàng global lại.

UI queue hiển thị trạng thái, vị trí xấp xỉ, thời điểm cập nhật, cancel và reconnect. ETA chỉ là range khi có dữ liệu đủ tốt; unavailable/stale không biến thành vị trí 0 hay “vào ngay”.

## 5. Capacity: đo, khuyến nghị và điều khiển

### 5.1 Baseline hiện có chưa xác nhận server thật

Repo ghi profile 100 clients/120 giây admit 100, stress ACK p95 517,9 ms; profile 1.000 sockets chỉ admit 256, stress p95 1.479,6 ms và giả thuyết 1.000 players `NOT_MET`. Đây là historical local presence benchmark, không có đầy đủ gameplay/TLS/WAN/browser và không phải máy server user. Exit 0 của harness không đồng nghĩa capacity hypothesis pass. [S8]

`C_sustainable` là mức cao nhất đã đo trên **hardware + image digest + workload profile** cụ thể vượt tất cả gates sau ramp/steady-state/soak. Chính sách mặc định đề xuất: `C_recommended = floor(C_sustainable × 0.70)` và `C_target = C_recommended`; phần headroom 30% được hiệu chỉnh bằng evidence. Luôn có `C_target <= C_hard <= C_sustainable`, cộng capacity riêng từng room. Khi hạ target thì occupancy có thể tạm vượt target ở trạng thái `DRAINING_LIMIT`, nhưng vẫn không vượt hard bound. Không ngoại suy CCU tuyến tính từ CPU hoặc số socket idle.

Report cần hardware/cgroups, topology DB/web/edge, generator resources, SHA/digest, runtime version, mix action, network conditions, admitted/rejected, successful/all-attempt latency, p95/p99, CPU/RSS, event-loop, DB wait, queue/backlog và cleanup. Lưu report bất biến; profile cũ được gắn stale khi thay đổi ảnh hưởng tải.

### 5.2 Thresholds khởi điểm — mục tiêu đề xuất, chưa đạt mặc định

| Chỉ số | Mục tiêu khởi điểm | Cách dùng |
|---|---|---|
| ACK action thường | p95 ≤ 500 ms, p99 ≤ 1.000 ms trong profile mạng vùng đã mô tả | Tách success, reject và timeout; không để reject nhanh làm percentile đẹp |
| Join/travel | p95 ≤ 2 giây trong điều kiện đã định nghĩa | Đo end-to-end và thời gian backend riêng |
| Room queue-wait | p95 ≤ 50 ms | Nếu vượt, tìm contention trước khi thêm replica |
| Event-loop lag | p95 ≤ 50 ms | Không chỉ nhìn CPU trung bình toàn máy |
| Unexpected failures | < 0,5% trên cửa sổ 15 phút tại admitted load | Tách 5xx/dependency/timeout khỏi policy denial |
| Memory và DB | Không tăng không kiểm soát sau warmup; còn headroom ≥ 25% theo resource limit | Theo dõi DB pool-wait, I/O và lock, không chỉ RSS API |
| Full-stack soak | Tối thiểu 2 giờ cho capacity candidate, kéo dài khi cần kiểm leak/lifecycle | 120 giây chỉ là regression/smoke, không chứng minh ổn định dài hạn |

Các mục tiêu là input để owner và agent hiệu chỉnh bằng evidence, không lời hứa năng lực hiện tại. CI có profile nhỏ để phát hiện regression; capacity qualification có profile idle, movement/chat, orders/rewards, bookings/travel, reconnect storm, slow reader, NAT, restart/DB delay và soak trên môi trường tương đương server thật.

### 5.3 Load test từ admin

Admin tạo request; backend xác nhận quyền và tạo record/job. Runner là Kubernetes Job chỉ được chọn image/profile cố định đã pin digest, namespace staging allowlisted, resource/time/connection/arrival-rate ceilings, NetworkPolicy chỉ tới target staging và artifact sink. ServiceAccount chỉ có quyền tối thiểu tạo/xem/cancel các Job do hệ thống quản lý; không cluster-admin, arbitrary shell, URL hay image do browser gửi.

Mỗi run có cancel/kill, abort khi error/resource threshold vượt, cleanup own clients/fixtures, lock chống chạy chồng và audit. Generator và target được đo riêng. Artifact report lưu ngoài source; record giữ checksum/reference/provenance. Test production là scope riêng cần được chỉ định rõ về target, budget và thời gian; nút thử tải mặc định không đi production.

Run hoàn tất chỉ tạo **capacity recommendation**. Không tự nâng quota. Admin áp mức cap trong guardrail đã verify, có reason, policy version, effective time và rollback về mức thấp an toàn.

## 6. Admin một account, nhiều nhóm chức năng

Chỉ một principal quản trị được backend cấp quyền bằng immutable subject/account ID, không public registration và không lấy role từ client. Session admin tách audience/cookie, dùng passkey hoặc MFA, revoke/recovery và reauthentication cho thao tác nhạy cảm. Scope nội bộ vẫn tách đọc account, publish event, đổi cap, chạy test và xem audit để giới hạn lỗi thao tác dù hiện chỉ một operator.

Admin frontend gọi backend/BFF. Metrics proxy phía server có credentials read-only và query allowlist; không gửi operator telemetry token xuống browser. Không expose SQL console, Kubernetes terminal hoặc backup secrets qua UI. Thao tác có requestId, reason, before/after và append-only audit; dữ liệu nhạy cảm được redact.

| Trang | Trọng tâm |
|---|---|
| Overview | Revision/digest, readiness, admitted/connections/grace/queue, lỗi và latency, alert và độ mới dữ liệu |
| Events & worlds | Draft/preview/schedule/publish/cancel, timezone, eligibility/capacity, flags, maintenance, lịch sử thay đổi |
| Accounts & safety | Tìm account, revoke session, restriction có lý do, case/appeal, export/deletion job; không mở toàn bộ private profile |
| Capacity & queue | Current/recommended cap và report chứng minh, pause/resume admission, FIFO/holds/grace, oldest wait, rejection reasons |
| System & traffic | Topology thực, status dependency, request/message/bytes rate, CPU/RAM/event-loop, DB pool, worker backlog và restart |
| Metrics & traces | Time-series, histogram theo window, sanitized logs/traces, liên kết dashboard sâu |
| Releases & recovery | Desired/observed Argo revision, sync status, migration compatibility, backup age/restore drill và runbook |
| Load tests | Fixed profile staging, tiến trình/cancel/report, so sánh candidate và recommendation |
| Audit & config | Thay đổi event/flag/quota, admin access/recovery, redacted config và incident timeline |

`System & traffic` là trang riêng với summary trên Overview. Mỗi cạnh trong topology hiển thị rate quan sát và sample timestamp, không dùng animation giả traffic. Phân biệt `healthy`, `idle`, `degraded`, `stale`, `unknown` và `down`. API probe 200 không chứng minh người chơi join được: bổ sung synthetic journey nhỏ, có quota và label rõ.

Một admin account không tự giải quyết mọi policy review. Source hiện có yêu cầu independent review cho permanent ban/appeal. Giữ kiểm soát đó bằng quy trình review ngoài account hoặc gate tính năng đến khi ADR policy được chấp nhận; không tự tạo admin thứ hai hay âm thầm xóa kiểm soát. [S9]

## 7. Monitoring và nguồn cấu hình

Source hiện có private telemetry/metrics, fixed labels, trace buffer 100 entries/5 phút và p95 upper bound từ lúc process start. Đây chưa phải collector/dashboard/alert đang vận hành; room p95 gauge hiện không thay cho histogram theo window. [S12]

Ưu tiên dùng Prometheus/Grafana đang có trên server nếu phù hợp ngân sách. Bổ sung histogram room, queue wait, DB pool, outbox lag/retry, runtime/node/container và backup age; OTel export có sampling/batching/retention. Tính p95/p99 từ buckets + rate theo window, không average percentile giữa process. Alert delivery và signal outage phải được diễn tập, không chỉ có YAML. [S13]

Không đưa account/room/session ID hoặc raw path vào metric labels. Giữ private dating data/presence khỏi global dashboard; capacity enforcement có thể dùng resource slots mờ, còn thay đổi aggregate private telemetry cần ADR privacy. Stale/failed read trả unknown, không giả zero.

| Loại cấu hình | Source of truth | Admin được làm gì |
|---|---|---|
| Image digest, topology, replicas, resource limits, network/TLS/secrets references | GitOps trong repo; Argo reconcile | Xem desired/observed; chuẩn bị change có review nếu cần |
| Event schedule/content, runtime business flags, admission effective cap | Database, versioned và audited | Thay đổi trong guardrail qua API |
| Giới hạn vận hành tối đa và compatibility requirements | Release/deployment policy version trong Git | Không vượt guardrail chỉ bằng UI |
| Capacity recommendation | Benchmark report + profile/digest + trạng thái review | Xem/đề xuất; không auto-raise quota |
| Metrics/traffic | Observation có timestamp từ collector | Read-only; không được coi là desired state |

Runtime flag không patch Deployment/ConfigMap đằng sau Argo. GitOps không liên tục ghi đè các event/quota business đã được thiết kế là DB-owned. Emergency runtime switch được audit và có expiry/clear semantics; các baseline triển khai vẫn về Git.

## 8. Acceptance gates

- Preserve seat/order/reward/travel races, duplicate request/ACK, stale epoch, consent revoke khi work đang pending và owner-loss tests.
- Không gate multi-replica trước fencing/routing/partition tests; worker không nhận room authority.
- Admission race tại last slot không over-admit; replay/multi-tab/TTL/restart/cap-lowering/reconnect đều đúng và FIFO được chứng minh.
- Old compatible image + expanded DB còn ready; incompatible migration vẫn bị chặn; rollback image có rehearsal thật.
- User thường không đọc/ghi admin; MFA/recovery/revoke/audit và metrics token isolation có evidence.
- Load runner reject target/image/command ngoài allowlist; quota/cancel/abort/cleanup hoạt động.
- Metrics query hợp lệ, stale/unknown rõ, alert thực nhận và privacy regression pass.
- Capacity report có full workload/hardware/digest, cùng SLO đề xuất được chấp nhận; không lấy tài liệu hoặc exit 0 thay evidence.

## Nguồn

Source links dưới đây cố định cùng SHA, được đọc trong review; test source tồn tại không đồng nghĩa đã chạy lại trong lượt này.

- [S1 — Room authority](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/authority.ts)
- [S2 — Room service](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/service.ts)
- [S3 — Runtime maintenance/shutdown](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/main.ts)
- [S4 — Readiness](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/operations/readiness.ts)
- [S5 — Room socket fanout](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/socket.ts)
- [S6 — Future ownership design](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/architecture/FUTURE-OWNERSHIP.md)
- [S7 — Identity/socket gateway](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/identity/socket.ts)
- [S8 — Historical city load results](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/architecture/CITY-LOAD-PROFILES.md)
- [S9 — Safety policy](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/config/safety-policy.json)
- [S10 — Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)
- [S11 — Socket.IO multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/)
- [S12 — Current telemetry scope](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/operations/OBSERVABILITY.md)
- [S13 — Prometheus histograms](https://prometheus.io/docs/practices/histograms/)
- [Additional: Socket.IO recovery](https://socket.io/docs/v4/connection-state-recovery/)
- [Additional: OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
- [Additional: PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
