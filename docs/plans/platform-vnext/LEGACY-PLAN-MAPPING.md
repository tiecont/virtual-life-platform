# Tiếp nối bộ kế hoạch M00–M24

## 1. Baseline được giữ nguyên

Bộ ZIP gốc có 25 module M00–M24. Tại SHA audit `cef7dc17172f7c6cda930c99648a5e3ad609cc55`, current handoff của repo **báo cáo 151 task: 148 VERIFIED và 3 BLOCKED_EXTERNAL**. Đây là kết quả đã ghi của phạm vi offline trước đây, không phải 148 task được chạy lại trong lượt review này. Không reset IDs, sửa lịch sử hoặc dùng trạng thái đó chứng minh các thay đổi Nxx đã đạt gate. [Handoff tại SHA audit](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/HANDOFF.md).

Ba gate external được handoff nêu là M23-03 (vận hành/on-duty/contact cho public), M23-05 (public release signoffs) và M20-07 (pilot adult/provider/privacy/operator thực tế). Giữ đúng phạm vi từng gate; không coi chúng là bằng chứng code chưa tồn tại hoặc tự đóng gate để checklist đẹp.

Yêu cầu mới của chủ dự án **mở lại phạm vi mobile và Kubernetes/ArgoCD**, vốn là non-goals của MVP cũ. Checkpoint “offline work exhausted” không chặn thiết kế hoặc task Nxx. Các nguyên tắc còn đúng về dữ liệu, consent, source rights và release vẫn được kế thừa. Production/store release là kết quả riêng, không tự phát sinh từ việc tạo gói kế hoạch.

## 2. Ý nghĩa namespace mới

N00 baseline; N01 cleanup; N02 boundaries; N03 build/CI; N04 ArgoCD; N05 authority/protocol; N06 UX; N07 admin; N08 telemetry/load; N09 global admission queue; N10 shared client/mobile spike; N11 Android store; N12 release regressions; N13 conditional scaling; N14 conditional iOS. Mapping sau thể hiện nơi mở rộng hoặc nơi phải chạy regression, **không phải dependency DAG**. Task IDs/dependencies mới theo `PLAN-MANIFEST.json`.

## 3. Mapping đầy đủ

| Module gốc | Scope Nxx tiếp nối | Invariant và evidence phải giữ |
|---|---|---|
| M00 Product, UX, governance | N00, N06, N12 | Product intent, ADR, release gates; tách quyết định mới khỏi phê duyệt public cũ |
| M01 Repository foundation | N00–N03 | Frozen install, toolchain, scripts, reproducibility; clean checkout không phụ thuộc máy tác giả |
| M02 Domain architecture | N02, N05, N13 | Ownership/import boundaries; world không đọc DB domain khác; không scaffold đè source |
| M03 Identity, session, privacy | N05, N07, N10, N11 | Session revoke, cookie/Origin/CSRF, consent/export/deletion; native auth có regression riêng |
| M04 Social graph, blocking | N05–N07, N11 | Block/visibility áp dụng xuyên world; cache/fanout không làm rò privacy |
| M05 World SDK, registry | N02, N04–N06, N12 | Catalog/scene versions và server eligibility; feature flag không thay runtime installer |
| M06 Rooms, seats, reconnect | N05, N09, N12, N13 | Một authority, capacity/seat atomicity, epoch, retry, resync; giữ owner-loss/race tests |
| M07 Scene, avatar, art | N06, N10, N11 | Asset provenance/hash, renderer cleanup, reduced motion và controls thay canvas |
| M08 Safety, moderation | N07, N11, N12 | Report/block/sanction/audit; một admin không tự bỏ independent-review policy |
| M09 Invitations, travel, party | N05, N06, N09, N12 | Intent scoped/single-use, consent, destination reserve/source compensation; không double membership |
| M10 Focus engine | N05, N06, N10 | Trusted timestamps, pause/resume, private history; background mobile không tự tính phần thưởng |
| M11 Hospitality engine | N02, N05, N06, N13 | Order/claim/completion atomic, voluntary shift, idempotency/outbox; worker không tranh room authority |
| M12 Events, reservations | N07–N09, N12 | Timezone, capacity, reservation TTL/FIFO và cancellation; booking queue khác global admission |
| M13 Progression, cosmetics | N05–N07, N12 | Ledger immutable/source-unique, corrections có audit; không nhân reward khi retry/reconnect |
| M14 Portal, map, discovery | N06, N08, N10 | Discovery đúng quyền/occupancy, không giả population; first-action và accessibility được đo |
| M15 Deadline integration | N00, N01, N05, N06, N10, N12 | Snapshot/source hashes, adapters và actual gameplay acceptance; giữ focus/identity/travel regressions |
| M16 Maid integration | N00, N01, N05, N06, N10, N12 | Snapshot/source hashes, role/service consent, real order loop, moderation và travel evidence |
| M17 Library world | N05, N06, N10, N12 | Shared focus semantics, quiet/private study, consent và content rights; không clone engine |
| M18 Restaurant world | N05–N07, N09, N12 | Booking/table/party/service capacity nhất quán; đổi UI không bypass hospitality policy |
| M19 Lounge world | N06, N07, N11, N12 | Stage consent, independent stop, audience limits, cleared-media gate; không tự mở public |
| M20 Adult dating | N05, N07, N11, N12 | Private profile/presence, withdrawal, age/access gates; M20-07 vẫn riêng và initial mobile chưa mở |
| M21 Infra, CI/CD, observability | N03, N04, N08, N12 | Giữ CI/security tests; thêm image/GitOps/live telemetry evidence, không suy từ template |
| M22 Quality, security, load, a11y | N00, N05, N06, N08, N10–N13 | Preserve adversarial/concurrency cases; local/emulated results không thành production/device claims |
| M23 Release, rollback, operations | N04, N07, N11, N12 | Backup/restore, compatible rollback, incident/runbook evidence; code-ready khác public/store release |
| M24 Central Park | N05, N06, N09, N10, N12 | Public gathering/consent/social safety, authority và observed activity; shared shell không mất behavior |

## 4. Chuyển kế hoạch và evidence an toàn

N00 đối chiếu code, task ledger và current handoff tại HEAD thực tế. Nếu HEAD khác SHA audit, đọc delta; không ép quay về snapshot. Với một claim VERIFIED cũ, giữ source SHA, môi trường, command, exit code, artifact và giới hạn ban đầu; change mới cần evidence mới liên kết ngược task Mxx.

N01 phân loại source/fixtures/generated/evidence trước khi di chuyển. Raw logs/ảnh có thể ra archive có manifest/hash, nhưng phải restore được và đổi consumers trước. Giữ migrations đã phát hành, asset provenance và immutable Deadline/Maid snapshots hoặc địa chỉ thay thế tái lập được. Không xóa lịch sử Git mặc định.

Có drift giữa `JOURNEY-ACCEPTANCE.md` đầu kỳ và handoff mới: tài liệu cũ còn nói synthetic-only/blocked, handoff mới ghi actual adapters đã chạy. Current index phải nêu `asOfCommit`, `evidenceRefs`, `knownGaps`; checkpoint cũ mang nhãn lịch sử. Không dùng ảnh fixture cũ để phủ nhận gameplay hiện tại, cũng không dùng handoff để tuyên bố production đã chạy.

Khi task Nxx chạm một domain, acceptance chọn các invariant Mxx trong bảng và scenario mới. Nếu chỉ move files, chứng minh imports/build/tests và evidence retrieval còn đúng. Nếu đổi authority/auth/schema, chạy race/security/migration matrix; nếu đổi scene/mobile, chạy recovery, usability và thiết bị thật. N13 chỉ kích hoạt bởi workload đã đo; không bắt beta chờ distributed architecture.


Revision 2.1 giữ nguyên Mxx/N00–N13 IDs, đổi scope mobile gate sang Android trước và bổ sung N14 cho iOS. Không reset/mark VERIFIED ledger lịch sử hoặc task implementation mới.
