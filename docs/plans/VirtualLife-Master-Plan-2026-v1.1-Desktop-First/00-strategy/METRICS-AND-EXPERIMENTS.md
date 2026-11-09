# North-star metrics & playtests

## KPI tối thiểu
- Activation: % session tạo avatar → thành công vào plaza → bước đầu/teleport → ngồi/khởi trận trong session đầu.
- Game: battle completed / started, turn abandon, reconnect success, duplicate receipt incidents = 0, reward ledger lag.
- Social: invite accept, cafe seat occupancy (không thu sensitive/private identity), block/report response time, griefing rate.
- Experience: web first-interactive p50/p75/p95; FPS p50/p95 frametime; mobile thermal after 30m; shader compile stutters; input-to-feedback.
- Business: retention D1/D7 (chỉ aggregate, không deanonymize), cosmetics conversion sau consent, total assets bytes.

## Experiments theo phase
1. Persona/no tutorial vs short 3-step onboarding; ưu tiên time to first seat.
2. Teleport zoom/map filters; đo confusion/cancel/back/fail.
3. Social density: 8/20/40 visible avatars cùng LOD; p95 GPU/CPU/memory.
4. Card game seated overlay vs camera table composition; quan sát privacy/turn clarity.
5. Pet Arena board 6x6 vs 7x7; quan sát session length, teachability và deterministic replay.

## Quy tắc dữ liệu
No PII in metrics labels; opt-in telemetry khi bắt buộc; không logging raw private hand/seed/chat; pipeline account deletion and retention. Metric name và owners phải được review trước publish.
