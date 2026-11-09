# Release and rollback — Windows desktop & official website v1.1

## Feature gates
`vl_game_runtime_enabled` OFF default; `vl_world_aurora_pilot`, `vl_pet_arena_rust_pve`, `vl_unity_windows_alpha`, `vl_release_portal_windows_download`, `vl_optional_web_lite`, `vl_mobile_unity_pilot`, `vl_legacy_room_cutover` (G7 only). Cohort/world scopes; never authorize privileges via flags alone.

## Safe rollout
Pin Rust service OCI, generated proto API compatibility, signed Windows executable build, Addressables catalog/content hashes, official website download JSON; deploy staging and test installed client vs staging server. Preserve existing encrypted Lodge journal. Canary new sessions first; no rollback while incompatible schema is still in use. Monitor crash/graphics tier, client RTT, Rust tick, Postgres IO/reward receipts, outbox lag, CDN 404/cache poisoning, installer signature and site download conversion. Roll back *separately* website, binary, content, Rust service and database with compatibility checks.

## Failure responses
Privacy/card leak, reward duplicate, seat ghost/teleport duplication, signed artifact failure: disable admissions, protect existing game states, drain or recover, perform incident playbook. GPU failure: lower default quality/disable shader flags + route stable installer hotfix, communicate supported drivers. Browser web-lite failure does not interrupt native game sessions. Keep status/news via website even when game backend unavailable.

See `DESKTOP-PATCHING-DISTRIBUTION.md` and `DESKTOP-RELEASE-RUNBOOK.md`.
