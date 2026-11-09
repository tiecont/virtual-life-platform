# Game session contract v1 — API, socket, privacy

**Planning specification, not implemented.** Names and DTOs are proposed; do not freeze on client before contract tests/ADR. All game-specific DTOs must live in `packages/contracts`, not repeated in mobile/web/client and API.

## Public vs private vs internal views

| View | Allowed fields | Never include |
|---|---|---|
| Lobby directory | mode, sessionId opaque, participant count/cap, join policy, state, time-left band | private accounts, hand/card/role, secret target, joined users hidden by privacy |
| Match public | phase, current-turn actor display as policy allows, card count per seat, public discard/pile, board tile, score, rule version, deadline, stateVersion | raw deck order, hand, hidden role, unchallenged claim identities, RNG seed |
| Own private | public + own hand IDs/symbols, own role and any explicitly authorized private facts, legal action hints | any other account hand, other role, central hidden target except intended mist role |
| Spectator | public subset, possibly delay/hide account names | private fields, server internals, moderation/report details |
| Operator metrics | counts/latency/denials by mode, stale/source status, version/digest | secret game state, individual role, card IDs, personal chat |
| Internal persistence | encrypted full authoritative state + hashed metadata for integrity | secrets in plain log or telemetry |

## Endpoints / events (proposed)

| Route/event | Purpose | Authority notes |
|---|---|---|
| `GET /v1/game-tables` | filter tables in current authorized Lodge room | no hidden lobby discovery; bounded pagination |
| `POST /v1/game-tables` | create table (idempotent) | identity+current room+policy, game flags |
| `POST /v1/game-tables/:id/join` | join as participant; spectator mode reserved/disabled in v1 | capacity, one-active-match/account, block, current room |
| `POST /v1/game-tables/:id/ready` | consent to start | private current account only |
| `POST /v1/game-tables/:id/leave` | leave/forfeit | clears own table seat, not world room membership automatically |
| `GET /v1/game-matches/:id/view` | server-projected current view | independently redacted own/public/spectator; ETag/version |
| Socket `game.command` | command envelope | game turn/phase/auth/version/idempotency |
| Socket `game.public.delta` | room/table subscribers | public projection only, no hidden info |
| Socket `game.private.view` | account/session scoped only | own hand/role; redacted on old session invalidation |
| Socket `game.interrupted` | authoritative recovery | no claim of committed action before reconciliation |

### Receipt and version invariants

- Receipt key unique `(matchId, authenticatedAccountId, requestId)`; returning an old accepted result must not grant state ownership after logout or account change. Avoid embedding plaintext private hand in long-lived receipts.
- `expectedVersion` detects stale actions. Duplicate same key and same canonical payload returns same *sanitized* outcome; same key with different payload must reject `IDEMPOTENCY_CONFLICT`. Database transaction serializes count/turn/card mutations.
- Public state version increments monotonically after a committed action; `public.delta.version` must match. If client misses a version, fetch fresh snapshot; do not replay event blindly against wrong actor/hand.
- Match visibility is not an implicit permission to message players. Social privacy/block applies to friend/invite/emote/report.
- Server records time and rejects after deadline. Final phase updates occur in transaction before broadcast. Recovery after unacknowledged commit uses receipt lookup and current view.
- **Separation of capacities:** lobby directory advertises exact `roomId`, valid mode, table slots and current room slots; `availableToJoin = min(freeRoomSlots, freeTableSlots)` when data current, otherwise `UNKNOWN` and disable positive join. A table reservation never bypasses a room gate; no spectator slot in v1. Room listing without specific roomId cannot bind a player to an arbitrary game table.
- **Timing and ownership:** incoming command may be authorized initially but become invalid during an awaited PG/API operation; recheck current owner lock/epoch, active authenticated session, room membership, safety policy and phase deadline immediately before commit. Operator intervention changes are not a pretext to leak secret projections.

## Security matrix (must test)

| Attack/failure | Expected behavior |
|---|---|
| Player sends foreign `cardId` | 403/422 semantic error, no state mutation and no clue about card identity |
| Spectator subscribes private room | denied; never sees a private payload, even before unsubscribe |
| Reconnect after logout/revocation | all private subscriptions invalidated; no phantom table participant |
| Old owner wakes after lock loss | never replays an accepted action from previous epoch |
| Two submit same turn | exactly one accepted transition; second idempotent result or stale conflict |
| Missing encryption key | matches fail closed; never return decrypted private state partially |
| Admin queries game analytics | only aggregate, no hidden hand/role/target |
| User blocks another mid-match | obey safe policy: private report and departure/restriction; no forced disclosure of hidden info |
| Server restart during face-down claim | recover phase+deadline from transaction; no reveal to wrong viewer |
| Unknown flags/schemas/new client | reject safely, or negotiate explicit supported protocol; do not silently accept wildcard |

## Compatibility and release

`protocolVersion` and `rulesetVersion` are separate. A match launched with rules v1 completes using v1 reducer even when the server receives rules v2; do not mutate rules of an active match during rollout. A client that lacks a rule capability cannot start that mode; server supplies a localized update message. Prior web/Android/desktop client versions require explicit regression once distributed. All modes OFF by default.
