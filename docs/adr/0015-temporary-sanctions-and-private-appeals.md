# ADR0015: Temporary Sanctions and Private Appeals

Status: local implementation; verification evidence is tracked in M08-04 checkpoints. Public activation is not authorized.

Audit found that assigned case access, encrypted evidence, identity transaction hooks, registry authorization and the single-owner room queue already exist. Extend those boundaries instead of adding a parallel authority system. Derive sanctions from reviewed cases and require a reason, policy-allowed severity/kind and bounded duration. Keep reasons encrypted and target responses limited to safe controlled summaries.

Use PostgreSQL for lifecycle, expiry/revocation and durable idempotency; query committed policy at admission and chat edges independently of evidence-key availability. Serialize the transaction commit and room interruption with final chat publication and joins in the existing room queue. Preserve session access for appeal/export/delete while banning world access. Reversal requires a distinct currently assigned reviewer; platform ban and staff-subject action require safety-admin. Permanent bans are absent until independent-review design and operational approval exist.

Use existing room-ended semantics and an own-account refresh-only sanction.changed signal. Expiry does not revive memberships. Bounded encrypted appeal intake gives a durable receipt without exposing reporter details. Moderator review/disposition remains M08-05, metadata retention and privacy-owner approval M08-06. No automatic classifier sanctions, real staff provisioning, public release or multiple-authority guarantee is implied.

The100-session regression exposed unnecessary recipient projections for disconnected/unobserved connection IDs. Delta subscriptions now declare connection interest; explicit snapshots and authoritative membership/capacity remain unchanged, and connected socket privacy/delta regressions remain required. This avoids generating undeliverable snapshots without weakening test timeouts or production limits.

See [SANCTIONS](../architecture/SANCTIONS.md) for API, scope, concurrency, retention and rollback limitations.
