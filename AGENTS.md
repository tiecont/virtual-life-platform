# AGENTS.md — virtual-life-platform instructions

**MUST READ FIRST:** [`MASTER-AGENT-PLAN.md`](MASTER-AGENT-PLAN.md). Đây là file điều phối dự án. Mỗi module có plan riêng dưới `plans/`.

## Current Owner Instruction - Desktop First (2026-11-10)

Owner update in the continuing 2026-11-10 session: only one agent executes all
lanes. Owner explicitly authorizes separate same-agent audit plus actual CI,
clearly labeled not independent. Use the hashed policy under active runtime
`policies/single-agent-2026-11-10.json` and the scheduler coordinator API.
This supersedes the two-agent assignment/review requirement below for new work;
historical independent reviews, exact-source checks, dependency/external gates,
immutable baseline and release restrictions remain unchanged.

The active plan is [VirtualLife v1.1 Desktop First](docs/plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First/START-HERE.md).
Read its AGENTS, task graph and architecture before work. Agent 1 owns A0/A1/A2
and is the sole writer of `.agent-runtime/live-state.json` and reservations.
Agent 2 owns Unity/Desktop/frontend and writes independent reviews under
`.agent-runtime/reviews/`; it must request a coordinator reservation before source edits.
Use `node scripts/desktop-scheduler.mjs status agent1` (or `agent2`) for live readiness.
The checksum baseline `06-execution/STATE.json` and `FILE-MANIFEST.json` are immutable.
VERIFIED requires exact committed source, actual checks and another agent's review.

Legacy plans are preserved byte-for-byte under `docs/legacy-plans/2026-11-10/`;
[the relocation index](docs/execution/desktop-first/LEGACY-INDEX.json) resolves old
evidence paths. Do not change their statuses or treat archive acceptance as a fresh
run. N06-04 is checkpointed IN_PROGRESS and optional web compatibility is outside
the Windows critical path. Existing Nest RoomAuthority remains the only legacy
writer; new Rust namespaces require their own verified contracts and default-off
activation. Pet Arena PvE precedes new Lodge gameplay. Mobile remains conditional.
The older vNext instructions below describe the historical execution profile.

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

Execution profile (owner 2026-11-09): web/server/platform trước, native mobile sau. Đọc revision 2.4 trong vNext; không dùng APK/ADB/AVD/physical Android/iOS làm hard gate cho tính năng web hoặc Lantern Lodge web. N10/N11/N12-03/N14 và N19-04 native được hoãn theo owner; giữ code/evidence cũ, chỉ resume khi owner yêu cầu. Responsive browser vẫn trong web scope. Ngay khi hỗ trợ/phân phối mobile, cập nhật platform context và support inventory; backend compatibility gates theo platform supported/distributed (true/unknown fail-closed). Android evidence không thay iOS evidence.

Cập nhật `docs/plans/platform-vnext/state/` sau mỗi task. Raw logs/screenshots lớn ở private artifacts; repository giữ summaries/hash. Evidence cần SHA/diff hash, môi trường, lệnh và kết quả thật. Không đánh VERIFIED vì file tồn tại.
