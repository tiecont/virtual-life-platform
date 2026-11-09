# Agent orchestration — desktop-first v1.1

**A0 Coordinator**: source/audit/reconciliation, ADR owners, issue/file reservations, approvals, no legacy ledger writes.
**A1 Rust**: world and game authority, actor ownership/ticks, game reducer/AI, gRPC and WSS.
**A2 DB/Security**: identity tickets/privacy/consent, Postgres event/receipt/idempotency, migrations, outbox and signing trust review.
**A3 Web-UX**: **Next.js official portal**: hero/trailer, secure download, news/profile/account/support; optional web-lite only after decision.
**A4 Art/Avatar**: Blender source rig, café/city/Pet props, expression channels, toon shader art direction with Unity tech-art handoff.
**A5 Native**: **primary Unity Windows client**: render/animation/input/HUD/streaming/quality, native CI, installer/patch and conditional Mac/mobile.
**A6 Gameplay**: Pet Arena/card rules/content, tutorials, fairness & progression, human playtests.
**A7 QA/SRE**: real GPU and Windows device matrix, crash, perf traces, security tests, deployment, site Web Vitals, installer rollback.

Parallel review rules: `AGENTS.md` and `AGENT-EXECUTION-ORDER.md` own the file restrictions. A PR/task needs SHA, tests, profiling environment and reviewer before status VERIFIED; block external gates instead of pretending to use missing hardware/keys. Source repos remain authoritative over this planning ZIP.
