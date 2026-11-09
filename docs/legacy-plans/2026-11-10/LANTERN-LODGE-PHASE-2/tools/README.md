# Phase 2 helpers — đọc-only, không tự tạo implementation

Sử dụng sau khi giải nén đúng cấu trúc:

```sh
node docs/plans/lantern-lodge-phase2/tools/validate-plan.mjs
node docs/plans/lantern-lodge-phase2/tools/check-upstream.mjs
node docs/plans/lantern-lodge-phase2/tools/next-task.mjs
```

Lần đầu, `next-task` phải báo `WAITING_FOR_PHASE1_HANDOFF` và không cấp task. `check-upstream` sẽ báo thiếu upstream state khi chạy ZIP độc lập ngoài repo — đó là hành vi đúng, không phải lỗi cần điền giả.

Khi upstream ở path khác, dùng `--upstream /path/to/state/task-state.json` (read-only). Scheduler kiểm `phase-gate.json` và upstream status, không ghi file. Cấu trúc manifest mới chỉ có N15–N19; `upstream_requires` được xử lý bằng trạng thái Phase 1 thật.

`validate-plan` chỉ chứng thực file/links/schema/DAG của **kế hoạch**. Không chứng thực API, database, UI, CI, release hay hiệu năng. Các script test trong module chỉ là *planned* cho đến khi agent triển khai.
