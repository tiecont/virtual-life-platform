# ADR0029: Atomic shared hospitality core

Status: Accepted local implementation. Date:2026-11-03.

M11-01 found menu/schema/contracts but no running legacy order/shift service. Implement the city engine independently through strict contracts and trusted per-world policy, preserving legacy repositories and reserving actual adapters for M16/M18/M19.

Use the existing room owner to serialize current source authorization/capacity, and account-locked SQL transactions, row locks, expected versions, one-active-customer uniqueness and durable fingerprints/receipts for place/claim/cancel. A trusted staff port denies by default; voluntary shifts are the next slice. Client roles/clothing grant no authority. Model transitions are not implemented gameplay endpoints.

Participant reads and bounded queues expose booleans rather than account identifiers. Origin/CSRF, blocks, current world safety/generation and own export/erasure apply. Staff erasure requeues pre-serve work instead of removing the customer's request; served/completed records involving erased staff are removed. No payment, free text, reward or public activity feed exists.

Rejected alternatives: in-memory assignment loses critical state on restart; client authority cannot resolve races; copying an absent legacy handler establishes no compatibility. Multi-owner scaling needs fencing. M11-03/04/05/06 own shifts/recovery, menu/workflow, completion/outbox and refusal/safety. This core alone does not justify rollout.

Evidence: m11-core-checks.json. The49 model cases and actual TCP20staff contention are distinct scopes. Earlier m11-core-red.log contains passing model tests, not a red-first failure. Migration0014 is additive; rollback disables adapters and preserves data.
