# Kiến trúc tổng thể Virtual Life Platform

## 1. Quyết định cốt lõi

**Xây tiếp nền tảng hiện hữu bằng modular monolith có ranh giới module rõ, nhiều bản build độc lập và một giao thức client chung.** Độ phức tạp thêm vào phục vụ những việc cụ thể: tách UI admin để kiểm soát access/bundle; worker cho công việc bền vững; global admission queue để bảo vệ runtime; hợp đồng auth native để không làm yếu web auth. Chưa tách mỗi world thành microservice.

Nguồn thực tế là [repo tại SHA audit](https://github.com/tiecont/virtual-life-platform/tree/cef7dc17172f7c6cda930c99648a5e3ad609cc55), đặc biệt manifests, `rooms/authority.ts`, `rooms/service.ts`, `identity/socket.ts` và các migrations. Đây là lựa chọn cho game social 2D theo phòng hiện tại. Nếu product chuyển thành world 3D liên tục hoặc action competitive, cần ADR mới dựa trên workload khác.

## 2. Sơ đồ runtime

~~~mermaid
flowchart TB
  subgraph Clients["Client"]
    Web["Web portal + shared game client"]
    Mobile["Mobile Capacitor + shared game client"]
    Admin["Admin web: một operator"]
  end
  Edge["Ingress TLS và rate limits"]
  API["Platform API + Socket.IO: một room owner"]
  Worker["Worker: durable jobs khi cần"]
  DB[("PostgreSQL")]
  Assets["Static assets có content hash"]
  Telemetry["Metrics, logs, traces"]
  Web --> Edge
  Mobile --> Edge
  Admin --> Edge
  Edge --> API
  Web --> Assets
  Mobile --> Assets
  API --> DB
  Worker --> DB
  API --> Telemetry
  Worker --> Telemetry
  Admin -. "backend proxy, read-only" .-> Telemetry
~~~

Portal và admin có thể có Next server riêng. Mũi tên tới API là HTTPS cho nghiệp vụ thông thường và WSS/Socket.IO cho room/presence; không phải mọi hành động phải đi qua realtime. Admin browser không truy cập thẳng Prometheus/Argo/DB; backend đã xác thực mới lấy dữ liệu.

Worker là entrypoint riêng từ cùng code/image API khi durable jobs cần chạy độc lập. Nó không sở hữu room in-memory và không khởi tạo cùng composition root của API. Hệ thống vẫn vận hành trên một PostgreSQL; module boundaries được enforce bằng API/service ports và import rules.

## 3. Đơn vị build, deploy và dữ liệu

| Đơn vị | Build/artifact | Scale/deploy ban đầu | Trách nhiệm |
|---|---|---|---|
| portal-web | `ghcr.io/tiecont/vlp-web@sha256:…` | 1 replica; tăng độc lập khi cần | Portal, shared game shell, asset delivery |
| platform-api | `ghcr.io/tiecont/vlp-api@sha256:…` | 1 replica, Recreate + drain | HTTP, auth, room owner, gameplay authority |
| admin-web | `ghcr.io/tiecont/vlp-admin@sha256:…` | 1 replica, private route | Một operator và dashboard |
| migration Job | Cùng API digest, entrypoint migrate | Một job có DB lock | Expand/schema compatibility, không chạy tự phát ở mọi pod |
| worker | Cùng API digest, entrypoint worker | 1 replica khi được tách | Outbox, schedules/retention/notifications bền vững |
| mobile | Android AAB, iOS archive/IPA | Store beta/release riêng | Local game bundle và native capabilities |
| contracts/world packages | Workspace build | Không có deployment riêng | Schema, domain rules, scene/config |

“Registry” ở đây nên là **một OCI registry (GHCR) chứa nhiều image repositories**. Không cần dựng một registry server cho mỗi ứng dụng. Package nội bộ không đồng nghĩa microservice hay image.

Database/stateful infrastructure có vòng đời riêng với application: không đưa việc xóa PVC/database vào prune mặc định của Argo app. Dùng ingress/certificates/cluster đang có; không mặc định thêm một reverse proxy nữa bên trong K8s chỉ vì Compose hiện dùng Caddy.

## 4. Ranh giới nghiệp vụ và quyền sở hữu

| Module | Sở hữu | Quy tắc |
|---|---|---|
| Identity/privacy | Account, session, consent, avatar identity | Client không tự khai accountId/role/age làm authority |
| Social/safety | Friendship, blocks, reports, sanctions | Block/revoke áp dụng cả HTTP, socket, travel, recipient projection |
| World registry | Catalog, content version, capabilities | World lifecycle được server cho phép, không chỉ UI toggle |
| Room/presence | Membership, seats, paths, owner epoch, sequence | Một owner cho mỗi room; giới hạn hiện tại là một owner toàn process/schema |
| Travel/invitations | Intent, hold, consent và chuyển world | Target giữ chỗ trước, source nhả sau; một active membership |
| Focus | Session timestamps, history | Server time; không cần tick timer qua mạng mỗi giây |
| Hospitality/progression | Order/shift state machines, rewards ledger | Transaction và idempotency; không phát thưởng vì animation xong |
| Events/reservations | Schedule, slots, room booking và waitlist | Waitlist đặt bàn khác queue vào platform |
| Admission | Global slots, queue tickets, offers và leases | Transaction nguyên tử; không phụ thuộc tab/socket count |
| Operations | Operator actions, runtime policies, audit | Một người dùng admin, service identities tách biệt |
| Durable jobs | Outbox, retention, notices | At-least-once + dedupe; side effects sau DB commit |
| Assets/client | Layout, animation, rendering và input | Client chỉ trình bày và gửi intent |

Không cho world A đọc repository/SQL của world B. Shared engine cung cấp service ports; ORM/query layer hiện có được giữ, không đổi công cụ chỉ để đồng nhất tên gọi.

## 5. Luồng xử lý authoritative

1. Client gửi intent: muốn tới ô, lấy ghế, đặt order, nhận order, chuyển world.
2. Gateway xác thực session/ticket, schema/version, origin/policy thích hợp và rate limit.
3. Module authority kiểm account, membership/visit, permission, capacity, state version và idempotency.
4. Critical business state được commit trong DB transaction. Movement và projection có thể ở memory của owner; không ghi mọi frame vào DB.
5. Server trả ACK có requestId/outcome và event/snapshot có epoch + sequence.
6. Client cập nhật view, interpolate animation và resync khi mất gói/epoch đổi. Client không được quyết định balance, completed work hoặc kết quả reservation.

Socket.IO bảo đảm thứ tự message nhưng mặc định không tự bảo đảm giao mọi message; ACK/retry/idempotency và resync là trách nhiệm application. [Tài liệu Socket.IO](https://socket.io/docs/v4/delivery-guarantees/).

Giữ transport hiện có là quyết định để giảm migration risk. HTTPS/Socket.IO phù hợp social room/focus/service; browser không có raw TCP/UDP socket chung như native. Chỉ thêm WebRTC/WebTransport/native UDP nếu gameplay thật cần và có benchmark chứng minh chi phí triển khai, bảo mật, fallback và client compatibility đáng đánh đổi.

## 6. Consistency và hiệu năng

Source hiện dùng queue serialize toàn service và PG advisory lock. Đây là boundary correctness hữu ích nhưng có thể gây head-of-line blocking. Lộ trình:

- Instrument per-command queue wait, execution time, DB wait và event-loop delay.
- Giảm truy vấn lặp, recipient projection lớn, payload/broadcast thừa; dùng index và cache có invalidation đúng.
- Nếu queue toàn cục là bottleneck, chuyển sang mailbox theo room và coordinator theo account/travel. Đặt lock ordering xác định; cross-room transfer không được tạo deadlock hoặc hai active memberships.
- Chuyển outbox/notifications/retention/schedules bền vững sang worker; room-bound maintenance vẫn do owner.
- Chỉ sau đó mới cân nhắc room-runtime nhiều process: directory, lease/fencing, owner routing, sticky behavior nếu còn long polling, resync và rolling compatibility.

Không hứa có thể tăng throughput tuyến tính bằng replica. Không tự thêm Kafka/service mesh/Redis vì gọi hệ thống là platform. Redis là tùy chọn cho distributed rate limits/caches/routing khi thật sự có nhiều owner; Pub/Sub không thay thế durable state hoặc fencing.

## 7. Frontend và mobile

`packages/game-client` chứa React DOM game shell, HUD, UI states và scene mounting. `packages/client-sdk` chứa HTTP/Socket.IO contracts/client state; platform adapters xử lý storage/auth/lifecycle/navigation khác nhau. `packages/pixi-scene` và world packages giữ render/scene rules.

Next portal mount game client trong browser; mobile dùng Vite tạo bundle tĩnh cài cùng app Capacitor. Không đưa Next Server Components, `next/headers`, internal API URL hoặc filesystem code vào game-client. Không cần mở thêm một deployment game-web chỉ để có mobile.

**Mobile là quyết định có gate theo platform.** CachyOS + Android hiện có chạy N10 physical spike trước; iPhone gate thuộc N14 conditional. Cả hai gate dùng room thật, secure session, 30 phút hoạt động, sleep/resume/network switching, memory/FPS/battery quan sát được trong phạm vi thiết bị đã đo. Xem [execution profile](05-CACHYOS-ANDROID-FIRST.md). Nếu không đạt sau tối ưu có giới hạn, dùng ADR so sánh lại Capacitor, React Native/Expo, Godot và Unity. Đổi renderer không yêu cầu thay authority backend hoặc mô hình dữ liệu.

Chương UX/mobile định nghĩa kỹ tiêu chí. Hiện chưa có kết quả physical mobile hoặc store approval nào trong lần review này.

## 8. Admin và vận hành

Một tài khoản operator, bootstrap riêng, không mở đăng ký admin. Dùng passkey/MFA, session tách khỏi player, step-up cho thay đổi cap/ban/maintenance, audit append-only với reason và version trước/sau. Service accounts của CI/Argo/metrics không phải tài khoản admin người dùng thứ hai.

Tách các mặt thông tin:

- **Overview:** trạng thái, version/digest, thời điểm scrape, session/player count, latency/error.
- **Live system:** service/dependency map, traffic, healthy/degraded/stale/no traffic.
- **Worlds/rooms/events/accounts:** thao tác nghiệp vụ server-validated.
- **Capacity/queue:** số đo workload, recommended/hard cap, queue wait/admission.
- **Load tests:** profile cố định chạy staging, resource budget, stop/cancel, report.
- **Release/operations:** Argo read-only status, feature flags theo scope, backup/restore, incident controls.

Một HTTP 200 không đủ để tô dashboard xanh. Traffic bằng 0 là trạng thái hợp lệ; scrape bị mất là “không rõ/stale”, không là số 0. Không dùng accountId/chat/private dating profile làm labels metrics.

## 9. Cấu hình có hai vòng đời rõ ràng

**GitOps:** image digests, resource requests/limits, replica policy, ingress, DB schema compatibility, secret references, entitlement cho release/world.

**Runtime policy trong DB:** event schedules, bounded admission cap, maintenance switch, room policy có version, moderation actions. Mọi write có auth, validation, optimistic concurrency, reason và audit.

Quyền mở world hiệu lực phải nằm trong giới hạn release entitlement của Git; runtime toggle chỉ có thể giảm/tắt hoặc bật trong phạm vi đã đủ gate. Dashboard không sửa manifest K8s trực tiếp và không “tự chữa” Argo bằng imperative kubectl. Như vậy mỗi loại config có một nơi quyết định, tránh vòng lặp hai bộ quản lý.

## 10. Capacity và admission

Chưa có số CCU production được chứng minh. Evidence cũ cho thấy 1.000 transports nhưng 256 admitted do cap room/world; không thể suy ra phần cứng chỉ chịu 256 người hay đã chịu 1.000 người chơi.

Đo riêng: anonymous HTTP, authenticated sessions, open transports, admitted players, active gameplay mix, room occupancy và waiting tickets. Workload phải có movement/snapshot, focus, orders, travel, reconnect, DB và edge/TLS; load generator chạy ngoài host mục tiêu khi đo capacity.

Đặt:
- `C_sustainable`: mức tải cao nhất đạt SLO và invariant trong workload/hardware/version đã ghi.
- `C_recommended = floor(C_sustainable × 0.70)`: chính sách headroom ban đầu đề xuất, cần hiệu chỉnh bằng số đo.
- `C_hard ≤ C_sustainable`: hard safety bound của cấu hình đã kiểm chứng.
- `C_target ≤ C_hard`: ngưỡng nhận thêm người; mặc định bằng `C_recommended`.
- Invariant: `active + reconnect_grace + reserved <= C_hard`; ba trạng thái phải rời nhau.
- Chỉ cấp slot mới khi tổng occupancy nhỏ hơn `C_target`. Reconnect trong grace dùng lại slot cũ, không cấp thêm.

Queue bền vững trong Postgres, một ticket/active slot cho một account, FIFO có aging, offer TTL và reconnect grace có hạn. Travel giữa world giữ cùng platform slot; chỉ reserve room đích. Hạ `C_target` dưới occupancy chuyển sang `DRAINING_LIMIT`, không đá người đang chơi và không cấp thêm slot. Muốn hạ `C_hard` thì policy mới chờ occupancy xuống mức phù hợp rồi mới có hiệu lực. Grace hết hạn phải queue lại. Lỗi DB/authority thì fail closed.

Không lấy benchmark có fast rejection làm latency thành công; dashboard báo số offered/accepted/rejected/timeout và latency theo outcome riêng.

## 11. CI/CD và release

GitHub Actions kiểm code/test/contracts, build hardened images, publish GHCR, tạo release manifest. Promotion PR cập nhật digest tại overlay của môi trường; Argo reconcile Git với cluster. Không cần custom reconciliation như mô hình nhiều repository, nhưng native reconciliation của Argo vẫn là cơ chế CD. [Argo automated sync](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/).

Ban đầu API singleton dùng drain + Recreate, có gián đoạn ngắn được hiển thị đúng. Migration có lock và schema compatibility đã test; rollback code dùng digest cũ tương thích schema đã expand, không tự down-migrate dữ liệu. Mobile có lane signing/store riêng; Argo chỉ triển khai backend/web/admin.

Không triển khai sản phẩm chỉ dựa vào unit tests. Gate cần image chạy thật, ingress/TLS/socket reconnect, DB migration failure, singleton lock loss, rollback, backup restore, queue correctness, UI usability và physical mobile.

## 12. Khi nào chấp nhận kiến trúc phức tạp hơn

| Tình huống đã đo | Thay đổi nhỏ nhất hợp lý | Tránh làm trước |
|---|---|---|
| Durable jobs làm tăng latency room | Worker entrypoint độc lập + outbox | Tách toàn bộ business thành services |
| Nhiều room chịu head-of-line blocking | Per-room execution/mailboxes | HPA replica API singleton |
| Một owner bão hòa sau tối ưu | Room-runtime riêng, routing + fencing + admission allocator | Chỉ gắn Redis adapter rồi tăng replica |
| Dashboard query ảnh hưởng gameplay | Cache/read model, query budget, ops backend tách nếu cần | Metrics scrape query trực tiếp DB mỗi refresh |
| Renderer không đạt thiết bị mục tiêu | Tối ưu/budget rồi spike renderer khác | Rewrite toàn platform |
| Event traffic bất thường | Queue, staged admission, prewarm asset cache | Hứa CCU bằng số socket mở |

Kiến trúc thêm phải có ADR mô tả business invariant nào dễ bảo đảm hơn, chi phí vận hành, failure modes, migration path, rollback và benchmark so sánh. Mục tiêu là code nghiệp vụ dễ hiểu và vận hành tin cậy.
