# Thứ tự phát triển VLP — web, Lantern Lodge và Pet Arena

Ngày điều phối: 2026-11-09. Đây là cập nhật kế hoạch theo yêu cầu owner, không phải acceptance của game hoặc quyền release. Các ledger Mxx, Nxx và evidence đã có giữ nguyên. [vNext revision 2.4](platform-vnext/REVISION-2.4-WEB-FIRST.md) tiếp tục áp dụng: web/server trước, native sau.

## Thứ tự theo ưu tiên owner

| Thứ tự | Phạm vi | Mốc kết thúc và chuyển giao |
|---|---|---|
| 1 | Hoàn thiện nền web đang làm | N06-04 → N06-09; sửa các lỗi CI thực tế, giữ nguyên budgets, final-art và safety gates. N06-07 web đã VERIFIED. |
| 2 | **Pet Arena S0 → S1 PvE — owner ưu tiên trước Lodge** | Audit/ADR + khóa rules/contract → một trận PvE thật → tutorial, 8 Pet, 6 stage + boss → PA-017 nghiệm thu S1. |
| 3 | Lantern Lodge: một game multiplayer hoàn chỉnh | Checkpoint Arena tại PA-017 → refresh handoff upstream → N15-05 → N16-01..05 (Sắc Đèn). Reuse foundation N15-01..04; không scaffold lại. |
| 4 | Pet Arena S2 | Pet Camp/progression, privacy lifecycle, deployment boundary, metrics/recovery → PA-018 nghiệm thu S2. Social/cross-reward là nhánh opt-in riêng. |
| 5 | Các game Lodge còn lại | Tiếp tục N17 → N18 → N19 web theo wave gates gốc; không đánh VERIFIED từ Pet Arena. |
| 6 | Pet Arena S3 | Chỉ sau PA-017 + PA-018: PvP unranked, rồi ranked/normalization; beta cohort có quyết định rollout riêng. |
| Theo nhu cầu thực | Staging/recovery và release N04/N07/N08/N09/N12 | Chạy task có đúng dependency khi có môi trường; external credentials không chặn pure engine hay phát triển web offline. Public release vẫn cần gates hiện hành. |
| Khi owner resume | Android/iOS | N10/N11/N12-03/N14/N19-04; không là hard prerequisite của các hàng web phía trên. |

Owner chốt trong phiên này: **Pet Arena PvE trước, Lantern Lodge sau**. Hoàn thiện chất lượng nền đang thiếu trước khi thêm renderer/game; dùng PvE để kiểm chứng engine, persistence và UX ít phụ thuộc multiplayer; sau đó làm một game Lodge hoàn chỉnh trước mở rộng collection/competitive modes. Không cần đợi toàn bộ Lodge, Kubernetes staging, human usability cohort hoặc native để viết engine Pet Arena. Human review và staging vẫn là gates cho acceptance/release tương ứng, không được tự đánh pass. Nếu một mốc chỉ còn blocker external như cohort/pilot, coordinator được chuyển sang task độc lập tiếp theo tại checkpoint/handoff rõ ràng; không cần để S2 đứng yên chờ tester, cũng không đánh N16 VERIFIED để mở đường.

PA-017 là checkpoint chuyển sang Lodge; PA-010/011 và các task S2 giữ TODO đến lượt, không tự chạy nối tiếp chỉ vì dependency đã đủ. N16 là priority checkpoint trước S2, không phải dependency kỹ thuật Arena. Không thay DAG Lodge hoặc bỏ N06-09 cho bản web tích hợp chỉ để đổi ưu tiên. Review tài liệu/S0 có thể làm ngay; source implementation theo activation/handoff riêng.

## Một coordinator, ba ledger

- [vNext](platform-vnext/MASTER-AGENT-PLAN.md): giữ N00–N14 và active N06-04.
- [Lantern Lodge](LANTERN-LODGE-PHASE-2/PHASE-2-MASTER-AGENT-PLAN.md): giữ N15–N19, wave milestones và bốn foundation acceptance; hiện PAUSED.
- [Pet Arena execution](vlp-pet-arena-plan-v0.1/EXECUTION-PLAN.md): PA-001..PA-020, proposal gốc được giữ bằng hash; hiện PLANNED, tất cả implementation TODO.

Chỉ một feature scheduler giữ source ownership tại một thời điểm. Đổi lane cần checkpoint source SHA, dirty-path inventory, upstream task/evidence hashes, phạm vi file, next exact action và handoff thật. Coordinator có thể chuẩn bị docs/fixtures độc lập, không tự mở ba agent cùng sửa contracts, app.ts, migrations, root scripts hoặc lockfile. Không spawn agents chỉ vì proposal có các vai A0–A6.

Khi chuyển từ Arena S1 sang Lodge, checkpoint/pause Arena; khi chuyển sau N16 sang Arena S2, checkpoint/pause Lodge bằng cơ chế hiện có; khi trở lại, refresh handoff và resume từ N17. Không đánh dấu task chưa làm DEFERRED_APPROVED chỉ vì đổi thứ tự. Thứ tự trên không tạo quyền public deployment, mua hạ tầng, mở purchases hay store submission.

## Việc tiếp theo

Source lane vẫn là N06-04; các thử nghiệm renderer chưa commit cần giữ nguyên và kiểm chứng trước khi dùng. Review gói Arena chỉ sắp xếp kế hoạch. Sau N06-09 thật, handoff tới Arena PA-001/PA-002 và S1 đến PA-017; sau đó resume N15-05/N16. Trước code Arena, chạy validator/scheduler và ghi ownership/handoff; S2 chưa active. Không nhập PA tasks vào manifest Nxx.
