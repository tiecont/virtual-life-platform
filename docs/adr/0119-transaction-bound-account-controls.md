# ADR0119: transaction-bound operator account controls

Date:2026-11-06. Status:accepted for the N07-03 account vertical slice; remaining task scope is incomplete.

Reuse the singleton operator's lock/session boundary and the identity owner's account lock namespace. Trusted server control ports run business effects and immutable audit under the same transaction, verify fresh elevation before and after work, and publish notifications only after successful COMMIT. A replay reconciles live sockets from canonical session state after uncertain acknowledgement, without replaying mutations or revoking new credentials. Business lock/statement timeouts apply before operator lock acquisition. No browser-supplied principal, SQL, shell, arbitrary callback or service credential grants interactive authority.

Identity owns account status, session revocation and a separate versioned/idempotent command receipt. Default-active additive columns preserve existing behavior. The only actions are suspend/resume/revoke with fixed reason codes. Resuming never restores old sessions. Original session/room/safety/progression owners retain their transaction and publication semantics; a committed identity notification closes real sockets through the existing gateway.

Minimize operator account projections and retain no raw target/profile/contact/token in immutable audit. Use keyed target references, bounded state snapshots and chained HMAC receipts. Existing authenticated owner export/deletion remains separate. Suspended-owner privacy recovery and retention qualification, event controls and durable runtime switches remain unfinished N07-03 work and cannot be marked VERIFIED by this slice.

Migration0040 remains additive with strict40 runtime compatibility. Preserve all earlier SQL/checksum evidence and never widen an old image's compatibility window without actual qualification. Production/public operation and real operator provisioning remain gated.
