# Desktop native event/command compatibility contract (illustrative, not production .proto)

`ClientHello {protocolVersion, clientBuild, catalogHash, platform:"windows", capabilities, worldTicket}` → `ServerWelcome {worldId, zoneId, authorityEpoch, serverTick, snapshotHash}`. Each command includes session-scoped `commandId`, `expectedVersion` where applicable and never client-authored damage/reward/position authority.

- `MoveIntent {seq, axes, jump?, sprint?, clientTime}` → `WorldDelta {serverTick, actorId, verifiedPos, stateFlags}`; preserve local prediction/interpolate others.
- `NavigateTarget {commandId, poiId|worldPoint}` → `PathAccepted {routeId, legalWaypoints, region}` or `PathRejected {reason}`. Client never teleports to arbitrary coordinate by this.
- `Interact {commandId, objectId, verb}` → `InteractAck {status, anchorId, activityId, version}`.
- `SeatHold {commandId, tableId, chairId}` → `SeatReceipt {leaseId, expiry, actorAnchor}`; `SeatCommit`/`LeaveSeat` idempotent.
- `PrepareTravel {commandId, targetPoi}` → `TravelReady {holdToken, contentCatalogId, expiresAt}` → `CommitTravel` → `TravelReceipt {newZone, epoch, spawn}`; timeout cancels, no ghost sessions.
- `GameAction {commandId, matchId, expectedVersion, action}` → `GameProjection {matchVersion, publicState, privateForRecipient}`; spectator never gets hidden hand.
- `RewardReceipt {id, sourceMatch, status:pending|confirmed|rejected}` comes from Rust / platform settlement, client displays but never invents.
- `EmoteIntent {emoteId}` → broadcast semantic emote plus serverTick; detailed face/ear/tail animation client-local.

Native clients must use generated stable bindings from `05-contracts/rpc/game-runtime.proto` and discover whether legacy room implementation is Nest or Rust by signed join ticket; never blindly route across owners. Treat this file as design spec requiring new protobuf review before merge.
