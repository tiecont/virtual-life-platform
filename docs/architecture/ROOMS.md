# Authoritative rooms v1: M06 work in progress

Initial allocator: apps/platform-api/src/rooms/service.ts, one process/owner, per-instance epoch UUID, bounded room/membership/receipt maps and serialized command queue. Shipped sandbox capacity:8. This slice does not register actual worlds or authorize release. M06 is not complete.

Socket events reuse the origin/CSRF/cookie identity gateway. room.join, room.leave and room.snapshot require strict schemas/ACKs and real PostgreSQL session checks for every command. No accountId/role authority accepted. Max pending per socket:8; existing transport/session command budgets apply. Unknown events disconnect. No arbitrary world command passthrough.

room.join contains schemaVersion:1, requestId, worldSlug, exact worldVersion/sceneVersion, optional roomId. Without target prefer occupied rooms with free capacity; create at most 32/world,128/process. Serialized allocation adds provisional membership before SDK onJoin, authorized by this owner. Failure/disconnect/world generation change rolls back. Full specified target returns ROOM_FULL. A different current room returns ALREADY_IN_ROOM; safe handoff is M09.

One account owns one room membership across authenticated tabs/sessions. Duplicate join receipt returns current snapshot only while that membership exists; never resurrects a left membership. Changed input/session key reuse returns IDEMPOTENCY_CONFLICT. Process-local receipts:5-minute TTL,10,000 cap. Restart loses runtime state/receipts; fresh epoch and explicit rejoin required. No persistent domain transaction guarantee is claimed.

room.snapshot/room.leave require requestId, epoch, roomId,membershipId matched to connection/account/session; foreign IDs/old epochs denied. Initial snapshot has own accountId/membership, room/world IDs, capacity, aggregate occupancy, roomVersion; no peer profiles/seats. GET /v1/worlds/:slug/rooms applies session/world access, no-store/rate limits and aggregate-only output. Disabled world:WORLD_UNAVAILABLE; unknown/unauthorized:NOT_FOUND.

Leave removes all tabs' membership and emits room.ended. Disconnect removes that connection; final disconnect removes membership immediately in this slice. Logout/rotation disconnects via existing identity gateway. World disable/offline immediately invalidates admission generations, then removes rooms and emits room.ended. Empty rooms evict after 60 seconds on command/maintenance sweep (main maintenance every 5 minutes). Maps bounded, no simulated players. Shutdown closes transports and discards state. No DB migration.

Pending M06-02..07: seats/grace, peer presence with privacy/block filtering, deltas/client gap recovery, reconnect/restart UX, measured network benchmark/budgets and single-owner split-brain rejection. No scene/chat/movement/travel success claimed. Disconnected hook cleanup and lifecycle deadlines remain to address; current sandbox holds no per-player resources.
