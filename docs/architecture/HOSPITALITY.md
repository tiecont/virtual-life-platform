# Shared hospitality engine

M11-02 provides new city APIs; it does not replace or call legacy Maid routes. All real world flags remain OFF. Only an explicit trusted world definition with hospitality capability and matching policy can admit orders.

## Implemented Core

POST `/v1/orders` requires an authenticated connected membership, owned seat, exact owner epoch/room/membership, trusted item and policy version. One account has at most one nonterminal customer order across worlds. Trusted policy bounds room queue and active staff work. Clients cannot choose customer, assignee, role, phase, timestamps, price or reward.

POST `/v1/orders/:id/claim` atomically moves PENDING to ASSIGNED with expectedVersion. POST `/v1/orders/:id/cancel` allows only the customer of a PENDING order. Both require current membership in the origin room. The seven-phase model rejects illegal transitions, but prepare/ready/serve/complete endpoints are not implemented by M11-02. No completion/reward event is emitted.

Staff authorization is an injected internal port defaulting to deny. Integration fixtures grant synthetic account IDs; this is not an HTTP privilege route or real staff provisioning. M11-03 supplies voluntary shifts and disconnected-work recovery. Role labels and avatars grant no authority.

The room owner serializes live authorization/capacity with room changes, captures world generation before awaited authorization and checks owner/session/membership/generation before commit. SQL transactions reauthenticate under sorted identity account locks, lock order rows, validate versions/phases and persist changes plus mutation receipts together. A failed receipt insert rolls back the order. Twenty concurrent actual TCP claims yield exactly one assignment/version increment/claim receipt. This is single-owner PostgreSQL behavior, not distributed fencing.

Mutations require Origin, CSRF and UUID Idempotency-Key. Fingerprints reject changed input under the same key. Exact place retries observe the existing private result after restart without creating membership or orders. New mutations require live source; historical receipts cannot authorize new visits. New mutations30/minute/account and placements12/hour/account are durable limits; exact retries reuse receipts. HTTP/session/IP bounds also apply.

## Privacy And Safety

GET `/v1/orders/:id` is customer/current-assignee only. POST `/v1/orders/queue` requires current origin-room staff authorization and returns at most50 pending/own-active rows plus truncation. Bilateral block filters queues and rejects new claims. Participation is exposed as mine/assignedToMe booleans; raw customer/staff IDs, source grants, fingerprints and secrets are absent. Request logging redacts order IDs and queries. No free text, paid service, attention tips or romantic-service requirement exists.

Own export is bounded100 with truncation. Customer erasure cascades orders/receipts. Staff erasure requeues pre-serve work with a new version and clears identity; served/completed rows involving erased staff are removed. M11-03/06 must implement disconnect/withdrawal/sanction reassignment and stale assignment protection. Current safety admission is enforced, but this alone does not establish M11-06 service refusal. No hospitality UI is claimed here.

## Persistence And Rollback

Additive0014 creates engine_hospitality_orders/mutations with account FKs, state checks, one-active-customer uniqueness, queue/assignee indexes and creation order. No FK references ephemeral room memory or legacy data. Critical state survives restart; old memberships do not. Stranded work recovery is M11-03; bounded terminal retention is required before rollout. Local defaults require operator review.

Rollback disables hospitality adapters/flags while preserving tables and private exports. Do not drop user data or apply city migrations to legacy DBs. No legacy conversion, rollout enablement or public release occurred.
