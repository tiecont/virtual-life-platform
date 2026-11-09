# Networking & multiplayer synchronization

## Protocol / transport
- **HTTPS** auth/BFF, **WSS** gameplay as browser-compatible baseline. Native Unity can use same protobuf over WSS; alternative QUIC/native UDP **research-only** after latency/packet-loss benchmark and fallback story.
- `ClientHello(protocolVersion, assetManifest, featureCaps, ticket)`, `ServerWelcome(assignedInstance, tick, authorityEpoch, contentHash, snapshot)`, `Input(seq, dt/buttons)`, `Command(idempotency, expectedVersion, payload)`, `Ack(receipt)`, `WorldDelta(seq, serverTime, regionOfInterest)`, `Projection(recipientScope)`, `Resync`, `Heartbeat`.
- ACK/dedupe; WSS order does **not** mean reliable gameplay commit if reconnect/unknown ack. Client reconciles receipt/snapshot after timeout, never repeat reward without same commandId.
- Keep positional updates bounded (quantization, AOI, deltas, compression after measurement); limit per-player input rate and per-packet size, reject unsupported protocol.

## Smooth animation
- Client camera/render 30/60fps independent of 10–20Hz world tick; input prediction only for own avatar; interpolate remote avatars with buffer tuned by RTT/jitter, extrapolate a limited window then snap softly.
- Authority validates navigation/collision with simplified deterministic world geometry; client animation uses same gameplay position but richer visual IK/physics; no per-bone replicate except emote clip/face expressions.
- Instance limits are **measured**, not hard-coded as "1,000 in view". When crowded, lower update frequency for distant avatars, avatar LOD/fur complexity, visibility radius and NPC density.

## Recovery
- Reconnect sends `lastSeenEpoch, lastSeenSeq, pendingCommandIds`; Rust checks signed ticket/session/sanction generation; sends missing deltas only if history usable, else canonical authorized snapshot.
- Room/venue transfer: target hold with TTL → secure actor transfer commit → source release; on timeout cancel hold and keep or restore source membership. If client offline mid-transfer, server-resolved status endpoint returns authoritative location; never show both rooms active.
- Double login: policy explicit (replace previous connection, preserve game session) and tests for revocation/account switch.

## Service protection
Token bucket per actor/session/IP; zone mailbox length and latency; backpressure not OOM. DDoS/WAF and egress limits; no trusting user-supplied actorId or location. Track p95 tick overrun, retransmission/seq gaps, resync count, queues, bytes per visible actor, cross-region RTT. Sensitive social lists must be projected only to authorized recipients.
