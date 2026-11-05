# AGENTS.md — virtual-life-platform instructions

**MUST READ FIRST:** [`MASTER-AGENT-PLAN.md`](MASTER-AGENT-PLAN.md). Đây là file điều phối dự án. Mỗi module có plan riêng dưới `plans/`.

## Agent boot protocol

1. Xem `git status`, repo tree, runtime, README, scripts, migrations, tests, hai ứng dụng hiện hữu (nếu truy cập được).
2. Đọc master rồi đọc `docs/agent/{PROGRESS,DECISIONS,BLOCKERS,HANDOFF}.md`; tiếp theo chỉ đọc plan cho task sắp thực hiện và dependencies trực tiếp.
3. Không scaffold đè project đã tồn tại; không thay đổi stack/ORM chỉ vì plan dùng đề xuất mặc định. Audit trước; quyết định qua ADR.
4. Implement **one vertical slice**, chạy verification thật, ghi evidence/commit/PR, tiếp tục task có dependency đã VERIFIED.
5. Khi hết thời gian/context, lưu `Next exact action` và các blockers. Không giả vờ công việc sẽ tự chạy ở background.
6. Không tự mua tài nguyên, công khai production, dùng thông tin nhạy cảm, force-push, chạy migration phá dữ liệu hoặc tự cấp bản quyền media. Các thao tác đó cần owner approval.
7. Chat/report/block, privacy/consent và release gates là bắt buộc với world social; dating 18+ là gated, không mở public chỉ vì code đã pass.

## Status values

`TODO | IN_PROGRESS | VERIFIED | BLOCKED_TECHNICAL | BLOCKED_EXTERNAL | DEFERRED_APPROVED`

`VERIFIED` cần kết quả test/build hoặc bằng chứng tương đương (commands, exit codes, SHA, artifacts) chứ không phải checklist tự tích.

## Final response format per execution session

`Task IDs / Changed files / Test commands and actual outcomes / Commit SHA / Risks or blockers / Next exact action`.

## Virtual Life Platform vNext

Với công việc tiếp theo về CI/deployments/cleanup/UI-UX/server-authority/mobile/admin, đọc [`docs/plans/platform-vnext/MASTER-AGENT-PLAN.md`](docs/plans/platform-vnext/MASTER-AGENT-PLAN.md), manifest, state và module plan liên quan. Task Nxx tiếp nối M00–M24; không reset ledger cũ. [`docs/architecture/CURRENT-STATE.md`](docs/architecture/CURRENT-STATE.md) chỉ mục source/evidence hiện hành, phân biệt kết quả lịch sử và verification mới.

Yêu cầu mới cho phép Kubernetes/ArgoCD và native mobile preparation. Handoff cũ “offline work exhausted” không chặn scope mới; quyền viết code không cấp quyền public deployment, store submission hay thay đổi dữ liệu production.

Giữ một room-owner đến khi multi-owner gate đạt. Worker dùng entrypoint riêng không dựng RoomAuthority. Chỉ pin digest đã kiểm thử; native client giữ auth và protocol compatibility riêng.

Execution profile: CachyOS + một Android thật; N10/N11/N12-03 cho Android, N14 iOS conditional. Thiếu Mac/iPhone không chặn Android/web. Ngay khi phân phối mobile, cập nhật platform context và support inventory; backend gates theo platform supported/distributed. Android evidence không thay iOS evidence.

Cập nhật `docs/plans/platform-vnext/state/` sau mỗi task. Raw logs/screenshots lớn ở private artifacts; repository giữ summaries/hash. Evidence cần SHA/diff hash, môi trường, lệnh và kết quả thật. Không đánh VERIFIED vì file tồn tại.
