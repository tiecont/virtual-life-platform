# Current CI enforcement limitation — 2026-11-05 (N03-04)

Actual read-only repository preflight observes private repository, `main` at `cef7dc1`, `protected:false`, no required checks, rulesets/protection HTTP403 and auto-merge false. Owner: Foundation/CI and repository owner. Do not describe owner review as technical branch protection; keep auto-merge and production auto-promotion disabled. Publishing also remains default-disabled, with no GHCR/hosted run claimed. Exact-SHA hosted checks, registry access/private visibility and later staging evidence are needed before owner promotion. This limitation does not block local CI/artifact preparation or independent N05-01; do not buy a plan or change repository visibility. See `docs/operations/ARTIFACT-RELEASE.md` and N03-04 actual checks.

# Current baseline finding — 2026-11-05

Hosted Quality 42037215254 at cef7dc1 failed at desktop Deadline rAF p95 133.3 ms vs <100 ms; the aggregate failed closed. Fresh local core and legacy browser lanes exited 0 (28 governance/278 unit/553 integration; 40 browser executions), and local cadence passed 33.4/16.7 ms. Cause remains unresolved; no budget changed or hosted rerun was triggered. Owner: Foundation/CI and Experience lanes in N03/N06. This baseline finding does not block the completed N00-01 audit or next independent N00-02. See [baseline](../audit/N00-01-BASELINE.md).

# Blockers và unknowns tại lúc tạo

Không có blocker nào ngăn phần thiết kế đã bàn giao. Các task Nxx chưa bắt đầu; chưa tự gắn BLOCKED_EXTERNAL cho mọi task.

| Loại | Thông tin cần khi tới task | Xử lý |
|---|---|---|
| Server | Hardware/network/cluster/ingress/domain và staging access | N00-03/N04; local manifests/test vẫn tiếp tục |
| Capacity | Workload mục tiêu và phép đo host thật | N08; chưa công bố recommended CCU production |
| Android baseline | User có một Android; chưa biết model/OS/WebView, SDK/ADB/workstation specs | N10-01 kiểm trực tiếp; không yêu cầu Mac/iPhone |
| Android store | Play account/access và tester eligibility khi tới phân phối | N11-04; không chặn local APK/AAB build hay device tests |
| iOS | macOS/Xcode access, iPhone testing path, provisioning | N14 conditional; Android/web/CI/admin tiếp tục độc lập |
| Release | Candidate cụ thể, quyền production/store, active policy | N12-05/N11-04; không chặn công việc chuẩn bị |
| Historical | M20-07/M23-03/M23-05 của plan cũ | Giữ trạng thái; đánh giá lại phần còn liên quan, không tự mở restricted worlds |

Mỗi blocker khi xuất hiện cần taskId, evidence, owner/neededInput và next independent task. Không yêu cầu xác nhận lặp lại điều người dùng đã cho phép.
