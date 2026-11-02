# DEADLINE CAFE — MASTER AGENT EXECUTION PLAN

> Version: 1.0 · Language: Vietnamese · Target: Solo developer + coding agent · Status: **SPECIFICATION / NOT IMPLEMENTED**
>
> **Mục tiêu:** Từ repository trống tạo một web app **Quán Cà Phê Deadline** dạng virtual coworking 2D pixel art, có guest identity, quán/phòng, chọn ghế realtime, presence/reconnect, Pomodoro chính xác, mời bạn bè, thống kê tối thiểu, chia sẻ thành tích, kiểm thử và quy trình triển khai production trên VPS.
>
> **Hợp đồng giao việc:** Đây là tài liệu hướng dẫn để agent *thực thi*, không phải bằng chứng code đã tồn tại. Không tuyên bố hoàn thành tính năng, test, deploy hay tải nếu chưa có bằng chứng chạy thật. Mọi mục “production ready” phụ thuộc việc người sở hữu cung cấp domain, VPS, secret, quyền asset và xác nhận release.

---

## 0. HƯỚNG DẪN BẮT BUỘC CHO CODING AGENT

**Role:** Bạn là principal full-stack engineer + game-web engineer + DevOps + QA của dự án. Hãy tự thực thi các phase liên tiếp theo dependency cho tới khi đạt Definition of Done (DoD), hoặc xuất hiện blocker thực sự mà bạn không có quyền tự giải quyết. Không dừng ở việc viết kế hoạch hoặc dựng giao diện demo.

**Operational rules:**

1. Đầu mỗi phiên: đọc `MASTER-AGENT-PLAN.md`, `AGENTS.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `git status`, package scripts và test hiện có. Nếu code tồn tại, **inspect trước, không scaffold đè**.
2. Chỉ thực hiện task có dependencies đã hoàn thành. Mỗi task phải có: code, test/verification, tài liệu liên quan, cập nhật trạng thái và bằng chứng. Ưu tiên vertical slice end-to-end hơn tạo tất cả file rỗng.
3. Không tự ý thay đổi stack, giao thức, schema, API hoặc scope. Nếu cần đổi, ghi ADR (`docs/adr/`) với rationale, migration impact và update plan/contract. Không triển khai microservices, Kafka, Kubernetes, Elasticsearch, thanh toán hoặc AI chatbot trong MVP.
4. **Không giả lập pass**: không commit test placeholder `expect(true).toBe(true)`, screenshot giả, log giả, benchmark giả, hardcoded online count, hardcoded avatar của người dùng ảo như đang online thật, hay dữ liệu seed trình bày như thực.
5. Không hardcode credentials, token, IP cá nhân, cookie signing key, database password. Không ghi PII hoặc secret vào log. Không tự mua domain/dịch vụ/chi tiêu, không deploy production nếu thiếu explicit authorization.
6. Nếu thiếu artwork/âm thanh có quyền sử dụng: tạo asset gốc tối giản trong repo (SVG/pixel tiles có thể kiểm chứng) và ghi provenance; **không** copy sprites/songs từ sản phẩm/game khác. Không gọi kết quả placeholder là asset hoàn chỉnh.
7. Sau mỗi task và phase: chạy lệnh nghiệm thu liên quan, ghi đầu ra chính xác (command, exit code, ngày/commit, environment) vào `docs/PROGRESS.md`. Với lệnh không chạy được, ghi `BLOCKED` + lý do.
8. Mỗi phase kết thúc bằng commit có ý nghĩa nếu môi trường cho phép; không force push, không rebase branch chia sẻ, không sửa dữ liệu production nếu không được duyệt. Nếu có PR workflow, tách PR theo phase hoặc vertical slice.
9. Luôn giữ build chạy được. Mọi lỗi test/CI đang đỏ phải xử lý trước khi thêm tính năng không liên quan. Nếu phát hiện bug scope hiện tại, sửa ngay và thêm regression test.
10. Khi hết context: ghi **Next exact action** (task ID, file, command, dependency, blocker) trong `docs/PROGRESS.md`, không dựa vào trí nhớ hội thoại. Agent phiên sau đọc file đó để tiếp tục.

**Chế độ chạy không cần hỏi lại:** Tự chọn các giá trị mặc định đã quy định trong tài liệu này; chỉ hỏi chủ dự án khi cần thanh toán, secrets, credential, domain/IP, asset không có license, quyền deploy, hoặc lựa chọn pháp lý mà không thể mặc định an toàn. Nếu blocker ngoài hệ thống, tiếp tục các task độc lập không bị chặn.

### Output bắt buộc sau mỗi phase

```text
Phase: <ID>
Tasks completed: <IDs> ; Pending/blocked: <IDs>
Files created/changed: <paths>
Validation: <command> -> <exit code> (+ key metrics)
Known risks / unresolved: <items>
Git commit / PR: <SHA or not available>
Next exact action: <ID + concrete step>
```

**Quy ước task:** `[ ]` Not started, `[~]` In progress, `[x]` Verified, `[!]` Blocked. `Verified` chỉ khi acceptance + evidence hoàn tất.

---

## 1. PRODUCT BRIEF / PRD

### 1.1 Vấn đề và giá trị

Người học/làm việc tại nhà dễ mất tập trung và thiếu cảm giác có người đồng hành. Sản phẩm là **không gian coworking nhẹ nhàng trên web**, không phải mạng xã hội hay game di chuyển tự do. Người dùng vào nhanh, ngồi cùng người thật, bắt đầu phiên focus, nghỉ giải lao, quay lại.

**Product promise:** “Mở web → chọn chỗ → tập trung cùng mọi người, không cần tài khoản.”

**North-star candidate:** Weekly verified completed focus sessions per returning guest (đo định lượng, không đồng nghĩa chứng minh người dùng thực sự tập trung).

### 1.2 Personas

- **Sinh viên:** vào học 25/5, muốn có người ngồi cùng, dùng điện thoại hoặc laptop.
- **Developer/remote worker:** làm việc trong phiên 50/10, rủ đồng nghiệp, cần không bị chat làm phiền.
- **Khách vãng lai:** chỉ muốn khám phá quán và chia sẻ; không bị ép tạo tài khoản.

### 1.3 MVP in-scope (P0)

1. Landing/lobby với giới thiệu rõ ràng; trạng thái phòng thật và nút vào ngay.
2. Guest session ẩn danh tồn tại qua reload; đặt display name, chọn avatar từ bộ asset gốc; có tính năng đổi tên/avatar.
3. Một quán pixel-art 2D hoàn chỉnh, 30 chỗ ngồi; tạo nhiều **room instance** cùng theme khi đông; hiển thị số người và ghế còn trống (không hứa số liệu realtime tuyệt đối giữa refresh).
4. Người dùng vào room, nhìn thấy avatar khác và trạng thái: idle, focusing, break, away; chọn/đổi/rời ghế; spectators được phép đứng xem.
5. Realtime join/leave/seat/presence với reconnect, snapshot/resync và giải phóng ghế đúng hạn.
6. Pomodoro: 15/25/50 phút focus; 5/10 phút nghỉ tùy chọn; server xác nhận thời điểm; hoàn thành phiên ghi thống kê; không spam broadcast từng giây.
7. Invite URL tới room (không bảo đảm giữ chỗ); nút chia sẻ kết quả focus bằng text và/hoặc hình canvas generated từ dữ liệu thật, có privacy defaults.
8. Thống kê cá nhân tối thiểu: số phiên đã hoàn thành, tổng phút, 7 ngày gần nhất cho cùng guest session; có thể xóa dữ liệu của mình.
9. Responsive desktop/mobile; touch controls; accessibility cơ bản: keyboard navigation, giảm chuyển động, tương phản, timer qua DOM thay vì chỉ canvas.
10. Logs/metrics/health, security baseline, E2E/integration/concurrency/load test, Docker + deployment docs + CI/CD.

### 1.4 Explicitly out of scope / anti-goals

Không login bằng social, chat công khai, chat voice/video, rich friend system, xếp hạng gây áp lực, cửa hàng/kinh doanh, payment, người dùng ảo, world map nhiều scene, di chuyển tự do bằng WASD, NFT/crypto, AI assistant, đa vùng production, Kubernetes, Kafka, Redis cluster, Kafka event sourcing. Có thể ghi backlog nhưng **không tự triển khai**.

### 1.5 Core journeys và acceptance

| ID | Journey | Kết quả cần thấy |
|---|---|---|
| UJ-01 | Khách mở trang lần đầu | Nhìn thấy demo/preview có ghi rõ minh họa, chọn tên/avatar, nhận guest session, vào lobby không login |
| UJ-02 | Khách vào room | Snapshot hiện ra; ghế và avatar người dùng thật đồng bộ; có thể spectate khi hết ghế |
| UJ-03 | Hai khách chọn cùng ghế | Một claim thành công; người còn lại nhận conflict, scene cập nhật không trùng ghế |
| UJ-04 | Guest A focus 25 phút | Trạng thái focusing; đồng hồ đúng sau tab sleep/reload; hoàn thành được server xác nhận một lần |
| UJ-05 | Guest A mất mạng rồi trở lại | Trong grace window giữ ghế và đồng bộ state; quá hạn phải join/claim lại |
| UJ-06 | Guest A mời B | B vào đúng room nếu còn capacity, không tiết lộ secret/token của A |
| UJ-07 | Guest A rời quán | Ghế giải phóng, room thấy update, focus session được xử lý theo chính sách ở mục 5 |
| UJ-08 | Guest A trên mobile | Chạm chọn ghế, zoom/pan phù hợp, timer/controls dễ đọc; no blocking canvas |
| UJ-09 | Guest A xóa dữ liệu | Thống kê/guest session được xóa hoặc ẩn danh theo policy; không xóa session người khác |
| UJ-10 | Server restart | Clients reconnect, snapshot đúng; room state in-memory được reset an toàn; focus state persistent phục hồi đúng |

### 1.6 Product analytics / privacy

Events tổng hợp: `landing_view`, `guest_created`, `room_joined`, `seat_claimed`, `focus_started`, `focus_completed`, `invite_shared`, `return_visit`; tránh gửi mô tả task/công việc cá nhân. Dedupe, loại bot nội bộ khỏi số liệu. Analytics là opt-in nếu sử dụng dịch vụ bên thứ ba cần đồng ý; có trang privacy/help. Không tuyên bố có người online nếu là số liệu giả định.

---

## 2. TECHNICAL DECISIONS — MẶC ĐỊNH CHỐT

| Layer | Quyết định | Lý do / ràng buộc |
|---|---|---|
| Package manager | `pnpm` workspaces; Node **active LTS được pin** trong `.node-version` + `packageManager` + CI | Không dùng `latest` trôi; giữ lockfile |
| Frontend | Next.js App Router, React, TypeScript strict, Tailwind CSS, Zustand | Landing SEO, DOM controls, reactive state |
| 2D scene | PixiJS render canvas **client-only** qua dynamic import | Lightweight 2D; không SSR WebGL |
| Backend | NestJS + Fastify HTTP; Nest `ws` adapter hoặc thin native `ws` gateway đã có test | Same app process MVP; typed event protocol |
| Validation | Zod schemas dùng chung trong `packages/contracts`, server parse mọi boundary | Single source of truth; không tin client |
| DB | PostgreSQL + Drizzle ORM + migrations | Persistent session/focus/aggregate config |
| Ephemeral state | In-memory authoritative room registry **1 API replica MVP** | Không cần Redis ở giai đoạn đầu; tránh distributed state sai |
| Scale path | Redis + dedicated room ownership/partitioning theo ADR; không scale API replicas tùy ý trước khi hỗ trợ | Phân phối socket, seat consistency |
| Real-time transport | WebSocket; HTTP dành cho guest/config/stats; ping/pong, versioned events | Event-driven; không tick timer mỗi giây |
| Tests | Vitest frontend/contracts; Jest backend; Playwright E2E; PostgreSQL integration; k6 hoặc Artillery load | Tự động hóa và kiểm soát hồi quy |
| Deployment | Docker Compose on one VPS, Caddy HTTPS + reverse proxy, GHCR images, GitHub Actions | Chi phí thấp; deploy reproducible |
| Observability | JSON structured logs + Prometheus-compatible metrics + health probes; dashboard tùy tài nguyên | Đo chính xác và khắc phục sự cố |

**Single-origin routing:** `https://<domain>/` tới web, `/api/v1/*` tới api, `/socket` nâng cấp WebSocket tới api. Tránh Next.js API route cùng prefix. Cookie guest session `Path=/`, `HttpOnly`, `Secure` production, `SameSite=Lax`; HTTP và WS cùng origin. Dùng `http://localhost` ở local; secure cookie chỉ production.

**Không tự thay đổi sang Socket.IO:** nếu chọn WS protocol thuần thì không dùng Socket.IO client. Nếu phát hiện yêu cầu transport khác, lập ADR và migrate toàn bộ contracts/tests.

### 2.1 Target repository

```text
deadline-cafe/
├── AGENTS.md                       # Agent operating contract + pointers
├── MASTER-AGENT-PLAN.md           # Copy of this spec
├── .node-version
├── pnpm-workspace.yaml
├── package.json
├── pnpm-lock.yaml
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── apps/
│   ├── web/
│   │   ├── app/                   # landing, lobby, cafe, stats, privacy
│   │   ├── src/features/         # guest, lobby, room, focus, sharing
│   │   ├── src/game/             # Pixi scene, camera, sprite system
│   │   ├── public/assets/        # original/CC0 approved assets
│   │   └── tests/
│   └── api/
│       ├── src/modules/          # guests, cafes, rooms, seats, presence, focus, stats
│       ├── src/realtime/         # gateway, connection state, room registry
│       ├── src/common/           # auth, rate-limit, errors, telemetry
│       ├── drizzle/              # migrations
│       └── test/
├── packages/
│   ├── contracts/                 # Zod HTTP/WS schemas + generated types
│   ├── scene-data/                # room tilemap, seats & asset manifests
│   └── config/                    # shared tooling
├── tests/
│   ├── e2e/                       # Playwright multi-tab/multi-context
│   └── load/                      # WS/HTTP scenarios
├── infra/
│   ├── compose/                   # dev/production manifests
│   ├── caddy/Caddyfile
│   ├── backup/
│   └── monitoring/
├── scripts/                        # bootstrap, seed, smoke, restore checks
└── docs/
    ├── PRD.md
    ├── UX-ART-DIRECTION.md
    ├── ARCHITECTURE.md
    ├── API-CONTRACTS.md
    ├── RUNBOOK.md
    ├── SECURITY.md
    ├── DEPLOYMENT.md
    ├── TEST-REPORT.md
    ├── PROGRESS.md
    ├── DECISIONS.md
    ├── ASSET-LICENSES.md
    └── adr/
```

### 2.2 Required scripts (root)

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel --filter './apps/*' dev",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:integration": "pnpm --filter @deadline/api test:integration",
    "test:e2e": "playwright test -c tests/e2e/playwright.config.ts",
    "test:load": "./scripts/run-load-test.sh",
    "build": "pnpm -r build",
    "db:migrate": "pnpm --filter @deadline/api db:migrate",
    "db:seed": "pnpm --filter @deadline/api db:seed",
    "smoke": "./scripts/smoke.sh",
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

Các scripts phải chạy được thực tế; sửa tên nếu package tooling khác, đồng bộ tài liệu. Không chỉ copy JSON minh họa. Với `test:e2e`, cấu hình phải tự khởi động server/test DB hoặc mô tả chính xác prerequisites. `test:load` tách khỏi CI thường quy.

---

## 3. DOMAIN MODEL VÀ DATA CONTRACTS

### 3.1 Domain entities

**PostgreSQL (durable):**

- `guest_sessions`: `id UUID PK`, `token_hash UNIQUE`, `display_name`, `avatar_key`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at NULL`, `deleted_at NULL`. Token bí mật không bao giờ lưu plaintext. Hash token mật mã ngẫu nhiên >= 256 bit; giới hạn tên (2–24 ký tự), normalize/sanitize và block reserved names.
- `cafes`: `id`, `slug UNIQUE`, `name`, `theme_key`, `enabled`, `created_at`.
- `rooms`: `id UUID`, `cafe_id FK`, `public_code UNIQUE`, `capacity INT`, `seat_capacity INT`, `active`, `created_at`. Room record là configuration/identity; **occupancy realtime không nằm trong bảng này** ở MVP.
- `focus_sessions`: `id UUID`, `guest_session_id FK`, `room_id FK`, `duration_seconds`, `started_at`, `ends_at`, `completed_at NULL`, `cancelled_at NULL`, `status ENUM(active,completed,cancelled)`, `idempotency_key`, indexes `(guest_session_id, started_at)`, unique `(guest_session_id, idempotency_key)`.
- `room_invites` **optional** nếu cần link hết hạn/thu hồi; MVP có thể dùng room public code opaque không chứa guest identity.
- `analytics_events` **optional**: nếu tạo, giới hạn retention, anonymous IDs, loại bỏ payload nhạy cảm; có thể bắt đầu bằng aggregated server metrics.

**Ephemeral room state (RAM v1, not persisted):**

```ts
type Participant = {
  sessionId: string;         // server derived, never trust from client
  connectionId: string;      // active authoritative socket for this guest
  displayName: string;
  avatarKey: string;
  seatId: string | null;
  presence: 'idle' | 'focusing' | 'break' | 'away';
  lastHeartbeatAt: number;
  disconnectedAt: number | null;
};
type RoomState = {
  roomId: string;
  version: number;           // monotonic version for event sync
  seats: Map<string, string>; // seatId -> sessionId
  participants: Map<string, Participant>;
};
```

Trong một guest session có nhiều tab: **chỉ một connection điều khiển room**. Connection mới yêu cầu takeover rõ ràng hoặc chuyển tab trước sang spectator. Không tự động cho 2 tab cùng chiếm 2 ghế; test race takeover. Không cho guest claim nhiều room cùng lúc trong một process.

### 3.2 Room capacity và lifecycle — default numbers

- Một room có **30 seats**, tối đa **40 participants** bao gồm người đứng xem; thông số lấy từ config nhưng `seatId` phải tồn tại trong scene manifest.
- Mỗi cafe có thể có nhiều room instances. Mở thêm room khi đầy với thuật toán `find-or-create` **server authoritative**, chống double creation qua single-owner controller ở MVP.
- Heartbeat app-level mỗi 20 giây nếu dùng; timeout đánh dấu stale sau 65 giây hoặc 2 ping/pong thất bại; mốc này là default cần thử nghiệm thực tế, không coi là chắc chắn cho mọi mạng.
- Mất kết nối: giữ ghế trong **30 giây sau khi server phát hiện disconnect**; reconnect trong hạn phục hồi state. Nếu timeout không được phát hiện kịp, grace bắt đầu tại thời điểm detect. `lastHeartbeatAt` và cleanup timer tránh trạng thái kẹt vô hạn.
- Thoát chủ động (`room.leave`, `seat.release`): giải phóng ngay; passive disconnect: grace; quét cleanup định kỳ và test.
- Khi reconnect sau instance restart: RAM room/seat có thể mất, guest **không được giả định** giữ ghế cũ; server gửi fresh snapshot và UI báo đã reset. Focus session được khôi phục theo DB.

### 3.3 Seat claim must be atomic

**Single API instance v1:** toàn bộ check + assign + version increment diễn ra đồng bộ trong một room owner; không có `await` giữa kiểm tra và cập nhật state. Mọi đường thay đổi ghế (claim/change/release/disconnect timeout) phải đi qua cùng service. Invariant:

```text
∀ room, seat: at most one live session owns seat
∀ guest session: at most one seat and one active controlling room
seat owner must be a current participant (including grace window)
room version increases on every authoritative state transition
```

`seat.claim` có `requestId` và được dedupe theo `(sessionId, requestId)` trong TTL, replay trả cùng ack mà không gán lại. Khi đổi ghế, giữ ghế cũ nếu claim ghế mới thất bại. Server broadcast delta sau commit state, client render bản ghi mới.

**Future multi-instance:** không chỉ thêm Redis Pub/Sub rồi chạy 2 API replicas vì sẽ double-book. Chọn một trong hai và lập ADR: (A) partition room owners + routing/affinity + failover fencing; hoặc (B) Redis Lua/transaction atomic seat ownership + robust membership/version/source-of-truth; giải quyết split-brain, cleanup và replay, test multi-instance trước khi scale. MVP **không** công bố hỗ trợ multi-replica.

### 3.4 Focus session behavior

- Thời lượng focus được phép: **15, 25, 50 phút**; break: 5/10 phút client-side hoặc server tracked tùy quyết định ở phase focus. Không được gửi `completed=true` và tin tưởng client.
- `focus.start` yêu cầu authenticated guest, đang giữ seat và chưa có active session. Server ghi `started_at` và `ends_at` theo thời gian server, unique idempotency key, trả canonical timestamps.
- Client tính remaining=`max(0, endsAt - Date.now() - estimatedClockSkew)`, resync qua API/WS khi reconnect/visibility change. Server giữ quyền quyết định `completed`.
- Khi user rời room/disconnect: **focus tiếp tục chạy** trên server, nhưng UI không giả vờ đây là bằng chứng tập trung. Quy tắc product: session được ghi hoàn thành khi `ends_at` đi qua và không bị cancel, dù tab mất kết nối; báo rõ `timer completed` chứ không xác nhận productivity. Cho phép cancel trước hạn và không tính thành completed.
- Implement idempotent finalization `UPDATE ... WHERE status='active' AND ends_at<=now() RETURNING ...` (hoặc tương đương), chạy scheduler và khi query lại; chịu được process restart. Các thống kê lấy từ DB, không cộng dồn trên client; index tốt cho weekly aggregates.
- Chỉ cho phép **một active focus session mỗi guest** bằng constraint phù hợp (partial unique index `WHERE status='active'`, có reconcile trước khi start); tránh race giữa HTTP và WS.

### 3.5 WebSocket protocol v1

WebSocket endpoint: `/socket`. Auth bằng HttpOnly guest cookie trong handshake, verify allowed `Origin`, reject invalid session trước subscribe. Mọi command được validate Zod; giới hạn frame/payload (ví dụ 8KiB/command), max sends, rate limit theo session/IP. Schema envelope:

```json
{
  "v": 1,
  "type": "seat.claim",
  "requestId": "client-uuid",
  "payload": { "roomId": "room-uuid", "seatId": "seat-08" }
}
```

Server ack/error:

```json
{
  "v": 1,
  "type": "command.ack",
  "requestId": "client-uuid",
  "ok": false,
  "error": { "code": "SEAT_OCCUPIED", "message": "Ghế đã có người ngồi" },
  "roomVersion": 42
}
```

**Commands (client -> server):** `room.join`, `room.leave`, `room.resync`, `seat.claim`, `seat.release`, `presence.set` (only idle/break/away; focusing do server quản lý), `focus.start`, `focus.cancel`, `client.ping` (nếu dùng heartbeat app). **Events (server -> client):** `room.snapshot`, `participant.joined`, `participant.left`, `seat.claimed`, `seat.released`, `presence.changed`, `focus.started`, `focus.completed`, `focus.cancelled`, `server.maintenance`, `command.ack`, `server.error`.

- `room.snapshot` gồm `roomId`, `version`, metadata, seat occupancy, participants đã **lọc PII**, `serverTime`, `self` và focus session của chính guest.
- Mỗi delta gồm `roomVersion`; client chỉ apply nếu version liên tục. Mất số version => gửi `room.resync`, không đoán state.
- Mỗi command có typed success/failure, `requestId`, idempotency semantics; reconnect re-join nhận snapshot; duplicate event không tăng counters.
- Server không nhận `participantId` từ payload để quyết định quyền; derive từ cookie/session; không broadcast guest token, IP, email, danh sách task cá nhân.
- Client WS lifecycle: connecting / connected / reconnecting / offline; exponential backoff + jitter với trần; không retry vô hạn tốc độ cao; cleanup listener on unmount.
- Event payload size bounded, prevent fan-out amplification; room max 40.

### 3.6 REST endpoints v1

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/v1/guests/session` | Tạo/khôi phục guest session, set cookie; idempotent theo cookie |
| `GET` | `/api/v1/me` | Guest public profile + minimal preferences |
| `PATCH` | `/api/v1/me` | Update display name/avatar với validation |
| `DELETE` | `/api/v1/me` | Thu hồi guest token + xóa/ẩn danh dữ liệu theo retention policy |
| `GET` | `/api/v1/cafes` | Cafe theme + published availability summary |
| `GET` | `/api/v1/cafes/:slug/rooms` | Available rooms, capacity, snapshots summary |
| `GET` | `/api/v1/rooms/:id` | Room metadata, existence/capacity |
| `GET` | `/api/v1/me/focus` | Current active and recent focus sessions |
| `GET` | `/api/v1/me/stats?period=7d` | Verified counts and minutes aggregated server-side |
| `GET` | `/healthz` | Process alive; no secrets |
| `GET` | `/readyz` | Dependencies ready; no secrets |
| `GET` | `/metrics` | Protected metrics endpoint, not public by default |

Serve a versioned OpenAPI or equivalent contract doc; semantic consistent error shape `{code,message,requestId}`. Methods altering session require valid Origin and CSRF defense suited to same-site deployment (e.g. explicit CSRF token header for protected writes; initial guest bootstrap exempt with narrow policy) plus rate limiting. HTTP 401/403/409/422/429 semantics documented. Correct path routing through reverse proxy.

### 3.7 Session and privacy defaults

Use cryptographically random opaque session token (>=32 bytes), store **only SHA-256 hash**, cookie `deadline_session`. Cookie HttpOnly, Secure on HTTPS, SameSite=Lax, Path=/; expiration **30 days**, reissue with rotation policy documented. Do not store guest token in localStorage or query parameters. Session lookup indexed; cleanup expired sessions; guest deletion invalidates active WS connections. Invite uses opaque `room public_code`, not session token. Sanitize display names and encode any HTML rendering; no arbitrary rich HTML. CSP/security headers via Caddy/web. Plain task titles, if feature added, stay **in localStorage only** by default and never broadcast.

---

## 4. DESIGN SYSTEM / ART DIRECTION / ASSETS

### 4.1 Visual quality bar

- A single high-quality **cozy night café** scene: 2D isometric-or-top-down (pick **top-down 3/4 pixel-art** as v1; do not switch mid-build), warm amber indoor lights, rainy window, plants, 30 visible seats; 2–3 tile layers, foreground occlusion if practical.
- Scene scales to desktop and mobile; if mobile screen too narrow, use pan/zoom with seat list alternative and persistent HTML toolbar.
- Original pixel art spritesheet for 6–8 avatar variations (hairstyle/outfit/colors), seated/focusing/break/away animation states. Animation modest: blink, steam, rain, lamp pulse; respect reduced-motion.
- UI overlays as semantic HTML: guest setup, room selection, focus panel, toasts, accessibility controls; Pixi canvas should **not** host essential form text.
- Font license recorded, accessible contrast, focus outline, keyboard/tab flow, aria label for seat list and timers.
- Background audio **off by default**, toggle with stored local preference; add only original/licensed loops with permission for distribution. No music copied from copyrighted tracks.
- Show explicit empty state when room has no guests, no fake “busy cafe”; scene stays beautiful without users.

### 4.2 Asset manifest / licensing

`packages/scene-data` must define machine-checkable seat coordinates, scene dimensions, sprite variants and asset keys. Seat IDs stable across releases; migrations of saved identifiers documented.

Every imported asset has entry in `docs/ASSET-LICENSES.md`: `path | origin | creator | source URL | license | attribution required | proof/date`. No image from search results assumed free. If generated artwork, record generator/prompt/provenance and review rights of usage; for hand-drawn/vector original mark owned. No use of other web apps' screenshots as final asset.

### 4.3 Performance goals (validate, not assume)

- Scene frame rate goal >= 55 FPS on target desktop and >= 25–30 FPS on mid-range mobile during representative room occupancy; measure on specified devices/browser.
- Avoid rendering text as thousands of individual canvases, textures loaded repeatedly, unbounded particle counts and all-player physics.
- Lazy-load assets, compress sprite atlas, asset cache headers with hashed filenames, disable WebGL effects on low-end devices, handle context loss.
- Skeleton/loading/error and WebGL unavailable fallback: interactive HTML seat list + timer still works.

---

## 5. SECURITY, RELIABILITY, ACCESSIBILITY

**Threat model:** malicious guests, cross-site WS hijack, forged seat operations, bot flood, oversized WS payloads, PII leaks, guest identity theft, rate-limit bypass, session fixation, SQL injection, XSS via names, brute-force room joins, service restart, DB unavailable, Caddy misrouting, unbounded memory growth.

**Non-negotiable controls:**

- Validate every REST & WS body with shared Zod schema. Reject unknown protocol versions, unauthorized room operations, excessive payloads, malformed JSON and non-allowed Origin.
- Per-IP and per-session rate limits for session bootstrap/commands/room joins; abuse response 429 / WS rate-limit error, cap concurrent sockets and room occupants; reverse proxy request/body limits.
- Cookie session security + CSRF/origin defenses; random invite codes; no PII sent to room participants; GDPR/PDPA-type obligations assessed according to launch market (do not claim compliance without legal review).
- DB parameterized queries via ORM, dedicated least privilege DB user, migration credentials separate if practical. Secrets from env/secret store, never committed.
- Security headers HTTPS/HSTS production, CSP compatible with Pixi/assets, Referrer-Policy and X-Content-Type-Options. Enable WS TLS via same HTTPS origin.
- No guest-supplied media upload/chat in MVP. Limit display names and avatar choices to allow-list. Report-abuse/contact link for public launch.
- Data retention documented: guest expiry 30 days, purge job; server logs minimal and rotated; backups encrypted/offsite. User deletion has tested server behavior.
- Concurrency test of seat invariant; focus idempotence; reconnect/grace expiration; slow client/backpressure; shutdown gracefully closes sockets and avoids writing incorrect stats.
- Accessibility: WCAG 2.2 AA **target where applicable**, keyboard navigation with seat list, no flashing, reduced motion, touch size, visible focus, timers not conveyed only by color/sound. Audit and list any gaps honestly.

---

## 6. IMPLEMENTATION PHASES — ATOMIC TASK BACKLOG

**Dependency chain:** P00 → P01 → P02 → P03 → (P04 + P05) → P06 → P07 → P08 → P09 → P10 → P11. P04 frontend scene and P05 realtime core can progress independently after P03 but must integrate at P06. P10 infrastructure can be prepared earlier but production deploy only after P09 gate.

### P00 — Repository discovery, plan synchronization, agent governance

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P00-01 | Inspect existing files/branches, detect repo state; if empty initialize Git | No destructive overwrite; `git status` recorded |
| P00-02 | Add this plan, `AGENTS.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, ADR template | Agent rules reference canonical file, progress records baseline |
| P00-03 | Write PRD, ADR-0001 scope/stack, risk register, initial milestone map | No unspecified MVP scope remains |
| P00-04 | Choose/pin supported Node LTS/dependency versions after checking package compatibility | `.node-version` + lock + CI align |

**Gate P00:** clear source of truth and baseline documented. Do not call application implemented.

### P01 — Monorepo foundation & developer experience

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P01-01 | pnpm workspace and root scripts; Next web, Nest+Fastify API, contracts, scene-data | `pnpm install --frozen-lockfile`, `pnpm build` pass |
| P01-02 | TypeScript strict, lint/format, import boundaries, shared config | `pnpm lint && pnpm typecheck` green |
| P01-03 | Dev Docker Compose PostgreSQL, example env schema & validation, graceful startup | `docker compose ... up -d` + API boots locally |
| P01-04 | HTTP `healthz` / `readyz`, shared error shape, request ID and structured logs | health checks distinguish liveness/readiness |
| P01-05 | `.gitignore`, `.env.example` (no secrets), README bootstrap/troubleshooting | New machine follows README successfully |

**Gate P01:** clean clone builds and starts landing/API with documented commands.

### P02 — DB, guest identity, base HTTP contracts

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P02-01 | Drizzle schema + ordered migrations for guests/cafes/rooms/focus | Fresh DB migrate + seed idempotently; rollback/forward policy documented |
| P02-02 | Session creation, token hash, cookie middleware, expiry/revocation | Session persists reload, cannot impersonate by fake cookie |
| P02-03 | `GET/PATCH/DELETE me`, validation, avatar allow-list, deletion cleanup | HTTP integration: valid/invalid/expired/revoked cases |
| P02-04 | Cafe/room public APIs, seed one cafe 30 seats, capacity config | Deterministic seed, no dummy online count |
| P02-05 | Session rate limits, Origin/CSRF, security headers, tests | Automated negative security cases pass |

**Gate P02:** two isolated browsers obtain distinct guest sessions; same browser survives refresh; deleting own session invalidates it.

### P03 — Frontend UI shell & product journeys

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P03-01 | Landing, lobby, guest setup, cafe route `/cafe/[roomCode]`, skeleton/error/offline UI | Works no account; route refresh succeeds |
| P03-02 | Shared API client, typed DTO, cookie flow, Zustand state, error handling | No guest token in JS-visible storage |
| P03-03 | HTML focus/timer panel UI (local display only until P06), responsive design | Keyboard/touch access; no network logic falsely mocked as live |
| P03-04 | Privacy/help/404/503 pages and empty room state | Correct copy and non-deceptive metrics |
| P03-05 | Component tests + at least one Playwright guest onboarding smoke | Browser end-to-end reaches lobby |

**Gate P03:** usable product shell with honest loading/disabled states.

### P04 — Pixel café rendering & art assets

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P04-01 | UX/art direction doc, color/type/scene grid, seat geometry in scene-data | All 30 seats have distinct stable IDs, within bounds |
| P04-02 | Original or license-cleared sprites/tiles/assets, attribution ledger | Zero unlicensed or missing provenance files |
| P04-03 | Pixi scene lifecycle and asset loading, camera resize/pan/zoom | No client/SSR import error, no memory leak on navigation |
| P04-04 | Avatar sprites and idle/focus/break/away animation mapping | States visually distinct and updated by state changes |
| P04-05 | Click/tap seat, selection highlight, room occupancy overlays | HTML seat list fallback, keyboard action works |
| P04-06 | Rain/lamps/steam ambience, reduced motion, audio off by default | Low-end/perf checks; effects can be disabled |
| P04-07 | Visual regression screenshots on 2 desktop + 2 mobile viewports | No clipped critical buttons/canvas, screenshots saved as artifacts |

**Gate P04:** one cafe scene is visually coherent even with zero guests; all essential controls work without the canvas.

### P05 — WebSocket room ownership, seats, presence

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P05-01 | Zod WS v1 schemas + protocol docs + version/reject behavior | Serialization/validation contract tests |
| P05-02 | Authenticated WS handshake, Origin check, connection manager, limits | No-cookie/cross-Origin rejected; accepted guest connected |
| P05-03 | Single-process room registry, server room join/leave, capacity, snapshots | 40 max participants; extra guest gets typed FULL response |
| P05-04 | Atomic seat claim/change/release with idempotent ack and versioning | Parallel N claims for one seat have exactly one winner |
| P05-05 | Presence, ping/pong, grace/reconnect, cleanup, multi-tab ownership | Simulated network loss/duplicate tabs/restart consistent |
| P05-06 | Delta events, monotonic room versions, resync protocol, bounded queues | Event gap triggers snapshot; slow peer does not exhaust memory |
| P05-07 | WS integration tests 2–100 clients + invalid/malformed/race paths | Deterministic assertions and no orphan seats after TTL |

**Gate P05:** server state invariants hold under concurrency, disconnection and malformed input; don't claim distributed consistency yet.

### P06 — End-to-end realtime integration + focus lifecycle

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P06-01 | WS client lifecycle/reconnect/backoff, join/snapshot/delta reducer | Two browsers see each other and same seat state |
| P06-02 | Connect Pixi avatar render to authoritative room state | No avatars created from fake online users |
| P06-03 | Focus start/cancel/complete server logic and DB persistence | UTC timestamps authoritative; allowed durations only |
| P06-04 | Completion reconciliation/scheduler for process restart, idempotency | Completion exactly once; restart/test clock advance validated |
| P06-05 | Timer UI skew handling, background tab sleep, refresh, reconnect | Remaining time converges to server timestamps |
| P06-06 | Away/break/idle transitions with explicit rules | State never contradicts active focus state |
| P06-07 | Full multi-user E2E: invite/claim/start/reconnect/finish | E2E green on clean DB against actual backend |

**Gate P06:** use-case UJ-01 through UJ-07 passes with real browser clients and real DB.

### P07 — Invites, stats, user delight

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P07-01 | Public room invite deep-link + error/room-full fallback | Invited guest enters exact room, no identity leak |
| P07-02 | Aggregated 7d/lifetime stats query and `/stats` UI | No double counting / cancel counted as completion |
| P07-03 | Share text/card using only verified focus stats and non-sensitive data | Mobile share/copy fallback; anonymous name opt-out |
| P07-04 | Profile updates persisted and reflected in room in sanitized events | Safe display names; no HTML injection |
| P07-05 | Polished empty/connection/migration/error/celebration states | No audio spam, respects reduced motion |
| P07-06 | Analytics minimal privacy-aware counters; conversion instrumentation | Dashboards/metrics clearly distinguish synthetic from real |

**Gate P07:** MVP P0 feature set complete; share works even without Web Share API.

### P08 — Testing hardening + accessibility + security

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P08-01 | Unit tests domain reducers, time calculations and seat state invariants | Target critical-path branch coverage; no fake assertions |
| P08-02 | PG integration: migrations, focus unique index, expiry, session deletion | Repeatable isolated DB tests |
| P08-03 | Playwright E2E desktop/mobile, 2 contexts, resume after reload/network drop | All P0 journeys stable at repeated runs |
| P08-04 | Security tests for forged payload, session theft replay assumptions, XSS, WS Origin, rate limit | No known critical/high reachable vulnerability ignored |
| P08-05 | Keyboard, screen-reader labels, reduced motion, contrast and responsive audit | Accessibility gap list; critical paths keyboard-accessible |
| P08-06 | Error injection: DB unavailable, Caddy upstream reset, WS shutdown, process restart | Graceful failure/recovery and no stuck DB records |
| P08-07 | Dependency audit and secret scan + evidence | Findings triaged and documented; critical blocker fixed |

**Gate P08:** `check`, integration, E2E and security suite green; known caveats documented.

### P09 — Load/performance & scaling readiness

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P09-01 | k6/Artillery scenario: join room, claim, focus, heartbeat, disconnect/reconnect | Repeatable scripts using realistic payloads |
| P09-02 | Test controlled 100, 300, 500 WebSocket connections on actual target/similar VPS | Record node, vCPU, RAM, Mbps, latencies, failures |
| P09-03 | 30-minute soak, churn, malformed events, slow client | No unbounded memory or stuck seats |
| P09-04 | Profile critical paths (room snapshot/event fan-out/DB queries) | Fix observed bottlenecks; no speculative optimizations |
| P09-05 | Document scaling beyond one instance ADR, Redis/room owner roadmap | No unsupported “10k users ready” claims |

**Suggested experiment targets**, *not guaranteed SLAs*: zero double-booking in concurrency tests; p95 seat ack <250ms under 100 active WS on specified test environment; 0 uncaught exceptions; after cleanup no permanently occupied seats; client scene usable within 3 seconds on defined test network/device. If targets fail, keep gate open, report and optimize based on evidence. Do not interpolate 100/500 connections into 10,000-user production guarantee.

### P10 — Infrastructure, production deployment, observability

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P10-01 | Multi-stage production Dockerfiles, non-root images, healthchecks, Docker Compose prod | Clean image build + local prod compose smoke |
| P10-02 | Caddy config same-origin `/`, `/api/v1`, `/socket`, TLS/WebSocket headers | WS upgrade and cookies function through proxy |
| P10-03 | GitHub Actions CI: lint/types/unit/build/PG integration/E2E + caches | Required jobs pass from fresh branch; artifacts on failures |
| P10-04 | CD to GHCR with immutable image digests, gated SSH deploy/rollback | Secrets in GitHub env; deploy not automatic without authorization |
| P10-05 | Structured logs, metrics, dashboard guide, request/correlation IDs, alerts plan | Observe active sockets/rooms/seat conflicts/errors/DB latency |
| P10-06 | DB backup encrypted/offsite, retention, restore runbook, **restore rehearsal** | Verified restore on isolated test DB, no fabricated pass |
| P10-07 | Environment schema, uptime probe, resource ceilings, firewall and least privilege | External surface limited to 80/443 + administrative access policy |
| P10-08 | Real domain VPS deployment **only after approval** | HTTPS home/REST/WS/reconnect & smoke pass from external device |

**Gate P10:** without secrets, domain, VPS and deploy authority mark P10-08 BLOCKED; everything else can be validated in local/staging. “Deployable” ≠ “deployed”.

### P11 — Final acceptance, release and handover

| Task | Action / deliverable | Acceptance |
|---|---|---|
| P11-01 | Clean clone bootstrap verification from README | No undocumented manual step |
| P11-02 | Real 2-user walkthrough on separate browsers/devices | Guest, room, seat, focus, invite, stats, reconnect pass |
| P11-03 | Execute release checklist + synthetic and real-data boundary check | No fake production users/statistics |
| P11-04 | Final `TEST-REPORT.md`, security/asset license review, accessibility gaps | Evidence links, versions, commands, environment |
| P11-05 | Operations handover (backup/restore/rollback/upgrade/incident) | Another engineer can operate service |
| P11-06 | Write V2 backlog separate from MVP (themes, social, private rooms, cosmetics) | MVP scope unchanged; known limitations explicit |

**Gate P11:** signed-off by human project owner after visible product verification; final status one of `READY_FOR_RELEASE`, `DEPLOYED_AND_VERIFIED`, `BLOCKED` with exact reasons. Never write `100% DONE` if release gates not met.

---

## 7. MANDATORY TEST MATRIX / EDGE CASES

| Area | Cases (automate where practical) | Severity |
|---|---|---|
| Guest | missing cookie, forged/expired/revoked cookie, cross-browser isolation, refresh/reissue, delete while WS active | P0 |
| Seat | 100 parallel claims same seat → 1 winner; change seat race; duplicate command; stale guest; invalid seat ID | P0 |
| Room | room full (40), 30 seats full, spectators, simultaneous room creation, join/leave reconnect churn | P0 |
| Presence | hard close, network drop, browser sleep, grace 30s, server crash/restart, ghost cleanup | P0 |
| Multi-tab | duplicate controlling tab, takeover, cross-tab seat claim, stale socket ack | P0 |
| Focus | invalid duration, 2 tabs start simultaneously, start after losing seat, cancel, clock tamper, tab sleep, restart before deadline, completion race, aggregation correct | P0 |
| WS protocol | malformed JSON, unknown version/event, oversized body, duplicate/out-of-order version, slow client, handshake Origin | P0 |
| Privacy | session token never exposed in URL/HTML/log; no task text broadcast; delete guest invalidates data | P0 |
| Rendering | empty room, full room, mobile touch, zoom/pan, context loss, reduced motion, WebGL fallback | P1 |
| Sharing | Web Share API unavailable, share image blocked, copied summary correct, does not reveal task title | P1 |
| Infra | DB unavailable, disk full alert, cert renewal, failed deploy rollback, backup restore | P0 release |

**Determinism:** tests that use timestamps/TTL should use controllable clocks/fake timers where possible; real-network E2E gets bounded realistic timeouts and retries for infrastructure only, not hidden logic failures. Test data removed after run. Assert server invariants directly, not just screen pixels.

---

## 8. CI/CD CONTRACT

**Pull request CI** (minimum): install frozen lockfile, lint, typecheck, unit, DB integration against isolated PostgreSQL, build web/api, Playwright E2E against ephemeral stack, security dependency scan, optional image build. Artifact store: test report, coverage, Playwright traces/screenshots **on failures**, migration evidence. Branch protection for required jobs.

**Release flow:** tag version → build/push immutable GHCR images → optionally stage → predeploy DB backup → apply migrations with documented compatibility → update Compose image digest → health/ready + HTTP/WS synthetic smoke → observe error rates → accept/revert. Migrations should use expand/contract for non-backward-compatible DB changes. Rollback cannot trivially undo destructive data migrations; release process must explicitly identify that risk.

**Production security:** separate deploy user, SSH public key only, no root login over SSH, firewall, DB/metrics private, rotation plan for secrets, TLS. Do not print `.env` contents in workflows. Do not provision real VPS or trigger deploy without permission. Stateful components (Postgres/backup) must use persistent volumes and offsite backup.

**Observability starter metrics:** active WS connections, room count, claimed seats, seat conflicts, join latency, focus started/completed/cancelled, WS message rate, auth rejects, reconnect success, RSS/heap, DB pool usage, HTTP latency/status. Avoid cardinality explosion from guest IDs in metric labels. JSON logs include request/connection correlation IDs but not tokens.

---

## 9. RELEASE ACCEPTANCE — DEFINITION OF DONE

**Functional / UI**

- [ ] No signup required; persistent revocable guest session, secure cookies.
- [ ] One attractive original/licensed scene with 30 interactable seats, real guests and avatar states.
- [ ] Two browsers see updates with authoritative seat occupancy; all seat concurrency invariants proven in tests.
- [ ] Reconnect, room snapshot/delta resync, multi-tab takeover and disconnect cleanup tested.
- [ ] Pomodoro server timestamps, cancel/complete exactly once, stats accurate after restart.
- [ ] Invite link, privacy-safe share/copy, mobile usability, keyboard fallback.
- [ ] No fake user numbers, fake test results or hidden placeholder experience.

**Engineering / Security**

- [ ] Clean clone build and reproducible environment; migrations + seed.
- [ ] Unit/DB integration/E2E and critical concurrency tests green with evidence.
- [ ] WS authentication/Origin/rate-limit/payload checks and secure HTTP session policies.
- [ ] Performance report from measured environment, not assumptions; no critical memory leaks.
- [ ] Asset license/provenance ledger complete; accessibility review and documented gaps.

**Operations**

- [ ] CI passing, immutable release artifact, health endpoints and monitored error logs.
- [ ] HTTPS/WSS through Caddy verified in staging/local equivalent; real production only if authorized.
- [ ] Encrypted offsite backup with a **verified restore**, deployment/rollback runbook.
- [ ] Domain/VPS/secrets and release sign-off supplied by owner (otherwise deployment marked BLOCKED).
- [ ] Final `docs/TEST-REPORT.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, known limitations updated.

---

## 10. CHECKPOINT PROTOCOL / AGENT RESUME

Maintain `docs/PROGRESS.md` in this structure:

```md
# Progress
Last updated: <UTC datetime>
Current branch / commit: <...>
Current phase: Pxx
Current task: Pxx-yy

## Verified
- [x] P00-01 — Evidence: <command + exit code + commit/file>

## In progress
- [~] P05-04 — Current implementation: <files/functions>

## Blocked
- [!] P10-08 — Needs owner's VPS/domain/deploy approval

## Validation snapshot
- pnpm check: PASS/FAIL/NOT_RUN, datetime, environment
- test:integration: PASS/FAIL/NOT_RUN
- test:e2e: PASS/FAIL/NOT_RUN
- security/load: PASS/FAIL/NOT_RUN

## Next exact action
1. <Task ID + one concrete step>
2. <Command to run>
3. <Expected result / failure behavior>

## Risks / deviations
- <risk + decision + ADR reference>
```

**Pre-commit:** `pnpm lint`, `pnpm typecheck`, tests scoped to changes; full CI at phase gates. **On resumed session:** verify reported state against filesystem/branch; never blindly trust progress notes as authoritative proof. If tests no longer pass, reopen tasks. If user asks for an update, report verified vs planned separately.

**When blocked:** log issue, solve all independent tasks first; provide exact missing input and why necessary. Do not endlessly request permission for operations that require none. Do not conceal missing deployment rights by claiming the app is live.

---

## 11. RISK REGISTER / MITIGATIONS

| Risk | Likelihood/impact | Mitigation | Trigger / owner |
|---|---|---|---|
| Asset quality weak or copyright unclear | High / High | Original limited style guide, license ledger, no unlicensed scraping | P04 / Agent + owner review |
| Seat double-booking on scale | Medium / Critical | Single owner MVP, invariants, prohibit multi-replica without ADR and tests | P05/P09 / Backend |
| WS disconnect causes ghost seats | High / Medium | Grace TTL, cleanup, reconnect/resync, soak test | P05/P09 |
| Next/Pixi SSR integration breaks | Medium / Medium | Client-only scene, HTML controls, tested hydration | P04 |
| Focus timer wrong after sleep/restart | High / High | Server timestamps, DB reconciliation, fake-clock tests | P06 |
| Viral traffic overwhelms VPS | Medium / High | 40-user room limits, rate limits, load reports, degrade gracefully, capacity plan | P09/P10 |
| Zero retention despite pretty demo | High / High | Instrument real focus completion/return visits; user research; no feature sprawl | P07 / Product owner |
| Guest identity abused / bots | Medium / High | Token security, limits, monitoring, abuse response | P02/P08 |
| CI green but deployment unavailable | Medium / High | Staging smoke, runbook, explicit real secrets/authorization gate | P10 / Owner |
| DB loss / rollback failure | Low / Critical | Encrypted offsite backups, restore drill, migration compatibility | P10 |
| Agent runs out of context / unfinished work | High / Medium | Atomic phases, PROGRESS + exact action, tests evidence | Every phase |

---

## 12. METRICS, GROWTH & V2 (AFTER MVP)

**Metrics to measure (not promised results):** landing→seat conversion, first-session completion, D1/D7 retention, median focus minutes per returning guest, invite open→room join, error rates and memory/socket. Begin with a small invite-only test before social-media launch. Don't add fake participants to solve the cold-start experience. Improve empty state, asynchronous invites and timed community sessions instead.

**Separate V2 backlog — not blockers for MVP:** break-room moderated chat/reactions; private rooms; extra themed cafes; group focus rooms; custom cosmetics; optional social login; “desk with friends”; achievements; public room directory. **V3:** multi-instance room ownership, region routing, paid cosmetics/payments only when retention and support needs justify.

---

## 13. INITIAL AGENT INVOCATION — COPY/PASTE

```text
You are the principal engineering coding agent for Deadline Cafe.

Read MASTER-AGENT-PLAN.md fully, then AGENTS.md and docs/PROGRESS.md if present.
Execute the plan from the actual repository state, not from assumptions.
Build the complete production-deployable MVP described in phases P00–P11,
following dependencies and the defined architecture/contracts. Work autonomously
on unblocked tasks, implement real code, run the prescribed tests, record exact
evidence and make safe incremental commits. Do not stop after scaffolding or
mockups. Do not invent test results, online users, licenses, screenshots or
production deployment. Do not introduce out-of-scope services. If critical
external access is missing, mark only the dependent task BLOCKED and keep
executing independent work.

At the start of each session output a short snapshot of actual repo status and
next task. After each phase update docs/PROGRESS.md including test commands,
results, code changes, risks, and next exact action. If context ends, leave
repository in reproducible state and a resumable checkpoint.

Start now by inspecting the repo and executing P00, then proceed until all
unblocked acceptance gates are met.
```

## 14. FINAL REPORT EXPECTED FROM CODING AGENT

At the end, provide exactly:

1. **Implemented & verified**: phase/task IDs, high-level functionality, affected modules and commits.
2. **How to run**: exact commands for dev, database migrate/seed, tests and local prod Compose.
3. **Proof**: command exit statuses, relevant CI build URL/commit (if available), E2E artifacts, performance machine specs and numbers actually measured.
4. **Security/ops**: backup restore status, known limitations, asset licenses and rollback notes.
5. **External blockers**: missing secrets/domain/approval/verification; NEVER silently label them done.
6. **Release state**: `READY_FOR_RELEASE`, `DEPLOYED_AND_VERIFIED`, or `BLOCKED`, with explanation.

---

**End of Master Agent Plan v1.0.**
