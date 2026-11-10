# Live Coordination

The owner assigned Agent 1 as coordinator and Rust/backend architect on
2026-11-10. The surrounding package remains an immutable planning baseline.

- `live-state.json`: runtime status for all 110 VL tasks; Agent 1 is sole writer.
- `reservations/`: coordinator-issued task, branch/worktree and path ownership.
- `handoffs/`: exact source SHA, actual checks and acceptance limitations.
- `reviews/`: independent Agent 2 review of the exact handoff hash and source.
- `blockers/`: missing inputs and decisions; never implicit approvals.

Run `node scripts/desktop-scheduler.mjs status agent1` from the repository root.
Agent 2 can use `status agent2`. The exported coordinator API serializes mutations
using an exclusive directory lock; abandoned locks require inspection. Dependency,
lane, external-gate and overlapping-path checks fail closed. Reviews cannot be
authored by the task owner. No successor is READY while its prerequisite remains
IN_REVIEW. Review files are requests/results, not permission for public deployment.

Do not edit `../06-execution/STATE.json` or `../FILE-MANIFEST.json`. Do not run the
baseline `next_task.py` as the live scheduler; it intentionally shows baseline TODO.
Only Agent 1 changes live state. Agent 2 may audit read-only and place review files
here before requesting a source reservation. No Unity, frontend or visual files
are reserved by Agent 1 during VL-001.

See `docs/execution/desktop-first/README.md` for legacy evidence mapping and the
N06-04 handoff. Existing mobile deferrals do not constitute Windows qualification.

Source evidence must name committed repository files: submit/verify resolve the
exact Git commit and check each artifact's SHA256 against that commit. Load repeats
the gate for VERIFIED tasks. Later source edits do not change historical evidence;
private raw logs are linked through committed summaries. Required commands must
exit 0; optional diagnostics use `required: false` and an explicit `limitation`.

For CHANGES_REQUESTED, the coordinator uses `requestChanges(taskId, reviewRef)`.
It preserves hashes of the rejected handoff/review in `attempts`, reopens the
existing reservation, and requires a new immutable handoff path for resubmission.
Do not overwrite any published handoff or independent review.

After a committed partial slice, the coordinator may call
`narrowReservation(taskId, paths, reason)` on RESERVED/IN_PROGRESS work. Paths
can only shrink inside the previous scope. The task stays open; a new mirror
records the reason and hashes every prior mirror, which load checks unchanged.
Released shared paths can then be reserved by another READY task. Scope expansion
and changes during review are rejected; this does not waive acceptance or review.
