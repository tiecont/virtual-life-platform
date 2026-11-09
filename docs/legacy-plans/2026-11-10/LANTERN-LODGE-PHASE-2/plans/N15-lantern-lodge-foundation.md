# N15 — Lantern Lodge — world, game session và shared UX

**Status:** PLAN / TODO · **Lane:** Game Platform · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Tạo một world và bộ công cụ ván đấu theo lượt, giữ RoomAuthority và safety hiện hữu.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N15-01 — Khóa product scope, luật và content/IP constraints

**Depends on:** N00-02, N06-01

**Deliverables**

- ADR game-lodge scope/ownership
- Freeze proposal rule v1 docs and original naming
- Asset provenance/IP checklist

**Acceptance / Definition of done**

- Đối chiếu M05/06/07/08/09/M13/Nxx hiện hữu; không tạo thêm identity/world room owner.
- Ba rulebooks có ví dụ/phase/timeouts/target audience, mọi đổi luật có ADR.
- Tên/graphics/audio khác biệt, không dùng asset hoặc tên Party Animals trong sản phẩm.
- Đối chiếu owner animal/landscape brief và shared-avatar ownership; art cụ thể còn cần review, không coi animal theme là quyền sao chép.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm architecture:check; pnpm governance:check
- Proposed; implement before claiming execution: node scripts/verify-game-plan.mjs (implement before claiming PASS)
- Manual scenarios: Review product journey và rủi ro nội dung trước code.

**Rollback / recovery:** Revert docs/ADR only; không chỉnh nguồn ngoài scope.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N15-02 — Hợp đồng GameSession và pure rules engine

**Depends on:** N15-01, N02-01, N05-01

**Deliverables**

- packages/contracts game DTO version 1
- packages/boardgame-core pure reducer interface
- Boundary and negative contract tests

**Acceptance / Definition of done**

- Mỗi mode nhận deterministic state+command+clock và trả nextState/effects, không import network/DB/React.
- Phân tách public/own/spectator projection bằng allowlist và version; invalid commands không thay state.
- Không thư viện world nào được import API repository trực tiếp; boundary guard bắt lỗi.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/contracts.unit.test.ts (planned)
- Manual scenarios: API/client signatures được chốt từ implementation/tests, không chỉ từ plan.

**Rollback / recovery:** Tắt module flag, trả contract về phiên bản cũ tương thích; không phá clients phân phối.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N15-03 — World scene, table lobby, consent và permissions

**Depends on:** N15-02, N05-06, N06-02

**Deliverables**

- packages/lantern-lodge-world original scene
- Table lobby with join/ready/spectate options
- Room+Safety+Travel authorization adapters

**Acceptance / Definition of done**

- Table join không tạo world membership thứ hai; room current policy kiểm trên mọi entry path.
- Table cap 2–6/3–6/4–8 có race tests; một account chỉ ở một game active.
- Default flags OFF; origin/provenance art; invite không tự ép join hoặc travel.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/table-lobby.integration.test.ts (planned)
- Manual scenarios: Browser keyboard/mobile lobby empty/full/private flows.

**Rollback / recovery:** Disable all Lodge/table flags, remove only new world/catalog registration, giữ users hiện hữu an toàn.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N15-04 — Encrypted durable game journal, idempotency và recovery

**Depends on:** N15-02, N02-04

**Deliverables**

- Additive game migrations
- Encrypted match state and unique receipts
- Reconciliation after owner restart or truthful abort

**Acceptance / Definition of done**

- Một accepted command = một persisted stateVersion và result; same key never duplicates result.
- Encrypted hands/roles/deck/target at rest; missing key fails closed; backups/key custody reviewed.
- Restart/DB outage/owner-loss cleanup không tuyên bố phantom win, không giữ pending unfair secret.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/persistence.integration.test.ts (planned); pnpm exec vitest run tests/games/fault-recovery.integration.test.ts (planned)
- Manual scenarios: Use disposable DB and restore drills; no down migration on retained/prod DB.

**Rollback / recovery:** Feature flags OFF; keep additive schema and stored outcomes; roll forward compatible code, not destructive DB down.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N15-05 — Shared match UI, recipient projections và reconnect

**Depends on:** N15-03, N15-04, N05-04, N06-09

**Deliverables**

- Shared match shell and status UX
- Recipient-scoped socket event projections
- Versioned snapshot/resync tests

**Acceptance / Definition of done**

- Own hand/role only in per-account auth projection; spectator/public/metrics never contains secrets.
- Lost ACK/duplicate/out-of-order event/update account/reconnect all converge on server current view.
- DOM action controls support keyboard/touch/reduced motion; status never claims success before ACK.
- Dùng shared landscape shell và modular animal appearance đã qualify tại N06-09; không tạo creator/catalog/orientation store riêng.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec playwright test tests/e2e/game-shell.spec.ts (planned)
- Manual scenarios: Inspect desktop/responsive browser screenshots at error/reconnect/timeout.

**Rollback / recovery:** Unregister shell routes and flags; no destructive match state change.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.
