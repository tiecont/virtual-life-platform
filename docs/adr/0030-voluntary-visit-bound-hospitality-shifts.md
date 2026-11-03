# ADR0030: Voluntary visit-bound hospitality shifts

Status: Accepted local implementation. Date:2026-11-03.

M11-03 replaces the production default-deny staff port with a concrete voluntary shift permission only when the trusted hospitality policy explicitly offers staffing. Worlds without staffing still deny. The injected internal port remains for trusted test/adaptor composition, never caller input. Voluntary service roles do not grant moderation authority, require cosmetics or confer paid attention.

Persist one open shift/account, binding it to current owner epoch, world, room, membership and policy version. Starting requires a currently connected authorized visit; clients cannot set role, duration or actor. Trusted policy caps room staff. Maximum shift duration is four hours. Own end works after leaving or world closure and atomically requeues ASSIGNED/PREPARING/READY work, increments order version and writes its receipt. Terminal end retries cannot end a later shift.

Room-owner-serialized maintenance observes actual aggregate connection state. One remaining tab preserves the shift. Last-connection loss retains assignment for the same15second room reconnect grace; reconnect before expiry restores permission. After grace, end the old shift and requeue the existing order with a new version; never clone an item. Missing visit, owner restart or four-hour expiry ends the shift. Old assignments/receipts do not reactivate work. A restart invalidates old room context; this does not invent a replacement room or automatically admit users.

Use a sequence-based fair checked order,20shifts per batch. A frozen clock or healthy oldest cohort cannot starve a later disconnected shift. main.ts runs maintenance every3seconds; endpoint reconciliation also invokes it. Batching may add delay under large populations, so15seconds is the earliest reassignment time,not a hard wall-clock service SLA. Close awaits in-flight maintenance before closing rooms/DB. PostgreSQL outage/lost authority denies progress and is not treated as proof of disconnection.

Start/end fingerprints and receipts are account-locked,with24new commands/hour and exact retries free. Receipt failures roll back both withdrawal/requeue. Own exports include at most100 shifts and truncation; account deletion cascades shifts/receipts. Bounded90day terminal order/shift cleanup deletes at most100 rows each plus receipt cascades. Defaults need operator retention approval before rollout. Migration0015 is additive; rollback disables staffing/flags and preserves data.

M11-04 workflow actions,05 completion/outbox,06 service refusal/block/sanction and abandoned-customer cleanup remain pending. In particular,requeue cannot make an old ephemeral room serviceable after restart; M11-06 must give stranded customer requests a safe withdrawal/expiry path. No hospitality UI,real Maid gameplay or public rollout is implied. See m11-shifts-checks.json for actual checks and retained initial404 acceptance failure.
