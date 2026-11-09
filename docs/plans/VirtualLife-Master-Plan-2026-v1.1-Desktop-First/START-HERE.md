# VirtualLife — Desktop-first master plan v1.1 | START HERE

**2026-11-09 · PROPOSED / PLANNING ONLY · không phải sản phẩm đã build.** Thay thế thứ tự triển khai của gói v1.0; bảo toàn toàn bộ hợp đồng, 76 task IDs VL-001..076 đã có, và **không sửa** legacy Nxx/PA/Lodge ledgers.

## Quyết định của phiên bản 1.1
1. **Ứng dụng chính = VirtualLife Windows desktop native**, **Unity 6.3 LTS + URP + C#**. Không đặt mục tiêu browser chạy cùng mức world/shading. macOS và Android/iOS là mục tiêu *có gate riêng*, Linux theo nhu cầu/kỹ thuật.
2. **Rust** (Tokio + Axum + PostgreSQL) làm authoritative world simulation + mọi game logic (Pet Arena, bài, seating, teleport). **NestJS** làm control plane, identity, social, admin, ledger, async workers; website không tính game state.
3. **Website chính thức = Next.js official portal** có hero video / key-art, landing, cập nhật, account, tải bản Windows, bản đồ preview; không ship open-world browser 3D như một nghĩa vụ MVP. Existing Three.js web slice chỉ giữ như **compatibility / teaser có gate**, không bỏ VERIFIED work.
4. **Trải nghiệm đầu tiên cần đạt:** chạy thành phố 3D Aurora Plaza, NPC sống động, avatar người thú có face/ear/tail expressions, tự đi WASD/click-to-move, bấm M mở map, teleport, vào café, ngồi bàn, chơi bài, rời bàn, vào Pet Arena đấu PvE và nhận thưởng; reconnect/rollback/privacy phải đúng.
5. **Rust không render 3D**; Unity thực hiện render/animation GPU; server vẫn sở hữu rules, position/seat/teleport/turn/result. Không đưa các chức năng này sang TypeScript chỉ vì tiện.

## Đọc theo thứ tự
- `README.md` → `01-architecture/ADR-003-DESKTOP-FIRST.md` → `04-delivery/DESKTOP-FIRST-ROADMAP.md`.
- `01-architecture/NATIVE-CLIENT-ARCHITECTURE.md`, `UNITY-URP-RENDERING.md`, `GRAPHICS-QUALITY-BUDGETS.md`, `CLIENT-NETCODE.md`.
- `01-architecture/OFFICIAL-WEBSITE-ARCHITECTURE.md`, `DESKTOP-PATCHING-DISTRIBUTION.md`.
- `02-world-design/DESKTOP-PLAYER-AND-CITY-LIFE.md`, `DESKTOP-VENUE-FLOW.md`.
- `04-delivery/PERFORMANCE-GO-NOGO.md`, `MIGRATION-V1-TO-V1.1.md`, `AGENT-EXECUTION-ORDER.md`.
- `06-execution/TASKS.json`, `06-execution/STATE.json`, `AGENTS.md`.
- `07-visuals/VirtualLife-official-site-prototype.html`: UI tĩnh offline, mẫu trình bày của website chính thức.

## Khởi động / tiếp nhận cho agents
```bash
python3 tools/validate_plan.py
python3 tools/next_task.py G0
```
Đọc real repository HEAD, thống nhất branch/file reservations, giữ original state đã verified, chỉ chuyển task sau **reviewed evidence**. V1.1 là overlay roadmap và chỉnh task semantics **chưa triển khai**; tất cả 110 task mới/giữ ID đang TODO tại thời điểm đóng gói.
