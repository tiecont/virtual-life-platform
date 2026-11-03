# ADR 0014: confidential reports and assigned-case access

Status: local M08-03 implementation; verification tracked in task-state.

The audit found identity transaction/export ports, account deletion with FK cascades, bilateral blocks and authoritative viewer-specific room projections. No report store, staff identity grant, evidence encryption or case audit existed. Add a platform safety owner rather than world-specific report tables. Add a private deletion-owner port so explicit deletion and guest expiry cannot strand identifiable encrypted evidence.

Require a separate stable local AES-GCM key and fail closed without it; production remains closed. Store minimal encrypted allegation evidence with a confidential receipt, scoped registered staff grants, explicit assignment, self-conflict denial and database append-only audit. A moderator's access depends on current assignment/world/grant, not a client role or being an admin alone. Provide no self-promotion route and create no real staff accounts. Durably deduplicate intake/assignment and count account-wide report limits without treating claims as findings.

Capture only authorized live room context or server-authored approved message references. Optional encrypted volatile message evidence is bounded/short-lived and never durable ordinary chat history. Fresh blocks do not erase a recipient's existing report reference. Message retention is a deliberate opt-in change when local report encryption is configured, documented explicitly instead of promising zero memory retention.

Conservatively erase associated evidence on account deletion/guest expiry and unlink account FKs while preserving non-body audit. This trades future investigatory context for local privacy and is not a reviewed public/legal-hold policy. Enforce draft evidence expiry and bounded purge; defer metadata retention/holds and reviewed DSR/operations to M08-06. Document single-key/DB-owner/volatile-delivery limits. All real/public rollout gates remain OFF. See REPORTS.md and actual verification evidence.
