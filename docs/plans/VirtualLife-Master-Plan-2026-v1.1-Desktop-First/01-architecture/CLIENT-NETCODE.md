# Client ↔ Rust networking protocol for native Unity + future clients

## Protocol baseline
HTTPS Nest login/account; short-lived ticket minted by trusted control plane; native client **direct WSS** to Rust for world/game; versioned Protobuf or compact binary, length-limited, authenticated. Start with WebSocket for simplicity/firewall friendliness, only add secure UDP/QUIC after comparative live network profiling and server tick evidence.

## Reliable semantic commands vs volatile streams
| Path | Example | Delivery and ownership |
|---|---|---|
| client→Rust input stream | sequence + directional input, target click navigation intent | drop stale seq; server clamps speed/collision; visual client predicts |
| Rust→client world snapshots | authoritative position/velocity/zone epoch + AOI avatars | delta, snapshot and interpolation; not ACID per frame |
| client→Rust durable commands | request seat, start card game, swap gem, teleport | `commandId`, expectedVersion, authorizer, durable receipt/idempotency |
| Rust→Nest outbox event | eligible reward / season milestone | at-least-once message + platform inbox unique effect |
| Nest→Rust trust changes | ban/block/privacy consent generation | monotonic generation, freshness at commit/revocation, not just initial login |

## Player movement
- Unity local WASD/gamepad/point-click triggers immediate animation, predicts local capsule, smooth correction. Server validates navmesh/collision and auto-route intent. Client should avoid speedhack by movement delta and be robust under 150ms RTT.
- AOI updates distant avatars at lower frequency, camera follows local; NPC non-interactive ambient may be visual client-only, game-interactable NPC server owns goals and identity.
- Parent-child seat state: Rust reserves `seatId` with lease, enters seated session at verified anchor and commits; Unity animates sit/IK in response and is allowed to send LeaveSeat. Cannot drag avatar away while active turn/session unless leave policy allows.

## Transition & reconnect
- Teleport `prepare(targetPOI,idempotencyKey)` → server hold target spawn → Unity preloads scene content → `commit` → src relinquish, target becomes authoritative; abort/timeout cancels hold and keeps source. Reconnect queries canonical location; no player duplicated in two rooms.
- Match UI receives private projection scoped to current user, no opponent hand leak via cache/recording/analytics logs.
- Connection state machine: `DISCONNECTED→AUTHENTICATING→CONNECTING→SYNCING→IN_WORLD→DEGRADED→RECONNECTING`; soft avatar/camera fallback only, never fake success/reward.

## Testing
Golden fixtures from Rust→generated C#, schema compatibility matrix (n vs n-1 for controlled rolling deployments), injected duplicated/late/out-of-order packets, forbidden seat, forged asset/outfit/board command, revoked ticket during commit, staging regional latency traces. Never count edit-mode mocks as evidence of server trust.
