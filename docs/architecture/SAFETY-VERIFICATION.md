# Local Safety Regression Scope

M08-06 verifies the implemented local M08 workflow. Evidence: `docs/agent/evidence/m08-regression-checks.json`. All real/public worlds and production reporting/chat remain closed. No real moderator has been provisioned. Passing these checks does not approve staffing, privacy policy or a public release.

## Language and False Positives

`tests/fixtures/chat-moderation-corpus.json` contains 31 named synthetic examples. Unit tests check exact local decisions; real Socket.IO tests check pre-broadcast outcomes, authoritative sender identity and absence of automatic cases/sanctions. Eleven curated greetings/thanks/help phrases pass after accented/unaccented, decomposed/fullwidth, zero-width and whitespace normalization. Twenty examples are rejected or withheld: explicit abuse, contextual quotations, unfamiliar benign language, obfuscation, contact disclosure, markup and controls. Invalid text returns INVALID_REQUEST; reject/review both return CONTENT_REJECTED without broadcast. Canned help/thanks remains available after a withheld message.

This corpus is a regression fixture, not a representative language evaluation or a classifier quality score. The local allowlist deliberately withholds benign language outside its list. The ambiguous abbreviation `dm` can trigger a lexical false positive. Unknown evasions stay withheld without being classified as guilt. Context requires independent human review; no unreviewed classifier decision issues a sanction. Nickname impersonation/semantic moderation, broad multilingual coverage and an actual operated review queue are still public activation limits.

## Runtime Matrix

| Boundary | Actual regression evidence |
| --- | --- |
| Shared abuse budgets | Two separately signed-in sessions, concurrent quick actions, two-in-flight/account and six/10s window, sequential quota fill, denial in both sessions, recovery after trusted clock advance; existing socket/global worker/queue bounds retained |
| Confidential current authority | Already-open appeal becomes unreadable/unreviewable after reassignment, grant expiry or session revocation; incident operations also denied without current authority; no disposition/audit mutation on denial |
| Independent false-positive reversal | Scoped distinct assigned reviewer, authentic nonexpired context, terminal retry/conflict, no reactivation of revoked restriction, target receives controlled outcome only; M08-05 actual desk flow on desktop/mobile |
| Audience and interruptions | Existing actual block/privacy/delayed moderation, sanction commit, closure, missing-key restart and fresh-admission guards; all included in full integration run |
| Log privacy | Shared request serializer strips query filters and safety receipt/case/sanction/appeal IDs, omits cookies/body; new appeal review route is covered |
| Evidence lifecycle | Existing TTL denial, bounded evidence/note purge, conservative identity erasure, key failure and SQL append-only tests; not approved metadata retention/legal-hold compliance |

## Measured Profile

Linux/Node26.9.0/pnpm11.28.5, disposable local PostgreSQL, sequential loopback Socket.IO/HTTP. Corpus tests advance a synthetic clock between samples to isolate moderation from rate windows. No WAN, sustained load, external moderation vendor or physical browser device was measured.

The recorded 31 socket ACK samples had p50 6.577ms, p95 22.017ms, maximum26.804ms. A separate nonsettling-provider sample returned MODERATION_UNAVAILABLE after506.022ms against the500ms provider deadline; the local regression ceiling is1500ms. The underlying worker slot remains occupied until the provider settles; no late success is broadcast. These are local regression measurements, not a production SLA.

Actual TCP HTTP final samples, one per operation: assigned case read20.135ms, mute issuance21.844ms, own decisions7.887ms, appeal intake11.481ms, independent revoke15.397ms, world closure11.913ms, independent recovery12.359ms. Client deadline2500ms bounds this synthetic check. The check confirms committed mute/revoke effects through actual chat commands, zero memberships at closure acknowledgement, eventual room.ended delivery, no automatic membership restoration and successful fresh admission. It does not assume ordering between TCP streams or compute a percentile from one sample/operation.

## Remaining Gates

M18-05 adds an own reservation-invitation contact source,reportable within24hours without entering a room or obtaining a hidden profile. Existing encryption,private receipt,assigned/scoped registered review,budgets and audit apply. Report evidence identifies the invitation/reservation internally;it establishes no room proof and room-eject rejects it. Offer-based Block resolves only an authenticated own counterparty through the Social owner. Integration verifies foreign denial,post-block reporting,idempotency,assigned evidence access,no automatic sanctions,24hour expiry and erasure. The request logger also redacts the new nested offer IDs;the privacy regression failed before the serializer fix and passes after it. Actual commands/results are in m18-private-checks.json;this supplies no real staff coverage or public reporting activation.

Task verification covers the implemented local behavior. Metadata TTL/holds and case closure, privacy-owner DSR/legal basis, audit archival/pruning, staff/contact/coverage, evidence key rotation/restore, release operations and independent human review remain explicit external or future runtime work. Draft case90day/audit180day/appeal90day settings are not active metadata jobs. No indefinite hold exemption or unreviewed audit-delete endpoint was added. Actual travel requires M09 guarded admission and failure tests; real legacy integrations still need stable revisions and rights review. Single room owner/trusted-hook lifecycle limits remain. W1 is incomplete.
