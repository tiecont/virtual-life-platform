# N19 — Cross-game QA, metrics, Android và staging playtest

**Status:** PLAN / TODO · **Lane:** QA + Operations · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Nghiệm thu privacy, authority, performance, operator controls và release decisions độc lập.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N19-01 — Cross-mode privacy, authority, room/travel/reconnect regressions

**Depends on:** N16-04, N17-04, N18-04

**Deliverables**

- LG-01..LG-18 acceptance suite
- Cross-world travel/safety integration report

**Acceptance / Definition of done**

- No secret card/role/target in spectator/metrics/chat reports.
- Single table/account and RoomAuthority one-owner invariants preserved.
- Interrupted matches recover or truthfully abort; no phantom wins/rewards.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm architecture:check; pnpm governance:check
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/acceptance.integration.test.ts (planned); pnpm exec playwright test tests/e2e/lantern-lodge.spec.ts (planned)
- Manual scenarios: Review redacted snapshots, consent/capacity and prior world journeys.

**Rollback / recovery:** Feature flags all OFF, revert only new Lodge registration, keep append-only outcome journal.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N19-02 — Observability và mixed-game load profile

**Depends on:** N19-01, N08-01

**Deliverables**

- Game metrics with freshness
- Recorded staged load profile and SLO hypothesis

**Acceptance / Definition of done**

- Metadata cardinality bounded by mode/status; no game IDs/role/secret in labels.
- Report actual admitted tables/players and rejected commands, not only connected sockets.
- No claim of 100+ tables or p95 target without actual hardware evidence.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/load-profile.test.ts (planned)
- Manual scenarios: Run on isolated target host, record CPU/RAM/DB/WS with duration and cleanup.

**Rollback / recovery:** Disable load runner/schedules; never run load against public production without explicit approval.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N19-03 — Admin world/game controls, metrics và incident kill switches

**Depends on:** N19-02, N07-03

**Deliverables**

- Admin view mode status, live tables and queue metrics
- Mode/config audit and emergency disable

**Acceptance / Definition of done**

- Single operator principal and existing MFA/audit boundaries apply.
- Admin cannot inspect hidden hands/roles/targets in day-to-day metrics.
- Disable blocks new start; in-flight match drain/abort policy tested and visibly explained.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/admin-controls.integration.test.ts (planned)
- Manual scenarios: Operator drill for degraded/unknown data and on-duty reporting.

**Rollback / recovery:** Restore previous reviewed feature flag via audited config, not direct DB edit.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

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

**Depends on:** N19-03, N16-05, N17-05, N18-05

**Deliverables**

- Internal staging playtest release dossier
- Explicit web/Android/Steam readiness status per platform

**Acceptance / Definition of done**

- Art rights, security, moderation/ops and game acceptance are reviewed; all flags OFF until owner-controlled staging activation.
- Staging candidate uses digest/ruleset/DB compatibility proof; public launch requires separate N12 release gates and explicit approvals.
- Steam PC is future desktop adapter scope, not implied by a browser game; no false App Store/Play/Steam certification.
- Ghi riêng technical visual QA, owner art review còn thiếu và human playtest findings; không suy ra đẹp/hay từ synthetic screenshots.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm infra:check; pnpm ci:check
- Manual scenarios: Review pilot evidence and user fun feedback; owner decision logged as GO_INTERNAL / NO_GO.

**Rollback / recovery:** Roll back desired digest/config by Git promotion where safe, keep migrations append-only, abort games truthfully.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.
