# N19 — Cross-game QA, metrics, Android và staging playtest

**Status:** PLAN / TODO · **Lane:** QA + Operations · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Nghiệm thu privacy, authority, performance, operator controls và release decisions độc lập.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N19-01 — Cross-mode privacy, authority, room/travel/reconnect regressions

**Phụ thuộc:** `N16-04`, `N17-04`, `N18-04`  
**Đầu ra:**
- LG-01..LG-22 acceptance suite (includes room/table bound and stale-authority fault checks)
- Cross-world travel/safety integration report

**Nghiệm thu:**
- No secret card/role/target in spectator/metrics/chat reports.
- Single table/account and RoomAuthority one-owner invariants preserved.
- Interrupted matches recover or truthfully abort; no phantom wins/rewards.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/acceptance.integration.test.ts (planned)`
- `pnpm exec playwright test tests/e2e/lantern-lodge.spec.ts (planned)`

**Manual review:**
- Review redacted snapshots, consent/capacity and prior world journeys.

**Rollback/Recovery:** Feature flags all OFF, revert only new Lodge registration, keep append-only outcome journal.

### N19-02 — Observability và mixed-game load profile

**Phụ thuộc:** `N19-01`, `N08-01`  
**Đầu ra:**
- Game metrics with freshness
- Recorded staged load profile and SLO hypothesis

**Nghiệm thu:**
- Metadata cardinality bounded by mode/status; no game IDs/role/secret in labels.
- Report actual admitted tables/players and rejected commands, not only connected sockets.
- At max 32 RoomService rooms per world, profile 4/8/16/32 tables is only a hypothesis; never claim measured capacity without actual host evidence.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/load-profile.test.ts (planned)`

**Manual review:**
- Run on isolated target host, record CPU/RAM/DB/WS with duration and cleanup.

**Rollback/Recovery:** Disable load runner/schedules; never run load against public production without explicit approval.

### N19-03 — Admin world/game controls, metrics và incident kill switches

**Phụ thuộc:** `N19-02`, `N07-03`  
**Đầu ra:**
- Admin view mode status, live tables and queue metrics
- Mode/config audit and emergency disable

**Nghiệm thu:**
- Single operator principal and existing MFA/audit boundaries apply.
- Admin cannot inspect hidden hands/roles/targets in day-to-day metrics.
- Disable blocks new start; in-flight match drain/abort policy tested and visibly explained.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/admin-controls.integration.test.ts (planned)`

**Manual review:**
- Operator drill for degraded/unknown data and on-duty reporting.

**Rollback/Recovery:** Restore previous reviewed feature flag via audited config, not direct DB edit.

### N19-04 — Android single-device acceptance và release-independent proof

**Phụ thuộc:** `N19-01`, `N10-04`  
**Đầu ra:**
- Physical Android ADB/build/session evidence
- Touch/back/background/reconnect screenshots and timings

**Nghiệm thu:**
- Record model/OS/WebView/GPU and test coverage limit.
- All three modes core flows and hidden-privacy work on available real Android.
- Do not mark iOS/Windows/Steam Deck tested using Android evidence.

- Ba mode landscape trên Android thật, creator/equip→travel giữ appearance, rotation/Back/resume và asset frame-time/memory có source/catalog revision.

**Verification mới phải triển khai:**
- `pnpm exec playwright test tests/e2e/lantern-lodge.mobile-web.spec.ts (planned)`

**Manual review:**
- Manual physical Android test with device log sanitization.

**Rollback/Recovery:** Disable mobile route/feature flag, no breaking server protocol rollback.

### N19-05 — Staged internal playtest, no-go report và future Steam adapter scope

**Phụ thuộc:** `N19-03`, `N16-05`, `N17-05`, `N18-05`  
**Đầu ra:**
- Internal staging playtest release dossier
- Explicit web/Android/Steam readiness status per platform

**Nghiệm thu:**
- Art rights, security, moderation/ops and game acceptance are reviewed; all flags OFF until owner-controlled staging activation.
- Staging candidate uses digest/ruleset/DB compatibility proof; public launch requires separate N12 release gates and explicit approvals.
- Steam PC is future desktop adapter scope, not implied by a browser game; no false App Store/Play/Steam certification.

- Ghi riêng technical visual QA, owner art review còn thiếu và human playtest findings; không suy ra đẹp/hay từ synthetic screenshots.

**Verification mới phải triển khai:**
- `pnpm infra:check`
- `pnpm ci:check`

**Manual review:**
- Review pilot evidence and user fun feedback; owner decision logged as GO_INTERNAL / NO_GO.

**Rollback/Recovery:** Roll back desired digest/config by Git promotion where safe, keep migrations append-only, abort games truthfully.

## Tài liệu tham chiếu

[QA matrix](../games/06-CROSS-GAME-QA.md) · [Architecture](../architecture/06-LANTERN-LODGE-GAME-ARCHITECTURE.md)
