# Prompt cho agent ở phiên Phase 2 — chỉ dùng sau khi Phase 1 bàn giao

> Owner revision 2026-11-09: [web/server first; mobile later](games/10-WEB-FIRST-EXECUTION.md). N15–N18 and N19 platform work use web/responsive browser scope. N19-04 native is DEFERRED_APPROVED; no physical Android/APK/AVD prerequisite blocks web features. Existing sequential wave/art/privacy/authority/release gates remain.

> Read `docs/plans/lantern-lodge-phase2/START-HERE.md`, `PHASE-2-MASTER-AGENT-PLAN.md`, `PLAN-MANIFEST.json`, `state/phase-gate.json` and the **real** Phase 1 handoff/status. Do not touch or reset Phase 1 master, manifest, checkpoints or evidence. Run `tools/validate-plan.mjs` and `tools/check-upstream.mjs`; if Phase 2 is not explicitly ACTIVE, another scheduler owns N15–N19, or prerequisites are not VERIFIED, stop with the exact blocker. Otherwise use `tools/next-task.mjs`, execute only the next ready vertical slice, verify real tests/builds, record evidence SHA/commands/exits, update Phase 2 state/handoff only, and finish with the next exact action. Never claim runtime or public release success from plan validation.

Bạn có thể gửi [yêu cầu bàn giao](HANDOFF-FROM-PHASE-1.md) cho agent đang chạy **sau khi** nó hoàn tất task/phiên hiện tại; không yêu cầu agent đó import gói game trong lúc đang thay đổi source.
