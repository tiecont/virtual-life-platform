# Rà soát repository Virtual Life Platform

**Repository:** [tiecont/virtual-life-platform](https://github.com/tiecont/virtual-life-platform).  
**Snapshot:** `cef7dc17172f7c6cda930c99648a5e3ad609cc55`. **Ngày review:** 05/11/2026.

## 1. Kết luận và phạm vi bằng chứng

Repo đã có nền ứng dụng đáng kể: identity, room authority, travel, shared engines, world scenes và nhiều regression scenarios. Hướng phù hợp là tiếp tục modular monolith, cải thiện trải nghiệm và vận hành, tách build theo ứng dụng. Không có cơ sở từ audit này để viết lại backend hoặc thay giao thức chỉ nhằm đạt server-authoritative.

Đây là **review read-only** của source, manifests, tests, tài liệu và evidence được commit. Không sửa repository, không truy cập server/database thật, không chạy lại lint/build/unit/integration/browser/load tests, không thử thiết bị vật lý hoặc thực hiện user research. Các nhận định hiệu năng là phân tích code hoặc diễn giải báo cáo lịch sử, không phải phép đo mới.

[HANDOFF][R-handoff] và [OFFLINE-HANDOFF][R-offline] tự báo **148/151 task VERIFIED**, ba gate external còn mở, cùng kết quả local `pnpm check` thành công. Review này không xác nhận lại toàn bộ 148 task. Source hiện hữu, test scenarios hiện hữu, historical test result và production readiness là những loại bằng chứng khác nhau.

**Severity trong báo cáo:** “Cao” là rào cản trước release/scale hoặc mục tiêu mới tương ứng; “Vừa” là vấn đề maintainability/experience cần giải quyết theo phase. Đây không phải điểm CVSS hoặc kết luận có khai thác bảo mật.

## 2. Điểm mạnh phải bảo toàn

- **Authority thật đã có:** room service kiểm session, membership/epoch, capacity, seat ownership và request fingerprint; movement nhận intent rồi server quyết định path/thời gian. Không chuyển authority sang client khi thay renderer.[R-rooms]
- **Consistency nghiệp vụ:** migrations có checksum journal/lock; outbox và rewards có transaction/deduplication; travel có intent, redemption, timeout và compensation. Giữ các invariants này trong refactor.[R-db][R-outbox][R-travel]
- **Regression có chiều sâu:** source có owner-loss, concurrent owner, readiness/drain và privacy/safety scenarios. Việc có test code không đồng nghĩa lượt review này đã chạy chúng.[R-owner-tests][R-ready]
- **CI và UI có nền tốt:** actions pin SHA, permissions tối thiểu, browser matrix, aggregate gate; renderer có lifecycle cleanup/reduced motion và DOM controls cho tương tác ngoài canvas. Thiết kế lại cần giữ các đường truy cập đó.[R-ci][R-panel][R-renderer]

## 3. Các phát hiện và hành động

| ID / severity | Evidence tại SHA audit | Tác động | Hành động đề xuất |
|---|---|---|---|
| A01 — **Cao trước deployment** | [Dockerfile][R-docker] build toàn workspace, runtime `FROM build`; [Compose][R-compose] dùng một `CITY_APP_IMAGE` cho web/API/migrate. Tree chưa có Kubernetes/Argo/GHCR publishing. | Build source pass chưa chứng minh runtime image/deployment. Runtime giữ source/dev dependencies; deployables bị gắn chung. | Tách `vlp-web`, `vlp-api`, rồi `vlp-admin` khi có source. Migrator/worker reuse API image với entrypoint riêng. Build once, promote tested digests. |
| A02 — **Cao trước scale** | [RoomAuthority][R-authority] giữ PostgreSQL advisory lock theo DB schema, một dedicated connection. | Đây là guard một process, chưa phải distributed room ownership. Tăng replicas/HPA hoặc rolling mặc định không tạo capacity/availability đúng. | Singleton API, Recreate + drain ban đầu. Chỉ scale nhiều owner sau routing/fencing/epoch/failure tests; worker không khởi tạo authority. |
| A03 — **Cao trước migration release** | [Readiness][R-ready] yêu cầu count/checksum migrations bằng chính xác image. [Recovery scope][R-recovery] rollback API tương thích, web giữ nguyên. | Schema mới có thể làm binary cũ unready. Bằng chứng hiện tại không chứng minh rollback cả release set hoặc N-1 mobile. | Schema compatibility contract, expand/contract và N-1 tests; checksum lịch sử giữ nguyên. Rollback digest chỉ khi tương thích DB; nếu không, roll-forward. |
| A04 — **Cao về throughput** | [rooms/service.ts][R-rooms] có `#tail` dùng chung, bounded pending queue; snapshot tạo theo người nhận. [Socket gateway][R-room-socket] gọi `room.delta` nhưng gửi state snapshot. | Room chậm có thể chặn room khác; projection/fanout và reads lặp có thể tốn CPU/DB/network. Chưa có phép đo mới để định lượng bottleneck. | Instrument queue wait/execution/DB wait/bytes; batch reads và giảm payload trước. Per-room execution chỉ sau race tests cho travel, revocation và single membership. |
| A05 — **Cao trước capacity recommendation** | [Load profiles][R-load] ghi 1.000 transports nhưng chỉ 256 admitted; [room service][R-rooms] trả `ROOM_FULL`. Booking có [reservation waitlist][R-reservation], chưa thấy global admission queue trong scope review. | Socket count khác player capacity; hàng chờ đặt bàn không cấp slot runtime. Chưa thể đưa mức recommended users cho server thật. | Benchmark gameplay mix đúng hardware; durable platform queue, atomic slot reservation, offer TTL/reconnect grace; cap gắn report/version. |
| A06 — **Cao trước operated release** | [Telemetry][R-telemetry] có endpoint/metrics giới hạn; [ops-watch][R-watch] nói historical local sample, collector/alert chưa cài. | Chưa có dashboard vận hành live end-to-end. Lifetime percentile gauge không thay windowed p95/p99; missing sample không phải zero traffic. | Lắp pipeline metrics có budget; admin backend đọc aggregate bằng quyền tối thiểu, histogram theo cửa sổ, stale/unknown và alert drill. |
| A07 — **Cao trước mobile** | [Socket auth][R-socket-auth] kiểm exact Origin, signed cookie và CSRF; [Next config][R-next] dùng server/internal URL và rewrites. | Local WebView/native app không tự có same-origin browser session hoặc Next server runtime. Nới wildcard/CSRF để chạy được sẽ làm yếu boundary. | Shared static game client + platform adapters; native secure session và short-lived socket ticket riêng; giữ browser guards; physical-device spike trước chọn stack cuối. |
| A08 — **Cao về mục tiêu sản phẩm** | [Home page][R-home] có “LOCAL FOUNDATION”, database/schema status; [WorldRoomPanel][R-panel] gom connection/recovery và nhiều UI concerns. | Flow còn ưu tiên chứng minh nền tảng; technical copy và form dài không phục vụ first meaningful activity. Screenshot lịch sử không chứng minh retention. | Polished one-room slice, home theo hoạt động, contextual sheets, queue/reconnect/error states; usability test và accessibility/device gate. Không rewrite toàn UI một lần. |
| A09 — **Cao trước production policy** | [Release verifier][R-release] và [governance][R-governance] assert offline, worlds OFF, approvals/operator chưa có; [safety policy][R-safety] có independent review/appeals. | Code policy gắn chặt phạm vi cũ; đổi cờ đơn lẻ không tạo production installation an toàn. Yêu cầu một admin account cần giải quyết policy review rõ ràng. | Policy theo environment/release entitlement, deny-default, runtime control có audit. Một operator login; service identities tách biệt. Preserve checks hoặc thay bằng invariant tương đương. |
| A10 — **Vừa, tài liệu lệch thời điểm** | [Master][R-master] vẫn “PLAN ONLY — NOT IMPLEMENTED”; [ARCHITECTURE][R-old-arch] nói Pixi/gameplay chưa mount; handoff mới nói đã có actual adapters/journeys. | Agent có thể scaffold lại phần đã làm hoặc xem lịch sử như current blocker. Câu “all commits local” cũng là lịch sử, không mô tả repo GitHub vừa đọc. | Current index có asOfCommit/evidence/known gaps; gắn nhãn historical checkpoints, giữ lịch sử và links; không xóa hoặc đổi VERIFIED vì plan vNext chưa làm. |
| A11 — **Vừa, repository hygiene** | Recursive tree: evidence chiếm 96,1% bytes; [ops-watch][R-watch]/[release verifier][R-release] đọc evidence JSON trực tiếp. [.dockerignore][R-ignore] đã loại docs. | Checkout/review/search nặng; xóa hàng loạt làm vỡ consumers. Không phải toàn khối evidence đang nằm trong Docker image. | Archive immutable + hash index/restore check, đổi loader/verifier trước rồi bỏ raw outputs khỏi current tree; không rewrite history mặc định. |
| A12 — **Vừa, thiếu xác nhận hosted gate** | [Quality run 42037215254][R-run] cùng SHA audit: quan sát lúc **21:15:26 Asia/Saigon ngày05/11/2026**: toàn run `in_progress`, conclusion null; **core-checks và5browser groups đã success**, browser legacy còn chạy. [Branch API][R-branch] trả `protected:false`; [rulesets endpoint][R-rulesets] trả 403 nên chưa xác minh được. | Có bằng chứng các job trên đã pass; chưa thể nói toàn pipeline đã pass hoặc failed, và chưa thể kết luận repository không có mọi loại policy. Chỉ quan sát không có legacy branch protection qua trường đó. Local passing report không thay required-check enforcement. | Revalidate run tại lúc thực thi; xác minh policy khả dụng trong task foundation và thử required gate có kiểm soát. Không tự public repository hoặc mua gói dịch vụ để vượt hạn chế endpoint. |

Chi tiết triển khai và gates nằm trong các chương [repository](../architecture/01-REPOSITORY-BOUNDARIES.md), [CI/CD](../architecture/02-CI-CD-ARGOCD.md), [runtime/admin/capacity](../architecture/03-RUNTIME-ADMIN-CAPACITY.md), [UX/mobile](../architecture/04-UX-MOBILE.md).

## 4. Số liệu cần đọc đúng

### Tree cleanup

Các con số sau là tổng blob của **tree tại SHA audit**, không phải Git history, dung lượng clone hoặc disk usage:

| Nhóm | Files | Bytes |
|---|---:|---:|
| Toàn tree | 4.365 | 157.991.008 |
| `docs/agent/evidence/` | 3.586 | 151.876.136 |
| Evidence PNG | 514 | 144.552.796 |
| Evidence logs | 1.513 | 6.026.160 |
| Evidence JSON | 581 | 1.295.224 |
| Evidence exit markers | 978 | 1.956 |

Legacy source archives tổng dưới 1 MB có checksum và consumers regression. Không nên xóa `.tar`, tests, contracts hoặc historical migrations chỉ để source nhìn gọn. Asset provenance cũng là dependency chất lượng cần giữ.[R-snapshots]

### Historical load results

[Load report trong repo][R-load] ghi:

| Profile | Admitted / connected | Stress ACK p95 | Kết luận lịch sử |
|---|---:|---:|---|
| 100 clients, soak 120 giây | 100 / 100 | 517,9 ms | MET_LOCAL_ONLY |
| 1.000 clients, soak 120 giây | 256 / 1.000 | 1.479,6 ms | NOT_MET |

Profile lớn gặp room/rate limits; soak chủ yếu presence/snapshot, không đại diện đầy đủ browser render, gameplay, TLS/WAN và server thật. Vì vậy **256 không phải giới hạn phần cứng đã tìm được**, và **1.000 không phải CCU chơi được đã chứng minh**. Harness exit 0 có thể chỉ xác nhận experiment hoàn tất/cleanup, không xác nhận capacity hypothesis đạt. Chưa có benchmark mới trong review.

## 5. Unknowns cần thu thập khi thực thi

- Server thật: CPU/RAM/storage/network, Kubernetes/Argo versions, ingress, DB topology, backup và observability sẵn có. Resource file 2 vCPU/4 GiB/$25 là giả định cũ, không phải cấu hình user đã xác nhận.
- Workload/sản phẩm: nhóm người chơi, thiết bị tối thiểu, regions/latency, peak concurrency và tỷ lệ movement/focus/orders/travel.
- Runtime thật: dữ liệu persistent hiện có, domains/TLS/secrets custody, mức online, error/retention/cost thực tế. Không biến dữ liệu chưa có thành 0.
- Mobile/store: Mac/Xcode/Android toolchain, devices, signing/store accounts và physical accessibility/performance. Chưa có bằng chứng app đã được store duyệt.
- Hosted governance: kết quả CI cuối và rulesets/required checks. Rulesets API trả 403 với thông báo tính năng yêu cầu GitHub Pro hoặc repository public; ghi nhận không truy cập được, không suy ra toàn bộ policy hiện tại và không tự thay visibility/mua dịch vụ.

Các unknowns này không ngăn viết architecture, clean refactor, prototype hoặc tests cô lập. Chúng trở thành input/gate ở đúng task cần đến.

## 6. Hướng xử lý thống nhất

Giữ TypeScript, React/Pixi, Nest/Fastify, Socket.IO và PostgreSQL; tách ba image theo deployable, một backend business boundary. Argo theo dõi overlays cùng repo; CI promote digest, không custom reconciler.

Ưu tiên đồng thời một UX slice có chất lượng và foundation deployable. Tối ưu đường xử lý đã đo trước khi phân tán room ownership. Thêm admission queue và dashboard một operator, phân biệt business state với telemetry. Mobile mặc định thử shared web client trong Capacitor; quyết định cuối sau spike thiết bị thật, native auth và lifecycle.

Gói plan mới phải có tasks nhỏ, dependency rõ, test/gate theo artifact và evidence thật. Status của kế hoạch cũ được bảo toàn; không đánh dấu tính năng mới hoàn thành vì kiến trúc đã được viết.

## Nguồn ghim snapshot

Các reference sau trỏ đúng SHA audit; run/branch metadata là quan sát thời điểm đọc, cần refresh riêng.

[R-handoff]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/HANDOFF.md
[R-offline]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/OFFLINE-HANDOFF.md
[R-rooms]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/service.ts
[R-db]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/db/migrations.ts
[R-outbox]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/hospitality/outbox.ts
[R-travel]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/travel/service.ts
[R-owner-tests]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/tests/integration/room-owner.test.ts
[R-ready]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/operations/readiness.ts
[R-ci]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/.github/workflows/quality.yml
[R-panel]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/app/components/WorldRoomPanel.tsx
[R-renderer]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/packages/pixi-scene/src/renderer.ts
[R-docker]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/infra/docker/Dockerfile
[R-compose]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/infra/compose/stack.yml
[R-authority]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/authority.ts
[R-recovery]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/operations/DEPLOYMENT-RECOVERY.md
[R-room-socket]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/socket.ts
[R-load]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/architecture/CITY-LOAD-PROFILES.md
[R-reservation]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/events/reservations.ts
[R-telemetry]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/operations/telemetry.ts
[R-watch]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/ops-watch.mjs
[R-socket-auth]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/identity/socket.ts
[R-next]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/next.config.ts
[R-home]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/app/page.tsx
[R-release]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/verify-release.mjs
[R-governance]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/verify-governance.mjs
[R-safety]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/config/safety-policy.json
[R-master]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/MASTER-AGENT-PLAN.md
[R-old-arch]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/architecture/ARCHITECTURE.md
[R-ignore]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/.dockerignore
[R-snapshots]: https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/integrations/legacy-snapshots/README.md
[R-run]: https://github.com/tiecont/virtual-life-platform/actions/runs/42037215254
[R-branch]: https://api.github.com/repos/tiecont/virtual-life-platform/branches/main
[R-rulesets]: https://api.github.com/repos/tiecont/virtual-life-platform/rulesets



Machine-readable provenance: [REVIEW-PROVENANCE.json](REVIEW-PROVENANCE.json). Trạng thái CI là quan sát tại mốc ghi trên, có thể thay đổi sau đó.
