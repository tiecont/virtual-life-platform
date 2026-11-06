# EXECUTION BOARD — PHASE 2 ONLY

**Tất cả 25 task TODO. DORMANT cho đến khi Phase 1 handoff + owner approval.**

| Wave | Module | Unlock after | Task IDs |
|---|---|---|---|
| W0 | N15 | Phase gate | N15-01, N15-02, N15-03, N15-04, N15-05 |
| W1 | N16 | N15-05 | N16-01, N16-02, N16-03, N16-04, N16-05 |
| W2 | N17 | N16-05 | N17-01, N17-02, N17-03, N17-04, N17-05 |
| W3 | N18 | N17-05 | N18-01, N18-02, N18-03, N18-04, N18-05 |
| W4 | N19 | N18-05 | N19-01, N19-02, N19-03, N19-04, N19-05 |

## Task dispatch (không chạy đồng thời các game nếu milestone chưa đạt)

| ID | Mô tả | Local prerequisites | Phase 1 prerequisites |
|---|---|---|---|
| `N15-01` | Khóa product scope, luật và content/IP constraints | — | N00-02, N06-01 |
| `N15-02` | Hợp đồng GameSession và pure rules engine | N15-01 | N02-01, N05-01 |
| `N15-03` | World scene, table lobby, consent và permissions | N15-02 | N05-06, N06-02 |
| `N15-04` | Encrypted durable game journal, idempotency và recovery | N15-02 | N02-04 |
| `N15-05` | Shared match UI, recipient projections và reconnect | N15-03, N15-04 | N05-04, N06-09 |
| `N16-01` | Freeze 64-card deck, Glow và turn rules | N15-02 | — |
| `N16-02` | Server reducer Sắc Đèn, receipts và authoritative timer | N16-01, N15-04 | — |
| `N16-03` | UI đánh bài web/Android với icon hỗ trợ colorblind | N16-02, N15-05 | — |
| `N16-04` | Concurrency, security và một ván Sắc Đèn end-to-end | N16-03, N15-03 | — |
| `N16-05` | Pilot UX và cân bằng Sắc Đèn | N16-04 | — |
| `N17-01` | Freeze face-down claim, challenge and six-round rules | N15-02 | — |
| `N17-02` | Server sealed claims and confidential reveal projections | N17-01, N15-04 | — |
| `N17-03` | UI lựa chọn Tin/Lật và điểm Uy Tín | N17-02, N15-05 | — |
| `N17-04` | Adversarial acceptance Mặt Nạ | N17-03, N15-03 | — |
| `N17-05` | Pilot social bluff và diễn đạt luật | N17-04 | — |
| `N18-01` | Freeze 7×7 map, connector tiles, hidden factions và objective | N15-02 | — |
| `N18-02` | Authoritative tile placement, compass và BFS settlement | N18-01, N15-04 | — |
| `N18-03` | UX bản đồ và thao tác xoay thẻ trên web/Android | N18-02, N15-05 | — |
| `N18-04` | Hidden-role anti-cheat, solvability và acceptance | N18-03, N15-03 | — |
| `N18-05` | Pilot cân bằng phe ẩn và khả năng giải được | N18-04 | — |
| `N19-01` | Cross-mode privacy, authority, room/travel/reconnect regressions | N16-04, N17-04, N18-04 | — |
| `N19-02` | Observability và mixed-game load profile | N19-01 | N08-01 |
| `N19-03` | Admin world/game controls, metrics và incident kill switches | N19-02 | N07-03 |
| `N19-04` | Android single-device acceptance và release-independent proof | N19-01 | N10-04 |
| `N19-05` | Staged internal playtest, no-go report và future Steam adapter scope | N19-03, N16-05, N17-05, N18-05 | — |

`tools/next-task.mjs` trả task được phép chạy tại checkpoint hiện hành. Kết quả READY không phải proof task hoàn thành.

Trước khi chuyển task thành VERIFIED, cập nhật evidence thực trong `state/evidence-index.json` và `state/HANDOFF.md`. Không edit upstream task-state.
