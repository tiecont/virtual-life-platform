# ADR0043 — Immutable reward corrections

Status: local implementation; actual checks in m13-correction-checks.json.

Migration0025 adds one full compensating correction per original positive grant. A composite FK binds account and revoked amount to that grant; a unique grant key prevents duplicate deductions. UPDATE/TRUNCATE reject, while account erasure cascades both histories. Database administrators remain trusted.

ProgressionService.correct is a trusted in-process operation with at most8registered operator labels, empty by default. Labels identify trusted composition, not client authentication. No HTTP/socket route accepts corrections or arbitrary amounts. Real operator authentication/provisioning remains an operational gate. Strict input contains account/grant/request/fixed reason; amount comes from the grant. Exact retries return the same receipt across restart; changing the input or correcting a grant with another key conflicts.

Correction and entitlement reconciliation share the existing account advisory lock and SQL transaction. Failure rolls back both. Effective balance is gross grants minus corrections, nonnegative under SQL constraints. Below-threshold apron is revoked; saved preference may remain apron but fresh room snapshots resolve casual. Existing15second room reconciliation still applies; no dedicated correction push or new operator UI is claimed. Legitimate new work may unlock the apron again.

Original source IDs, original UTC-day caps, cooldown and partner budgets remain consumed after correction. Neither refund farming nor moving a completion to a later day creates more XP. Corrections never automatically follow refusal, blocks, reports or sanctions; those actions must not punish legitimate earnings.

Own progression/export adds awardedXp (gross) and negative corrections, with lifetimeXp now effective balance. Original positive history stays intact. This extends a strict prerelease response; bundled consumers are verified together, while older external strict readers require an upgrade. No actual legacy app consumes this endpoint. Histories are bounded100each with truncation; durable source/correction records last for account lifetime. Operator labels/fingerprints and engine source/peer identifiers are excluded from responses.

Rollback disables operator registration and reward policy/consumer, preserving history/private reads. Do not edit original grants, delete corrections, free source budgets or drop0025 to restore XP. Further restoration needs a reviewed compensating design. Default rewards/operators and all real-world flags remain OFF. No real-person anti-collusion, account-reset prevention or hostile-DB-owner certificate is claimed. Synthetic high-count SQL fixtures verify retention bounds, not runtime minting authority.
