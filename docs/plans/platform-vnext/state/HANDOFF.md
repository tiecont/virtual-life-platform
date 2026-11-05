# vNext current handoff

Updated 2026-11-05T23:33:26.827043+00:00; task N05-04 VERIFIED on `codex/vnext-n05-04-runtime-drain`. Base revision `82f0f187e50bd0f7cbf421ff484971248ae66dcf`; this task has its own reviewable commit after evidence finalization.

Added process-local RuntimeLifecycle so main stops new maintenance/SIGHUP admissions, settles complete admitted chains, closes app/owner, then pool within the existing12s shutdown budget. Same periodic chain cannot overlap; repeated stop is idempotent; deadline/close failure exits1 without successful-drain claims. Actual main SIGTERM passed clean blocked-read release and stuck-work deadline, with readiness503/liveness200 and owner release. Real API-role database-access outage leaves old sockets/owner fenced after access restoration and requires a new epoch/membership. Real progression outbox COMMIT settles before closure and restart preserves exactly2 reward rows/1 delivery without duplicates. Executable runtime-fault gate81 cases passed; full check passed60 governance,313 unit,574 integration and all workspace builds. Existing authority/business/38 SQL/versions/151-task ledger/gates preserved; initial TDD, new-test expectation and optional fixture typecheck failures retained and corrected.

[Actual checks](../audit/N05-04-CHECKS.json) / [evidence index](evidence-index.json). Counts: `{"VERIFIED": 24, "TODO": 45}`.

## Remaining gates

Hosted baseline Quality 42037215254 failed Deadline cadence (133.3 ms vs <100 ms); scoped local baseline passed without budget changes. Cause remains unresolved. Raw logs are private local artifacts until owner cleanup, not off-host archives. Historical 151 Mxx tasks/evidence and all public/restricted gates persist. No production/store release is authorized by code verification; platform distribution contexts remain false until actual supported distribution. N13/N14 are inactive.

## Next exact action

Reserve N05-05; use the existing hospitality/jobs transaction/account-lock seam, extract the progression completion sink into a room-free reusable ledger port if needed, and implement a separate durable worker bootstrap/config/DB lifetime that never calls createApp or constructs RoomAuthority/socket ownership. Keep room-bound maintenance in API, preserve default behavior/closed gates, add bounded retry/dead-letter controls and actual worker kill/resume/effect-receipt tests; implement worker:check before executing it, then run applicable full verification and checkpoint.

Continue dependency-ready tasks independently of external server/device/store inputs. Do not claim unattended background continuation.
