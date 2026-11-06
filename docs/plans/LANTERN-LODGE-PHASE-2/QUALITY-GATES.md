# Phase 2 — quality gates (chỉ dành cho ba mini-game)

**Tất cả là yêu cầu, chưa có kết quả test gameplay thật.** Phạm vi game đề xuất dựa trên repo tại SHA audit, phải xác minh lại tại HEAD triển khai.

Owner update 2026-11-06: áp dụng [animal/landscape art](games/08-ANIMAL-LANDSCAPE-ART.md), character creator từng bộ phận và scene-first gameplay ngang. N15-05 chờ upstream N06-09 VERIFIED, tái sử dụng shared appearance/landscape shell. N19-04 ghi actual Android landscape/rotation/avatar-travel/performance evidence cả ba mode; không dùng sơ đồ portrait hoặc preview cũ để đạt visual gate. Technical QA, owner art review và human playtest được ghi riêng.

## Gate 0: trước khi code

1. Handoff Phase 1 và owner approval được ghi lại; không có hai scheduler N15–N19.
2. N00-02/N06-01 đã VERIFIED trước task N15-01; mỗi task tiếp theo kiểm `upstream_requires` từ state Phase 1 thật.
3. One room authority singleton vẫn enforced; `package/contracts` và SDK boundaries không bị vi phạm; staging/hardware/release status trung thực.
4. Các playbook nguyên tắc copyright: ý tưởng thể loại được tham khảo, asset/tên/lời thoại/thiết kế thẻ/phòng phải là bản gốc VLP.

## Gate 1: quyền quyết định server và consistency

- Không gửi toàn bộ state nhạy cảm cho client để tự lọc. Server **tạo projection được phép** theo account/session/room; test raw HTTP/socket response, event fanout, log, traces và metrics.
- Command `requestId`/`expectedVersion`/authenticated account/room epoch/turn/phase/deadline phải kiểm trước khi commit, và recheck sau các await quan trọng; duplicate same fingerprint replay ra sanitized result, conflict payload reject.
- PostgreSQL transaction/lock + một active game claim/account; đảm bảo thắng/thua/reward không duplicate khi hai tab, retry, mất ACK, crash và rollout.
- Strict cap: room world, table, global platform; spectator mặc định OFF. Không cho room auto-select bừa bàn.
- Match must recover deterministically from persisted state or mark `INTERRUPTED/ABORTED`, no phantom win or invisible stale turn.

## Gate 2: luật

- **Sắc Đèn:** card conservation (tổng 64 lá), color/number/symbol/Glow, wild chọn màu, reverse 2-player, hết deck, no negative Glow, 1 actor mỗi turn.
- **Mặt Nạ:** truth/challenge sealed decisions, private hand, reveal chỉ khi đã quyết định theo luật, no retroactive challenge, no wrong-user peeking, party bluff không bị moderation kết tội tự động.
- **Hải Đồ Sương Mù:** seed/goal solvability, map 7×7, role distribution, tile adjacency/rotation/BFS, victory both factions, hidden objective không lộ qua metadata.

## Gate 3: UX và thiết bị

- Game có entry/ready/full/quit/reconnect/error/timeout/finish, current turn rõ, feedback không tuyên bố thành công trước ACK.
- Native keyboard/touch alternatives, không chỉ drag-and-drop, ít dùng màu như kênh nhận biết duy nhất, reduced-motion.
- CachyOS + một Android vật lý: ghi model, Android/WebView, viewport, lifecycle/performance; không suy kết quả cho iOS/Steam/Deck.

## Gate 4: phát hành nội bộ

- Chạy tests thật: `pnpm lint`, `pnpm typecheck`, `pnpm test:integration`, `pnpm build` và Playwright profile đúng phạm vi; tên test mới trong module plan phải **được implement trước khi gọi**.
- Staging mới có metrics, admission, release compatibility, restore/rollback/drain, logs không lộ secret; không dùng kết quả benchmark cũ để công bố CCU mới.
- Handoff lưu command, exit code, SHA, artifacts/hashes, known failures và quyết định GO_INTERNAL/NO_GO. Public release, Steam/CH Play/App Store là gate khác cần phép riêng.
