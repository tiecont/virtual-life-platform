# Pet Arena — kế hoạch thực thi theo repository

Revision 1, 2026-11-09. Đọc sau `README.md` và `03_delivery/decision_log.md`. Tài liệu này cùng `execution/PLAN-MANIFEST.json` điều chỉnh **thứ tự, dependency và integration** của proposal v0.1 cho repo hiện tại. Luật/sản phẩm gốc được giữ; các điểm chưa chốt nằm trong [contract gaps](execution/CONTRACT-GAPS.md). Chưa có implementation Pet Arena được nghiệm thu.

## Phạm vi và kiến trúc

- Web/responsive browser trước. Board dùng DOM/SVG/canvas hiện hữu phù hợp a11y; Pet art phải theo hướng 3D hiện hành của VLP. Board 7×7 dạng 2D không yêu cầu một world 3D hoặc một bộ avatar người chơi thứ hai. Pet chiến đấu và avatar tài khoản là hai catalog khác nhau; cùng provenance/quality policy, không ép chung rig.
- Engine/content tách package thuần. S1 dự kiến module trong Nest/Fastify hiện có và route Next mỏng, reuse identity/CSRF, không thêm auth/wallet/chat riêng. Đây là phương án baseline cần ADR tại PA-001 trước scaffold, không phải code đã tồn tại.
- Giữ mục tiêu **deploy độc lập** của proposal. PA-019 phải đánh giá và chứng minh artifact/runtime/bridge boundary trước S2 release acceptance. Không tuyên bố một package hoặc feature flag là deploy độc lập. Nếu ADR chọn service ngay từ S1, cập nhật ownership/verification trước code; không tự dựng thêm RoomAuthority hay chia DB theo game.
- `GameRulesEngine`/journal hiện có gắn ba mode Lodge, room membership và travel source. Không cast Pet Arena thành một mode Lodge, không thêm nó vào enum chung khi chưa review compatibility. Reuse patterns, tạo adapter/contracts riêng hoặc extraction được chứng minh tại PA-001/002.
- Arena PvE không cần room admission, friend presence hay socket gameplay. Auth/policy còn hiệu lực ở mỗi command; failure của identity phải fail closed. Social outage có thể degrade; safety revocation không được bypass để giữ trận chạy.

Xem [integration audit](execution/REPOSITORY-INTEGRATION.md) để biết source thật và giới hạn reuse. Đường dẫn runtime dưới đây là **đề xuất ownership**, không phải thư mục đã scaffold.

## Các slice và gates

| Slice | Tasks | Acceptance cụ thể |
|---|---|---|
| S0 | PA-001, PA-002 | ADR topology/ownership và integration matrix; schemas strict, public/private state, PRNG/hash fixtures, rules ordering và migration/privacy plan. Không chỉ chép `domain-types.ts`. |
| S1a | PA-003, PA-004, PA-005, PA-006, PA-007, PA-008, PA-009 | Một trận PvE browser→API→DB hoàn chỉnh, team thử công bằng; seed/outcome do server, receipt/recovery thật. Không dùng mock E2E để nghiệm thu. |
| S1b | PA-012, PA-017 | Tutorial, 8 Pet, 6 stage + boss, local result receipt; keyboard/touch, reduced motion, original 3D Pet review, retry/restart/ownership and privacy checks. S1 chưa có Pet Camp hoặc grant vào VLP. |
| S2 | PA-010, PA-011, PA-013, PA-019, PA-020, PA-018 | Own inventory/team/progression; game-scoped reward ledger; export/delete/retention; recovery/load/metrics; artifact-bound deployability và rollback. Optional social/cross-reward không chặn S2 khi flags OFF và không có grants đang pending. |
| S3 | PA-014, PA-015, PA-016 | Chỉ mở khi PA-017 và PA-018 VERIFIED. Hai client, server clock, stale/duplicate/reordered commands, block/safety/reconnect/forfeit; ranked fairness, measured capacity, independent kill switches. Rollout cần cohort và owner decision. |
| S4 | Chưa schedule | Co-op/guild/spectator/housing/monetization; cần dữ liệu và review riêng. Không tạo status DEFERRED_APPROVED thay owner. |

PA-011 có **core bắt buộc** là game-local ledger/outbox/correction, và **extension mặc định OFF** là bridge cosmetics/achievement. Bridge chưa có API generic trong repo; cần platform-owner contract review + atomic dedupe/correction/privacy evidence trước bật. Không gọi một grant bị tắt là pending; chỉ hiển thị pending khi có durable intent thật. Không kéo currencies Pet Arena vào VLP progression ledger.

S1 lưu battle/command receipt để chịu được retry và restart. “Trial” chỉ nghĩa team/progression chưa persistent; kết quả và reward eligibility vẫn do server, chưa cấp XP/tiền/cosmetic lâu dài. PA-010/011 dùng result đó để cấp game-local rewards ở S2, theo transaction/idempotency thật.

## Thứ tự và bàn giao

Theo [roadmap chung](../DEVELOPMENT-ROADMAP.md): owner đã chọn hoàn thiện N06-04/N06-09 → **Arena S0/S1 PvE trước** → Lodge N15/N16 → Arena S2. PA-017 là checkpoint chuyển lane; S2 không tự active. N16 là **priority checkpoint trước S2**, không phải dependency kỹ thuật Pet Arena. Code integration/UI S1 cần upstream web art N06-09; audit/contracts/pure engine có thể chuẩn bị ở checkpoint an toàn mà không đợi native, staging hay toàn bộ Lodge.

`execution/state.json` là ledger PA riêng; `activation=PLANNED` nghĩa chỉ có quyền chuẩn bị kế hoạch ở phiên này. Không tự activate từ việc đọc file. Khi coordinator chuyển source lane theo yêu cầu implementation hiện hành, ghi handoff SHA + reviewed paths + trạng thái scheduler khác, rồi activate phạm vi S0/S1; PvP activation riêng sau hai gates. Không yêu cầu owner phê duyệt lại các sửa code routine đã được giao; public/bridge/topology exceptions giữ đúng quyền thật.

```sh
node docs/plans/vlp-pet-arena-plan-v0.1/tools/validate-plan.mjs
node docs/plans/vlp-pet-arena-plan-v0.1/tools/next-task.mjs
```

Hai helper chỉ đọc và kiểm kế hoạch; không build, migrate, launch agents, flip runtime flags hay deploy. `ready` rỗng khi chưa active hoặc upstream chưa đủ evidence. Future task VERIFIED cần command exits thật, source SHA/diff hash, artifact hashes và acceptance scope, không từ validator PASS.

## Ownership dự kiến

| Vai | Phạm vi khi đã reserve | Điểm coordinator giữ |
|---|---|---|
| A0 | `docs/plans/vlp-pet-arena-plan-v0.1/`, ADR/integration review | Shared contract export, root scripts, composition roots, migration sequence, flags/inventory |
| A1 | `packages/pet-arena-engine/` | Đề xuất reusable pure utility qua integration change, không sửa Lodge lén |
| A2 | `packages/pet-arena-content/` | Original asset provenance, content/ruleset versions |
| A3 | `apps/platform-api/src/pet-arena/` | Additive SQL số kế tiếp **tại thời điểm code**; không preallocate 0048 |
| A4 | `packages/game-client/src/pet-arena/`, thin `apps/portal-web/app/games/pet-arena/` | Không mang Next vào shared client, không tạo shared-player authority ở UI |
| A5 | Adapter trong module Arena và existing owner service qua contract | Không sửa trực tiếp auth/social/progression tables từ game |
| A6 | `tests/pet-arena/`, scoped artifacts | CI graph/allowlists do coordinator tích hợp; không thêm suite bị bỏ ngoài `pnpm check` |

Tên A0–A6 là vai công việc; chạy tuần tự mặc định. Handoff giữa vai gồm payload fixtures, failed runs, migrations/rollback, path list và next exact action. Không mở multi-agent hoặc nhiều source lane tự động.

## Verification, dữ liệu và release

PA-002 khóa budgets **trước đo**, kế thừa giới hạn VLP áp dụng và giữ failed runs hiện có; mục tiêu “usable board 3s” của proposal chưa phải benchmark. Browser mobile emulation ghi riêng với native. Performance 20avatar của café không tự thành budget workload Arena; khai báo workload board/3Pets/FX và kiểm tài nguyên chồng lấp khi tích hợp. Owner art approval/human usability cần evidence riêng.

Migrations additive, canonical journal Drizzle/PostgreSQL; backup/restore và N−1 image/schema compatibility theo policy hiện có, không destructive down-migration. Worker nếu thêm chỉ xử lý durable jobs, không gọi createApp/RoomAuthority. Active ruleset/content/seed state phải recover được hoặc abort truthful; command key trùng payload khác phải reject, không trả success cũ mơ hồ.

PA-020 áp dụng export/delete ngay từ dữ liệu S1 và hoàn tất S2: identity revocation/account switch/late reply, retention/PII redaction, replay ownership, pending outbox sau deletion và documented holds. Không tự thu D1/D7 hay public replay; synthetic tests không chứng minh engagement hoặc người dùng consent.

S1/S2 local technical acceptance khác public release. S3 tách enable unranked/ranked/cohort. Purchases/real money, cross-game grants, public deployment, tên/IP/asset clearance, store và supported-native compatibility giữ gates tương ứng. Không thêm Redis/Kafka/Kubernetes runtime chỉ vì plan gợi ý.
