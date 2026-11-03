# Focus Compatibility Audit - M10-01

Readonly audit of `../deadline-cafe` at HEADf9475b4caa65813e9351aaa4598663df538116a3/main plus observed dirty/untracked web files. Source hashes/current status are captured in m10-focus-audit.json. This is source inspection, not evidence that a legacy database or focus service is running. No source, media, credentials or data is copied/imported.

## Observed source vs reference plan

| Boundary | Existing source evidence | City engine decision |
| --- | --- | --- |
| Persistence | `apps/api/src/db/schema.ts` and `drizzle/0000_hot_slyde.sql` define focus_sessions,active/completed/cancelled,guest owner,room FK,start/end/completed/cancel timestamps,idempotency UUID. Allowed900/1500/3000s,one active row/guest and unique guest/key. | Add independent engine-owned city tables using existing SQL migration journal; account owner and immutable origin world/room context. Do not point city at legacy tables or change ORM. |
| Runtime commands | `apps/api/src/http.ts` exposes guest/profile/catalog routes only; `src/modules` has guests/catalog. `packages/contracts/src/index.ts` has no focus DTO/command. | There is no deployed focus wire format to silently emulate. Define strict city v1 commands and add an explicit mapper during M15 after revision/rights approval. |
| UI | `apps/web/src/components/FocusPanel.tsx` selects15/25/50min but start button is disabled; `features/time.ts` has formatting/countdown helpers. `/stats` renders an honest no-data view. | No working timer UI is replaced. Build a reusable accessible server-backed timer; display helpers are not completion authority. No fake statistics/peers. |
| Lifecycle | Original reference section3.4 requires authenticated seat ownership,start/end server time,one active timer,continue through disconnect/leave/restart,cancel before deadline,conditional idempotent finalization. These rules are not implemented in the audited runtime. | Preserve these Deadline semantics. Completion means timer elapsed,not measured productivity. No client-supplied completed flag,elapsed duration,reward or timestamps. |
| Pause | Legacy enum/reference has no pause implementation; module M10 permits optional pause. | Deadline mode cannot pause. Shared engine may expose explicit guarded pause/resume for an opt-in policy; default denied. Pause never awards completion or changes already elapsed focus time. No silent reinterpretation of legacy cancel. |
| Idempotency | Schema uniqueness exists; no runtime fingerprint/replay/finalization implementation or award service found. | Account-serialized durable UUID mutation keys/input fingerprints,one active/paused timer per account across tabs/sessions,one terminal completion row. Statistics derive from completed rows; no duplicated award/counter. |
| Timezone | SQL uses timestamp with time zone; no timezone preference,aggregation query or DST tests found. `remainingSeconds` accepts local now/skew but disabled UI does not exercise server synchronization. | Store instants in UTC,server now authoritative. Daily summaries group by explicit validated IANA zone (default Asia/Ho_Chi_Minh),completion boundary based on canonical endsAt. Add UTC/midnight/23h/25h DST tests in M10-05. |
| Privacy/retention | Focus rows cascade on legacy guest deletion; reference avoids task text in analytics. Actual UI stores no notes or live history. | Private account-owned history/export/erasure; no notes required by the initial engine,no public leaderboard/no surveillance. Any optional sharing is separate opt-in sanitized completion data. Retention remains a human-reviewed local default. |

## Adapter sequence and gaps

1. Implement city focus lifecycle/persistence with deterministic trusted clock and existing authenticated identity/room ports. Start must use a current server-authorized seat in a focus-capable world; browser room/role/time claims are not authority. Realm-specific adapter policy controls pause; no free-standing Deadline start bypass.
2. Keep running focus independent of ephemeral room presence after start. Travel/seat release/disconnect does not manufacture completion/cancellation. Account deletion removes history. Server read/maintenance reconciles elapsed timers after restart; browser countdown is display only and never writes ticks.
3. Associate canonical city account/world/source room/epoch/member/seat at start; expose own summaries only until explicit per-context consent permits a projection. A legacy guest ID is never accepted as a city account/session credential.
4. In M15, pin an approved legacy revision and confirm redistribution rights. Add an adapter that resolves possession-proven identity,legacy room/seat mapping and strict city command DTOs. Unknown old fields/events reject with a refresh path. Compare live legacy behavior if new focus code appears before integration; do not rely on this audit as proof of future source state.
5. Any history import is a separately reviewed migration with backup,identity ownership proof,timezone choice,per-row external source uniqueness and rollback plan. No imports or legacy database writes are authorized/executed in M10.

## Required verification for subsequent tasks

M10-02: concurrent starts/finish/cancel,immutable original duration,current seat checks,own-session authorization and IDOR,server deadline boundary,clock tamper,sleep/restart,retry after response loss,conditional completion exactly once,SQL receipt failure rollback,pause disabled for Deadline and guarded resume if supported. No economic reward is introduced.

M10-03: actual focus-capable synthetic Deadline/Library associations,private own history/export/delete,current world/privacy and source membership checks without cross-world repositories or hidden task text. Actual integrated legacy worlds remain M15/M17.

M10-04/05: semantic timer without per-second announcements or required sound/animation,visibility/sleep resync,explicit sanitized sharing,UTC storage and timezone/DST/midnight daily summaries,retention cleanup without per-second DB writes. Specifications here do not satisfy those runtime tasks.
