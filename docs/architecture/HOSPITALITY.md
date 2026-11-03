# Shared hospitality engine

M11-02 provides new city APIs; it does not replace or call legacy Maid routes. All real world flags remain OFF. Only an explicit trusted world definition with hospitality capability and matching policy can admit orders.

## Implemented Core

POST `/v1/orders` requires an authenticated connected membership, owned seat, exact owner epoch/room/membership, trusted item and policy version. One account has at most one nonterminal customer order across worlds. Trusted policy bounds room queue and active staff work. Clients cannot choose customer, assignee, role, phase, timestamps, price or reward.

POST `/v1/orders/:id/claim` atomically moves PENDING to ASSIGNED with expectedVersion. POST `/v1/orders/:id/cancel` allows only the customer of a PENDING order. Both require current membership in the origin room. The seven-phase model rejects illegal transitions, but prepare/ready/serve/complete endpoints are not implemented by M11-02. No completion/reward event is emitted.

Staff authorization uses durable voluntary shifts only when the trusted policy explicitly offers staffing; otherwise it denies. An injected internal port remains for trusted test/adapter composition,not HTTP privilege input. Role labels and avatars grant no authority. Service shifts are separate from safety moderator privileges.

The room owner serializes live authorization/capacity with room changes, captures world generation before awaited authorization and checks owner/session/membership/generation before commit. SQL transactions reauthenticate under sorted identity account locks, lock order rows, validate versions/phases and persist changes plus mutation receipts together. A failed receipt insert rolls back the order. Twenty concurrent actual TCP claims yield exactly one assignment/version increment/claim receipt. This is single-owner PostgreSQL behavior, not distributed fencing.

Mutations require Origin, CSRF and UUID Idempotency-Key. Fingerprints reject changed input under the same key. Exact place retries observe the existing private result after restart without creating membership or orders. New mutations require live source; historical receipts cannot authorize new visits. New mutations30/minute/account and placements12/hour/account are durable limits; exact retries reuse receipts. HTTP/session/IP bounds also apply.

## Privacy And Safety

GET `/v1/orders/:id` is customer/current-assignee only. POST `/v1/orders/queue` requires current origin-room staff authorization and returns at most50 pending/own-active rows plus truncation. Bilateral block filters queues and rejects new claims. Participation is exposed as mine/assignedToMe booleans; raw customer/staff IDs, source grants, fingerprints and secrets are absent. Request logging redacts order IDs and queries. No free text, paid service, attention tips or romantic-service requirement exists.

Own order/shift exports are independently bounded100 with truncation. Customer erasure cascades orders/receipts. Staff erasure requeues pre-serve work with a new version and clears identity; served/completed rows involving erased staff are removed. Shifts and their receipts cascade. Current safety admission is enforced,but M11-06 interaction refusal/block/sanction reassignment remains pending. No hospitality UI is claimed here.

## Persistence And Rollback

Additive0014 creates engine_hospitality_orders/mutations with account FKs,state checks,one-active-customer uniqueness,queue/assignee indexes and creation order. Additive0015 creates shifts/mutations plus fair recovery sequence. No FK references ephemeral room memory or legacy data. Critical state survives restart;old memberships do not. Maintenance removes at most100 terminal orders/100 ended shifts older than90days per batch with receipt cascades. Local defaults require operator retention review.

Rollback disables hospitality adapters/flags while preserving tables and private exports. Do not drop user data or apply city migrations to legacy DBs. No legacy conversion, rollout enablement or public release occurred.

## Voluntary Shifts And Recovery - M11-03

POST `/v1/staff/shifts` requires strict source/policyVersion and Idempotency-Key. Only explicitly offered voluntary staffing admits a shift;one open shift/account and per-room staff cap are enforced. Duration is server-set four hours. GET `/v1/staff/shift` privately reconciles and returns one's latest shift or null. POST `/v1/staff/shifts/:id/end` uses strict schemaVersion-only body,Origin/CSRF/key and own account authorization;no live room is needed to withdraw. It atomically clears pre-serve assignments,requeues existing orders with increased versions and persists the receipt. New terminal-end keys are still charged against24commands/hour. Exact retries do not reactivate old shifts or end a newer shift.

Shifts bind epoch/room/membership/policy and require a connected current visit for staff commands. A remaining tab preserves authority. Last-tab disconnect interrupts service;the original assignment survives the15second room grace. Timely reconnect resumes the same shift. Expiry,missing visit,restart or grace timeout ends/requeues with version invalidation. Actual TCP/socket tests cover20staff competition using real voluntary shifts,not injected grants. Old-room context after restart is not a new admission;stranded customer withdrawal/expiry remains M11-06.

Fair recovery observes at most20shifts/batch under the room owner and account/row locks,using a SQL sequence rather than clock equality. main.ts schedules it every3seconds and relevant endpoints also reconcile. Batching/DB outages can delay observation;15seconds is an earliest timeout,not a guaranteed realtime SLA. Shutdown awaits in-flight work. Served/completed work is not requeued;later completion semantics remain M11-05. ADR0030 records the limits.
