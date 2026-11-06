# N15 — Lantern Lodge — world, game session và shared UX

**Status:** PLAN / TODO · **Lane:** Game Platform · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Tạo một world và bộ công cụ ván đấu theo lượt, giữ RoomAuthority và safety hiện hữu.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N15-01 — Khóa product scope, luật và content/IP constraints

**Phụ thuộc:** `N00-02`, `N06-01`  
**Đầu ra:**
- ADR game-lodge scope/ownership
- Freeze proposal rule v1 docs and original naming
- Asset provenance/IP checklist

**Nghiệm thu:**
- Đối chiếu M05/06/07/08/09/M13/Nxx hiện hữu; không tạo thêm identity/world room owner.
- Ba rulebooks có ví dụ/phase/timeouts/target audience, mọi đổi luật có ADR.
- Tên/graphics/audio khác biệt, không dùng asset hoặc tên Party Animals trong sản phẩm.

**Verification mới phải triển khai:**
- `node scripts/verify-game-plan.mjs (implement before claiming PASS)`

**Manual review:**
- Review product journey và rủi ro nội dung trước code.

**Rollback/Recovery:** Revert docs/ADR only; không chỉnh nguồn ngoài scope.

### N15-02 — Hợp đồng GameSession và pure rules engine

**Phụ thuộc:** `N15-01`, `N02-01`, `N05-01`  
**Đầu ra:**
- packages/contracts game DTO version 1
- packages/boardgame-core pure reducer interface
- Boundary and negative contract tests

**Nghiệm thu:**
- Mỗi mode nhận deterministic state+command+clock và trả nextState/effects, không import network/DB/React.
- Phân tách public/own/spectator projection bằng allowlist và version; invalid commands không thay state.
- Không thư viện world nào được import API repository trực tiếp; boundary guard bắt lỗi.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/contracts.unit.test.ts (planned)`

**Manual review:**
- API/client signatures được chốt từ implementation/tests, không chỉ từ plan.

**Rollback/Recovery:** Tắt module flag, trả contract về phiên bản cũ tương thích; không phá clients phân phối.

### N15-03 — World scene, table lobby, consent và permissions

**Phụ thuộc:** `N15-02`, `N05-06`, `N06-02`  
**Đầu ra:**
- packages/lantern-lodge-world original scene
- Table lobby with join/ready; disabled spectator placeholder until safety+capacity approval
- Room+Safety+Travel authorization adapters

**Nghiệm thu:**
- Table join không tạo world membership thứ hai; room current policy kiểm trên mọi entry path.
- Một game table gắn đúng một `roomId` của world; cap phòng và cap bàn cùng được enforce; v1 tối đa 8 room members/bàn và spectator OFF. Nếu client vào room sai, không có quyền điều khiển table; không dùng join world không roomId để chọn đại bàn.
- Table cap 2–6/3–6/4–8 có race tests; một account chỉ ở một game active.
- Default flags OFF; origin/provenance art; invite không tự ép join hoặc travel.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/table-lobby.integration.test.ts (planned)`

**Manual review:**
- Browser keyboard/mobile lobby empty/full/private flows.

**Rollback/Recovery:** Disable all Lodge/table flags, remove only new world/catalog registration, giữ users hiện hữu an toàn.

### N15-04 — Encrypted durable game journal, idempotency và recovery

**Phụ thuộc:** `N15-02`, `N02-04`  
**Đầu ra:**
- Additive game migrations
- Encrypted match state and unique receipts
- Reconciliation after owner restart or truthful abort

**Nghiệm thu:**
- Một accepted command = một persisted stateVersion và result; same key never duplicates result.
- Durable unique active-account claim chặn hai bàn đồng thời; recheck session, owner epoch, membership, ban, deadline sau mọi await dài trước commit. GC claim khi terminal/abort được kiểm bằng fault tests.
- Encrypted hands/roles/deck/target at rest; missing key fails closed; backups/key custody reviewed.
- Restart/DB outage/owner-loss cleanup không tuyên bố phantom win, không giữ pending unfair secret.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/persistence.integration.test.ts (planned)`
- `pnpm exec vitest run tests/games/fault-recovery.integration.test.ts (planned)`

**Manual review:**
- Use disposable DB and restore drills; no down migration on retained/prod DB.

**Rollback/Recovery:** Feature flags OFF; keep additive schema and stored outcomes; roll forward compatible code, not destructive DB down.

### N15-05 — Shared match UI, recipient projections và reconnect

**Phụ thuộc:** `N15-03`, `N15-04`, `N05-04`  
**Đầu ra:**
- Shared match shell and status UX
- Recipient-scoped socket event projections
- Versioned snapshot/resync tests

**Nghiệm thu:**
- Own hand/role only in per-account auth projection; spectator/public/metrics never contains secrets.
- Lost ACK/duplicate/out-of-order event/update account/reconnect all converge on server current view.
- DOM action controls support keyboard/touch/reduced motion; status never claims success before ACK.

**Verification mới phải triển khai:**
- `pnpm exec playwright test tests/e2e/game-shell.spec.ts (planned)`

**Manual review:**
- Inspect desktop/Android prototype screenshots at error/reconnect/timeout.

**Rollback/Recovery:** Unregister shell routes and flags; no destructive match state change.

## Tài liệu tham chiếu

[Architecture](../architecture/06-LANTERN-LODGE-GAME-ARCHITECTURE.md) · [Match protocol](../games/04-MATCH-PROTOCOL.md) · [UX](../games/05-GAME-UX-WIREFRAMES.md)
