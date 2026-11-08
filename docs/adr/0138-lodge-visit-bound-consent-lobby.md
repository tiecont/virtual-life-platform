# ADR 0138 — Visit-bound Lantern Lodge lobby

Status: accepted and N15-03 VERIFIED for the local lobby foundation; see source-bound acceptance audit.

One default-off original Lodge world consumes existing WorldRegistry, RoomAuthority, safety, chat and travel. Room capacity is eight. One table per exact room, mode caps six/six/eight and minimums two/three/four. Room seating never grants game consent. Installation, world enablement and lobby activation are independent; production refuses local controls. Existing catalog and export shapes remain unchanged when off.

N15-03 uses bounded ephemeral waiting-room consent, like existing study sharing. A process restart withdraws all readiness. It cannot deal, start games or mint durable active-match claims; N15-04 must provide encrypted journal and durable claims before any concrete mode runs. This avoids treating a room visit as an accepted match. A single serialized lobby queue enforces one waiting table per account without holding the global RoomService queue over relationship reads. Every entry uses an authenticated exact-room lease and a fresh lease after awaited checks. Withdrawal works independently of room/turn context. Logout, privacy changes, contact withdrawal and expired visit leases revoke consent.

Anonymous seat and readiness sharing requires explicit consent. Table DTOs contain no other account IDs, profiles or presence details. A block hides the table and revokes both participants; spectators remain closed. Strict input schemas reject actor overrides, implicit joins and spectator commands. Stale generations cannot operate on a replacement table. Joining/leaving clears readiness so quorum never implies consent to a changed group. Ready-check does not start a game.

The scene is project-authored geometry rendered with the existing shared 3D animal renderer. There is no new avatar catalog, physics/game engine or world persistence repository. Existing landscape/appearance owners remain authoritative. This technical study is not final art, physical Android qualification or a public release approval.

The browser keeps the retained visit binding across RoomRecovery's periodic snapshot resync. Join/Ready are disabled while that snapshot is unconfirmed; withdrawal and already committed lobby replies are not discarded solely for a brief sync. A real membership/account change still aborts old requests and clears the table view. Browser evidence must cross the actual periodic snapshot, not just an immediate click sequence.

Rollback: turn off local lobby and world controls. Keep additive contracts; no database migration or retained-data mutation in this slice. Durable restart/idempotency/fairness guarantees belong to N15-04; final shared game shell remains gated by N06-09.
