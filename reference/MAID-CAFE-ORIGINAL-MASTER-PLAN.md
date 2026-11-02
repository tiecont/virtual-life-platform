# MAID CAFE SOCIAL — MASTER AGENT EXECUTION PLAN

> **Phiên bản:** 1.0 · **Ngôn ngữ:** Tiếng Việt · **Loại tài liệu:** Implementation contract cho AI coding agent  
> **Mục tiêu:** Từ repository trống đến **MVP social game 2D multiplayer trên browser có thể vận hành thực tế**, gồm gameplay Customer/Maid, realtime, moderation, kiểm thử, CI/CD và production release.  
> **Trạng thái:** Kế hoạch kỹ thuật, **chưa phải mã nguồn hoàn thành**. Mọi kết quả phải được xác minh khi agent thực thi.  
> **Giả định:** Một solo developer có AI coding agent, ngân sách hạ tầng thấp lúc đầu, deploy một instance trước khi scale.

---

## 0. AGENT OPERATING CONTRACT — ĐỌC ĐẦU TIÊN

Bạn là **Lead Product Engineer + Game Client Engineer + Backend Engineer + QA + DevOps** cho dự án này. Thực thi theo tài liệu, không chỉ đề xuất giải pháp hoặc tạo giao diện demo.

### 0.1 Nguyên tắc bắt buộc

1. **Implement → Verify → Document → Commit → Continue.** Không đánh dấu `DONE` khi chưa chứng minh được acceptance criteria.
2. Đi lần lượt qua phases **P00 → P11**, theo dependency graph. Có thể thay đổi task order trong cùng phase khi hợp lý, nhưng phải ghi lý do.
3. Tạo và duy trì `docs/agent/PROGRESS.md`, `docs/agent/DECISIONS.md`, `docs/agent/BLOCKERS.md`, `docs/agent/HANDOFF.md` ngay từ P00. Mỗi task có ID, trạng thái, evidence.
4. Không tự xóa dữ liệu, force-push, thay đổi bí mật, tạo tài khoản trả phí, mua domain, deploy production hoặc thực hiện thao tác mất dữ liệu nếu chưa được chủ repo cho phép.
5. Không giả lập thành công: test bị skip, mock endpoint, ảnh minh họa, hard-coded số người online hoặc `TODO` trong critical path **không** tính là feature hoàn tất.
6. Nếu môi trường thiếu credentials hoặc quyền thao tác: hoàn thành phần code/test có thể thực hiện, ghi **BLOCKED_EXTERNAL** cùng lệnh kiểm chứng cụ thể. Không tuyên bố production đã live.
7. Giữ ứng dụng chạy được sau mỗi milestone. Ưu tiên vertical slice có thực, thay vì xây toàn bộ UI trước rồi mới nối backend.
8. Không tự ý đưa AI companion, chat riêng, voice/video, trading, real-money economy hoặc các tính năng V2 vào MVP.
9. Tuân thủ license assets và dependencies. Không lấy sprite từ game/anime hiện hữu không có quyền sử dụng.
10. Bảo vệ người dùng là tính năng cốt lõi. Không cho phát hành public nếu moderation/report/block chưa hoạt động.
11. Không khẳng định mục tiêu 10.000 CCU đã đạt nếu chưa đo bằng load test thực tế và có log/evidence.
12. Đọc code hiện tại trước khi sửa. Nếu repo đã có dữ liệu, giữ tương thích, bổ sung migrations và tránh phá vỡ hoạt động sẵn có.

### 0.2 Quy tắc hoàn thành task

- `TODO`: chưa làm.
- `IN_PROGRESS`: đang triển khai.
- `BLOCKED_EXTERNAL`: thiếu thông tin/quyền/secret/asset thuộc bên ngoài; ghi rõ cách mở khóa.
- `BLOCKED_TECHNICAL`: vướng lỗi kỹ thuật; ghi reproduction, attempts, next action.
- `DONE`: đã code, chạy test/verification, ghi evidence và kiểm tra acceptance.
- `DEFERRED_APPROVED`: ngoài MVP hoặc được chủ dự án chấp nhận hoãn; lý do phải cụ thể.

**Bằng chứng tối thiểu:** commit hash; lệnh test và output hoặc CI link; screenshot/video ở các task UI khi môi trường cho phép; migration status; checklist nghiệm thu. Không bịa output.

### 0.3 Session resume protocol

Khi mở phiên agent mới:

1. Đọc file này, `docs/agent/PROGRESS.md`, `DECISIONS.md`, `BLOCKERS.md`, `HANDOFF.md`, `git status`, commit gần nhất và `README.md`.
2. Xác nhận commands đang chạy được (`install`, `lint`, `typecheck`, `test`); đọc lỗi trước khi tiếp tục.
3. Lựa chọn **task TODO đầu tiên không bị block có dependencies DONE**.
4. Hoàn thành task đó đến acceptance; không nhảy ngẫu nhiên sang task khác.
5. Cập nhật tài liệu theo mẫu trong §15 trước khi kết thúc phiên.
6. Nếu context sắp hết: ưu tiên ghi HANDOFF trung thực + test status + next exact command.

### 0.4 Definition of DONE của toàn dự án

`RELEASE_READY` chỉ khi tất cả điều kiện sau đều đúng:

- Người mới vào quán với guest session, chọn vai Customer/Maid và chơi được với ít nhất hai browser độc lập.
- Có **một quán pixel-art 2D hoàn chỉnh**, tài nguyên hợp pháp; di chuyển click-to-move có kiểm soát, chọn ghế, tương tác với quầy và bàn.
- Có lifecycle Order end-to-end, trạng thái đồng bộ với các client, xử lý duplicate và race.
- Hoạt động khi Maid hoặc khách disconnect/reconnect; room snapshot khôi phục đúng.
- Có chat room, quick chat, emote; `mute`, `block`, `report`, quyền moderator, xử lý sanction thực sự áp dụng ở HTTP và socket.
- Ghi nhận EXP và cosmetic reward mà không dễ double-grant qua retry.
- Có luồng chụp ảnh và chia sẻ **có consent**, không xuất chat hay danh tính không được cho phép.
- E2E, security, concurrency và performance smoke tests pass; không còn blocker severity Critical/High chưa được chấp thuận.
- Container production khởi động; có health check, migrations, HTTPS, backup và **thử restore backup** trên môi trường kiểm thử.
- CI pass, rollback được tài liệu hóa, production smoke đã chạy sau deploy thực (nếu được cấp hạ tầng), các bằng chứng đính kèm.
- Nếu chưa có domain/VPS/secrets hoặc chưa deploy: trạng thái **`CODE_COMPLETE / RELEASE_BLOCKED_EXTERNAL`**, không phải `LIVE`.

---

## 1. PRODUCT REQUIREMENTS DOCUMENT (PRD)

### 1.1 Vision

**Maid Cafe Social** là một social roleplay game 2D trên trình duyệt: người dùng nhập vai **Customer** hoặc **Maid** (người phục vụ), cùng vận hành quán cà phê anime-inspired. Người chơi có mục tiêu nhẹ nhàng, các hành vi phối hợp hữu ích, các hoạt động vui và trải nghiệm an toàn với người lạ.

**North-star experience:** Một khách chọn bàn, gọi món; một Maid người thật nhận đơn, pha chế, mang món tới; cả hai tương tác bằng emote/chat đã được kiểm duyệt; kết thúc bằng ảnh kỷ niệm/EXP. Toàn bộ vòng lặp hoạt động cho nhiều người chơi đồng thời.

### 1.2 Đối tượng & giá trị

| Nhóm | Nhu cầu chính | Giá trị sản phẩm |
|---|---|---|
| Người thích anime/pixel art | Trải nghiệm vui và chia sẻ | Quán ảo đẹp, avatar chibi, sự kiện |
| Người chơi social casual | Gặp gỡ, tương tác nhanh | Room multiplayer, trò chuyện, emotes |
| Người thích roleplay phục vụ | Có hoạt động và tiến độ | Maid shift, order queue, minigame, EXP |
| Nhóm bạn | Cùng vào một phòng | Invite link, chỗ ngồi gần nhau nếu còn |

### 1.3 Product principles

- Join nhanh, **không cần đăng ký** cho người mới; guest identity có kiểm soát lạm dụng.
- Player Maid là người thật tự nguyện; **không đồng nghĩa moderator/nhân viên công ty**.
- Trang phục và vai trò không giới hạn giới tính; không thiết kế nội dung tình dục hay cơ chế “trả tiền để nhận sự quan tâm”.
- Không bắt buộc giao tiếp riêng. Có quyền từ chối/tắt tương tác, mute, block, chuyển phòng.
- Khi quán vắng vẫn có việc để làm nhờ NPC fallback **được gắn nhãn NPC rõ ràng**.
- Người chơi có thể chơi trên desktop; mobile có cơ chế touch-to-move và UI thu gọn.
- Chất lượng hình ảnh, onboarding và moderation quan trọng tương đương backend.

### 1.4 Scope MVP bắt buộc

1. Landing + onboarding + nickname/avatar cơ bản + guest session.
2. Lobby: danh sách room, số người thực tế, chỗ trống, join/invite.
3. Một map Café Sakura isometric 2D và các vị trí tương tác.
4. Chọn vai Customer/Maid, capacity riêng từng vai, role switching an toàn.
5. Realtime room, presence, seat allocation, movement theo điểm đích, reconnect + snapshot.
6. Customer menu gồm **6 món** cấu hình bằng dữ liệu, đặt/hủy đơn theo quy tắc.
7. Maid shift, nhận đơn, pha chế bằng **1 minigame ngắn**, phục vụ tại bàn.
8. NPC fallback giới hạn khi không có Maid và thời gian chờ đạt ngưỡng.
9. Room chat có moderation; quick-chat; emote; mute/block/report.
10. Moderator dashboard: báo cáo, bằng chứng tối thiểu, mute/kick/temporary ban, action audit và quyền truy cập đúng.
11. EXP + một số rewards cosmetic, profile tối giản; friend invite; cheki/screenshot với consent.
12. Logging, metrics, CI/CD, backup-restore, security, test suite, docs vận hành.

### 1.5 Ngoài phạm vi MVP (hard non-goals)

- AI Maid LLM / tình cảm ảo, voice chat, livestream, video, webcam, 1:1 direct messages.
- Payment, virtual goods mua bằng tiền thật, user-to-user trading, gift/tip trả phí.
- User-generated images, audio, arbitrary text on sprites, uploads công khai.
- World editor, nhiều map và sự kiện theo mùa tự động.
- Kubernetes, Kafka, Elasticsearch, microservices, distributed transaction orchestrator.
- 3D/VR, movement vật lý kiểu MMO, competitive combat.
- Xếp hạng người chơi dựa vào mức độ được người khác chú ý.

### 1.6 MVP content specification

- **Một quán** `cafe-sakura`, có khu lobby, dining (8 bàn x 3 ghế hoặc phương án tương đương), counter, kitchen, photo spot, social corner; cấu hình room tối đa 30 participants.
- **Room quota mặc định:** 24 Customer + 6 Maid; phải config được và tuân thủ tổng ≤ 30.
- **6 món menu:** Coffee, Iced Latte, Milk Tea, Matcha, Cake, Omurice (chỉ là vật phẩm ảo).
- **4 avatar starter variants**, các màu/trang phục cơ bản; không bắt buộc account.
- **3 trạng thái nhân vật:** idle, moving, interacting; có trạng thái sit/serve/prepare tùy role.
- **3–5 emotes**: wave, bow, thanks, happy, surprised.
- **Minigame:** chọn đúng thứ tự nguyên liệu trong giới hạn thời gian thoải mái; không trừng phạt người chơi bằng mất quyền truy cập.
- **NPC fallback:** một nhân vật công khai là NPC nhận đơn trễ; không giả là người thật, không auto chat với vẻ như user.
- **Ảnh Cheki:** chỉ ảnh client-rendered với sprite của người đồng ý; không cần lưu server-side trong MVP.

### 1.7 Core user journeys & acceptance

**J1 Guest Customer:** landing → create guest → pick avatar → lobby → join room → seat → order → receive → emote → screenshot. Toàn bộ không yêu cầu tài khoản trả phí.

**J2 Maid:** create guest → choose Maid → join shift → see pending orders → claim → minigame → deliver → get XP → end shift.

**J3 Friends:** A tạo invite link → B mở → nếu room còn chỗ được vào cùng room; hết chỗ trả trạng thái rõ và đề xuất room mới; không bypass quota.

**J4 Safety:** A bị B quấy rối → A mute/block hoặc report → ngay lập tức không nhận chat B nữa → moderator thấy report và xử lý → sanction áp dụng cả sau reconnect.

**J5 Resilience:** A đang phục vụ mất kết nối 10 giây → vào lại trong grace period → thấy room/order/role nhất quán; hết hạn thì order được requeue hoặc NPC fallback theo quy tắc.

### 1.8 KPI đo lường (giả thuyết, chưa phải benchmark)

- Landing → joined-room conversion; session length; first order placed; order completion rate.
- Maid active shift ratio; order wait time p50/p95; NPC fallback rate.
- Day-1/Day-7 return rate; invite conversion; report rate per active users; moderation median response time.
- Server: CCU, room count, socket reconnect, command error rates, event latency, resource usage.
- Analytics chỉ thu dữ liệu tối thiểu, có thông báo minh bạch và khả năng tắt analytics không thiết yếu.

---

## 2. ARCHITECTURE DECISIONS & BOUNDARIES

### 2.1 Technology baseline

| Vị trí | Quyết định | Lý do |
|---|---|---|
| Workspace | pnpm monorepo + TypeScript strict | Shared contracts và tooling đồng bộ |
| Web | Next.js + React + Tailwind | Web onboarding, responsive UI |
| Scene | PixiJS 2D | Render sprites/animation hiệu quả |
| Client state | Zustand | Game/UI state nhỏ gọn |
| API | NestJS + Fastify adapter | Module rõ, HTTP nhanh, ecosystem |
| Realtime | NestJS Socket.IO gateway | Room, ACK, event namespace, reconnect control |
| Contracts | Zod schemas + inferred TypeScript types | Validate hai phía, tránh drift |
| Database | PostgreSQL + Drizzle ORM | Durable transactional data, migrations rõ |
| Transient room state | In-memory ở **một instance** | Đơn giản hóa MVP, không trả chi phí Redis vô ích |
| Scale phase | Redis + dedicated owner routing | Chỉ triển khai khi có số liệu và nhu cầu |
| Test | Vitest hoặc Jest thống nhất, Playwright E2E, k6/Artillery | Unit/integration/browser/load |
| Ops | Docker Compose + Caddy + GitHub Actions | Phù hợp VPS nhỏ |
| Telemetry | Structured JSON logs + Prometheus metrics + error tracking tùy điều kiện | Quan sát lỗi và tải |

**Lock versions** vào lockfile trong P01; không ghim phiên bản trong plan vì công cụ thay đổi. Xem security advisories và compatibility ở thời điểm triển khai.

### 2.2 Runtime topology MVP

```text
Browser (Next.js, PixiJS)
    | HTTPS / Socket.IO over WSS
    v
Caddy Reverse Proxy
    ├── web: Next.js
    └── api: NestJS + Socket.IO
            ├── Identity / Room / Seat / Role / Presence
            ├── Orders / Shift / Gameplay / Rewards
            ├── Chat / Moderation / Photo Consent
            ├── RoomActor registry [single-instance]
            └── Drizzle + PostgreSQL

Observability: health + metrics + structured logs
CI: install → lint → typecheck → unit → integration → E2E → build
```

**Quan trọng:** Tránh giả vờ horizontally scalable ở MVP. Một authoritative backend instance với in-memory rooms sẽ **mất ephemeral state khi restart**; client phải resync; persistent orders và moderation nằm trong PostgreSQL. Muốn chạy nhiều instance phải hoàn thành P10 distribution design, không chỉ bật thêm replicas.

### 2.3 Repository target

```text
maid-cafe-social/
├── apps/
│   ├── web/
│   │   ├── src/app/
│   │   ├── src/features/{auth,lobby,game,orders,chat,wardrobe,safety}/
│   │   ├── src/game/{scenes,entities,systems,assets,animation}/
│   │   └── e2e/
│   └── api/
│       ├── src/modules/{identity,cafe,room,seat,role,presence,order,shift,gameplay,economy,social,moderation}/
│       ├── src/realtime/{gateway,room-actor,contracts,guards}/
│       ├── src/common/{config,logging,errors,security}/
│       ├── src/db/{schema,migrations,seeds}/
│       └── test/{integration,concurrency,e2e}/
├── packages/
│   ├── contracts/      # Zod schema, event names, error codes
│   ├── config/         # Shared tsconfig/eslint presets
│   └── art-metadata/   # Manifest, license metadata, no unowned assets
├── assets/
│   ├── source/
│   ├── sprites/
│   ├── tiles/
│   ├── audio/
│   └── LICENSES.md
├── infra/
│   ├── compose/
│   ├── caddy/
│   ├── monitoring/
│   └── scripts/{backup,restore,deploy,rollback}/
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── api/
│   ├── security/
│   ├── operations/
│   └── agent/{PROGRESS,DECISIONS,BLOCKERS,HANDOFF}.md
├── .github/workflows/
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── README.md
```

### 2.4 Architecture invariants

- Server validates **all** commands and controls room membership, role, seat, order, reward and sanctions.
- Client never chooses authoritative XP, order owner, completedAt or role privileges.
- Per-room commands execute in deterministic serialized order; **do not interleave async mutations** outside actor queue.
- Database durable order transition is authoritative for billing-like/reward-relevant operations; persist first, broadcast after commit.
- Real-time events are **at-least-once/possibly duplicated** from user perspective; idempotency and resync required.
- Domain events come with room `version`; snapshot has matching `version`; missing version → refetch snapshot.
- Every handler enforces identity, sanction, membership, role, target state, capacity, and rate limit.
- Chat filtering occurs **before broadcast**; do not trust client-side mute as enforcement alone.
- `role = Maid` không cho quyền xem tài liệu moderation hoặc quản trị quán.
- Không expose raw IP, email, session tokens, report details trong room events.

---

## 3. DOMAIN MODEL & STATE MACHINES

### 3.1 Entities

- `User` (registered optional later), `GuestSession`, `PlayerProfile`.
- `CafeTemplate`, `Room`, `RoomParticipant`, `Seat`, `ActiveMaidShift`.
- `MenuItem`, `Order`, `OrderEvent`, `PreparationAttempt`.
- `Wallet` (virtual), `RewardLedger`, `OwnedCosmetic`, `PlayerStats`.
- `ChatMessage` (short-lived for reports/moderation), `UserBlock`, `UserMute`, `Report`, `ModerationAction`, `AuditEvent`, `PhotoConsent` (ephemeral).

### 3.2 Room state

`CREATED → OPEN → DRAINING → CLOSED`. Phòng tự tạo khi cần, đóng khi hết người sau TTL. `DRAINING` không nhận người mới, vẫn cho người hiện tại hoàn tất/exit; deploy có deadline để force safe shutdown.

Quy tắc quota: `total <= maxTotal`, `customer <= maxCustomer`, `maid <= maxMaid`. Join phải atomically kiểm tra cả ba. Seat là resource độc lập với participation; có thể ở room nhưng chưa ngồi.

### 3.3 Presence state

`CONNECTED → TEMPORARILY_DISCONNECTED → LEFT/EXPIRED`, `AFK` là user activity flag, không phải disconnect. Grace period đề xuất **30 giây** (config), heartbeat/transport timeout theo Socket.IO. Ngắt kết nối ngắn không tự động phát thưởng hoặc đánh dấu hoàn tất task.

Multi-tab: một `guestSession` có thể có nhiều sockets, nhưng chỉ **một active player instance/room** cho mỗi identity; các tab còn lại ở chế độ spectator hoặc được yêu cầu take-over có xác nhận. Không cho duplicate seat/shift/EXP từ các tab.

### 3.4 Role & shift rules

- `Customer ↔ Maid` chỉ khi không giữ active order/shift cần hoàn tất; có API bàn giao an toàn.
- Maid shift: `OFF_DUTY → ON_DUTY → PAUSED → ENDED`. Auto-end khi leave, nhưng cần giải quyết outstanding orders.
- Customer ordering requires assigned seat; configurable để sau này cho takeaway.
- Maid may claim tối đa 2 `ASSIGNED/PREPARING/READY` orders (config).
- End shift khi còn order: `handoff` trước, hoặc server thực hiện requeue transactionally.

### 3.5 Order state machine — source of truth

```text
PENDING ──claim──> ASSIGNED ──prepare──> PREPARING
   |                  |                       |
   | customer.cancel  | maid.disconnect/TTL   | minigame.complete
   v                  v                       v
CANCELLED           PENDING                 READY
                                               |
                                            deliver
                                               v
                                             SERVED
                                               |
                                           complete
                                               v
                                           COMPLETED
```

- `PENDING → CANCELLED` cho Customer nếu chưa được nhận; sau đó cần cancellation policy rõ và không làm mất trạng thái bất ngờ.
- `ASSIGNED → PENDING` hoặc `PREPARING → PENDING` khi bàn giao; **version increment**; minigame attempt cũ invalid.
- `READY → SERVED` chỉ khi Maid đang sở hữu order và ở interaction point hợp lệ; game logic không tin vị trí client tự báo.
- `SERVED → COMPLETED` server tự hoàn tất sau xác nhận phù hợp; idempotent.
- Order terminal: `CANCELLED`, `COMPLETED`; không resurrect.
- Timeout phải có đường xử lý: requeue hoặc NPC fulfill; khách nhìn thấy thông báo rõ ràng.
- **NPC fallback**: nếu quá `NPC_FALLBACK_MS` mà order pending, `NPC` claim theo cùng state machine, chỉ một winner; có `fulfilledByType = NPC`.

### 3.6 Reward state machine

EXP/reward chỉ được cấp sau order `COMPLETED`, role phù hợp và guard chống abuse. Sử dụng unique `(user_id, source_type, source_id, reward_kind)` trong ledger. Reward/complete nằm trong cùng DB transaction hoặc có idempotent recovery bằng outbox. Không cho client gọi `reward.grant`.

### 3.7 Moderation semantics

- **Mute local:** chỉ ảnh hưởng nội dung hiển thị cho người thực hiện mute.
- **Block:** ngăn chat/targeted interaction và ẩn nội dung; xử lý shared-space bằng đổi bàn/phòng khi cần; tránh lộ block list công khai.
- **Chat timeout:** server từ chối `chat.send`, kể cả khi reconnect/new tab.
- **Kick room:** đóng membership + socket event, không đồng nghĩa account ban.
- **Temporary ban:** chặn HTTP join và realtime join cho identity đã biết đến `expiresAt`.
- **Admin action:** immutable audit có actor, reason, target, timestamp, policy reason; hỗ trợ appeal workflow tối thiểu qua form.
- Không dùng regex blacklist như cơ chế bảo vệ duy nhất; thiết kế rules + reports + manual review. Có hạn mức/retention cho message evidence.

---

## 4. PUBLIC API & REALTIME CONTRACTS

### 4.1 API endpoints (đề xuất)

| Method | Endpoint | Access | Expected outcome |
|---|---|---|---|
| POST | `/v1/session/guest` | Anonymous + rate limit | Set secure session cookie; return public profile |
| GET | `/v1/me` | Session | Own profile + capability flags |
| PATCH | `/v1/me/profile` | Session | Update validated nickname/avatar |
| GET | `/v1/cafes` | Public | Cafe templates |
| GET | `/v1/rooms` | Public | Room list with real occupancy |
| POST | `/v1/rooms/join-ticket` | Session | Short-lived ticket/intent (optional); enforce sanction |
| GET | `/v1/menu` | Public | Menu entries |
| GET | `/v1/me/stats` | Session | Own progress |
| GET | `/v1/me/cosmetics` | Session | Owned cosmetics |
| POST | `/v1/reports` | Session | Create report with controlled evidence reference |
| POST | `/v1/me/blocks` | Session | Block target |
| DELETE | `/v1/me/blocks/:targetId` | Session | Unblock target |
| GET | `/v1/mod/reports` | Moderator | List filtered reports |
| POST | `/v1/mod/reports/:id/actions` | Moderator | Apply action with reason, audit, idempotency |
| GET | `/health/live` | Public minimal | Liveness |
| GET | `/health/ready` | Internal/proxy | Readiness incl. DB |
| GET | `/metrics` | Protected | Prometheus metrics |

Cookie-based auth: `HttpOnly`, `Secure` in production, `SameSite` phù hợp cấu hình same-site, rotation/revocation. HTTP state changes require CSRF mitigation (Origin/Referer checks and appropriate token where needed); WS handshake validates Origin/session.

### 4.2 Socket namespace / command envelope

Namespace `/cafe`. Socket.IO protocol, not raw RFC6455 JSON WebSocket. Validate each payload by Zod; ACK standardized.

```ts
type ClientCommand<T> = {
  requestId: string;       // UUID; replay-safe within bounded TTL
  roomId: string;
  expectedVersion?: number;
  payload: T;
};

type CommandAck<T = unknown> = {
  requestId: string;
  ok: boolean;
  result?: T;
  error?: { code: string; message: string; retryable: boolean };
  roomVersion?: number;
};

type RoomEvent<T> = {
  eventId: string;
  roomId: string;
  version: number;
  type: string;
  payload: T;
  occurredAt: string; // ISO8601
};
```

**Không triển khai replay toàn bộ event stream trong MVP.** Reconnect nhận full room snapshot và version. Nếu thấy gap/duplicate/out-of-order thì yêu cầu resnapshot; không tự áp event theo thứ tự đoán.

### 4.3 Client commands / server events

| Command | Preconditions | Server event / ACK |
|---|---|---|
| `room.join` | session, capacity, no ban | `room.snapshot`, `participant.joined` |
| `room.leave` | member | `participant.left` |
| `role.select` | member; safe transition | `role.changed` |
| `seat.claim` | Customer; seat free; in room | `seat.claimed` or `SEAT_OCCUPIED` |
| `seat.release` | owner | `seat.released` |
| `player.move` | member; valid walk target; rate limit | `player.path.accepted` |
| `maid.shift.start` | Maid; quota | `shift.started` |
| `maid.shift.pause` | owner; handoff rule | `shift.paused` |
| `order.place` | Customer seated; valid menu | `order.created` |
| `order.cancel` | owner; cancellable status | `order.cancelled` |
| `order.claim` | on-duty Maid; pending; capacity | `order.assigned` |
| `order.prepare.start` | assigned Maid at counter | `order.preparing` |
| `minigame.submit` | valid preparation attempt | `order.ready` or feedback |
| `order.serve` | owning Maid near correct table | `order.served`; eventual `order.completed` |
| `chat.send` | allowed, validated, moderated | `chat.message` or error |
| `quickchat.send` | member; allowed phrase | `chat.quick` |
| `emote.send` | member; allowed emote | `emote.play` |
| `user.block` | self action | `block.updated` private ACK |
| `report.create` | reporter; evidence ref | `report.accepted` private ACK |
| `photo.consent.set` | current room; expiry | `photo.consent.updated` (minimal) |

### 4.4 Standard error codes

`UNAUTHENTICATED`, `FORBIDDEN`, `ROOM_FULL`, `ROLE_FULL`, `NOT_MEMBER`, `INVALID_TARGET`, `SEAT_OCCUPIED`, `ORDER_NOT_FOUND`, `ORDER_ALREADY_CLAIMED`, `INVALID_ORDER_STATE`, `SHIFT_REQUIRED`, `MAX_ACTIVE_ORDERS`, `RATE_LIMITED`, `CHAT_REJECTED`, `SANCTIONED`, `CONFLICT_VERSION`, `IDEMPOTENCY_CONFLICT`, `RESYNC_REQUIRED`, `INTERNAL_ERROR`.

- Error messages không expose sensitive internal state.
- ACK được trả với timeout + retry rule từ client; retry cùng `requestId` đối với command state-changing.
- Countermeasures với client hacked: server-side allowlist event, payload size cap, connection limits, rate limits, schema validation.

### 4.5 Contract tests

- Shared Zod schemas kiểm tra payload hợp lệ/sai và phân biệt versioned contracts.
- API errors và socket ACK cùng error taxonomy.
- Test browser-client serialization + backend parsing.
- Backwards-compatible field addition; breaking change yêu cầu contract version và deploy plan.

---

## 5. DATABASE DESIGN & MIGRATIONS

### 5.1 Core tables, fields & constraints

```text
users                  id, kind[guest|registered], created_at, status
sessions               id, user_id, token_hash, expires_at, revoked_at, created_at
profiles               user_id(PK), display_name, avatar_key, preferences_json, updated_at
cafe_templates         id, slug(UQ), config_json, enabled
menu_items             id, cafe_id, slug, title, virtual_price, recipe_json, active
orders                 id, room_id, customer_id, assigned_maid_id?,
                       menu_item_id, status, version, fulfilled_by_type,
                       created_at, assigned_at?, completed_at?, expires_at?
order_events           id, order_id, transition, actor_id?, from_state, to_state,
                       idempotency_key, occurred_at
maid_shifts            id, room_id, maid_id, started_at, ended_at?, state
preparation_attempts   id, order_id, maid_id, nonce_hash, expires_at, result_json
player_stats           user_id(PK), xp_total, orders_served, orders_received, updated_at
wallets                user_id(PK), balance_virtual, version
reward_ledger          id, user_id, source_type, source_id, reward_kind,
                       quantity, created_at,
                       UNIQUE(user_id, source_type, source_id, reward_kind)
cosmetic_catalog       id, kind, asset_key, active, unlock_condition_json
owned_cosmetics        user_id, cosmetic_id, unlocked_at, UNIQUE(user_id, cosmetic_id)
user_blocks            blocker_id, blocked_id, created_at, UNIQUE(blocker_id, blocked_id)
user_mutes             muter_id, muted_id, created_at, UNIQUE(muter_id, muted_id)
chat_messages          id, room_id, sender_id, text, created_at, expires_at
reports                id, reporter_id, target_id?, message_id?, category,
                       description, status, created_at, resolved_at?
moderation_actions     id, report_id?, actor_moderator_id, target_user_id,
                       action_type, reason, expires_at?, created_at
moderation_audit       id, actor_id, action_type, target_id, metadata_json, created_at
command_receipts       id, actor_id, request_id, command_type,
                       payload_hash, outcome_json, expires_at,
                       UNIQUE(actor_id, request_id)
```

**Lưu ý thiết kế:** `room_id`/seat occupancy và presence có thể ở in-memory trong MVP; không tạo durable `rooms` nếu restart room không cần giữ nguyên. ID stable cho `cafe_template`, session/guest. Dữ liệu order đang active khi restart được reconcile (cancel/requeue) bằng documented policy; không giả rằng memory room tồn tại sau crash.

### 5.2 Database indexes & integrity

- Index `orders(room_id, status, created_at)`, `orders(assigned_maid_id, status)`.
- Index `chat_messages(room_id, created_at)` với retention.
- Index `reports(status, created_at)` và `moderation_actions(target_user_id, expires_at)`.
- Unique `order_events(order_id, idempotency_key)` hoặc command receipts uniqueness tương đương.
- Use FK, check constraints (`virtual_price >= 0`, `balance_virtual >= 0`, valid states), server-side enums and migrations.
- `order.claim` dùng CAS: `UPDATE orders SET assigned_maid_id = ?, status='ASSIGNED', version=version+1 WHERE id=? AND status='PENDING' RETURNING ...`. Transaction bảo đảm chỉ một winner.
- `order.complete` và `reward_ledger insert` phải cùng transaction hoặc qua reliable outbox/idempotent consumer.

### 5.3 Retention/privacy rules

- Chat evidence lưu tối thiểu, TTL mặc định ví dụ 7–30 ngày **là cấu hình cần quyết định theo yêu cầu pháp lý và vận hành**, không coi mặc định là tuân thủ luật.
- Report/action/audit giữ theo policy đã công bố, phân quyền chặt.
- Không lưu lời thoại riêng (MVP không có DM) hay tọa độ/heartbeat dài hạn.
- Không ghi session cookie, access token, IP thô vào app logs; nếu IP thật sự cần chống abuse thì dùng hash/retention ngắn và quyền truy cập giới hạn.
- Có privacy policy, retention schedule, request delete/account data (đối với guest: giới hạn xác minh danh tính).

### 5.4 Migration discipline

- Mỗi schema change có migration forward và plan rollback hoặc expand/contract.
- Fresh DB: `migrate + seed` pass.
- Existing DB: migrate idempotently, validate schema/check constraints.
- Tạo snapshot backup trước deploy migration production; không auto destructive reset.

---

## 6. GAME CLIENT & ART SYSTEM

### 6.1 Scene graph

```text
GameShell
 ├── InputController (pointer/touch)
 ├── Camera (zoom/viewport constraints)
 ├── TileMap / Collision / InteractionPoints
 ├── EntityLayer (players, NPCs, props)
 ├── AnimationSystem (idle/walk/sit/prepare/serve/emote)
 ├── PathRenderer (accepted server path)
 ├── InteractionOverlay (hover/click target)
 └── ResponsiveHUD (chat, order, profile, safety)
```

### 6.2 Game art direction

- Anime-inspired **original** chibi pixel art; pastel pink/cream/wood; cozy sakura café; không sao chép nhân vật/biểu tượng thương mại.
- Đồng nhất sprite scale, tile size, lighting, palette, animation FPS, naming conventions và z-order.
- Thiết kế asset pipeline có `manifest.json` chứa size, frames, anchor, hitbox, collision, license/source.
- Mọi external asset phải có license rõ (`CC0`, quyền thương mại, hoặc bản quyền do dự án sở hữu); ghi `assets/LICENSES.md`.
- Audio opt-in, mute by default hoặc theo browser policy; âm lượng riêng; không tự động phát file bản quyền không có phép.
- Placeholder được dùng trong prototype, **không chấp nhận placeholder/stock watermarked trong release**.

### 6.3 Movement implementation

- Click/touch một `interactionPoint` (seat, counter, table, photo spot, lounge).
- Client sends `player.move(targetPointId)`; server checks target in room map, access by role, reasonable cooldown, source position known.
- Server returns accepted path/waypoints + start time, duration or discrete movement rules. All clients animate same path.
- Không tin coordinate x/y arbitrary từ client. Server xác minh range và action context (serve near table, prepare near counter).
- Collision with static map (and optional occupied interaction points). Dynamic crowd collision có thể dùng soft overlap nếu cần; không cố làm pathfinding MMORPG.
- Snapshot sync stores authoritative current target/last update; corrects drift on reconnect.

### 6.4 UI responsiveness & accessibility

- Desktop primary: game canvas 16:9 with responsive resizing/letterboxing.
- Mobile: landscape recommendation hoặc portrait HUD with controls; no tiny clickable surfaces.
- Keyboard accessible menus, visible focus, reduced motion, muted audio, legible text size.
- Text chat with keyboard and screen-reader labels; game canvas có HTML alternative controls cho major actions.
- Không chặn gameplay chính nếu máy yếu; có setting giảm particle/animation.

### 6.5 Snapshot rendering & photo booth

- Renderer xuất PNG cục bộ từ scene/canvas, không tự upload.
- Chỉ hiển thị những người chơi khác trong ảnh Cheki khi họ đã `photo.consent` cho lần chụp hoặc chế độ đồng ý rõ ràng; nếu không, ẩn sprite hoặc dùng silhouette.
- Không render nội dung chat hoặc thông tin account vào ảnh nếu thiếu đồng ý.
- Metadata ảnh có timestamp/room/theme nếu người dùng chọn; không chứa identifiers nhạy cảm.

---

## 7. SECURITY, SAFETY & MODERATION

### 7.1 Threat model

**Tài sản cần bảo vệ:** identity/session; quyền moderation; trạng thái order/reward; an toàn chat; dữ liệu báo cáo; độ sẵn sàng service.

**Mối đe dọa:** anonymous spam, sockpuppets, session theft, CSRF, forged socket events, privilege escalation, seat/order race, duplicate reward, bot farming, chat harassment, personal info leaks, DoS, reconnect storms.

### 7.2 Controls bắt buộc

- Server validation với Zod cho từng HTTP/socket payload và strict allowlist event types.
- Signed high-entropy sessions, secure cookies, rotation/revocation, moderate session TTL.
- Same-origin/correct CORS, socket Origin allowlist; không open `*` với credentials.
- HTTP CSRF protection cho mutations (Origin checks + CSRF token khi thích hợp).
- Per-IP (privacy respecting), per-session, per-room, per-command rate limits; payload size caps.
- Socket connection caps, idle timeout, load shedding, structured error handling.
- Content moderation trước broadcast: text normalization, abuse/profanity/PII heuristic, spam detection, policy rules; suspicious content held for review; warn/block accordingly.
- Chat safety policy viết bằng ngôn ngữ rõ, có báo cáo và appeals; moderation staff không là Maid mặc định.
- Moderator/admin accounts không guest; mạnh authentication, recommended MFA, RBAC, audit logs; bootstrap via protected admin command/secrets, không self-register moderator.
- Secrets không commit repo; `.env.example` chỉ chứa tên biến, CI secret scanning.
- Set CSP, secure headers, data access boundaries; test dependency vulnerabilities trước release.

### 7.3 Report lifecycle

`OPEN → TRIAGED → ACTIONED / DISMISSED → CLOSED`, có `REOPENED` qua appeal nếu cần.

- Reporter chọn player/message, reason (harassment, spam, sexual content, threats, personal data, others), optional description.
- Report tạo trên server với trusted message reference; không cho client gửi bằng chứng giả như message của người khác.
- Moderator queue show timestamp + context tối thiểu, history đã được phép xem.
- Action with reason and TTL; log audit; thông báo kết quả không tiết lộ chi tiết riêng tư cho người không có quyền.
- Thử report spam, report malicious, self-report và cross-room report.

### 7.4 Age-safety / public launch gate

Trước khi mở public phải xác định đối tượng tuổi và chính sách độ tuổi, hiển thị quy tắc cộng đồng, privacy policy, contact for abuse, cookie/analytics notice phù hợp. Nếu không có năng lực bảo vệ trẻ vị thành niên, **không định vị sản phẩm cho trẻ em** và thiết kế onboarding/giới hạn theo chính sách pháp lý đã rà soát. Không tự tuyên bố tuân thủ pháp luật một quốc gia mà chưa được kiểm tra.

### 7.5 Security acceptance tests

- Blocked chat sender gửi raw Socket.IO event → server reject.
- Non-mod gọi `/v1/mod/*` → 403.
- Banned user refresh/reconnect/new tab → không join.
- Duplicate requestId with different payload → `IDEMPOTENCY_CONFLICT`.
- Stolen/invalid/expired token → unauthorized; redact logs.
- Rate limited user bị từ chối trước DB-heavy work.
- Inputs with HTML/JS không tạo XSS khi hiển thị.
- Report evidence không truy cập được bởi user không có quyền.

---

## 8. PRODUCTION OPERATIONS DESIGN

### 8.1 Environments

- `local`: Docker Compose PostgreSQL, web, API, seeded guest sample; no public exposure.
- `test`: isolated DB/ports, deterministic seed, mocks cho external integrations.
- `staging`: deploy gần production, có TLS, test automation với dummy data.
- `production`: separate secrets, backups, Caddy HTTPS, monitoring, no debug endpoints publicly available.

### 8.2 Docker & networking

- Multi-stage builds, non-root process, health checks, sane memory/CPU limits.
- Database not exposed publicly; firewall allow only 80/443 and restricted SSH.
- Caddy reverse proxy websocket upgrade, timeouts tuned for Socket.IO; test WSS.
- Graceful shutdown: stop new joins, drain room, notify reconnect, persist durable transitions, close sockets cleanly.
- `readiness` checks DB availability, but do not overload app with giant queries.

### 8.3 Backup and rollback

- Automated scheduled PostgreSQL backup with encryption at rest where supported, retention policy, off-host storage preferred.
- **Restore drill** in isolated environment; prove sample users/orders/reports recover.
- Deploy script: preflight → backup → migrations → new image → health → smoke → promote; rollback app image if fails, but DB migrations might require expand/contract rather than reverse.
- No log secrets; redact guest tokens and moderator data.

### 8.4 Observability

**Metrics:** active websocket connections, room count/occupancy, heartbeat failures, event ACK latency p95, chat blocked ratio, order completion p95, order requeue/NPC fallback count, DB pool saturation, CPU/RAM, errors, report queue backlog.

**Logs:** requestId/roomId/correlation id, event name, latency, error category; avoid message text in general logs.

**Alerts:** readiness down, error ratio high, DB unavailable, moderation queue backlog abnormal, excessive reconnects, sustained CPU/memory pressure.

### 8.5 Cost discipline

- Launch on one appropriately sized VPS only after benchmark. No guarantee that a $5 VPS handles target CCU.
- No Kafka/Elasticsearch/K8s before a real bottleneck.
- Build assets optimized: sprite sheets, caching/CDN, compression.
- Define budget alerts / manual cost review for managed services.

---

## 9. EXECUTION ROADMAP — 12 PHASES

> Mỗi phase có **Inputs, Tasks, Verification, Gate**. Không đánh dấu gate DONE cho đến khi kiểm chứng thực tế. Task IDs cố định để agent tiếp tục được.

### P00 — Repository discovery, PRD, ADR, execution scaffolding

**Dependencies:** None. **Deliverable:** repo đã hiểu, tài liệu, plan tracking.

- [ ] `P00-T01` Inspect `git status`, branch, existing files, README, package scripts; ghi repo là empty hay existing; bảo vệ modifications của người khác.
- [ ] `P00-T02` Tạo `docs/agent/{PROGRESS,DECISIONS,BLOCKERS,HANDOFF}.md` và template evidence theo §15.
- [ ] `P00-T03` Viết `docs/product/PRD.md`: personas, J1–J5, scope MVP, non-goals, metrics, room rules.
- [ ] `P00-T04` Viết `docs/product/GAME_DESIGN.md`: role, map, order states, minigame, rewards, NPC fallback, consent/photo.
- [ ] `P00-T05` Viết `docs/security/COMMUNITY_RULES.md` và `MODERATION_POLICY.md`, chuẩn bị privacy/retention draft.
- [ ] `P00-T06` Tạo ADR cho stack, single-instance room owner, contracts, persistence & idempotency, moderation, scaling criteria.
- [ ] `P00-T07` Tạo asset specification + inventory/ownership metadata; xác định asset nào chưa có bản quyền và blocker.
- [ ] `P00-T08` Tạo dependency graph/checklist cho phases; xác minh các mâu thuẫn với repo và ghi quyết định.

**Gate P00:** PRD/ADR nhất quán; trạng thái + exception của order, shift, presence được viết rõ; không còn quyết định thiết kế trọng yếu bị bỏ ngỏ không ghi blocker.

### P01 — Workspace foundation, quality tooling, database boot

**Dependencies:** P00.

- [ ] `P01-T01` Tạo workspace `apps/web`, `apps/api`, `packages/contracts`, config base, Node/pnpm version documentation.
- [ ] `P01-T02` Config TS strict, ESLint, formatter, validation, conventional scripts (`lint`, `typecheck`, `test`, `build`).
- [ ] `P01-T03` Tạo Next.js shell + Tailwind UI; NestJS Fastify `/health/live`/`/health/ready` + structured errors.
- [ ] `P01-T04` Docker Compose local for PostgreSQL and API/web (optional hot reload), `.env.example`, configuration validation.
- [ ] `P01-T05` Drizzle setup, first migrations, seed cafe/menu/cosmetics; reset scripts **local/test only**.
- [ ] `P01-T06` Zod shared contract package and typed error codes, schema fixtures.
- [ ] `P01-T07` Setup unit/integration test infrastructure using isolated DB; no shared production DB.
- [ ] `P01-T08` GitHub Actions PR checks: install frozen lockfile → lint → typecheck → tests → build → artifacts.
- [ ] `P01-T09` README onboarding: exact commands, prerequisites, troubleshooting, env vars, architecture quickstart.

**Gate P01:** Clone sạch → setup → migrate/seed → run web/API → health/ready pass; CI runs all required checks; test DB isolation proven.

### P02 — Original visual assets, map & offline scene prototype

**Dependencies:** P01.

- [ ] `P02-T01` Define art bible: palette, tile units, sprite grid, animation frame budget, scene depth ordering, interaction points.
- [ ] `P02-T02` Produce or license map tiles, counters, seats, tables, windows, sakura decor; record provenance/license for each.
- [ ] `P02-T03` Produce starter avatar sprites, Customer/Maid outfits, walk/sit/idle/serve/prepare/emote animations.
- [ ] `P02-T04` Build asset manifest, sprite atlas loader, texture caching and memory cleanup.
- [ ] `P02-T05` Build PixiJS scene: tiled cafe, camera, zoom, layer sorting, view resize.
- [ ] `P02-T06` Build navigation graph/interactions (chair, counter, kitchen, photo point, entrance), click-to-move offline.
- [ ] `P02-T07` UI overlay: interaction actions, menu navigation, role badge, accessibility basics.
- [ ] `P02-T08` Reduced motion/low FX modes; responsive/touch behavior; test common browser sizes.
- [ ] `P02-T09` Performance smoke (sprite atlas sizes, FPS on development target), record findings; screenshots/manual visual QA.

**Gate P02:** Một browser có thể chọn avatar, thấy map không placeholder, tương tác với ghế/quầy và xem animation; assets có quyền sử dụng được ghi nhận.

### P03 — Guest identity, room registry, realtime presence & seat authority

**Dependencies:** P01 + P02 contracts; UI có thể dùng placeholder để test domain, nhưng hoàn tất P02 trước gate P03.

- [ ] `P03-T01` Guest session endpoints, cookie security, nickname validation, avatar choices, profile persistence.
- [ ] `P03-T02` Socket.IO `/cafe` namespace, session authentication, Origin checks, Zod handlers, ACK/error standard.
- [ ] `P03-T03` RoomActor queue/registry with `join`, `leave`, `snapshot`, `version`, membership, role quotas.
- [ ] `P03-T04` Room allocation and discoverability, real occupancy and invite link with expired/full handling.
- [ ] `P03-T05` Implement role select/switch with guarded transitions (Customer/Maid) and capacity enforcement.
- [ ] `P03-T06` Implement seat claim/release atomically per actor; ensure double claim impossible.
- [ ] `P03-T07` Presence with multi-socket identity, disconnect grace, reconnect recovery and AFK.
- [ ] `P03-T08` Server-validated movement by targetPointId; broadcast path and animation intent; reconnect position normalization.
- [ ] `P03-T09` Client state sync: snapshot + deltas, roomVersion/gap detection, safe resnapshot and optimistic UI rollback.
- [ ] `P03-T10` Concurrency and E2E tests: 100 simultaneous seat claims, max room capacity, 2 tabs, reconnect, expired session, stale snapshots.

**Gate P03:** 3+ independent browser sessions join same room, see accurate avatars/presence; role quotas and seats strictly correct; reconnect produces same authoritative snapshot without ghost duplicates.

### P04 — Order lifecycle, Maid shifts, kitchen interaction

**Dependencies:** P03, schema from P01.

- [ ] `P04-T01` Implement Order repository + DB status transitions, version CAS, command idempotency receipts.
- [ ] `P04-T02` Customer menu and place/cancel command; validates table, item active, per-customer order quota.
- [ ] `P04-T03` Maid shift start/pause/end, max active orders, on-duty restrictions.
- [ ] `P04-T04` Order queue visibility scoped to room, claim one winner, assignment confirmations.
- [ ] `P04-T05` Minigame preparation attempt with server nonce/expiry, deterministic recipe validation, anti-spam.
- [ ] `P04-T06` Serve at correct table/point; order state READY → SERVED → COMPLETED; animation triggered by authoritative event.
- [ ] `P04-T07` Disconnect/cancel/requeue behavior, failed preparation/retry rules, cleanup timers, bounded recovery job.
- [ ] `P04-T08` NPC fallback with visible NPC identity and same transition guards; no duplication with human Maid.
- [ ] `P04-T09` Client customer order tracker, Maid dashboard, queue, interaction prompts; accessible UI.
- [ ] `P04-T10` Integration/concurrency tests: 20 Maid claim one order, stale retry, cancel races, crash-recovery reconciliation.

**Gate P04:** Customer–Maid hoàn thành vòng lặp thật trên hai browsers; chỉ một order owner; reconnect và NPC không tạo món/đơn trùng; order history persisted.

### P05 — Social interaction, chat pipeline, safety center

**Dependencies:** P03; integrated with P04 game UI.

- [ ] `P05-T01` Implement fixed quick-chat phrases and emotes allowlist (localized).
- [ ] `P05-T02` Room text chat server-side validation, length/rate limits, sanitize rendering, transient evidence store.
- [ ] `P05-T03` Moderation pipeline text normalization, spam patterns, policy checks, allow/hold/reject decisions; graceful failure mode.
- [ ] `P05-T04` Personal mute/block in DB and enforcement in chat/targeted interactions; update UI immediately.
- [ ] `P05-T05` Report creation using trusted server evidence IDs; categories, status, anti-abuse rules, user feedback.
- [ ] `P05-T06` Safety UI accessible from main game, menus & profile. Visible community rules.
- [ ] `P05-T07` Add moderator credentials + RBAC foundation, not self-assignable by guest.
- [ ] `P05-T08` Safety tests: XSS, banned/muted messages, event spoofing, block interaction, report permissions.

**Gate P05:** Unsafe messages không broadcast khi bị chặn; user mute/block/report đúng; evidence không bị public; moderator role không thể giả mạo.

### P06 — Moderator dashboard, sanctions, audit & appeal

**Dependencies:** P05 + identity data.

- [ ] `P06-T01` Moderator login/session hardening; separate privileged capability checks, recommended MFA support if operationally feasible.
- [ ] `P06-T02` Report queue with filters, context minimization, safe message excerpts/evidence refs.
- [ ] `P06-T03` Apply mute/chat timeout, kick, temp ban with TTL; audit actor/reason/target/time.
- [ ] `P06-T04` Enforce sanctions on HTTP joins, socket handshake, reconnect, all relevant events.
- [ ] `P06-T05` Appeal/request review form with abuse prevention and resolution workflow.
- [ ] `P06-T06` Event notifications for sanctioned users without leaking reporter identity.
- [ ] `P06-T07` Test moderator permission matrix, ban expiry, concurrent decisions, audit immutability and denied direct API calls.

**Gate P06:** Moderator thực sự xử lý được report từ UI; sanction có hiệu lực ngay và sau reconnect; audit tồn tại; guest không xem dashboard.

### P07 — Progression, XP, wardrobe, photo booth & social retention

**Dependencies:** P04 + P05.

- [ ] `P07-T01` Define economy rules: XP per completed service, daily cap, anti-farm safeguards, no real-money features.
- [ ] `P07-T02` Reward ledger + stats; atomic/idempotent grants after order completion.
- [ ] `P07-T03` Starter cosmetics unlock and wardrobe/equip validation; sprites reflect selected outfit across clients.
- [ ] `P07-T04` Player profile: stats, order count, optional achievements; no publicly displayed sensitive identifiers.
- [ ] `P07-T05` Cheki UI: framing, PNG export, opt-in per participant, safe anonymous placeholders when no consent.
- [ ] `P07-T06` Share/invite flow with appropriate Open Graph metadata, no fabricated CCU counts.
- [ ] `P07-T07` Anti-farm tests across alts, repeated order requests, disconnect/retry, failed/cancelled orders.

**Gate P07:** Completed order grants reward exactly once; dress up persists; photo does not include non-consenting users; invitation handles room full.

### P08 — UX polish, accessibility, performance on real devices

**Dependencies:** P02–P07.

- [ ] `P08-T01` First-time experience: no confusing forms, guest create < small number of steps; clear role description.
- [ ] `P08-T02` Responsive HUD and touch-to-move, landscape/portrait support policy, keyboard navigation.
- [ ] `P08-T03` UI states for errors, reconnecting, role full, room full, requeue, sanctions, disabled chat.
- [ ] `P08-T04` Optimize sprite atlas, image sizes, render performance, input throttling, asset preloading.
- [ ] `P08-T05` Accessibility: contrast, focus states, reduced motion, semantic UI labels, safe animation/audio defaults.
- [ ] `P08-T06` Client memory cleanup when changing rooms/routes; no websocket handler leaks or duplicate listeners.
- [ ] `P08-T07` Browser testing across Chromium/Firefox/WebKit desktop and mobile emulation; record unsupported devices.
- [ ] `P08-T08` Human smoke playtest with at least 2–4 test users when available; capture friction/bugs (without inventing results).

**Gate P08:** Core gameplay usable on desktop and common mobile resolutions; no blocker UI, no known critical memory leak; screenshot evidence and actual compatibility matrix.

### P09 — Reliability, security, automated QA & load tests

**Dependencies:** P03–P08.

- [ ] `P09-T01` Test matrix: unit/integration/e2e for each domain and journey J1–J5.
- [ ] `P09-T02` Concurrency tests: seat and order claims, shift role switch, idempotency, race with disconnect.
- [ ] `P09-T03` Chaos/recovery: kill backend, restart, disconnected client, Redis unavailable only if enabled, DB restart.
- [ ] `P09-T04` Auth/security tests: CSRF/Origin, XSS, event injection, RBAC, rate limit, report privacy, token rotation.
- [ ] `P09-T05` Load test plans: 30 users/room, gradually larger active room count; realistic WS connections, command mix, message rate.
- [ ] `P09-T06` Track p50/p95 ACK latency, error rate, event fanout cost, CPU/RAM/network; identify bottlenecks and set **measured** limits.
- [ ] `P09-T07` Dependency audit, license scanning, secrets scanning, accessibility regression; fix Critical/High issues.
- [ ] `P09-T08` Production security checklist reviewed; define abuse escalation and operational contact.

**Gate P09:** Tests pass on clean environment; load report contains configuration and measured evidence; no claim of CCU beyond measurement; critical safety behaviors verified.

### P10 — Deployment, CI/CD, backups, monitoring & recovery

**Dependencies:** P01 + P09.

- [ ] `P10-T01` Production Docker images non-root, multi-stage, reproducible build, startup migration policy.
- [ ] `P10-T02` Compose deployment manifest, Caddy TLS, secret/env management, firewall documentation.
- [ ] `P10-T03` CI full pipeline + CD gated release with manual approval; no production secrets in PR jobs.
- [ ] `P10-T04` Deploy scripts include build id, image version, preflight, migration, health and smoke checks.
- [ ] `P10-T05` Backup automation, retention, off-host backup destination strategy; restore test in staging.
- [ ] `P10-T06` Metrics, structured logs, alert thresholds, dashboard for CCU/orders/report queue/reconnect/error.
- [ ] `P10-T07` Graceful shutdown, room drain, reconnect/recovery instructions, rollback runbook.
- [ ] `P10-T08` Configure staging deployment, smoke test WSS through proxy, moderate connectivity and client reconnect.
- [ ] `P10-T09` Production readiness review; deployment requires user-authorized infrastructure/secrets.

**Gate P10:** Staging boots from scratch, actual WSS and gameplay pass; restore drill has evidence; CI/CD gated; production only marked deployed if verified.

### P11 — Final acceptance, release checklist, handoff

**Dependencies:** all prior phases.

- [ ] `P11-T01` Traceability matrix every MVP requirement → task ID → test/screenshot → status.
- [ ] `P11-T02` Execute full clean-install/migrate/build/seed/test/E2E sequence, record commit and environment.
- [ ] `P11-T03` Final human multi-user gameplay J1–J5 and mobile walk-through; capture real issues and fixes.
- [ ] `P11-T04` Security/privacy/community policy review, report action and appeal drill, privacy data retention config.
- [ ] `P11-T05` CI green, staging stable, backup restore, rollback drill; ensure no test disabled to get green.
- [ ] `P11-T06` Create `docs/operations/RELEASE.md`, `RUNBOOK.md`, `KNOWN_LIMITATIONS.md`, `POST_LAUNCH_METRICS.md`.
- [ ] `P11-T07` Final release decision: `LIVE_VERIFIED`, `RELEASE_READY_NOT_DEPLOYED`, or `BLOCKED` with evidence.

**Gate P11:** Mọi tính năng MVP chạy được và có evidence; external blockers minh bạch; không gọi production complete nếu chưa live smoke.

---

## 10. ACCEPTANCE TEST MATRIX (BẮT BUỘC)

| ID | Scenario | Required assertion |
|---|---|---|
| `AT-001` | Guest onboarding | Session cookie hợp lệ, không lộ token, reload giữ profile |
| `AT-002` | Join 30/30 room | User #31 bị từ chối hoặc chuyển room; quota đúng |
| `AT-003` | Role quota | Maid #7 bị từ chối khi quota 6, Customer quota độc lập |
| `AT-004` | 100 claims/1 seat | Exactly one seat owner, others explicit conflict |
| `AT-005` | Multi-tab same guest | Không double presence, seat hoặc shift |
| `AT-006` | Transient disconnect | Trong grace period thì phục hồi; hết hạn giải phóng resource |
| `AT-007` | Same invite link | Join đúng room nếu còn chỗ; full xử lý rõ |
| `AT-008` | 20 Maid/1 order | Exactly one ASSIGNED winner, one DB transition |
| `AT-009` | Order duplicate submit | Same requestId trả cùng kết quả, không tạo đơn mới |
| `AT-010` | Invalid order item | Reject, no DB write |
| `AT-011` | Maid leaves during order | Requeue hoặc reconcile theo policy, không stuck |
| `AT-012` | NPC-human race | Exactly one fulfiller, NPC clearly labeled |
| `AT-013` | Completion repeated | Exactly one XP/reward ledger entry |
| `AT-014` | Role swap mid-order | Reject or safe handoff, never orphaned order |
| `AT-015` | Invalid movement/serve | Server rejects unauthorized target/action |
| `AT-016` | Chat input XSS | Escaped, no executable DOM |
| `AT-017` | Spam burst | Rate limit applied server-side before broadcast |
| `AT-018` | Block target | Blocked user's chat/targeted requests not delivered |
| `AT-019` | Report evidence forged | Rejected if message not trusted/authorized |
| `AT-020` | Guest as moderator | 403 + socket deny; role spoof fails |
| `AT-021` | Banned user reconnect | Join/messages refused until ban expiry |
| `AT-022` | Auditability | Moderator decisions recorded with actor/reason/timestamp |
| `AT-023` | Cheki consent | Non-consenting avatar/message omitted from export |
| `AT-024` | Server restart | App recovers, reconnect snapshot consistent, durable orders reconciled |
| `AT-025` | Backup restore | Restore into isolated DB then assert sample tables/relations |
| `AT-026` | Production WSS | Browser communicates over TLS through Caddy |
| `AT-027` | Mobile flow | Join/seat/order/serve/report works via touch controls |
| `AT-028` | Clean CI | Lint/typecheck/tests/build pass with pinned lockfile |

**Test naming:** map IDs to descriptive test names and docs. Do not fake multi-user test with only multiple React components sharing a state store; use independent clients/sockets.

---

## 11. QUALITY GATES & PERFORMANCE TARGETS

### 11.1 Code quality

- TypeScript strict; no silent `any` in critical domain code; Zod validation at trust boundaries.
- Domain use cases testable without Socket.IO transport.
- No direct DB calls scattered in unrelated UI/game layers.
- Consistent logging/correlation IDs, error classification, idempotency.
- `lint`, `typecheck`, `unit`, `integration`, `e2e`, `build` runnable in CI.
- Security-critical tests must not be skipped in release workflow.

### 11.2 Initial targets (hypotheses; adjust by measured results)

- Typical room: 30 players; default 24 Customer + 6 Maid.
- Backend socket event ACK p95 under ~300 ms on reference staging under defined representative load (network effects explicitly measured).
- Reconnect and snapshot resync completes without duplicate participation; measure end-to-end duration.
- Core desktop render targets ~60 FPS on chosen reference machine; mobile minimum acceptable target ~30 FPS on reference device.
- Errors under specified load scenario near zero for valid requests; no unbounded memory growth in 30-minute soak.
- **Không đặt 10.000 CCU làm release gate**; đó là future stress-test milestone. Publish capacity only from logs.

### 11.3 Load scenario recipe

1. Single room functional concurrency 30 players; varied chat, movement, order events.
2. Soak multiple rooms at increasing CCU; include 10% reconnect/turnover events.
3. Bursty join at lobby, simultaneous role selection, same-seat claim storm.
4. Concurrent order claim and minigame submissions, NPC fallback races.
5. Collect percentile latency, CPU, RSS, DB connections, broadcast volume, packet loss/errors; generate `docs/performance/LOAD-REPORT.md` with hardware specs, limits, scripts and commands.

---

## 12. CI/CD AND REQUIRED COMMAND CONTRACT

Monorepo root `package.json` should expose equivalents:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm test:concurrency
pnpm test:load:smoke
```

- Nếu một command không hợp lý ở root, wrapper phải hướng dẫn rõ và deterministic.
- Integration DB container / test DB must be independently bootstrapped and torn down.
- E2E tests phải chạy với web+api+DB thật, không chỉ mock backend.
- `CI` đặt fail fast; upload test reports, screenshots/trace on failure.
- CD chỉ phát hành từ branch/tag được bảo vệ và có manual approval production.
- Mỗi deployment chứa commit SHA và app version để truy vết.

---

## 13. RISK REGISTER / DECISION TRIGGERS

| ID | Risk | Severity | Mitigation / Trigger |
|---|---|---|---|
| R01 | Không đủ Maid hoặc Customer | High | NPC fallback, role balance, smaller rooms, measure wait time |
| R02 | Quấy rối/roleplay phản cảm | Critical | Safety tools MVP, moderation queue, report response workflow |
| R03 | Guest sockpuppet / spam | High | layered rate limits, sanctions, anti-farm, risk-based restrictions |
| R04 | Double order/XP/seat | Critical | server authority + transaction CAS + idempotency + concurrency tests |
| R05 | Restart mất in-memory room | High | documented reconcile, reconnect snapshot, drain deployment |
| R06 | Thiếu license sprite/âm thanh | High | asset manifest/provenance and pre-release audit |
| R07 | Deploy multi-instance không có owner routing | Critical | hard prohibit replicas > 1 until explicit distributed architecture |
| R08 | Mobile game không dùng được | High | responsive HUD, touch controls, device tests early |
| R09 | Chi phí tăng khi viral | High | limits, metrics, sprite optimization, benchmark before scaling |
| R10 | Moderation quá tải | High | limit chat features, quick-chat fallback, report triage tools |
| R11 | Lộ session/private report data | Critical | secrets/redaction, RBAC, security testing, least privilege |
| R12 | Agent dừng giữa dự án / context reset | High | progress/handoff/evidence protocol; small commits |
| R13 | Chỉ có mockups, không có game thật | High | end-to-end gates, no mock in release path |
| R14 | Pháp lý/độ tuổi chưa giải quyết | High | explicit launch policy review + BLOCKED_EXTERNAL if missing |

**Điểm ra quyết định:** Nếu lực lượng người chơi thật quá thấp, tối ưu onboarding/NPC trước khi xây thêm features. Nếu reconnect storms gây lỗi, ưu tiên reliability trước cosmetics. Nếu phát hiện abuse quy mô lớn, tạm hạn chế free chat thay vì mở rộng social features.

---

## 14. FUTURE SCALING DESIGN (KHÔNG THỰC HIỆN TRƯỚC KHI CẦN)

**Mốc kích hoạt:** Một instance không đáp ứng SLO đã đo, hoặc có nhu cầu HA/scale rõ. ADR mới bắt buộc trước khi thay topology.

### 14.1 Multi-instance strategy

1. Introduce Redis for session/presence coordination or compatible adapter as appropriate.
2. Define deterministic `roomId → ownerInstance` routing through room coordinator with leases/fencing tokens; only owner processes authoritative commands.
3. Socket.IO Redis adapter supports cross-node broadcast, **không thay thế owner consensus** hoặc DB idempotency.
4. On owner failover: new owner loads durable data + reconstructs room state with epoch/fencing; clients forced resnapshot; commands using stale epoch rejected.
5. Avoid relying solely on Socket.IO adapter for connection-state recovery; design application snapshot/rejoin.
6. Benchmark sticky sessions/transport configuration and WSS load balancer behavior.
7. Partition metrics by room owner/shard; test failover and split-brain scenarios.

### 14.2 Alternative architecture evaluation

Nếu room actor logic được cô lập tốt, có thể đánh giá room-per-Durable-Object / dedicated game server sau MVP. Không rewrite backend trước khi có số liệu và ADR. Giữ Postgres as durable domain store và moderation source of truth.

---

## 15. AGENT PROGRESS & HANDOFF FILE TEMPLATES

### 15.1 `docs/agent/PROGRESS.md`

```md
# Execution Progress

Overall status: IN_PROGRESS
Current phase: P03
Current task: P03-T06
Last verified commit: <sha>

| Task | Status | Evidence | Notes |
|---|---|---|---|
| P03-T05 | DONE | test command + result, commit | role quotas passed |
| P03-T06 | IN_PROGRESS | - | seat claim race test pending |

Last verification:
- `pnpm lint`: PASS/FAIL/NOT_RUN
- `pnpm typecheck`: PASS/FAIL/NOT_RUN
- `pnpm test:integration`: PASS/FAIL/NOT_RUN
- `pnpm test:e2e`: PASS/FAIL/NOT_RUN
- `pnpm build`: PASS/FAIL/NOT_RUN
```

### 15.2 `docs/agent/HANDOFF.md`

```md
# Agent Handoff

- Commit / branch: <sha / branch>
- Verified working features: <specific>
- Last commands run: <commands + exact outcome>
- Known failures and reproduction steps: <specific>
- Uncommitted changes: <files + reasons>
- Blockers external/technical: <IDs + what is required>
- Next task ID: <Pxx-Tyy>
- Exact next action / commands: <commands>
- Do not modify: <sensitive areas, if any>
```

### 15.3 `docs/agent/DECISIONS.md`

```md
# Architecture / Product Decisions

- ADR-001 / <date>: <decision>
- Context: <problem>
- Alternatives: <considered>
- Decision: <chosen approach>
- Tradeoff: <costs / limits>
- Revision trigger: <when to revisit>
```

### 15.4 `docs/agent/BLOCKERS.md`

```md
# Blockers

- ID: BLK-001
- Type: EXTERNAL | TECHNICAL
- Severity: Critical | High | Medium | Low
- Affected tasks: <IDs>
- Evidence / reproduce: <facts>
- Needed input/permission: <specific>
- Workaround / parallel task: <safe option>
- Owner: project owner | agent
```

---

## 16. READY-TO-USE PROMPTS FOR CODING AGENT

### 16.1 Initial task

```text
You are the implementation agent for Maid Cafe Social.
Read MAID-CAFE-SOCIAL-MASTER-AGENT-PLAN.md in full.
Inspect repository and protect any existing work.
Create required agent tracking files. Follow P00–P11 strictly by dependencies.
For each task: implement real code, verify acceptance, record exact test evidence,
update progress, commit logical changes, and continue to the next unblocked task.
Never mark DONE without verifying. Do not bypass critical safety, concurrency,
moderation, asset licensing, or CI acceptance gates.
Do not implement out-of-scope V2 features.
If external credentials/assets are missing, mark BLOCKED_EXTERNAL with exact requirements,
proceed on other unblocked tasks, and report the truthful release status.
Do not claim the website is live without a real deployed smoke test.
Start with P00-T01.
```

### 16.2 Resume task

```text
Resume Maid Cafe Social from the current repository.
Read MASTER PLAN and docs/agent/{PROGRESS,DECISIONS,BLOCKERS,HANDOFF}.md.
Inspect git status, last commits and current test status.
Select the earliest unblocked task whose dependencies are done.
Implement, test and update evidence before continuing.
Preserve existing user changes and do not fabricate passing test output.
```

### 16.3 Independent reviewer / quality pass

```text
Act as an independent reviewer, not the feature implementer.
Audit the repo against PRD, P00–P11 gates and AT-001..AT-028 matrix.
Look for missing real integration, hard-coded demo data, race conditions,
server-trust violations, unsafe chat/moderation bypass, license issues,
unbounded websocket buffers, non-idempotent XP and incomplete deployment.
Run available tests. Provide severity-ranked findings with file:line,
reproduction, exact expected/actual behavior, and needed fixes.
Do not approve the release if critical safety or concurrency gates fail.
```

---

## 17. OWNER INPUT CHECKLIST — NHỮNG THỨ AGENT KHÔNG ĐƯỢC TỰ ĐOÁN

Để phát hành public thật, chủ dự án phải cung cấp/chốt khi cần:

- [ ] Domain, VPS / deployment target, DNS, TLS ownership.
- [ ] Secrets, CI deployment credentials, database backup destination.
- [ ] Quyền sở hữu/license cuối cùng cho sprite, fonts, âm thanh.
- [ ] Chính sách người dùng, độ tuổi, privacy/data retention theo thị trường phát hành.
- [ ] Người/bộ phận tiếp nhận moderation reports và contact email hợp lệ.
- [ ] Giới hạn ngân sách và mức tải dự kiến, SLO đã đo hoặc mục tiêu thử nghiệm.
- [ ] Quyền thực hiện deploy production/migration có thể ảnh hưởng dữ liệu thật.

Nếu chưa được cấp, hệ thống có thể ở trạng thái **code complete + staging verified**, nhưng không được tự tuyên bố public launch.

---

## 18. FINAL RELEASE REPORT TEMPLATE

```md
# Maid Cafe Social — Release Report

Commit: <sha>
Build ID: <id>
Release status: LIVE_VERIFIED | RELEASE_READY_NOT_DEPLOYED | BLOCKED

## Scope delivered
- [ ] J1 Customer journey
- [ ] J2 Maid journey
- [ ] J3 Invite
- [ ] J4 Safety
- [ ] J5 Reconnect/recovery

## Tests
- Unit: <command, outcome>
- Integration: <command, outcome>
- E2E: <command, outcome>
- Concurrency: <command, outcome>
- Load: <hardware, CCU, event rate, p95, errors>
- Security: <command, outcome>

## Ops evidence
- CI URL: <link>
- Staging URL: <link if exists>
- Production URL: <link if verified>
- Backup restore drill: <proof>
- WSS smoke: <proof>
- Rollback: <proof>

## Known limitations and outstanding blockers
- <item>

## Go / No-Go reason
- <specific evidence>
```

---

## 19. EXECUTION PRIORITY WHEN RESOURCES ARE LIMITED

Nếu thời gian hoặc budget bị hạn chế, không loại bỏ moderation hay idempotency để làm thêm cosmetics. Thứ tự **must-ship**:

1. Guest onboarding + room/role/presence + real avatars + playable map.
2. Customer/Maid order loop + single-owner claims + recoverable disconnections.
3. Server-enforced safety + report + moderator action.
4. Tests + database migration + build + staging + backups.
5. Reward ledger, wardrobe, photo booth, UX polish — vẫn trong MVP mục tiêu, nhưng có thể nhận trạng thái `DEFERRED_APPROVED` chỉ khi chủ dự án đồng ý thay scope.

**Kết luận:** Một master plan có thể định hướng agent xây trọn sản phẩm, nhưng không thay thế việc cấp quyền hạ tầng, test với người thật, kiểm tra nội dung/copyright và giám sát release. Điều kiện kết thúc là **phần mềm hoạt động có bằng chứng**, không phải số lượng files sinh ra.
