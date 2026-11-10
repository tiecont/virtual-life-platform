# VL-016 continuation: invitation clock and immutable scene rendering

VL-016 remains open until its new committed source passes the required aggregate
Quality workflow and a separate source-bound audit. The previously published
handoffs, failed runs and reviews remain immutable. VL-019 is already VERIFIED at
`ba3aad32b63c820aeeb0a93457f7be234beb3805` with exact Rust workflow
`42799463304`; it does not waive VL-016's Quality gate.

## Invitation failure

The retained deterministic real-PostgreSQL regression advances the trusted clock
by one millisecond per read. Before the fix, group creation returns HTTP 503:
`created_at` and `expires_at` came from different reads, so their difference can
exceed the existing two-minute SQL constraint in `0011_invitation_groups.sql`.
Both timestamps now derive from one instant. No historical SQL bytes, lifetime
limit, invitation consent, rate budget or idempotency rule changes.

The regression requires HTTP 201, validates the full `InvitationGroupSchema`,
checks an exact 120000ms root lifetime, and confirms both child expirations stay
within the root deadline. The existing retry/expiry scenario now asserts HTTP
status and schema before using the response, preserving a bounded error code on
failure instead of obscuring an HTTP error with an `items` TypeError. Only the
test clock is injectable through the existing test composition.

## Browser failures

Quality `42799463520` at `ba3aad3` has successful core, image and five browser
groups but fails three groups. Study observes only three distinct path positions
against the unchanged requirement of more than four. Rendering measures a
216.6ms rAF p95 gap and Maid measures 233.3ms against the unchanged 100ms limit.
These are actual retained failures; no aggregate success is inferred.

Movement observation is installed in the page before dispatching the command.
It records raw timed positions and completion before assertions; path walkability,
distinct-position and final-position requirements remain. Every exit disposes
the observer, timer and Playwright handle. This removes observer setup round
trips from the movement interval without claiming they explain every hosted
failure.

Immutable scenery now belongs to a single cached Pixi container at the renderer's
existing pixel resolution. Seats, hit targets and people remain live siblings.
The installed Pixi container destruction path destroys its render group; the
existing scene teardown still owns all children. The cache reduces repeated
static geometry/text drawing while retaining camera scaling, resize and input.
No renderer selection, CPU throttle, network profile, duration, percentile,
minimum sample count or performance budget is changed by this correction.

## Evidence and remaining gate

Fresh continuation results and raw-log SHA256s are recorded in
`CONTINUATION-CHECKS-2026-11-10.json`. Private logs live under
`artifacts/desktop-first/vl016/continuation-20261110/`. Earlier clock red/green logs
and the three failed hosted job logs are retained separately with hashes.
Local browser evidence uses unique `ci/local/vl016-continue-*` scopes and never
overwrites historical measurements. This is local Chromium compatibility work,
not Unity/Windows/GPU acceptance. Hosted CI at the final committed source and
the owner's explicitly non-independent sequential audit remain required.
