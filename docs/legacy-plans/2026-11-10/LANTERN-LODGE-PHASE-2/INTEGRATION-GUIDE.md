# Đưa Phase 2 vào đúng lúc — không làm hỏng plan đang chạy

> Owner revision 2026-11-09: [web/server first; mobile later](games/10-WEB-FIRST-EXECUTION.md). N15–N18 and N19 platform work use web/responsive browser scope. N19-04 native is DEFERRED_APPROVED; no physical Android/APK/AVD prerequisite blocks web features. Existing sequential wave/art/privacy/authority/release gates remain.

## Trường hợp A — Phase 1 v2.1 chỉ chứa N00–N14 (khuyến nghị)

Đợi agent Phase 1 dừng ở checkpoint hợp lệ. Không copy ZIP trong lúc agent đang sửa manifest/state/AGENTS. Sau handoff, commit hoặc snapshot trạng thái Phase 1, sau đó copy **nội dung** `LANTERN-LODGE-PHASE-2/` vào `docs/plans/lantern-lodge-phase2/` ở PR/commit riêng. Không thay đổi `docs/plans/platform-vnext/`.

`node docs/plans/lantern-lodge-phase2/tools/validate-plan.mjs` kiểm tài liệu, DAG, trạng thái. `node docs/plans/lantern-lodge-phase2/tools/check-upstream.mjs` đọc upstream state. Ban đầu `next-task.mjs` phải báo `WAITING_FOR_PHASE1_HANDOFF`, không bắt đầu implementation.

Đối chiếu source HEAD thực tế với source SHA thiết kế, ghi và review handoff, xác nhận không còn agent sửa các vùng file trùng. **Chủ dự án** chuyển `state/phase-gate.json` thành `ACTIVE` và điền thông tin thực (SHA/approval/handoff) sau khi đủ điều kiện, không phải từ synthetic fixture. Tất cả N15–N19 vẫn `TODO` lúc bắt đầu.

## Trường hợp B — Phase 1 đang chạy v2.2 và đã có N15–N19

**Không import hoặc chạy song song gói này.** Scheduler cũ có thể đã nắm N15–N19. Dừng tại checkpoint, đọc diff/source/state, bảo toàn VERIFIED/IN_PROGRESS/evidence và chọn **một scheduler**. Có thể tiếp tục ngay trong v2.2 hiện tại; hoặc thực hiện chuyển state/evidence và vô hiệu hóa đường scheduling cũ **bằng PR review riêng**. Không xóa record một cách cơ học vì có thể làm hỏng validator/DAG cũ. `check-upstream` sẽ cố ý trả `CONFLICT_UPSTREAM_GAME_TASKS` khi phát hiện các task N15..N19 trong upstream.

## Trường hợp C — chưa có Phase 1 vNext trong repo / path khác

Không coi file ZIP nền tảng là proof đã triển khai. Cung cấp path trạng thái thực cho `node tools/check-upstream.mjs --upstream <path-to-state.json>`. Nếu không có những dependency bắt buộc, Phase 2 giữ `WAITING`/`BLOCKED`. Không tự tạo các status VERIFIED để bỏ qua gate.

## Nguyên tắc tương thích

- `N15..N19` giữ nguyên ID, **không đánh lại số**. `depends_on` trong manifest Phase 2 chứa task local; `upstream_requires` chứa dependency N00–N14; `original_depends_on` là bản gốc v2.2 để truy vết.
- Tách riêng không đồng nghĩa code đã có. Paths trong plan là **dự kiến**, cần audit tại HEAD mới.
- Test `planned` chưa chạy và thường chưa tồn tại; không được gán exit 0 nếu chưa thực thi.
- Phase 2 chỉ bổ sung module/game source sau khi gate mở và PR được kiểm tra; không chạm dữ liệu production khi đang chạy bản cũ.
- Hướng Android-first giữ nguyên; iOS/Steam là lane độc lập, không tự mở hay nhận certification từ một Android.
