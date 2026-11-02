# AGENTS.md — Virtual City instructions

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
