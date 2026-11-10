# Agent 2 CI Correction Reservation Request

Owner request: continue the full Desktop First plan. Agent 2 remains the
independent reviewer and Unity/frontend owner. This file requests coordination;
it is not a reservation and does not change live task status.

## Immediate Coordinator Action

1. Ingest `reviews/VL-016-v3-ci-final-agent2.json` through
   `requestChanges('VL-016', reviewRef)`. Keep all earlier approvals/rejections.
   Quality run `42767086757` at `aca14de` has now completed with failure;
   required hospitality, rendering and legacy jobs failed.
2. Issue an explicit bounded source-write reservation/grant for Agent 2's browser
   correction assistance, or apply the correction as coordinator and return its
   committed source for independent review. Agent 2 will not assume either.
3. Reconcile the existing reservation of `verify-adoption.mjs` in VL-016 before
   modifying it for VL-013 migration 0049. Do not overlap task reservations.

## Requested Browser Scope

- `tests/e2e/lodge-lobby.spec.ts`: split the four viewport/200-percent cases
  from the keyboard/delayed-ACK/periodic-sync flow. Keep all original assertions
  and the 60-second per-test budget.
- `tests/e2e/scene-performance.spec.ts` and `tests/support/scene-profile.ts`:
  investigation only initially. Any implementation change must follow actual
  cause attribution. Keep the CPU4x profile, sample requirements and p95 bound.
- `tests/e2e/maid-acceptance.spec.ts`: persist raw cadence before assertions and
  arm the observer before movement. Hosted zero-positive-sample cause remains
  unproven. Keep all existing budgets, real command and lifecycle assertions.
- New evidence summaries under `docs/execution/desktop-first/web-compatibility/`.

Concrete, unapplied Lodge candidate:
`artifacts/desktop-first/vl016/agent2-ci-followup/proposed-lodge-lobby-split.patch`.
Its hash and actual hosted trace findings are in the published CI review.

Final evidence is in `reviews/VL-016-v3-ci-final-agent2.json`. Local scene
profiling records traced p95=100ms (FAIL) versus trace-off p95=49.9ms with no
compositor CopyOutput events (diagnostic PASS only). This single comparison
supports further recording-overhead investigation; it does not authorize
changing the required recording profile or waive the hosted400ms failure.

## Work Allowed While Awaiting Reservation

Agent 2 continues read-only source inspection, original-source execution,
independent ignored diagnostic probes, CI evidence retrieval and review files.
No Unity/Next/Rust source or scheduler/reservation edits are authorized by this
request. The immutable 110-task graph/baseline, legacy ledgers and private owner
files remain untouched. A new implementation author must receive a separate
independent review; this request does not self-approve proposed changes.

Next exact action: coordinator issues the bounded source reservation after
recording the CI rejection; Agent 2 then applies and verifies the correction.
