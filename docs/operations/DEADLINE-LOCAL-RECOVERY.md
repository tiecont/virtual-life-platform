# Deadline local migration and recovery

This runbook covers the owner-authorized offline integration. It does not authorize a production migration or public release. Original repositories, processes and databases remain independent. The selected source has guest/catalog HTTP and stored focus history, but no playable predecessor scene or focus service to restore.

## Compatibility and data

Use the pinned Deadline snapshot in `integrations/legacy-snapshots/deadline.json`, materialized separately by `pnpm legacy:prepare`. The tool checks source hashes, installs from the frozen offline cache with lifecycle scripts disabled, and builds the selected API separately. Its declared Node26.13.x differs from the current City Node26.9.0; recorded successful commands do not certify the declared runtime.

City migration0037 adds private association/retry tables; it does not modify or import source guest/focus rows. Association is optional, explicit possession proof. Names, avatars and roles never merge accounts. City accounts, membership and focus remain owned by their existing services. Preserve the additive tables and revision tombstones during rollback; dropping them could discard withdrawals and durable retries.

## Close and recover the local world

1. In an owned development/test flags file, set the existing `deadline` key to false. Reload through the existing flags manager; the running main process also has the established SIGHUP reload path. The M15-06 rehearsal directly executes `reloadFlags()` on the real manager, not a new production signal exercise.
2. Check the authorized catalog and own room: Deadline admission is unavailable and the previous membership is gone. Old epoch/membership commands must fail. An unknown result is not a successful departure. Other City identity/private focus endpoints remain available.
3. If the optional source association adapter is suspect, restart the owned City API with `LOCAL_DEADLINE_IDENTITY=0`. Existing association status remains readable and withdrawal requires no source cookie or working provider. The independent selected source API and history remain available.
4. Fix the candidate, re-enable only the owned local world flag and restart/reload as appropriate. Entry requires fresh authority and an explicit action; do not auto-seat. Verify the unchanged private timer deadline and source history. An old positive association receipt must not reverse a later withdrawal.
5. If uninstalling the world with `LOCAL_DEADLINE_WORLD=0`, also remove its key from that owned flags file, or omit `WORLD_FLAGS_FILE`. The strict registry rejects unknown world keys. World flag closure and module removal are distinct operations.

Do not drop tables, rewrite legacy IDs, restore real databases, or change an original source process as part of this procedure. Use isolated disposable data to rehearse it.

## Reproduce local evidence

Run `pnpm check` before browser execution, then `pnpm ci:browser legacy` against the built application. This group isolates every spec/device in its own database/API lifetime and validates result metadata. Run `pnpm bench:deadline` separately for the bounded API profile. Avoid rebuilding Next while browser servers are active.

The API profile uses40 real loopback Socket clients,30 occupied seats, simultaneous contention on one seat and a30second soak. Admission is staged; it is not a burst-admission or production capacity certificate. A private active timer must retain both its timestamp and SQL tuple version throughout the soak. After explicit departure, membership and seats must be zero before owned-process/database cleanup.

The separate browser profile uses one visitor per Chromium desktop/mobile emulation, CPU4x and40ms/12Mbps networking. It measures load/cache, idle renders, movement rAF gaps and forced-GC JS heap over three SPA remounts against unchanged scene budgets. It does not measure40 rendered actors, physical-device GPU memory or a production CCU ceiling. Native keyboard, selected text contrast,44px button targets and reduced motion are scoped observations; human assistive technology and complete WCAG certification remain outside this evidence.

All real rollout flags stay OFF. Source reuse approval, original project-authored scene provenance and passing local tests do not replace operator/public/media gates.
