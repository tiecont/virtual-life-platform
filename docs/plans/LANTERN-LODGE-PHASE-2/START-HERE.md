# Lantern Lodge — Phase 2 (để chạy **sau** plan đang thực thi)

> Owner revision 2026-11-09: [web/server first; mobile later](games/10-WEB-FIRST-EXECUTION.md). N15–N18 and N19 platform work use web/responsive browser scope. N19-04 native is DEFERRED_APPROVED; no physical Android/APK/AVD prerequisite blocks web features. Existing sequential wave/art/privacy/authority/release gates remain.

**Bộ kế hoạch độc lập**, chỉ gồm N15–N19 / **25 task** được trích từ gói v2.2; không chứa 69 task N00–N14. Bản tách giữ nguyên ID, nội dung nghiệm thu và tài liệu trò chơi; bổ sung dependency gate, checkpoint riêng và thứ tự wave để các agent đang chạy không va chạm.

- **Repo tham chiếu lúc thiết kế:** `cef7dc17172f7c6cda930c99648a5e3ad609cc55`; đây không phải SHA đã kiểm thử Phase 2.
- **Trạng thái:** `PLAN_ONLY`, tất cả 25 task `TODO`; `state/phase-gate.json` mặc định `WAITING_FOR_PHASE1_HANDOFF`.
- **Vị trí đề xuất khi triển khai:** `docs/plans/lantern-lodge-phase2/` (sibling của `docs/plans/platform-vnext/`).
- **Quan trọng:** bạn đang cho agent chạy Phase 1, **đừng giải nén đè lên thư mục plan đó, không sửa manifest/task-state/handoff đang chạy và chưa bật Phase 2**.

## Bạn làm gì ngay lúc này?

**Chỉ lưu ZIP riêng.** Chưa cần thay đổi source hay yêu cầu agent cũ làm thêm game. Khi Phase 1 dừng tại checkpoint/handoff, đọc [HANDOFF-FROM-PHASE-1.md](HANDOFF-FROM-PHASE-1.md), kiểm tra trạng thái repo thật và cài plan theo [INTEGRATION-GUIDE.md](INTEGRATION-GUIDE.md).

## Khi Phase 1 đã bàn giao

1. Tạo commit/branch riêng cho Phase 2 từ HEAD thực tế, kiểm tra `git status --short`, `git rev-parse HEAD`, kết quả CI và migration compatibility. Không reset về source SHA audit.
2. Đưa **nội dung** ZIP vào `docs/plans/lantern-lodge-phase2/`, không copy qua `docs/plans/platform-vnext/`.
3. Chạy `node docs/plans/lantern-lodge-phase2/tools/validate-plan.mjs` (chỉ kiểm cấu trúc tài liệu).
4. Chạy `node docs/plans/lantern-lodge-phase2/tools/check-upstream.mjs` (đọc trạng thái Phase 1, không sửa gì). Nếu Phase 1 đang chứa task N15–N19, dừng, xem hướng dẫn xung đột scheduler.
5. Ghi sự kiện bàn giao thật tại `state/PHASE1-HANDOFF.md` từ template; sau khi chủ dự án đồng ý, điền đúng thông tin vào `state/phase-gate.json`, chuyển `phase_state` thành `ACTIVE` và commit review. **Không tự bật chỉ vì test đang xanh.**
6. Chạy `node docs/plans/lantern-lodge-phase2/tools/next-task.mjs` và thực hiện từng vertical slice với evidence thật.

## Vị trí nội dung

- [Master agent plan](PHASE-2-MASTER-AGENT-PLAN.md): luật chạy kế hoạch
- [Board](EXECUTION-BOARD.md): 5 wave, 25 task
- [Architecture](architecture/06-LANTERN-LODGE-GAME-ARCHITECTURE.md): one room owner + game sessions
- [Rules](games/01-SAC-DEN.md): Sắc Đèn
- [Bluff](games/02-MAT-NA.md): Mặt Nạ
- [Hidden-role](games/03-HAI-DO-SUONG-MU.md): Hải Đồ Sương Mù
- [Quality](QUALITY-GATES.md): security/privacy/reconnect/quality
- [Progress](state/HANDOFF.md): checkpoint của Phase 2, **không** phải của Phase 1

**Lưu ý:** Các test được ghi `(planned)` là kịch bản *phải viết* rồi mới chạy. Không coi các task cũ, kết quả audit hay file plan là proof rằng game đã chạy.
